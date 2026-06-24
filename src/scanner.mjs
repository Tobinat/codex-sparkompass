import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { estimateTextStats, estimateTokensFromBytes } from "./token-estimator.mjs";

const DEFAULT_IGNORED_DIRS = new Set([
  ".git",
  ".sparkompass",
  ".hg",
  ".svn",
  ".next",
  ".nuxt",
  ".turbo",
  ".cache",
  ".parcel-cache",
  "node_modules",
  "bower_components",
  "vendor",
  "dist",
  "build",
  "coverage",
  "target",
  "__pycache__",
  ".pytest_cache",
  ".mypy_cache",
  ".venv",
  "venv"
]);

const LOCK_FILES = new Set([
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lockb",
  "Cargo.lock",
  "Gemfile.lock",
  "poetry.lock"
]);

const BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".pdf",
  ".zip",
  ".gz",
  ".tgz",
  ".mp4",
  ".mov",
  ".mp3",
  ".wav",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".dmg",
  ".exe",
  ".dll"
]);

export async function scanProject(targetPath, options = {}) {
  const root = path.resolve(targetPath);
  await fs.access(root, fsConstants.R_OK);

  const files = [];
  const ignored = [];
  const special = {
    agents: [],
    codexConfigs: [],
    possiblePromptFiles: []
  };

  await walk(root, root, files, ignored, special, options);

  const textFiles = files.filter((file) => file.kind === "text");
  const totalEstimatedTokens = textFiles.reduce((sum, file) => sum + file.estimatedTokens, 0);
  const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);

  return {
    root,
    generatedAt: new Date().toISOString(),
    totals: {
      files: files.length,
      textFiles: textFiles.length,
      binaryFiles: files.length - textFiles.length,
      ignoredEntries: ignored.length,
      bytes: totalBytes,
      estimatedTextTokens: totalEstimatedTokens
    },
    special,
    files: files.sort((a, b) => b.estimatedTokens - a.estimatedTokens),
    ignored
  };
}

async function walk(root, currentDir, files, ignored, special, options) {
  let entries;
  try {
    entries = await fs.readdir(currentDir, { withFileTypes: true });
  } catch (error) {
    ignored.push({
      path: path.relative(root, currentDir) || ".",
      reason: `nicht lesbar: ${error.code ?? error.message}`
    });
    return;
  }

  for (const entry of entries) {
    const absolutePath = path.join(currentDir, entry.name);
    const relativePath = path.relative(root, absolutePath) || entry.name;

    if (entry.isDirectory()) {
      if (DEFAULT_IGNORED_DIRS.has(entry.name)) {
        ignored.push({ path: relativePath, reason: "Standard-Ignorierliste" });
        continue;
      }
      await walk(root, absolutePath, files, ignored, special, options);
      continue;
    }

    if (!entry.isFile()) {
      ignored.push({ path: relativePath, reason: "kein regulaerer Datei-Eintrag" });
      continue;
    }

    if (!options.includeLockfiles && LOCK_FILES.has(entry.name)) {
      ignored.push({ path: relativePath, reason: "Lockfile ausgeblendet" });
      continue;
    }

    const fileInfo = await inspectFile(absolutePath, relativePath);
    files.push(fileInfo);
    recordSpecialFile(fileInfo, special);
  }
}

async function inspectFile(absolutePath, relativePath) {
  const stat = await fs.stat(absolutePath);
  const extension = path.extname(relativePath).toLowerCase();

  if (BINARY_EXTENSIONS.has(extension)) {
    return {
      path: relativePath,
      kind: "binary",
      bytes: stat.size,
      lines: 0,
      estimatedTokens: 0,
      notes: ["Binaerdatei"]
    };
  }

  const readLimit = 512 * 1024;
  if (stat.size > readLimit) {
    return {
      path: relativePath,
      kind: "text",
      bytes: stat.size,
      lines: null,
      estimatedTokens: estimateTokensFromBytes(stat.size),
      notes: [`größer als ${readLimit} Bytes, per Dateigröße geschätzt`]
    };
  }

  const buffer = await fs.readFile(absolutePath);
  if (isProbablyBinary(buffer)) {
    return {
      path: relativePath,
      kind: "binary",
      bytes: stat.size,
      lines: 0,
      estimatedTokens: 0,
      notes: ["wirkt binaer"]
    };
  }

  const text = buffer.toString("utf8");
  const stats = estimateTextStats(text);
  const notes = [];
  const mcpServerCount = countMcpServers(relativePath, text);

  if (mcpServerCount > 0) {
    notes.push(`${mcpServerCount} mögliche MCP-Server-Konfiguration(en)`);
  }

  return {
    path: relativePath,
    kind: "text",
    bytes: stat.size,
    lines: stats.lines,
    estimatedTokens: stats.estimatedTokens,
    notes,
    mcpServerCount
  };
}

function isProbablyBinary(buffer) {
  if (buffer.length === 0) return false;
  const sampleLength = Math.min(buffer.length, 8000);
  let suspicious = 0;

  for (let index = 0; index < sampleLength; index += 1) {
    const byte = buffer[index];
    if (byte === 0) return true;
    if (byte < 7 || (byte > 14 && byte < 32)) suspicious += 1;
  }

  return suspicious / sampleLength > 0.03;
}

function recordSpecialFile(fileInfo, special) {
  const basename = path.basename(fileInfo.path);

  if (basename === "AGENTS.md" || basename === "AGENTS.override.md") {
    special.agents.push(fileInfo);
  }

  if (fileInfo.path === ".codex/config.toml" || fileInfo.path === ".codex/hooks.json") {
    special.codexConfigs.push(fileInfo);
  }

  if (/prompt|plan|review|agent/i.test(fileInfo.path) && fileInfo.kind === "text") {
    special.possiblePromptFiles.push(fileInfo);
  }
}

function countMcpServers(relativePath, text) {
  if (!relativePath.endsWith(".toml") && !relativePath.endsWith(".json")) return 0;

  const tomlMatches = text.match(/^\s*\[mcp_servers(?:\.|\])/gm)?.length ?? 0;
  if (tomlMatches > 0) return tomlMatches;

  const jsonMatches = text.match(/"mcpServers"\s*:/g)?.length ?? 0;
  return jsonMatches;
}
