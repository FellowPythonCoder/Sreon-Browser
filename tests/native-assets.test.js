import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execute = promisify(execFile);

test("desktop package contains only bundled UI assets, never the web server or legacy files", async () => {
  await execute(process.execPath, ["scripts/prepare-desktop.mjs"]);
  const files = (
    await readdir(new URL("../dist/desktop/", import.meta.url))
  ).sort();
  assert.deepEqual(files, [
    "app.js",
    "assets",
    "index.html",
    "native.js",
    "styles.css",
    "theme.js",
  ]);
  const html = await readFile(
    new URL("../dist/desktop/index.html", import.meta.url),
    "utf8",
  );
  assert.ok(html.indexOf('src="native.js"') < html.indexOf('src="app.js"'));
  assert.doesNotMatch(html, /<iframe|localhost|docker|demo-browser/i);
});

test("only the local main window receives explicitly scoped native commands", async () => {
  const config = JSON.parse(
    await readFile(
      new URL("../src-tauri/tauri.conf.json", import.meta.url),
      "utf8",
    ),
  );
  const capability = JSON.parse(
    await readFile(
      new URL("../src-tauri/capabilities/main.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(config.build.devUrl, undefined);
  assert.equal(config.build.frontendDist, "../dist/desktop");
  assert.deepEqual(config.app.security.capabilities, ["main"]);
  assert.deepEqual(capability.windows, ["main"]);
  assert.equal(capability.remote, undefined);
  assert.deepEqual(
    capability.permissions.filter((name) => name.startsWith("allow-")),
    ["allow-search", "allow-connection-status", "allow-open-page"],
  );
  assert.ok(
    !capability.permissions.some((permission) =>
      /shell|fs:|http:|process:/.test(permission),
    ),
  );
});
