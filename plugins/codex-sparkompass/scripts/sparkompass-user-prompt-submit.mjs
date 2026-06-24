#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const stdin = fs.readFileSync(0, "utf8");
const args = [
  "prompt-advisory",
  "--hook-payload",
  "--quiet-ok",
  ...process.argv.slice(2)
];
const candidates = [
  process.env.SPARKOMPASS_CLI,
  path.resolve(__dirname, "../../../bin/codex-sparkompass.mjs"),
  path.resolve(process.cwd(), "bin/codex-sparkompass.mjs")
].filter(Boolean);

let result = null;
for (const candidate of candidates) {
  if (fs.existsSync(candidate)) {
    result = spawnSync(process.execPath, [candidate, ...args], {
      input: stdin,
      encoding: "utf8"
    });
    break;
  }
}

if (!result) {
  result = spawnSync("sparkompass", args, {
    input: stdin,
    encoding: "utf8"
  });
}

if (result.error) {
  if (process.env.SPARKOMPASS_HOOK_DEBUG === "1") {
    console.error(`Sparkompass hook skipped: ${result.error.message}`);
  }
  process.exit(0);
}

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr && process.env.SPARKOMPASS_HOOK_DEBUG === "1") process.stderr.write(result.stderr);
process.exit(result.status === null ? 0 : result.status);
