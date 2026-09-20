import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createSreonServer, plainText, safeHttpUrl } from "../server.js";

async function listen(server) {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${server.address().port}`;
}
async function close(server) {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
async function withApp(options, callback) {
  const server = createSreonServer(options);
  const base = await listen(server);
  try {
    await callback(base);
  } finally {
    await close(server);
  }
}

test("serves the interface and assets without exposing private project files", async () => {
  await withApp({}, async (base) => {
    for (const path of [
      "/",
      "/search?q=forest",
      "/search/",
      "/app.js",
      "/theme.js",
      "/styles.css",
      "/assets/sreon-logo.png",
      "/assets/fonts/dm-sans-latin-400-normal.woff2",
      "/README.md",
    ]) {
      const response = await fetch(base + path);
      assert.equal(response.status, 200, path);
      assert.equal(response.headers.get("x-content-type-options"), "nosniff");
      assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    }
    for (const path of [
      "/.env",
      "/site-config.js",
      "/search/app.js",
      "/o/",
      "/games/engine.js",
      "/sreon.zip",
      "/.git/HEAD",
      "/server.js",
      "/package.json",
      "/searxng/settings.yml",

      "/assets/%2e%2e/server.js",
      "/assets/../server.js",
      "/missing",
      "/api/missing",
    ]) {
      assert.equal((await fetch(base + path)).status, 404, path);
    }
    const head = await fetch(base, { method: "HEAD" });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), "");
    assert.equal((await fetch(base, { method: "POST" })).status, 405);
    const source = await (await fetch(base)).text();
    assert.doesNotMatch(source, /google|duckduckgo|bing|<!--/i);
  });
});

test("accepts preview hosts without cross-origin browser calls", async () => {
  await withApp({}, async (base) => {
    const response = await fetch(base, {
      headers: { Host: "3000-preview.e2b.app" },
    });
    assert.equal(response.status, 200);
  });
});

test("unconfigured search returns an honest setup state", async () => {
  await withApp({}, async (base) => {
    const health = await (await fetch(`${base}/api/health`)).json();
    assert.deepEqual(health, { connected: false, configured: false });
    const response = await fetch(`${base}/api/search?q=forest`);
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, "NOT_CONFIGURED");
  });
});

test("validates queries, categories, pages and all filters", async () => {
  await withApp({}, async (base) => {
    const invalid = [
      "q=",
      `q=${"x".repeat(501)}`,
      "q=test&category=invalid",
      "q=test&page=0",
      "q=test&page=21",
      "q=test&page=1.5",
      "q=test&page=no",
      "q=test&safe=3",
      "q=test&language=invalid",
      "q=test&time=forever",
    ];
    for (const params of invalid)
      assert.equal(
        (await fetch(`${base}/api/search?${params}`)).status,
        400,
        params,
      );
  });
});

test("passes search options to the backend and normalizes real result data", async () => {
  let request;
  const upstream = createServer((req, res) => {
    request = new URL(req.url, "http://backend");
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        results: [
          {
            title: "<b>Forest</b> &amp; trees",
            url: "https://example.org/forest",
            content: "A <em>living</em> network &#8212; nature.",
            img_src: "https://example.org/image.jpg",
            publishedDate: "2026-09-20",
          },
          { title: "Unsafe", url: "javascript:alert(1)" },
        ],
        unresponsive_engines: [["one", "timeout"]],
      }),
    );
  });
  const backendUrl = await listen(upstream);
  try {
    await withApp({ backendUrl: `${backendUrl}/prefix` }, async (base) => {
      const response = await fetch(
        `${base}/api/search?q=forest%20bathing&category=images&page=2&safe=2&language=en&time=week`,
      );
      const data = await response.json();
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.equal(request.pathname, "/prefix/search");
      assert.equal(request.searchParams.get("q"), "forest bathing");
      assert.equal(request.searchParams.get("categories"), "images");
      assert.equal(request.searchParams.get("pageno"), "2");
      assert.equal(request.searchParams.get("safesearch"), "2");
      assert.equal(request.searchParams.get("language"), "en");
      assert.equal(request.searchParams.get("time_range"), "week");
      assert.equal(request.searchParams.get("format"), "json");
      assert.equal(data.results.length, 1);
      assert.equal(data.results[0].title, "Forest & trees");
      assert.equal(data.results[0].content, "A living network — nature.");
      assert.equal(data.results[0].thumbnail, "https://example.org/image.jpg");
      assert.equal(data.hasMore, true);
      assert.equal(data.partial, true);
      assert.equal(typeof data.elapsed, "number");
    });
  } finally {
    await close(upstream);
  }
});

test("preserves empty results and paging from a connected provider", async () => {
  await withApp(
    {
      backendUrl: "https://backend.example",
      fetchImpl: async () => Response.json({ results: [], paging: false }),
    },
    async (base) => {
      const response = await fetch(`${base}/api/search?q=unknown`);
      assert.equal(response.status, 200);
      const data = await response.json();
      assert.deepEqual(data.results, []);
      assert.equal(data.hasMore, false);
    },
  );
});

test("reports a connected backend without disclosing its private URL", async () => {
  await withApp(
    {
      backendUrl: "https://private.example",
      fetchImpl: async () => new Response("OK"),
    },
    async (base) => {
      const data = await (await fetch(`${base}/api/health`)).json();
      assert.deepEqual(data, { connected: true, configured: true });
    },
  );
});

test("handles JSON refusal, malformed responses and network failures", async () => {
  for (const fetchImpl of [
    async () => new Response("Forbidden", { status: 403 }),
    async () => new Response("<html>Error</html>"),
    async () => Response.json({ invalid: true }),
    async () => {
      throw new Error("secret internal host");
    },
  ]) {
    await withApp(
      { backendUrl: "https://private.example", fetchImpl },
      async (base) => {
        const response = await fetch(`${base}/api/search?q=test`);
        assert.equal(response.status, 502);
        assert.doesNotMatch(
          await response.text(),
          /secret internal host|private\.example/,
        );
      },
    );
  }
});

test("terminates slow backend searches", async () => {
  await withApp(
    {
      backendUrl: "https://backend.example",
      requestTimeout: 20,
      fetchImpl: (url, { signal }) =>
        new Promise((resolve, reject) =>
          signal.addEventListener("abort", () => reject(new Error("aborted"))),
        ),
    },
    async (base) => {
      assert.equal((await fetch(`${base}/api/search?q=test`)).status, 504);
    },
  );
});

test("rate limits excessive search requests", async () => {
  await withApp({}, async (base) => {
    for (let i = 0; i < 60; i++) await fetch(`${base}/api/search?q=test`);
    const response = await fetch(`${base}/api/search?q=test`);
    assert.equal(response.status, 429);
    assert.ok(Number(response.headers.get("retry-after")) > 0);
  });
});

test("URL and text normalization reject unsafe inputs", () => {
  assert.equal(safeHttpUrl("javascript:alert(1)"), "");
  assert.equal(safeHttpUrl("data:text/html,hello"), "");
  assert.equal(safeHttpUrl("https://user:pass@example.org"), "");
  assert.equal(safeHttpUrl("https://example.org/a"), "https://example.org/a");
  assert.equal(plainText(null), "");
  assert.equal(plainText("<b>Hello</b> &amp; &#x1f331;"), "Hello & 🌱");
  assert.throws(() => createSreonServer({ backendUrl: "file:///etc/passwd" }));
});

test("Docker configuration initializer generates a secret and preserves it", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sreon-config-"));
  const env = {
    ...process.env,
    SREON_CONFIG_DIRECTORY: directory,
    SREON_CONFIG_SOURCE: new URL("../searxng/settings.yml", import.meta.url)
      .pathname,
  };
  try {
    const execute = promisify(execFile);
    await execute(process.execPath, ["searxng/init.mjs"], { env });
    const first = await readFile(join(directory, "settings.yml"), "utf8");
    assert.match(first, /secret_key: [a-f0-9]{64}/);
    assert.doesNotMatch(first, /SREON_GENERATED_SECRET/);
    await execute(process.execPath, ["searxng/init.mjs"], { env });
    assert.equal(
      await readFile(join(directory, "settings.yml"), "utf8"),
      first,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("old search URLs redirect to the standalone engine and retain the query", async () => {
  await withApp({}, async (base) => {
    for (const path of ["/search", "/search/", "/search/index.html"]) {
      const response = await fetch(`${base}${path}?q=forest&category=images`, {
        redirect: "manual",
      });
      assert.equal(response.status, 308);
      assert.equal(
        response.headers.get("location"),
        "/?q=forest&category=images",
      );
    }
  });
});
