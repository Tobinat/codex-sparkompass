import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { buildContextInventory } from "./inventory.mjs";
import { formatNumber } from "./token-estimator.mjs";

export async function loadSourceByHash(rootPath, options = {}) {
  const root = path.resolve(rootPath || ".");
  const requestedSourceHash = normalizeHash(options.sourceHash || options.source_hash || "");
  const requestedFileHash = normalizeHash(options.fileHash || options.file_hash || "");
  const contextLines = clampInteger(options.contextLines, 6, 0, 80);
  const maxMatches = clampInteger(options.maxMatches, 5, 1, 50);
  const maxFiles = clampInteger(options.maxFiles, 300, 1, 2000);
  const fileFilter = options.file ? normalizeFile(root, String(options.file)) : "";

  if (!requestedSourceHash && !requestedFileHash) {
    throw new Error("Provide sourceHash or fileHash.");
  }

  const inventory = await buildContextInventory(root, { maxFiles });
  const candidates = await findCandidates(root, inventory, {
    requestedSourceHash,
    requestedFileHash,
    fileFilter
  });
  const selected = candidates.slice(0, maxMatches);
  const matches = [];

  for (const candidate of selected) {
    matches.push(await buildSourceHashMatch(root, candidate, {
      requestedSourceHash,
      requestedFileHash,
      contextLines
    }));
  }

  const verified = matches.length > 0
    && matches.every((match) => (
      (requestedSourceHash ? match.source_hash_match === true : true)
      && (requestedFileHash ? match.file_hash_match === true : true)
    ));

  return {
    schema: "SourceHashEvidenceV1",
    evidence_id: `source-hash-${sha256([
      root,
      requestedSourceHash,
      requestedFileHash,
      fileFilter,
      matches.map((match) => match.evidence_id).join("|")
    ].join("|")).slice(0, 12)}`,
    root,
    requested: {
      source_hash: requestedSourceHash || null,
      file_hash: requestedFileHash || null,
      file: fileFilter || null,
      context_lines: contextLines,
      max_matches: maxMatches,
      max_files: maxFiles
    },
    gate: {
      status: verified ? "verified-source-hash-evidence" : "source-hash-not-found",
      verified,
      reasons: verified ? [] : buildFailureReasons({ requestedSourceHash, requestedFileHash, fileFilter, matches })
    },
    inventory: {
      generated_at: inventory.generated_at,
      files: inventory.totals.files,
      units: inventory.totals.units
    },
    totals: {
      matches: matches.length,
      candidate_matches: candidates.length,
      truncated: candidates.length > matches.length
    },
    matches,
    next_actions: buildNextActions(verified, { requestedSourceHash, requestedFileHash })
  };
}

export function formatSourceHashEvidenceReport(evidence) {
  const matchLines = evidence.matches.map((match) => (
    `- ${match.file}:${match.line} ${match.unit?.id || "file"} source=${formatBool(match.source_hash_match)} file=${formatBool(match.file_hash_match)}`
  )).join("\n");
  const excerpts = evidence.matches.slice(0, 5).map((match) => `
### ${match.file}:${match.line}

\`\`\`text
${match.text}
\`\`\`
`.trim()).join("\n\n");

  return `
# SourceHashEvidenceV1

Gate: ${evidence.gate.status}
Pfad: ${evidence.root}

- Source-Hash: ${evidence.requested.source_hash || "nicht angefragt"}
- File-Hash: ${evidence.requested.file_hash || "nicht angefragt"}
- Treffer: ${formatNumber(evidence.totals.matches)}/${formatNumber(evidence.totals.candidate_matches)}
- Gekürzt: ${evidence.totals.truncated ? "ja" : "nein"}

## Treffer

${matchLines || "- keine"}

## Auszüge

${excerpts || "- keine"}

## Nächste Schritte

${evidence.next_actions.map((action) => `- ${action}`).join("\n")}
`.trim();
}

async function findCandidates(root, inventory, options) {
  const { requestedSourceHash, requestedFileHash, fileFilter } = options;
  const byUnit = new Map();

  if (requestedSourceHash) {
    for (const unit of inventory.units) {
      if (unit.source_hash !== requestedSourceHash) continue;
      if (fileFilter && unit.file !== fileFilter) continue;
      byUnit.set(candidateKey(unit.file, unit.line, unit.id), { file: unit.file, line: unit.line, unit });
    }
  }

  if (requestedFileHash) {
    const unitsByFile = groupUnitsByFile(inventory.units, fileFilter);
    if (fileFilter && !unitsByFile.has(fileFilter)) {
      unitsByFile.set(fileFilter, []);
    }

    for (const [file, units] of unitsByFile.entries()) {
      const text = await readInsideRoot(root, file);
      const actualFileHash = `sha256:${sha256(text)}`;
      if (actualFileHash !== requestedFileHash) continue;

      const fileUnits = units.length ? units : [{ file, line: 1, id: null }];
      for (const unit of fileUnits) {
        if (requestedSourceHash && unit.source_hash !== requestedSourceHash) continue;
        byUnit.set(candidateKey(file, unit.line, unit.id), {
          file,
          line: unit.line,
          unit: unit.id ? unit : null
        });
      }
    }
  }

  return [...byUnit.values()].sort((a, b) => (
    a.file.localeCompare(b.file) || a.line - b.line
  ));
}

async function buildSourceHashMatch(root, candidate, options) {
  const { requestedSourceHash, requestedFileHash, contextLines } = options;
  const text = await readInsideRoot(root, candidate.file);
  const lines = text.split(/\r\n|\r|\n/);
  const targetLine = Math.min(Math.max(1, candidate.line), lines.length || 1);
  const start = Math.max(1, targetLine - contextLines);
  const end = Math.min(lines.length, targetLine + contextLines);
  const numberedText = lines.slice(start - 1, end)
    .map((value, index) => `${String(start + index).padStart(4, " ")} | ${value}`)
    .join("\n");
  const targetSource = lines[targetLine - 1] ?? "";
  const targetSourceHash = `sha256:${sha256(targetSource.trim())}`;
  const fileHash = `sha256:${sha256(text)}`;

  return {
    schema: "SourceHashMatchV1",
    evidence_id: `src-${sha256(`${candidate.file}:${start}:${end}:${numberedText}`).slice(0, 12)}`,
    file: candidate.file,
    line: targetLine,
    line_start: start,
    line_end: end,
    unit: candidate.unit,
    source_hash: targetSourceHash,
    requested_source_hash: requestedSourceHash || null,
    source_hash_match: requestedSourceHash ? targetSourceHash === requestedSourceHash : null,
    file_hash: fileHash,
    requested_file_hash: requestedFileHash || null,
    file_hash_match: requestedFileHash ? fileHash === requestedFileHash : null,
    excerpt_hash: `sha256:${sha256(numberedText)}`,
    text: numberedText
  };
}

function groupUnitsByFile(units, fileFilter) {
  const grouped = new Map();
  for (const unit of units) {
    if (fileFilter && unit.file !== fileFilter) continue;
    if (!grouped.has(unit.file)) grouped.set(unit.file, []);
    grouped.get(unit.file).push(unit);
  }
  return grouped;
}

function buildFailureReasons({ requestedSourceHash, requestedFileHash, fileFilter, matches }) {
  const reasons = [];
  if (!matches.length) reasons.push("hash-not-found");
  if (requestedSourceHash && matches.some((match) => match.source_hash_match === false)) {
    reasons.push("source-hash-mismatch");
  }
  if (requestedFileHash && matches.some((match) => match.file_hash_match === false)) {
    reasons.push("file-hash-mismatch");
  }
  if (fileFilter && !matches.length) reasons.push("file-filter-no-match");
  return [...new Set(reasons)];
}

function buildNextActions(verified, { requestedSourceHash, requestedFileHash }) {
  if (verified) {
    return [
      "Nutze diese begrenzten Auszüge als On-Demand-Beleg statt die ganze Datei in den Startkontext zu legen."
    ];
  }
  if (requestedSourceHash) {
    return [
      "Baue das Inventar oder den ContextPlan gegen den aktuellen Arbeitsbaum neu; der angefragte source_hash wurde nicht gefunden."
    ];
  }
  if (requestedFileHash) {
    return [
      "Prüfe, ob die Datei seit dem Receipt verändert wurde oder ob ein engerer --file Filter nötig ist."
    ];
  }
  return ["Gib sourceHash oder fileHash an."];
}

function normalizeFile(root, file) {
  const absolute = path.isAbsolute(file) ? file : path.resolve(root, file);
  const relative = path.relative(root, absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Source path escapes root: ${file}`);
  }
  return relative;
}

async function readInsideRoot(root, file) {
  const relative = normalizeFile(root, file);
  return fs.readFile(path.join(root, relative), "utf8");
}

function normalizeHash(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^sha256:[a-f0-9]{64}$/i.test(text)) return `sha256:${text.slice(7).toLowerCase()}`;
  if (/^[a-f0-9]{64}$/i.test(text)) return `sha256:${text.toLowerCase()}`;
  return text;
}

function formatBool(value) {
  if (value === null) return "n/a";
  return value ? "ok" : "mismatch";
}

function candidateKey(file, line, id) {
  return `${file}:${line}:${id || "file"}`;
}

function clampInteger(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(number)));
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}
