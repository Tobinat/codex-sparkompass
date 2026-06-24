#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { resolveSparkompassScript } from "./sparkompass-resolve.mjs";

const args = process.argv.slice(2);
const resolved = resolveSparkompassScript("cli", import.meta.url);

if (resolved.script) {
  const result = spawnSync(process.execPath, [resolved.script, ...args], {
    stdio: "inherit"
  });
  process.exit(result.status ?? 1);
}

const result = spawnSync("sparkompass", args, {
  stdio: "inherit"
});

if (result.error) {
  console.error("Codex Sparkompass CLI not found. Install or run from the repository root.");
  console.error("Tried:");
  for (const candidate of resolved.candidates) {
    console.error(`- ${candidate}`);
  }
  process.exit(1);
}

process.exit(result.status ?? 1);
