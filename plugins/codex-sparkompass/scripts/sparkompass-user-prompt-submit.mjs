#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import process from "node:process";
import { resolveSparkompassScript } from "./sparkompass-resolve.mjs";

const stdin = fs.readFileSync(0, "utf8");
const args = [
  "prompt-advisory",
  "--hook-payload",
  "--quiet-ok",
  ...process.argv.slice(2)
];
const resolved = resolveSparkompassScript("cli", import.meta.url);

let result = null;
for (const candidate of resolved.candidates) {
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
