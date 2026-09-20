import { createServer } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { extname, join } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const files = new Set(["index.html", "styles.css", "app.js", "native.js", "theme.js", "assets/sreon-logo.png"]);
for (const name of await readdir(join(root, "assets/fonts")))
  if (name.endsWith(".woff2")) files.add(`assets/fonts/${name}`);
const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".woff2": "font/woff2" };
createServer(async (request, response) => {
  let path;
  try { path = decodeURIComponent(new URL(request.url, "http://preview.invalid").pathname).slice(1) || "index.html"; }
  catch { response.writeHead(400).end(); return; }
  if (!["GET", "HEAD"].includes(request.method)) { response.writeHead(405).end(); return; }
  if (!files.has(path)) { response.writeHead(404).end("Not found"); return; }
  try {
    const data = await readFile(join(root, path));
    response.writeHead(200, { "Content-Type": types[extname(path)], "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    response.end(request.method === "HEAD" ? undefined : data);
  } catch { response.writeHead(404).end("Not found"); }
}).listen(Number(process.env.PORT || 3000), "0.0.0.0", () => console.log("Sreon interface preview on port " + (process.env.PORT || 3000) + ". Search requires the native Mac app."));
