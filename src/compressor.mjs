import { createHash } from "node:crypto";
import { calculateSavings, formatSavingsBar } from "./savings.mjs";
import { estimateTextStats, formatNumber } from "./token-estimator.mjs";

const DEFAULT_TARGET_PERCENT = 35;
const PATH_PATTERN = /\b(?:[\w.-]+\/)+[\w.-]+\.(?:mjs|js|ts|tsx|jsx|py|go|rs|java|json|md|yml|yaml|toml|log|txt)\b/g;
const CODE_PATTERN = /\b[A-Z][A-Z0-9_]{3,}\b/g;
const CLI_OPTION_PATTERN = /--[a-z0-9][a-z0-9-]*/ig;
const QUOTED_PATTERN = /"([^"\n]{4,120})"|'([^'\n]{4,120})'|`([^`\n]{4,120})`/g;
const IGNORED_CODE_ANCHORS = new Set(["DEBUG", "ERROR", "FATAL", "INFO", "NOTICE", "TRACE", "WARN", "WARNING"]);
const CRITICAL_CLI_OPTIONS = new Set([
  "--dangerously",
  "--delete",
  "--force",
  "--hard",
  "--no-preserve-root",
  "--no-verify",
  "--prod",
  "--production",
  "--reset",
  "--unsafe",
  "--yes"
]);

export function compressText(input, options = {}) {
  const targetPercent = clamp(Number(options.targetPercent) || DEFAULT_TARGET_PERCENT, 10, 90);
  const label = options.label || "Eingabe";
  const keepTerms = asArray(options.keep).map(cleanInline).filter(Boolean);
  const normalized = normalizeText(input);
  const originalStats = estimateTextStats(normalized);
  const mode = options.mode && options.mode !== "auto"
    ? String(options.mode)
    : detectMode(normalized, label);

  if (!normalized) {
    return {
      label,
      mode,
      targetPercent,
      keepTerms,
      original: originalStats,
      compact: originalStats,
      savings: calculateSavings(0, 0),
      quality: buildQualityReport({
        original: "",
        compact: "",
        lines: [],
        selectedIndexes: new Set(),
        protectedIndexes: new Set(),
        keepTerms,
        targetTokens: 0,
        compactTokens: 0
      }),
      text: ""
    };
  }

  const targetTokens = Math.max(24, Math.ceil(originalStats.estimatedTokens * (targetPercent / 100)));
  const lines = normalized.split("\n");
  const protectedIndexes = findProtectedLineIndexes(lines, keepTerms, mode);
  const { selectedLines, selectedIndexes, selectedEntries } = selectImportantLines(lines, targetTokens, {
    keepTerms,
    mode,
    protectedIndexes
  });
  const selected = selectedLines;
  const compactText = selected.join("\n").trim();
  const compactStats = estimateTextStats(compactText);

  return {
    label,
    mode,
    targetPercent,
    keepTerms,
    original: originalStats,
    compact: compactStats,
    savings: calculateSavings(originalStats.estimatedTokens, compactStats.estimatedTokens),
    quality: buildQualityReport({
      original: normalized,
      compact: compactText,
      lines,
      selectedIndexes,
      selectedEntries,
      protectedIndexes,
      keepTerms,
      targetTokens,
      compactTokens: compactStats.estimatedTokens
    }),
    text: compactText
  };
}

export function formatCompressionReport(result) {
  return `
# Sparkompass Kompression

Quelle: ${result.label}
Modus: ${result.mode}
Zielgröße: ca. ${result.targetPercent}% der Ausgangsgröße
Ausgang: ca. ${formatNumber(result.original.estimatedTokens)} Tokens
Kompakt: ca. ${formatNumber(result.compact.estimatedTokens)} Tokens
Sparbalken: ${formatSavingsBar(result.savings)}

## Prüfung

- Ergebnis: ausgegeben, nicht blockiert
- Qualität: ${result.quality.status}
- Kritische Anker behalten: ${result.quality.retainedCriticalAnchors}/${result.quality.criticalAnchors} (${result.quality.criticalAnchorRetentionPercent}%)
${formatAnchorClassBreakdown(result.quality.criticalAnchorClasses)}
- Informative Anker behalten: ${result.quality.retainedInformativeAnchors}/${result.quality.informativeAnchors} (${result.quality.informativeAnchorRetentionPercent}%)
- Anker gesamt behalten: ${result.quality.retainedAnchors}/${result.quality.totalAnchors} (${result.quality.anchorRetentionPercent}%)
- Geschützte Zeilen behalten: ${result.quality.retainedProtectedLines}/${result.quality.protectedLines}
- Quellbeleg-Abdeckung: ${result.quality.sourceCoveragePercent}%
${formatWarnings(result.quality.warnings)}

## Kompakte Fassung

\`\`\`text
${result.text}
\`\`\`

Hinweis: Das ist eine heuristische Verdichtung vor dem Prompt, keine verlustfreie Kompression und keine offizielle Abrechnung.
`.trim();
}

function normalizeText(input) {
  return String(input ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .trim();
}

function selectImportantLines(lines, targetTokens, options) {
  const scored = lines.map((line, index) => ({
    index,
    line,
    score: scoreLine(line, index, options)
  }));

  const selectedIndexes = new Set();
  let tokens = 0;

  for (const item of scored.filter((entry) => options.protectedIndexes.has(entry.index))) {
    const lineTokens = estimateTextStats(item.line).estimatedTokens;
    selectedIndexes.add(item.index);
    tokens += lineTokens;
  }

  for (const item of [...scored].sort((a, b) => b.score - a.score || a.index - b.index)) {
    if (selectedIndexes.has(item.index)) continue;
    if (!item.line.trim()) continue;
    const lineTokens = estimateTextStats(item.line).estimatedTokens;
    if (tokens + lineTokens > targetTokens && selectedIndexes.size > 0) continue;
    selectedIndexes.add(item.index);
    tokens += lineTokens;
    if (tokens >= targetTokens) break;
  }

  const selectedEntries = [...selectedIndexes]
    .sort((a, b) => a - b)
    .map((index) => ({ index, line: lines[index] }))
    .filter((entry, index, selectedEntries) => !(entry.line.trim() === "" && selectedEntries[index - 1]?.line.trim() === ""));

  return {
    selectedLines: selectedEntries.map((entry) => entry.line),
    selectedIndexes,
    selectedEntries
  };
}

function scoreLine(line, index, options = {}) {
  const trimmed = line.trim();
  if (!trimmed) return 0;

  let score = Math.max(1, 6 - Math.floor(index / 80));
  if (options.protectedIndexes?.has(index)) score += 100;
  if (containsAny(trimmed, options.keepTerms ?? [])) score += 60;
  if (/^#{1,6}\s+/.test(trimmed)) score += 14;
  if (/`[^`]+`/.test(trimmed)) score += 10;
  if (/\s--[a-z0-9-]+/i.test(trimmed)) score += 8;
  if (/^[-*+]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed)) score += 8;
  if (/^(export\s+)?(async\s+)?function\s+|^(export\s+)?class\s+|^export\s+const\s+/.test(trimmed)) score += 12;
  if (/^(import|from)\s+/.test(trimmed)) score += 4;
  if (/\b(TODO|FIXME|BUG|error|failed|exception|warn|security|secret)\b/i.test(trimmed)) score += 12;
  if (/\b(Ziel|Done|Kontext|Grenzen|Tests?|Fehler|Problem|Ursache)\b/i.test(trimmed)) score += 10;
  if (PATH_PATTERN.test(trimmed)) score += 10;
  PATH_PATTERN.lastIndex = 0;
  if (hasCodeAnchor(trimmed)) score += 8;
  if (/^\s*(at\s+|File\s+")/.test(line)) score += 10;
  if (/^\d{4}-\d{2}-\d{2}|^\[\d{2}:\d{2}:\d{2}/.test(trimmed)) score += 5;
  if (options.mode === "log" && /\b(error|warn|fatal|trace|stack|caused by)\b/i.test(trimmed)) score += 10;
  if (options.mode === "code" && /^(const|let|var|if|for|while|return|throw)\b/.test(trimmed)) score += 4;
  if (trimmed.length > 180) score -= 5;
  if (/^[{}[\],;]+$/.test(trimmed)) score -= 4;

  return score;
}

function findProtectedLineIndexes(lines, keepTerms, mode) {
  const protectedIndexes = new Set();

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    if (containsAny(trimmed, keepTerms)) protectedIndexes.add(index);
    if (/^#{1,6}\s+/.test(trimmed)) protectedIndexes.add(index);
    if (mode === "markdown" && /`[^`]+`/.test(trimmed)) protectedIndexes.add(index);
    if (mode === "markdown" && hasCliOption(trimmed)) protectedIndexes.add(index);
    if (/\b(error|failed|exception|fatal|panic|traceback|stack trace)\b/i.test(trimmed)) protectedIndexes.add(index);
    if (/\b(TODO|FIXME|BUG|SECURITY|SECRET)\b/.test(trimmed)) protectedIndexes.add(index);
    if (hasCriticalCliOption(trimmed)) protectedIndexes.add(index);
    if (/\b(Done when|Ziel|Problem|Ursache|Fehler|Grenzen)\b/i.test(trimmed)) protectedIndexes.add(index);
    if (PATH_PATTERN.test(trimmed)) protectedIndexes.add(index);
    PATH_PATTERN.lastIndex = 0;
    if (hasCodeAnchor(trimmed)) protectedIndexes.add(index);
    if (mode === "code" && /^(export\s+)?(async\s+)?function\s+|^(export\s+)?class\s+|^export\s+const\s+/.test(trimmed)) {
      protectedIndexes.add(index);
    }
    if (mode === "code" && /^(import|export)\b/.test(trimmed)) protectedIndexes.add(index);
    if (mode === "code" && /\b(warnings\.push|throw new|console\.|Error\()/.test(trimmed)) protectedIndexes.add(index);
  });

  return protectedIndexes;
}

function buildQualityReport({ original, compact, lines, selectedIndexes, selectedEntries = [], protectedIndexes, keepTerms, targetTokens, compactTokens }) {
  const anchorSet = extractAnchors(original, keepTerms);
  const criticalAnchors = anchorSet.filter((anchor) => anchor.critical);
  const informativeAnchors = anchorSet.filter((anchor) => !anchor.critical);
  const retainedAnchors = anchorSet.filter((anchor) => compact.includes(anchor.value));
  const retainedCriticalAnchors = criticalAnchors.filter((anchor) => compact.includes(anchor.value));
  const retainedInformativeAnchors = informativeAnchors.filter((anchor) => compact.includes(anchor.value));
  const anchorClasses = buildAnchorClassBreakdown(anchorSet, compact);
  const criticalAnchorClasses = buildAnchorClassBreakdown(criticalAnchors, compact);
  const missingKeepTerms = keepTerms.filter((term) => !compact.toLowerCase().includes(term.toLowerCase()));
  const retainedProtectedLines = [...protectedIndexes]
    .filter((index) => selectedIndexes.has(index))
    .length;
  const anchorRetentionPercent = anchorSet.length
    ? Math.round((retainedAnchors.length / anchorSet.length) * 100)
    : 100;
  const criticalAnchorRetentionPercent = criticalAnchors.length
    ? Math.round((retainedCriticalAnchors.length / criticalAnchors.length) * 100)
    : 100;
  const informativeAnchorRetentionPercent = informativeAnchors.length
    ? Math.round((retainedInformativeAnchors.length / informativeAnchors.length) * 100)
    : 100;
  const protectedRetentionPercent = protectedIndexes.size
    ? Math.round((retainedProtectedLines / protectedIndexes.size) * 100)
    : 100;
  const warnings = [];

  if (missingKeepTerms.length) {
    warnings.push(`Keep-Begriffe fehlen: ${missingKeepTerms.join(", ")}`);
  }
  if (criticalAnchorRetentionPercent < 100) {
    warnings.push("Kritische Anker fehlen. Verdichtung darf nicht freigegeben werden.");
  }
  if (compactTokens > targetTokens && targetTokens > 0) {
    warnings.push("Zielgröße überschritten, weil geschützte Inhalte erhalten wurden.");
  }
  if (anchorRetentionPercent < 75) {
    warnings.push("Viele erkannte Anker fehlen. Für kritische Aufgaben Original prüfen.");
  }
  if (protectedRetentionPercent < 100) {
    warnings.push("Nicht alle geschützten Zeilen wurden erhalten.");
  }

  return {
    status: classifyQuality(anchorRetentionPercent, protectedRetentionPercent, missingKeepTerms.length, criticalAnchorRetentionPercent),
    totalAnchors: anchorSet.length,
    retainedAnchors: retainedAnchors.length,
    missingAnchors: anchorSet.filter((anchor) => !compact.includes(anchor.value)).map((anchor) => anchor.value).slice(0, 12),
    anchorRetentionPercent,
    criticalAnchors: criticalAnchors.length,
    retainedCriticalAnchors: retainedCriticalAnchors.length,
    missingCriticalAnchors: criticalAnchors.filter((anchor) => !compact.includes(anchor.value)).map((anchor) => anchor.value),
    criticalAnchorRetentionPercent,
    criticalAnchorClasses,
    informativeAnchors: informativeAnchors.length,
    retainedInformativeAnchors: retainedInformativeAnchors.length,
    informativeAnchorRetentionPercent,
    anchorClasses,
    protectedLines: protectedIndexes.size,
    retainedProtectedLines,
    protectedRetentionPercent,
    sourceEvidence: buildSourceEvidence(selectedEntries),
    sourceCoveragePercent: selectedEntries.length ? 100 : (compact ? 0 : 100),
    targetExceeded: compactTokens > targetTokens && targetTokens > 0,
    inputLines: lines.length,
    outputLines: compact ? compact.split("\n").length : 0,
    warnings
  };
}

function classifyQuality(anchorRetentionPercent, protectedRetentionPercent, missingKeepCount, criticalAnchorRetentionPercent) {
  if (missingKeepCount > 0) return "riskant";
  if (criticalAnchorRetentionPercent < 100) return "riskant";
  if (protectedRetentionPercent < 100) return "riskant";
  if (anchorRetentionPercent >= 85) return "gut";
  if (anchorRetentionPercent >= 65) return "ok";
  return "riskant";
}

function extractAnchors(text, keepTerms) {
  const anchors = new Map();
  for (const keepTerm of keepTerms) {
    addAnchor(anchors, keepTerm, "keep", true);
  }
  for (const match of text.matchAll(PATH_PATTERN)) addAnchor(anchors, match[0], "path", true);
  PATH_PATTERN.lastIndex = 0;
  for (const match of text.matchAll(CLI_OPTION_PATTERN)) {
    addAnchor(anchors, match[0], "cli-option", isCriticalCliOption(match[0]));
  }
  CLI_OPTION_PATTERN.lastIndex = 0;
  for (const match of text.matchAll(CODE_PATTERN)) {
    if (isCodeAnchor(match[0])) addAnchor(anchors, match[0], isErrorCodeAnchor(match[0]) ? "error-code" : "code", true);
  }
  CODE_PATTERN.lastIndex = 0;
  for (const match of text.matchAll(QUOTED_PATTERN)) {
    const quoted = match[1] ?? match[2] ?? match[3];
    if (isMeaningfulAnchor(quoted)) {
      addAnchor(anchors, quoted, "quoted", false);
    }
  }

  return [...anchors.values()]
    .map((anchor) => ({ ...anchor, value: cleanInline(anchor.value) }))
    .filter((anchor) => anchor.value.length >= 3)
    .slice(0, 80);
}

function addAnchor(anchors, value, source, critical) {
  const normalized = cleanInline(value);
  if (!normalized) return;
  const existing = anchors.get(normalized);
  if (existing) {
    existing.critical = existing.critical || critical;
    if (!existing.sources.includes(source)) existing.sources.push(source);
    return;
  }
  anchors.set(normalized, {
    value: normalized,
    critical,
    sources: [source]
  });
}

function buildAnchorClassBreakdown(anchors, compact) {
  const classes = new Map();

  for (const anchor of anchors) {
    for (const source of anchor.sources) {
      const current = classes.get(source) || {
        class: source,
        total: 0,
        retained: 0,
        missing: []
      };
      current.total += 1;
      if (compact.includes(anchor.value)) {
        current.retained += 1;
      } else {
        current.missing.push(anchor.value);
      }
      classes.set(source, current);
    }
  }

  return [...classes.values()]
    .map((entry) => ({
      schema: "CriticalAnchorClassV1",
      class: entry.class,
      total: entry.total,
      retained: entry.retained,
      missing: entry.missing.slice(0, 12),
      retention_percent: entry.total ? Math.round((entry.retained / entry.total) * 100) : 100
    }))
    .sort(compareAnchorClasses);
}

function buildSourceEvidence(selectedEntries) {
  return selectedEntries.map((entry, outputIndex) => ({
    evidence_id: `ev-${String(outputIndex + 1).padStart(4, "0")}`,
    output_line: outputIndex + 1,
    source_line: entry.index + 1,
    source_hash: `sha256:${sha256(entry.line)}`,
    compression_type: "extractive",
    text: entry.line
  }));
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function isMeaningfulAnchor(value) {
  const anchor = cleanInline(value);
  if (anchor.length < 3) return false;
  if (PATH_PATTERN.test(anchor)) {
    PATH_PATTERN.lastIndex = 0;
    return true;
  }
  PATH_PATTERN.lastIndex = 0;
  if (hasCodeAnchor(anchor)) {
    return true;
  }
  if (/--[a-z0-9-]+/i.test(anchor)) return true;
  if (/\b(Sparbalken|Qualität|Dogfood|Codex|MCP|CLI|AGENTS\.md)\b/i.test(anchor)) return true;
  return false;
}

function detectMode(text, label) {
  const lowerLabel = label.toLowerCase();
  if (/\.(mjs|js|ts|tsx|jsx|py|go|rs|java)$/.test(lowerLabel)) return "code";
  if (/\.(log|out|err)$/.test(lowerLabel)) return "log";
  if (/\.(md|mdx)$/.test(lowerLabel)) return "markdown";
  if (/^\s*#{1,6}\s+/m.test(text)) return "markdown";
  if (/\b(error|warn|fatal|traceback|stack trace)\b/i.test(text)) return "log";
  if (/\b(export function|class |import .* from)\b/.test(text)) return "code";
  return "text";
}

function formatWarnings(warnings) {
  if (!warnings.length) return "- Warnungen: keine";
  return `- Warnungen:\n${warnings.map((warning) => `  - ${warning}`).join("\n")}`;
}

function formatAnchorClassBreakdown(classes = []) {
  if (!classes.length) return "- Kritische Ankerklassen: keine";
  return [
    "- Kritische Ankerklassen:",
    ...classes.map((entry) => (
      `  - ${entry.class}: ${entry.retained}/${entry.total} (${entry.retention_percent}%)`
    ))
  ].join("\n");
}

function asArray(value) {
  if (value === undefined || value === "") return [];
  return Array.isArray(value) ? value : [value];
}

function cleanInline(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function containsAny(value, terms) {
  const lower = value.toLowerCase();
  return terms.some((term) => lower.includes(term.toLowerCase()));
}

function hasCodeAnchor(value) {
  for (const match of String(value ?? "").matchAll(CODE_PATTERN)) {
    if (isCodeAnchor(match[0])) return true;
  }
  return false;
}

function hasCriticalCliOption(value) {
  for (const match of String(value ?? "").matchAll(CLI_OPTION_PATTERN)) {
    if (isCriticalCliOption(match[0])) {
      CLI_OPTION_PATTERN.lastIndex = 0;
      return true;
    }
  }
  CLI_OPTION_PATTERN.lastIndex = 0;
  return false;
}

function hasCliOption(value) {
  const matched = CLI_OPTION_PATTERN.test(String(value ?? ""));
  CLI_OPTION_PATTERN.lastIndex = 0;
  return matched;
}

function isCriticalCliOption(value) {
  return CRITICAL_CLI_OPTIONS.has(String(value ?? "").toLowerCase());
}

function isCodeAnchor(value) {
  return !IGNORED_CODE_ANCHORS.has(String(value ?? "").toUpperCase());
}

function isErrorCodeAnchor(value) {
  const normalized = String(value ?? "");
  return normalized.includes("_") || /^E[A-Z0-9]+/.test(normalized) || /^ERR[A-Z0-9]+/.test(normalized);
}

function compareAnchorClasses(left, right) {
  const order = ["keep", "error-code", "path", "cli-option", "code", "quoted"];
  return order.indexOf(left.class) - order.indexOf(right.class) || left.class.localeCompare(right.class);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
