#!/usr/bin/env node
import { build } from "esbuild";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(root, "plugins/codex-sparkompass/dist");

const targets = [
  {
    entry: path.join(root, "bin/codex-sparkompass.mjs"),
    outfile: path.join(distDir, "sparkompass.mjs")
  },
  {
    entry: path.join(root, "bin/codex-sparkompass-mcp.mjs"),
    outfile: path.join(distDir, "sparkompass-mcp.mjs")
  }
];

await fs.rm(distDir, { recursive: true, force: true });
await fs.mkdir(distDir, { recursive: true });

for (const target of targets) {
  await build({
    entryPoints: [target.entry],
    outfile: target.outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    legalComments: "none",
    minify: true,
    sourcemap: false
  });
  await fs.chmod(target.outfile, 0o755);
}

console.log(`Built plugin dist in ${path.relative(root, distDir)}`);
