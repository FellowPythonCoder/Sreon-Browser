import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

test("source archive contains app, integrations, and protected source without credentials or build output", async () => {
  const script = `import zipfile, pathlib
with zipfile.ZipFile('Sreon-source.zip') as archive:
    names = set(archive.namelist())
    for file in ['index.html','src-tauri/src/search.rs','src-tauri/src/api.rs','integrations/sreon.py','integrations/sreon.mjs','HOW-IT-WORKS.md','o/index.html','games/engine.js']:
        assert 'Sreon/' + file in names, file
    for name in names:
        assert name.startswith('Sreon/') and '..' not in pathlib.PurePosixPath(name).parts
        assert not any(part in {'.git','node_modules','target','.env','dist'} for part in pathlib.PurePosixPath(name).parts)
        assert not name.endswith('.zip')
    assert archive.read('Sreon/o/index.html') == pathlib.Path('o/index.html').read_bytes()
print('ok')`;
  const result = await run(process.platform === "win32" ? "python" : "python3", ["-c", script]);
  assert.equal(result.stdout.trim(), "ok");
});
