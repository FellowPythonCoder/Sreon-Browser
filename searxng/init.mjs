import { readFile, writeFile, mkdir } from "node:fs/promises";
import { randomBytes } from "node:crypto";

const source = process.env.SREON_CONFIG_SOURCE || "/setup/settings.yml";
const directory = process.env.SREON_CONFIG_DIRECTORY || "/etc/searxng";
await mkdir(directory, { recursive: true });
let secret = randomBytes(32).toString("hex");
try {
  const previous = await readFile(`${directory}/settings.yml`, "utf8");
  const match = previous.match(/secret_key: ([a-f0-9]{64})/);
  if (match) secret = match[1];
} catch {}
const template = await readFile(source, "utf8");
if (!template.includes("SREON_GENERATED_SECRET"))
  throw new Error(
    "The search configuration is missing its secret placeholder.",
  );
await writeFile(
  `${directory}/settings.yml`,
  template.replace("SREON_GENERATED_SECRET", secret),
  { mode: 0o600 },
);
console.log("Sreon search configuration is ready.");
