import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { estimateTextStats, formatNumber } from "./token-estimator.mjs";

const IGNORED_DIRS = new Set([
  ".git",
  ".sparkompass",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".next",
  ".cache"
]);

const TEXT_EXTENSIONS = new Set([
  ".mjs",
  ".js",
  ".ts",
  ".tsx",
  ".jsx",
  ".py",
  ".go",
  ".rs",
  ".java",
  ".md",
  ".txt",
  ".log",
  ".json",
  ".yml",
  ".yaml",
  ".toml"
]);

export async function buildContextInventory(rootPath, options = {}) {
  const root = path.resolve(rootPath);
  const maxFiles = Number(options.maxFiles) || 300;
  const files = [];
  const units = [];

  await walk(root, root, files, maxFiles);
  const excludedFiles = normalizeExcludedFiles(root, options.excludeFiles || []);
  const visibleFiles = files.filter((file) => !excludedFiles.has(file));

  for (const file of visibleFiles) {
    const absolutePath = path.join(root, file);
    const text = await fs.readFile(absolutePath, "utf8");
    units.push(...extractUnits(file, text));
  }

  const byType = units.reduce((acc, unit) => {
    acc[unit.type] = (acc[unit.type] ?? 0) + 1;
    return acc;
  }, {});

  return {
    schema: "ContextInventoryV1",
    root,
    generated_at: new Date().toISOString(),
    totals: {
      files: visibleFiles.length,
      units: units.length,
      by_type: byType,
      estimated_tokens: units.reduce((sum, unit) => sum + unit.estimated_tokens, 0)
    },
    units
  };
}

function normalizeExcludedFiles(root, files) {
  return new Set((Array.isArray(files) ? files : [files])
    .map((file) => String(file || "").trim())
    .filter(Boolean)
    .map((file) => {
      const absolutePath = path.isAbsolute(file) ? file : path.resolve(root, file);
      const relativePath = path.relative(root, absolutePath);
      return relativePath && !relativePath.startsWith("..") ? relativePath : "";
    })
    .filter(Boolean));
}

export function formatInventoryReport(inventory) {
  const byType = Object.entries(inventory.totals.by_type)
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => `- ${type}: ${formatNumber(count)}`)
    .join("\n");
  const preview = inventory.units.slice(0, 24)
    .map((unit) => `- ${unit.id} ${unit.type} ${unit.file}:${unit.line} ${unit.name}`)
    .join("\n");

  return `
# Context Inventory

Pfad: ${inventory.root}

- Dateien: ${formatNumber(inventory.totals.files)}
- Einheiten: ${formatNumber(inventory.totals.units)}
- Geschätzte Unit-Tokens: ${formatNumber(inventory.totals.estimated_tokens)}

## Typen

${byType || "- keine Einheiten"}

## Vorschau

${preview || "- keine Einheiten"}
`.trim();
}

function extractUnits(file, text) {
  const ext = path.extname(file).toLowerCase();
  const lines = text.split(/\r\n|\r|\n/);
  const units = [];

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    const unit = extractLineUnit(file, ext, trimmed, index + 1);
    if (unit) units.push(unit);
  });

  return units;
}

function extractLineUnit(file, ext, line, lineNumber) {
  if ([".mjs", ".js", ".ts", ".tsx", ".jsx", ".py", ".go", ".rs", ".java"].includes(ext)) {
    const fn = line.match(/^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/);
    if (fn) return unit(file, "function", fn[1], lineNumber, line);

    const cls = line.match(/^(?:export\s+)?class\s+([A-Za-z_$][\w$]*)/);
    if (cls) return unit(file, "class", cls[1], lineNumber, line);

    const exported = line.match(/^export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/);
    if (exported) return unit(file, "export", exported[1], lineNumber, line);

    if (/^import\s+/.test(line)) return unit(file, "import", shorten(line), lineNumber, line);
  }

  if (ext === ".md" || ext === ".mdx") {
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) return unit(file, "heading", heading[2], lineNumber, line);
  }

  if (ext === ".log" || ext === ".txt") {
    if (/\b(error|fatal|exception|traceback|failed)\b/i.test(line)) {
      return unit(file, "log-error", shorten(line), lineNumber, line);
    }
    if (/^\s*(at\s+|File\s+")/.test(line)) {
      return unit(file, "stack-frame", shorten(line), lineNumber, line);
    }
  }

  if ([".json", ".yml", ".yaml", ".toml"].includes(ext)) {
    if (/^[\w.-]+\s*[:=]/.test(line) || /^"[\w.-]+"\s*:/.test(line)) {
      return unit(file, "config", shorten(line), lineNumber, line);
    }
  }

  return null;
}

function unit(file, type, name, line, source) {
  return {
    id: `unit-${sha256(`${file}:${line}:${type}:${name}`).slice(0, 12)}`,
    type,
    name,
    file,
    line,
    source_hash: `sha256:${sha256(source)}`,
    estimated_tokens: estimateTextStats(source).estimatedTokens
  };
}

async function walk(root, current, files, maxFiles) {
  if (files.length >= maxFiles) return;
  const entries = await fs.readdir(current, { withFileTypes: true });

  for (const entry of entries) {
    if (files.length >= maxFiles) return;
    const absolutePath = path.join(current, entry.name);
    const relativePath = path.relative(root, absolutePath);

    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      await walk(root, absolutePath, files, maxFiles);
      continue;
    }

    if (!entry.isFile()) continue;
    if (!TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
    files.push(relativePath);
  }
}

function shorten(value) {
  return value.length > 96 ? `${value.slice(0, 93)}...` : value;
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}
