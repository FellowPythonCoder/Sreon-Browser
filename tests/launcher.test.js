import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  writeFile,
  readFile,
  mkdir,
  copyFile,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execute = promisify(execFile);

async function fixture(callback) {
  const directory = await mkdtemp(join(tmpdir(), "sreon-launcher-"));
  const project = join(directory, "Sreon Search");
  const bin = join(directory, "bin");
  await mkdir(project);
  await mkdir(bin);
  await copyFile(
    new URL("../sreon.sh", import.meta.url),
    join(project, "sreon.sh"),
  );
  const log = join(directory, "commands");
  await writeFile(log, "");
  const commands = {
    docker: `#!/bin/sh
printf 'docker %s\n' "$*" >> "$TEST_LOG"
case "$*" in
  'compose version') exit 0 ;;
  info) if [ "$TEST_DESKTOP" = 1 ] && [ ! -f "$TEST_READY" ]; then exit 1; fi; exit 0 ;;
  *'up --build -d') exit "$TEST_BUILD_EXIT" ;;
  *'port sreon 3000') printf '127.0.0.1:%s\n' "$TEST_PORT" ;;
esac
`,
    curl: `#!/bin/sh
printf 'curl %s\n' "$*" >> "$TEST_LOG"
printf '{"configured":true,"connected":%s}\n' "$TEST_HEALTH"
`,
    uname: `#!/bin/sh
printf '%s\n' "$TEST_OS"
`,
    open: `#!/bin/sh
printf 'open %s\n' "$*" >> "$TEST_LOG"
if [ "$*" = '-a Docker' ]; then : > "$TEST_READY"; fi
`,
    sleep: "#!/bin/sh\nexit 0\n",
  };
  for (const [name, source] of Object.entries(commands))
    await writeFile(join(bin, name), source, { mode: 0o755 });
  async function run(args = [], overrides = {}) {
    const env = {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      TEST_LOG: log,
      TEST_READY: join(directory, "ready"),
      TEST_BUILD_EXIT: "0",
      TEST_HEALTH: "true",
      TEST_PORT: "3000",
      TEST_OS: "Darwin",
      TEST_DESKTOP: "0",
      SREON_NO_OPEN: "0",
      ...overrides,
    };
    try {
      const result = await execute(
        "/bin/bash",
        [join(project, "sreon.sh"), ...args],
        { cwd: directory, env, timeout: 15000 },
      );
      return { ...result, code: 0, commands: await readFile(log, "utf8") };
    } catch (error) {
      return { ...error, commands: await readFile(log, "utf8") };
    }
  }
  try {
    await callback(run, project);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("launcher help and invalid actions do not contact Docker", async () => {
  await fixture(async (run) => {
    const help = await run(["--help"]);
    assert.equal(help.code, 0);
    assert.match(help.stdout, /bash sreon.sh stop/);
    assert.equal(help.commands, "");
    const invalid = await run(["delete-everything"]);
    assert.equal(invalid.code, 2);
    assert.equal(invalid.commands, "");
  });
});

test("Mac launcher handles spaces, checks readiness, and opens the actual port", async () => {
  await fixture(async (run, project) => {
    const result = await run([], { TEST_PORT: "3001" });
    assert.equal(result.code, 0, result.stderr);
    assert.ok(
      result.commands.includes(
        `--project-directory ${project} -f ${project}/compose.yaml up --build -d`,
      ),
    );
    assert.match(
      result.commands,
      /curl .*http:\/\/localhost:3001\/api\/health/,
    );
    assert.match(result.commands, /open http:\/\/localhost:3001/);
    assert.match(
      result.stdout,
      /Sreon Search is ready: http:\/\/localhost:3001/,
    );
    assert.doesNotMatch(result.commands, /down|sudo/);
  });
});

test("launcher can open Docker Desktop before starting services", async () => {
  await fixture(async (run) => {
    const result = await run([], { TEST_DESKTOP: "1" });
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.commands, /open -a Docker/);
    assert.match(result.commands, /up --build -d/);
  });
});

test("launcher supports non-opening runs", async () => {
  await fixture(async (run) => {
    const result = await run([], { SREON_NO_OPEN: "1" });
    assert.equal(result.code, 0);
    assert.doesNotMatch(result.commands, /open http/);
  });
});

test("stop, status, and logs do not build or open the engine", async () => {
  for (const [action, command] of [
    ["stop", "down"],
    ["status", "ps -a"],
    ["logs", "logs --tail 100 sreon configure"],
  ]) {
    await fixture(async (run) => {
      const result = await run([action]);
      assert.equal(result.code, 0);
      assert.ok(result.commands.includes(command));
      assert.doesNotMatch(result.commands, /up --build|curl|open http|down -v/);
    });
  }
});

test("build failures do not claim readiness or open the browser", async () => {
  await fixture(async (run) => {
    const result = await run([], { TEST_BUILD_EXIT: "1" });
    assert.equal(result.code, 1);
    assert.match(result.stderr, /Sreon could not start/);
    assert.doesNotMatch(result.commands, /curl|open http/);
  });
});

test("backend readiness timeout is bounded and reported honestly", async () => {
  await fixture(async (run) => {
    const result = await run([], { TEST_HEALTH: "false" });
    assert.equal(result.code, 1);
    assert.match(result.stderr, /search backend is not ready/);
    assert.equal(
      result.commands.split("\n").filter((line) => line.startsWith("curl "))
        .length,
      45,
    );
    assert.doesNotMatch(result.commands, /open http/);
  });
});
