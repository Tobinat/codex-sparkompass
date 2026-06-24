import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_NAMES = {
  cli: "codex-sparkompass.mjs",
  mcp: "codex-sparkompass-mcp.mjs"
};

const ENV_NAMES = {
  cli: "SPARKOMPASS_CLI",
  mcp: "SPARKOMPASS_MCP"
};

export function resolveSparkompassScript(kind, metaUrl, options = {}) {
  const scriptName = SCRIPT_NAMES[kind];
  const envName = ENV_NAMES[kind];
  if (!scriptName || !envName) throw new Error(`Unknown Sparkompass script kind: ${kind}`);

  const cwd = options.cwd || process.cwd();
  const env = options.env || process.env;
  const scriptDir = path.dirname(fileURLToPath(metaUrl));
  const candidates = [
    env[envName],
    path.resolve(scriptDir, "../../../bin", scriptName),
    path.resolve(cwd, "bin", scriptName),
    ...marketplaceCandidates(scriptDir, scriptName, env)
  ].filter(Boolean);

  return {
    script: candidates.find((candidate) => fs.existsSync(candidate)) || null,
    candidates
  };
}

function marketplaceCandidates(scriptDir, scriptName, env) {
  const pluginRoot = path.resolve(scriptDir, "..");
  const parts = pluginRoot.split(path.sep);
  const cacheIndex = parts.lastIndexOf("cache");
  if (cacheIndex < 2) return [];
  if (parts[cacheIndex - 1] !== "plugins") return [];

  const marketplace = parts[cacheIndex + 1];
  if (!marketplace) return [];

  const codexHomeFromPath = parts.slice(0, cacheIndex - 1).join(path.sep) || path.sep;
  const codexHomes = unique([
    env.CODEX_HOME,
    codexHomeFromPath,
    path.join(os.homedir(), ".codex")
  ]);

  return codexHomes.flatMap((codexHome) => {
    const source = readMarketplaceSource(path.join(codexHome, "config.toml"), marketplace);
    return source ? [path.join(source, "bin", scriptName)] : [];
  });
}

function readMarketplaceSource(configPath, marketplace) {
  if (!fs.existsSync(configPath)) return "";
  const text = fs.readFileSync(configPath, "utf8");
  const sectionPattern = new RegExp(`^\\[marketplaces\\.(?:"${escapeRegex(marketplace)}"|${escapeRegex(marketplace)})\\]\\s*$`, "m");
  const match = sectionPattern.exec(text);
  if (!match) return "";

  const rest = text.slice(match.index + match[0].length);
  const nextSection = rest.search(/^\[/m);
  const section = nextSection === -1 ? rest : rest.slice(0, nextSection);
  const sourceMatch = /^\s*source\s*=\s*"([^"]+)"\s*$/m.exec(section);
  return sourceMatch?.[1] || "";
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
