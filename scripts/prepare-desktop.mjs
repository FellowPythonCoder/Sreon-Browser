import { cp, mkdir, rm, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const destination = join(root, "dist", "desktop");
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
for (const file of [
  "index.html",
  "styles.css",
  "app.js",
  "native.js",
  "theme.js",
  "assets",
]) {
  await cp(join(root, file), join(destination, file), { recursive: true });
}
if (
  /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(
    process.env.GITHUB_REPOSITORY || "",
  ) &&
  /^[a-f0-9]{40}$/.test(process.env.GITHUB_SHA || "")
) {
  const path = join(destination, "index.html");
  const source = `https://github.com/${process.env.GITHUB_REPOSITORY}/tree/${process.env.GITHUB_SHA}`;
  const html = await readFile(path, "utf8");
  await writeFile(
    path,
    html.replace(
      'href="https://github.com/FellowPythonCoder/Sreon-Browser"',
      `href="${source}"`,
    ),
  );
}
console.log("Sreon desktop assets are ready. No web server is started.");
