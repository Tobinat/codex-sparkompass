#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { resolveSparkompassScript } from "./sparkompass-resolve.mjs";

const resolved = resolveSparkompassScript("mcp", import.meta.url);

if (resolved.script) {
  const result = spawnSync(process.execPath, [resolved.script], {
    stdio: "inherit"
  });
  process.exit(result.status ?? 1);
}

const result = spawnSync("sparkompass-mcp", [], {
  stdio: "inherit"
});

if (result.error) {
  console.error("Codex Sparkompass MCP server not found. Install or run from the repository root.");
  console.error("Tried:");
  for (const candidate of resolved.candidates) {
    console.error(`- ${candidate}`);
  }
  process.exit(1);
}

process.exit(result.status ?? 1);
