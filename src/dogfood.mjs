import fs from "node:fs/promises";
import path from "node:path";
import { buildContextPack } from "./context-pack.mjs";
import { formatSavingsBar } from "./savings.mjs";
import { formatNumber } from "./token-estimator.mjs";

const DEFAULT_CASES = [
  {
    path: "README.md",
    mode: "markdown",
    keep: ["Codex", "compress", "Sparbalken"]
  },
  {
    path: "docs/strategy.md",
    mode: "markdown",
    keep: ["compress", "Sparbalken", "sparkompass-mcp"]
  },
  {
    path: "src/compressor.mjs",
    mode: "code",
    keep: ["compressText", "formatCompressionReport", "quality"]
  },
  {
    path: ".agents/skills/codex-sparkompass/SKILL.md",
    mode: "markdown",
    keep: ["codex-sparkompass", "compress", "CLI"]
  }
];

export async function runDogfood(rootPath, options = {}) {
  const root = path.resolve(rootPath);
  const targetPercent = Number(options.targetPercent) || 35;
  const minSaving = Number(options.minSaving) || 35;
  const minAnchors = Number(options.minAnchors) || 75;
  const allowRisk = Boolean(options.allowRisk);
  const results = [];

  for (const testCase of DEFAULT_CASES) {
    const absolutePath = path.join(root, testCase.path);
    try {
      const text = await fs.readFile(absolutePath, "utf8");
      results.push(buildContextPack(text, {
        label: testCase.path,
        targetPercent,
        mode: testCase.mode,
        keep: testCase.keep
      }));
    } catch (error) {
      results.push({
        label: testCase.path,
        error: error.code ?? error.message
      });
    }
  }

  const completed = results.filter((result) => !result.error);
  const averageSaving = completed.length
    ? Math.round(completed.reduce((sum, result) => sum + result.receipt.savings.delivered.percent, 0) / completed.length)
    : 0;
  const averageAnchorRetention = completed.length
    ? Math.round(completed.reduce((sum, result) => sum + result.compressed.quality.anchorRetentionPercent, 0) / completed.length)
    : 0;
  const averageCriticalRetention = completed.length
    ? Math.round(completed.reduce((sum, result) => sum + result.receipt.critical_anchors.retention_percent, 0) / completed.length)
    : 0;
  const averageSourceCoverage = completed.length
    ? Math.round(completed.reduce((sum, result) => sum + (result.receipt.source_evidence.coverage * 100), 0) / completed.length)
    : 0;
  const worstCase = buildWorstCaseSummary(completed);
  const minimumAnchorRetention = minimum(completed.map((result) => result.compressed.quality.anchorRetentionPercent));
  const minimumCriticalRetention = minimum(completed.map((result) => result.receipt.critical_anchors.retention_percent));
  const minimumSourceCoverage = minimum(completed.map((result) => Math.round(result.receipt.source_evidence.coverage * 100)));
  const p95DeliveredTokens = percentile(completed.map((result) => result.receipt.delivered_tokens), 95);
  const p95SavedTokens = percentile(completed.map((result) => result.receipt.savings.delivered.saved_tokens), 95);
  const totalDeliveredTokens = completed.reduce((sum, result) => sum + result.receipt.delivered_tokens, 0);
  const risky = completed.filter((result) => result.compressed.quality.status === "riskant");
  const expandedContexts = completed.filter((result) => result.context.mode === "expanded-context");
  const fullFallbacks = completed.filter((result) => result.context.mode === "full-context");
  const publishable = (
    completed.length === results.length
    && averageSaving >= minSaving
    && minimumAnchorRetention >= minAnchors
    && minimumCriticalRetention === 100
    && minimumSourceCoverage === 100
    && fullFallbacks.length === 0
    && (allowRisk || risky.length === 0)
  );
  const failures = [];

  if (completed.length !== results.length) {
    failures.push("Nicht alle Dogfood-Dateien konnten gelesen werden.");
  }
  if (averageSaving < minSaving) {
    failures.push(`Durchschnittliche Ersparnis ${averageSaving}% liegt unter Minimum ${minSaving}%.`);
  }
  if (minimumAnchorRetention < minAnchors) {
    failures.push(`Schlechteste Anker-Erhaltung ${minimumAnchorRetention}% liegt unter Minimum ${minAnchors}%.`);
  }
  if (minimumCriticalRetention < 100) {
    failures.push(`Schlechteste kritische Anker-Erhaltung ${minimumCriticalRetention}% liegt unter 100%.`);
  }
  if (minimumSourceCoverage < 100) {
    failures.push(`Schlechteste Quellbeleg-Abdeckung ${minimumSourceCoverage}% liegt unter 100%.`);
  }
  if (fullFallbacks.length > 0) {
    failures.push(`${fullFallbacks.length} Vollkontext-Fallback(s) im Dogfood gefunden.`);
  }
  if (!allowRisk && risky.length > 0) {
    failures.push(`${risky.length} riskante Verdichtung(en) gefunden.`);
  }

  return {
    root,
    targetPercent,
    gate: {
      publishable,
      minSaving,
      minAnchors,
      allowRisk,
      failures
    },
    totals: {
      cases: results.length,
      completed: completed.length,
      failed: results.length - completed.length,
      averageSaving,
      averageAnchorRetention,
      averageCriticalRetention,
      averageSourceCoverage,
      minimumAnchorRetention,
      minimumCriticalRetention,
      minimumSourceCoverage,
      p95DeliveredTokens,
      p95SavedTokens,
      totalDeliveredTokens,
      expandedContexts: expandedContexts.length,
      fallbacks: fullFallbacks.length,
      risky: risky.length,
      worstCase
    },
    results
  };
}

export function formatDogfoodReport(report) {
  const rows = report.results.map((result) => {
    if (result.error) {
      return `- ${result.label}: nicht gelesen (${result.error})`;
    }

    return `- ${result.label}: ${result.compressed.quality.status}, ${result.receipt.gate.status}, ${formatSavingsBar(toDeliveredSavings(result.receipt))}, kritische Anker ${result.receipt.critical_anchors.retained}/${result.receipt.critical_anchors.total}, Belege ${Math.round(result.receipt.source_evidence.coverage * 100)}%`;
  }).join("\n");

  return `
# Sparkompass Dogfood

Pfad: ${report.root}
Zielgröße: ca. ${report.targetPercent}% der Ausgangsgröße

- Fälle: ${formatNumber(report.totals.completed)}/${formatNumber(report.totals.cases)} erfolgreich gelesen
- Durchschnittliche Ersparnis: ${report.totals.averageSaving}%
- Durchschnittliche Anker-Erhaltung: ${report.totals.averageAnchorRetention}%
- Schlechteste Anker-Erhaltung: ${report.totals.minimumAnchorRetention}%
- Kritische Anker-Erhaltung: ${report.totals.minimumCriticalRetention}%
- Quellbeleg-Abdeckung: ${report.totals.minimumSourceCoverage}%
- Schlechtester Einzelfall: ${formatWorstCase(report.totals.worstCase)}
- p95 gelieferte Tokens: ${formatNumber(report.totals.p95DeliveredTokens)}
- p95 gesparte Tokens: ${formatNumber(report.totals.p95SavedTokens)}
- Erweiterte ContextPacks: ${formatNumber(report.totals.expandedContexts)}
- Vollkontext-Fallbacks: ${formatNumber(report.totals.fallbacks)}
- Riskante Verdichtungen: ${formatNumber(report.totals.risky)}
- Gate: ${report.gate.publishable ? "verified-publishable" : "nicht verified-publishable"}
${formatGateFailures(report.gate.failures)}

## Fälle

${rows}

Hinweis: Riskant heißt nicht blockiert. Es heißt: Ausgabe vorhanden, aber vor Nutzung kurz gegen das Original prüfen.
`.trim();
}

function formatGateFailures(failures) {
  if (!failures.length) return "- Gate-Probleme: keine";
  return `- Gate-Probleme:\n${failures.map((failure) => `  - ${failure}`).join("\n")}`;
}

function buildWorstCaseSummary(completed) {
  if (!completed.length) {
    return {
      label: "",
      savingsPercent: 0,
      anchorRetentionPercent: 0,
      criticalAnchorRetentionPercent: 0,
      sourceEvidenceCoveragePercent: 0,
      deliveredTokens: 0,
      qualityStatus: "unknown",
      fallbackUsed: false
    };
  }

  const lowestSavings = completed.reduce((worst, result) => (
    result.receipt.savings.delivered.percent < worst.receipt.savings.delivered.percent ? result : worst
  ), completed[0]);

  return {
    label: lowestSavings.label,
    savingsPercent: lowestSavings.receipt.savings.delivered.percent,
    anchorRetentionPercent: lowestSavings.compressed.quality.anchorRetentionPercent,
    criticalAnchorRetentionPercent: lowestSavings.receipt.critical_anchors.retention_percent,
    sourceEvidenceCoveragePercent: Math.round(lowestSavings.receipt.source_evidence.coverage * 100),
    deliveredTokens: lowestSavings.receipt.delivered_tokens,
    qualityStatus: lowestSavings.compressed.quality.status,
    fallbackUsed: lowestSavings.fallbackUsed
  };
}

function toDeliveredSavings(receipt) {
  return {
    originalTokens: receipt.original_tokens,
    compactTokens: receipt.delivered_tokens,
    savedTokens: receipt.savings.delivered.saved_tokens,
    percent: receipt.savings.delivered.percent
  };
}

function formatWorstCase(worstCase) {
  if (!worstCase?.label) return "keiner";
  return `${worstCase.label}, ${worstCase.savingsPercent}% gespart, ${worstCase.anchorRetentionPercent}% Anker, ${formatNumber(worstCase.deliveredTokens)} Tokens geliefert`;
}

function minimum(values) {
  const finite = values.filter((value) => Number.isFinite(value));
  return finite.length ? Math.min(...finite) : 0;
}

function percentile(values, rank) {
  const sorted = values
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);

  if (!sorted.length) return 0;

  const index = Math.ceil((rank / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
}
