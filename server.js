import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const categories = new Set(["general", "images", "news", "videos"]);
const times = new Set(["", "day", "week", "month", "year"]);
const languages = new Set(["auto", "en", "de", "es", "fr", "it", "ja"]);
const publicFiles = new Set([
  "index.html",
  "styles.css",
  "app.js",
  "native.js",
  "theme.js",
  "README.md",
  "LICENSE.txt",
]);
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".md": "text/plain; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};
const entities = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};
export function plainText(value) {
  if (typeof value !== "string") return "";
  return value
    .replace(/<[^>]*>/g, "")
    .replace(
      /&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,
      (match, entity) => {
        if (entity[0] !== "#") return entities[entity.toLowerCase()] || match;
        const number =
          entity[1].toLowerCase() === "x"
            ? parseInt(entity.slice(2), 16)
            : parseInt(entity.slice(1), 10);
        return number > 0 && number <= 0x10ffff
          ? String.fromCodePoint(number)
          : "";
      },
    )
    .trim()
    .slice(0, 5000);
}
export function safeHttpUrl(value) {
  try {
    if (typeof value !== "string") return "";
    const parsed = new URL(value);
    return ["https:", "http:"].includes(parsed.protocol) &&
      !parsed.username &&
      !parsed.password
      ? parsed.href
      : "";
  } catch {
    return "";
  }
}
async function readJson(response) {
  if (!response.body) throw new Error("Empty response");
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 5_000_000) throw new Error("Response too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
export function createSreonServer({
  backendUrl = process.env.SEARXNG_URL || "",
  requestTimeout = 18000,
  fetchImpl = fetch,
} = {}) {
  const base = backendUrl ? safeHttpUrl(backendUrl) : "";
  if (backendUrl && !base)
    throw new Error(
      "SEARXNG_URL must be an HTTP or HTTPS URL without credentials.",
    );
  const buckets = new Map();
  let lastPrune = 0;
  const securityHeaders = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Content-Security-Policy":
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https: http:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-src 'none'",
  };
  function sendJson(res, status, data) {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(data));
  }
  return createServer(async (req, res) => {
    for (const [name, value] of Object.entries(securityHeaders))
      res.setHeader(name, value);
    try {
      const url = new URL(req.url, "http://sreon.local");
      if (!["GET", "HEAD"].includes(req.method)) {
        res.setHeader("Allow", "GET, HEAD");
        return sendJson(res, 405, { message: "This method is not supported." });
      }
      if (url.pathname === "/api/health") {
        if (!base)
          return sendJson(res, 200, { connected: false, configured: false });
        try {
          const response = await fetchImpl(
            new URL("healthz", base.endsWith("/") ? base : `${base}/`),
            { signal: AbortSignal.timeout(5000), redirect: "error" },
          );
          await response.body?.cancel();
          return sendJson(res, 200, {
            connected: response.ok,
            configured: true,
          });
        } catch {
          return sendJson(res, 200, { connected: false, configured: true });
        }
      }
      if (url.pathname === "/api/search") {
        const now = Date.now();
        if (now - lastPrune > 60000) {
          for (const [key, bucket] of buckets)
            if (now > bucket.reset) buckets.delete(key);
          lastPrune = now;
        }
        const ip = req.socket.remoteAddress;
        const bucket = buckets.get(ip);
        if (bucket && now < bucket.reset && bucket.count >= 60) {
          res.setHeader(
            "Retry-After",
            String(Math.ceil((bucket.reset - now) / 1000)),
          );
          return sendJson(res, 429, {
            message:
              "A little too fast. Please wait a minute before searching again.",
            code: "RATE_LIMITED",
          });
        }
        buckets.set(
          ip,
          bucket && now < bucket.reset
            ? { ...bucket, count: bucket.count + 1 }
            : { count: 1, reset: now + 60000 },
        );
        const q = (url.searchParams.get("q") || "").trim();
        const category = url.searchParams.get("category") || "general";
        const pageRaw = url.searchParams.get("page") || "1";
        const page = Number(pageRaw);
        const safe = url.searchParams.get("safe") || "1";
        const language = url.searchParams.get("language") || "auto";
        const time = url.searchParams.get("time") || "";
        if (
          !q ||
          q.length > 500 ||
          !categories.has(category) ||
          !Number.isInteger(page) ||
          page < 1 ||
          page > 20 ||
          !["0", "1", "2"].includes(safe) ||
          !languages.has(language) ||
          !times.has(time)
        ) {
          return sendJson(res, 400, {
            message:
              "Please enter a search of 1–500 characters and choose valid search filters.",
            code: "INVALID_QUERY",
          });
        }
        if (!base)
          return sendJson(res, 503, {
            message:
              "Sreon needs a running search backend to fetch live results. Start the included Docker setup on your computer, or connect your own instance.",
            code: "NOT_CONFIGURED",
          });
        const upstream = new URL(
          "search",
          base.endsWith("/") ? base : `${base}/`,
        );
        upstream.search = new URLSearchParams({
          q,
          categories: category,
          pageno: String(page),
          safesearch: safe,
          language,
          time_range: time,
          format: "json",
        }).toString();
        const abort = new AbortController();
        const timer = setTimeout(() => abort.abort(), requestTimeout);
        const disconnect = () => {
          if (!res.writableEnded) abort.abort();
        };
        res.on("close", disconnect);
        const start = performance.now();
        try {
          const response = await fetchImpl(upstream, {
            signal: abort.signal,
            redirect: "error",
            headers: { Accept: "application/json", "User-Agent": "Sreon/1.0" },
          });
          if (!response.ok) {
            await response.body?.cancel();
            return sendJson(res, 502, {
              message:
                response.status === 403
                  ? "Your search backend is refusing JSON requests. Enable the JSON format in its search settings, then restart it."
                  : "The search backend is temporarily unavailable. Please try again shortly.",
              code: "BACKEND_ERROR",
            });
          }
          const data = await readJson(response);
          if (!Array.isArray(data.results))
            throw new Error("Invalid search response");
          const results = data.results
            .slice(0, 60)
            .filter((result) => safeHttpUrl(result.url))
            .map((result) => ({
              title: plainText(result.title) || new URL(result.url).hostname,
              url: safeHttpUrl(result.url),
              content: plainText(result.content),
              thumbnail: safeHttpUrl(
                result.thumbnail_src || result.img_src || result.thumbnail,
              ),
              published: plainText(
                result.publishedDate || result.published_date || "",
              ),
            }));
          return sendJson(res, 200, {
            results,
            elapsed: (performance.now() - start) / 1000,
            hasMore: results.length > 0 && page < 20 && data.paging !== false,
            partial:
              Array.isArray(data.unresponsive_engines) &&
              data.unresponsive_engines.length > 0,
          });
        } catch {
          if (res.destroyed) return;
          return sendJson(res, abort.signal.aborted ? 504 : 502, {
            message: abort.signal.aborted
              ? "The search took longer than expected. Please try again or choose another category."
              : "Couldn’t reach a working search backend. Check that it is running and that JSON search is enabled.",
            code: "BACKEND_UNAVAILABLE",
          });
        } finally {
          clearTimeout(timer);
          res.off("close", disconnect);
        }
      }
      if (url.pathname.startsWith("/api/"))
        return sendJson(res, 404, { message: "Not found." });
      let name;
      try {
        name = decodeURIComponent(url.pathname).replace(/^\/+/, "");
      } catch {
        return sendJson(res, 400, { message: "Invalid path." });
      }
      if (["search", "search/", "search/index.html"].includes(name)) {
        res.writeHead(308, { Location: `/${url.search}` });
        return res.end();
      }
      if (name === "") name = "index.html";
      const file = resolve(root, name);
      const asset =
        name.startsWith("assets/") &&
        file.startsWith(resolve(root, "assets") + sep) &&
        Boolean(mimeTypes[extname(file)]);
      if (
        (!publicFiles.has(name) && !asset) ||
        name.includes("\0") ||
        name.split("/").some((part) => part.startsWith("."))
      )
        return sendJson(res, 404, { message: "Not found." });
      try {
        const info = await stat(file);
        if (!info.isFile())
          return sendJson(res, 404, { message: "Not found." });
        const data = await readFile(file);
        res.writeHead(200, {
          "Content-Type":
            mimeTypes[extname(file)] || "application/octet-stream",
          "Content-Length": data.length,
          "Cache-Control": asset ? "public, max-age=86400" : "no-cache",
        });
        res.end(req.method === "HEAD" ? undefined : data);
      } catch {
        sendJson(res, 404, { message: "Not found." });
      }
    } catch {
      if (!res.headersSent)
        sendJson(res, 500, {
          message: "Something went wrong. Please try again.",
        });
      else res.end();
    }
  });
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const port = Number(process.env.PORT || 3000);
  const server = createSreonServer();
  server.listen(port, "0.0.0.0", () =>
    console.log(
      `Sreon is ready on port ${port}. ${process.env.SEARXNG_URL ? "Search backend configured." : "Connect a backend for live search. See README.md."}`,
    ),
  );
  for (const signal of ["SIGTERM", "SIGINT"])
    process.on(signal, () => {
      server.close();
      server.closeAllConnections();
    });
}
