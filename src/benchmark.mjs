import fs from "node:fs/promises";
import path from "node:path";
import { buildAcceptanceOracle, buildCounterfactualChecks, evaluateAcceptanceOracle } from "./acceptance-oracle.mjs";
import { buildContextPack } from "./context-pack.mjs";
import { buildTaskOutcomeReceipt } from "./task-outcome.mjs";
import { formatNumber } from "./token-estimator.mjs";

const REQUIRED_FAILURE_CORPUS_CLASSES = [
  { id: "negation-flag", label: "Negation und Flags" },
  { id: "version-priority", label: "Version, Zahl und Priorität" },
  { id: "stacktrace-cutoff", label: "Stacktrace-Abbruch" },
  { id: "same-symbols", label: "Gleichnamige Symbole" },
  { id: "security-dataflow", label: "Sicherheits-Datenfluss" },
  { id: "dynamic-import", label: "Dynamischer Import" },
  { id: "monorepo-dependency", label: "Monorepo-Abhängigkeit" }
];

const BENCHMARK_CASES = [
  {
    id: "log-auth-reset",
    category: "baseline",
    file: "test/fixtures/error-log.txt",
    mode: "log",
    source: `2026-06-23T12:00:01Z INFO starting auth flow for user 42
2026-06-23T12:00:02Z INFO loading src/auth/session.ts
2026-06-23T12:00:03Z WARN retrying password reset callback
2026-06-23T12:00:04Z ERROR AUTH_RESET_TOKEN_EXPIRED reset token expired immediately after password reset
Stack trace:
  at validateResetToken (src/auth/session.ts:44:11)
  at completePasswordReset (src/auth/reset.ts:88:7)
  at POST /api/auth/reset
Expected:
- User can log in after a successful password reset.
- Done when: Auth reset test passes.
Noise:
Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
Repeated noise line that should not survive compression.
Repeated noise line that should not survive compression.
Repeated noise line that should not survive compression.
Repeated noise line that should not survive compression.
Repeated noise line that should not survive compression.`,
    keep: ["AUTH_RESET_TOKEN_EXPIRED", "src/auth/session.ts"],
    expect: ["AUTH_RESET_TOKEN_EXPIRED", "src/auth/session.ts", "Done when: Auth reset test passes"]
  },
  {
    id: "markdown-plan",
    category: "baseline",
    file: "test/fixtures/plan.md",
    mode: "markdown",
    source: `# Codex Sparkompass Plan

## Ziel

Komprimiere lange Eingaben, ohne wichtige Fakten zu verlieren.

## Muss erhalten bleiben

- \`sparkompass compress --file debug.log --target 25\`
- \`--keep AUTH_RESET_TOKEN_EXPIRED\`
- Sparbalken mit geschätzten Tokens
- Qualität: gut, ok oder riskant

## Umsetzung

1. Inhalt in Zeilen zerlegen.
2. Schutzanker erkennen.
3. Zielgröße anwenden.
4. Ergebnis immer ausgeben.

## Nicht machen

- Keine Telemetrie.
- Keine stillen Uploads.
- Keine Behauptung, Codex intern zu patchen.

## Extra Kontext

Diese Zeile ist absichtlich lang und enthält viel Fülltext, damit die Kompression zeigen kann, dass nicht jede erklärende Passage überleben muss.
Noch eine lange erklärende Passage, die den Sinn wiederholt und für einen knappen Codex-Prompt wahrscheinlich nicht entscheidend ist.`,
    keep: ["sparkompass compress", "--keep AUTH_RESET_TOKEN_EXPIRED", "Qualität"],
    expect: ["sparkompass compress", "--keep AUTH_RESET_TOKEN_EXPIRED", "Qualität"]
  },
  {
    id: "code-exports",
    category: "baseline",
    file: "test/fixtures/code-sample.mjs",
    mode: "code",
    source: `import { calculateSavings } from "./savings.mjs";

export function compressText(input, options = {}) {
  const keepTerms = options.keep ?? [];
  const targetPercent = options.targetPercent ?? 35;
  if (!input) {
    return {
      text: "",
      quality: "gut"
    };
  }

  const result = {
    text: String(input).trim(),
    savings: calculateSavings(100, targetPercent),
    quality: {
      status: "gut",
      warnings: []
    }
  };

  if (keepTerms.includes("AUTH_RESET_TOKEN_EXPIRED")) {
    result.text += "\\nAUTH_RESET_TOKEN_EXPIRED";
  }

  return result;
}

export function formatCompressionReport(result) {
  return \`Qualität: \${result.quality.status}\\n\${result.text}\`;
}

const filler = [
  "noise one",
  "noise two",
  "noise three",
  "noise four",
  "noise five"
];

console.log(filler.join("\\n"));`,
    keep: ["compressText", "formatCompressionReport"],
    expect: ["export function compressText", "export function formatCompressionReport"]
  },
  {
    id: "failure-negation-flag",
    category: "failure-corpus",
    failureClass: "negation-flag",
    file: "test/fixtures/failure-corpus/negation-flag.md",
    mode: "markdown",
    source: `# Failure Corpus: Negation und Flag

## Kritische Entscheidung

- DO_NOT_DELETE_USERS ist aktiv.
- Die Migration ist not safe to run with --force.
- Verwende ausschliesslich \`--no-force\`.
- Do not set ENABLE_DESTRUCTIVE_MIGRATION=true.

## Kontext

Das Team will alte Demo-Datensätze entfernen, aber produktive Nutzer müssen unverändert bleiben.
Ein früherer Entwurf sagte, dass \`--force\` schneller wäre. Dieser Entwurf ist verworfen.
Die sichere Variante prüft erst die Betroffenenliste und beendet sich ohne Schreibzugriff.

## Nicht entscheidender Hintergrund

Diese Passage ist Fülltext für den Kompressionsdruck.
Diese Passage ist Fülltext für den Kompressionsdruck.
Diese Passage ist Fülltext für den Kompressionsdruck.
Diese Passage ist Fülltext für den Kompressionsdruck.
Diese Passage ist Fülltext für den Kompressionsdruck.
Diese Passage ist Fülltext für den Kompressionsdruck.`,
    keep: ["DO_NOT_DELETE_USERS", "--no-force", "not safe to run with --force", "Do not set ENABLE_DESTRUCTIVE_MIGRATION=true"],
    expect: ["DO_NOT_DELETE_USERS", "--no-force", "not safe to run with --force", "Do not set ENABLE_DESTRUCTIVE_MIGRATION=true"]
  },
  {
    id: "failure-version-priority",
    category: "failure-corpus",
    failureClass: "version-priority",
    file: "test/fixtures/failure-corpus/version-priority.md",
    mode: "markdown",
    source: `# Failure Corpus: Version, Zahl und Priorität

## Muss exakt bleiben

- API_VERSION=2026-06-23
- timeout_ms=1500
- retry_count=0
- priority: env > cli > default

## Warum das kritisch ist

Die Version \`2026-06-23\` wählt das neue Antwortschema.
Ein Timeout von 1500 ms ist Absicht, weil längere Wartezeiten den Job blockieren.
\`retry_count=0\` verhindert doppelte Abbuchungen.
Die Priorität env > cli > default ist für reproduzierbare CI-Läufe verbindlich.

## Rauschen

Die Produktnotiz erklärt, warum schnelle Rückmeldung wichtiger als Komfort ist.
Die Produktnotiz erklärt, warum schnelle Rückmeldung wichtiger als Komfort ist.
Die Produktnotiz erklärt, warum schnelle Rückmeldung wichtiger als Komfort ist.
Die Produktnotiz erklärt, warum schnelle Rückmeldung wichtiger als Komfort ist.
Die Produktnotiz erklärt, warum schnelle Rückmeldung wichtiger als Komfort ist.`,
    keep: ["API_VERSION=2026-06-23", "timeout_ms=1500", "retry_count=0", "priority: env > cli > default"],
    expect: ["API_VERSION=2026-06-23", "timeout_ms=1500", "retry_count=0", "priority: env > cli > default"]
  },
  {
    id: "failure-stacktrace-cutoff",
    category: "failure-corpus",
    failureClass: "stacktrace-cutoff",
    file: "test/fixtures/failure-corpus/stacktrace-cutoff.log",
    mode: "log",
    source: `2026-06-23T14:02:31.482Z ERROR E_AUTH_104 token refresh failed
first failing frame: src/auth/token_service.py:117
caused by: MissingKeyError("refresh_token")
last successful frame: src/auth/session_store.py:52
repeated 68 times before cancellation
Done when: refresh does not retry without refresh_token
INFO unrelated request finished
INFO unrelated request finished
INFO unrelated request finished
INFO unrelated request finished
INFO unrelated request finished
INFO unrelated request finished
DEBUG cache warmup finished for tenant demo-a
DEBUG cache warmup finished for tenant demo-b
DEBUG metrics heartbeat emitted
DEBUG metrics heartbeat emitted
DEBUG metrics heartbeat emitted
DEBUG worker idle checkpoint
DEBUG worker idle checkpoint
DEBUG worker idle checkpoint
DEBUG unrelated health probe passed
DEBUG unrelated health probe passed
DEBUG unrelated health probe passed
DEBUG unrelated health probe passed
DEBUG unrelated health probe passed
DEBUG unrelated health probe passed
DEBUG unrelated health probe passed
DEBUG unrelated health probe passed
DEBUG unrelated health probe passed
DEBUG unrelated health probe passed`,
    keep: ["E_AUTH_104", "first failing frame: src/auth/token_service.py:117", "repeated 68 times", "refresh_token"],
    expect: [
      "E_AUTH_104",
      "first failing frame: src/auth/token_service.py:117",
      "repeated 68 times",
      "Done when: refresh does not retry without refresh_token",
      {
        type: "regex",
        pattern: "first failing frame:\\s+src/auth/token_service\\.py:117",
        label: "stacktrace first failing frame with line"
      }
    ]
  },
  {
    id: "failure-same-symbols",
    category: "failure-corpus",
    failureClass: "same-symbols",
    file: "test/fixtures/failure-corpus/same-symbols.md",
    mode: "markdown",
    source: `# Failure Corpus: Gleichnamige Symbole

## Kritische Unterscheidung

- production symbol: buildTokenPlan
- test helper: buildTokenPlanFixture
- Do not replace production buildTokenPlan with buildTokenPlanFixture.
- Done when: src/context-plan.mjs keeps the production buildTokenPlan path.

## Kontext

\`buildTokenPlan\` berechnet die echten Lane-Entscheidungen für Codex.
\`buildTokenPlanFixture\` erzeugt nur Testdaten für Benchmark-Snapshots.
Beide Namen sind absichtlich ähnlich, weil dieser Fall prüfen soll, ob Verdichtung Symbolrollen verwechselt.

## Rauschen

Die Release-Notiz wiederholt allgemeine Planungsdetails.
Die Release-Notiz wiederholt allgemeine Planungsdetails.
Die Release-Notiz wiederholt allgemeine Planungsdetails.
Die Release-Notiz wiederholt allgemeine Planungsdetails.
Die Release-Notiz wiederholt allgemeine Planungsdetails.`,
    keep: [
      "production symbol: buildTokenPlan",
      "test helper: buildTokenPlanFixture",
      "Do not replace production buildTokenPlan with buildTokenPlanFixture",
      "src/context-plan.mjs"
    ],
    expect: [
      "production symbol: buildTokenPlan",
      "test helper: buildTokenPlanFixture",
      "Do not replace production buildTokenPlan with buildTokenPlanFixture.",
      "Done when: src/context-plan.mjs keeps the production buildTokenPlan path.",
      {
        type: "regex",
        pattern: "production symbol:\\s+buildTokenPlan",
        label: "production symbol is not confused with fixture"
      }
    ]
  },
  {
    id: "failure-security-dataflow",
    category: "failure-corpus",
    failureClass: "security-dataflow",
    file: "test/fixtures/failure-corpus/security-dataflow.md",
    mode: "markdown",
    source: `# Failure Corpus: Sicherheits-Datenfluss

## Muss exakt bleiben

- source: req.headers.authorization
- sanitizer: hashToken(rawAuthorization)
- sink: db.query("UPDATE sessions SET token_hash = ?")
- Never log rawAuthorization.
- Done when: raw token never reaches logger or SQL sink.

## Warum das kritisch ist

Der rohe Authorization-Header darf nur in \`rawAuthorization\` liegen, bis \`hashToken(rawAuthorization)\` ausgeführt wurde.
Danach darf nur der Hash in die Datenbank.
Ein Log von \`rawAuthorization\` wäre ein Sicherheitsfehler, auch wenn der Datenbankpfad korrekt bleibt.

## Rauschen

Die Audit-Notiz beschreibt irrelevante Session-Metriken.
Die Audit-Notiz beschreibt irrelevante Session-Metriken.
Die Audit-Notiz beschreibt irrelevante Session-Metriken.
Die Audit-Notiz beschreibt irrelevante Session-Metriken.
Die Audit-Notiz beschreibt irrelevante Session-Metriken.`,
    keep: [
      "source: req.headers.authorization",
      "sanitizer: hashToken(rawAuthorization)",
      "sink: db.query(\"UPDATE sessions SET token_hash = ?\")",
      "Never log rawAuthorization",
      "raw token never reaches logger or SQL sink"
    ],
    expect: [
      "source: req.headers.authorization",
      "sanitizer: hashToken(rawAuthorization)",
      "sink: db.query(\"UPDATE sessions SET token_hash = ?\")",
      "Never log rawAuthorization.",
      "Done when: raw token never reaches logger or SQL sink.",
      {
        type: "regex",
        pattern: "sanitizer:\\s+hashToken\\(rawAuthorization\\)",
        label: "sanitizer stays between source and sink"
      }
    ]
  },
  {
    id: "failure-dynamic-import",
    category: "failure-corpus",
    failureClass: "dynamic-import",
    file: "test/fixtures/failure-corpus/dynamic-import.md",
    mode: "markdown",
    source: `# Failure Corpus: Dynamischer Import

## Muss exakt bleiben

- importProvider = await import(\`./providers/\${tenant}.mjs\`)
- allowed_tenants = ["eu", "us"]
- Do not replace dynamic import with static ./providers/default.mjs.
- fallback only when tenant is missing.

## Kontext

Der Provider wird zur Laufzeit anhand des Tenants geladen.
Nur die Tenants \`eu\` und \`us\` sind erlaubt.
Ein statischer Default-Provider würde die Mandantentrennung verdecken.

## Rauschen

Die Integrationsnotiz erklärt historische Provider-Experimente.
Die Integrationsnotiz erklärt historische Provider-Experimente.
Die Integrationsnotiz erklärt historische Provider-Experimente.
Die Integrationsnotiz erklärt historische Provider-Experimente.
Die Integrationsnotiz erklärt historische Provider-Experimente.`,
    keep: [
      "importProvider = await import(`./providers/${tenant}.mjs`)",
      "allowed_tenants = [\"eu\", \"us\"]",
      "Do not replace dynamic import with static ./providers/default.mjs",
      "fallback only when tenant is missing"
    ],
    expect: [
      "importProvider = await import(`./providers/${tenant}.mjs`)",
      "allowed_tenants = [\"eu\", \"us\"]",
      "Do not replace dynamic import with static ./providers/default.mjs.",
      "fallback only when tenant is missing.",
      {
        type: "regex",
        pattern: "import\\(`\\.\\/providers\\/\\$\\{tenant\\}\\.mjs`\\)",
        label: "dynamic tenant import expression"
      }
    ]
  },
  {
    id: "failure-monorepo-dependency",
    category: "failure-corpus",
    failureClass: "monorepo-dependency",
    file: "test/fixtures/failure-corpus/monorepo-dependency.md",
    mode: "markdown",
    source: `# Failure Corpus: Monorepo-Abhängigkeit

## Muss exakt bleiben

- packages/api depends on packages/shared-config.
- packages/shared-config owns FEATURE_BILLING_V2.
- Do not edit packages/web for this failure.
- Test command: pnpm --filter @acme/api test.

## Kontext

Der Fehler tritt im API-Paket auf, weil \`FEATURE_BILLING_V2\` aus \`packages/shared-config\` kommt.
\`packages/web\` importiert denselben Wert nur für Anzeigezwecke und darf für diesen Fix nicht angefasst werden.
Die richtige Verifikation läuft mit dem API-Filter.

## Rauschen

Die Monorepo-Notiz listet alte Paketnamen.
Die Monorepo-Notiz listet alte Paketnamen.
Die Monorepo-Notiz listet alte Paketnamen.
Die Monorepo-Notiz listet alte Paketnamen.
Die Monorepo-Notiz listet alte Paketnamen.`,
    keep: [
      "packages/api depends on packages/shared-config",
      "packages/shared-config owns FEATURE_BILLING_V2",
      "Do not edit packages/web for this failure",
      "pnpm --filter @acme/api test"
    ],
    expect: [
      "packages/api depends on packages/shared-config.",
      "packages/shared-config owns FEATURE_BILLING_V2.",
      "Do not edit packages/web for this failure.",
      "Test command: pnpm --filter @acme/api test.",
      {
        type: "regex",
        pattern: "packages\\/api depends on packages\\/shared-config",
        label: "api package dependency stays attached to shared config"
      }
    ]
  }
];

export async function runBenchmark(rootPath, options = {}) {
  const root = path.resolve(rootPath);
  const targetPercent = Number(options.targetPercent) || 35;
  const cases = [];

  for (const benchmark of BENCHMARK_CASES) {
    const { source, origin } = await readBenchmarkSource(root, benchmark);
    const pack = buildContextPack(source, {
      label: benchmark.file,
      mode: benchmark.mode,
      targetPercent,
      keep: benchmark.keep
    });
    const oracle = buildAcceptanceOracle(benchmark.expect);
    const fullOracle = evaluateAcceptanceOracle(source, oracle);
    const contextOracle = evaluateAcceptanceOracle(pack.context.text, oracle);
    const counterfactuals = buildCounterfactualChecks(pack.context.text, oracle);
    const detectedCounterfactuals = counterfactuals.filter((check) => check.detected);
    const regression = fullOracle.success && !contextOracle.success;
    const counterfactualsOk = counterfactuals.length > 0 && detectedCounterfactuals.length === counterfactuals.length;
    const taskSuccess = fullOracle.success && contextOracle.success && !regression && counterfactualsOk;
    const taskOutcome = await buildBenchmarkTaskOutcome({
      benchmark,
      pack,
      source,
      fullOracle,
      contextOracle,
      regression,
      counterfactuals,
      detectedCounterfactuals,
      taskSuccess
    });

    cases.push({
      id: benchmark.id,
      category: benchmark.category,
      failure_class: benchmark.failureClass || null,
      file: benchmark.file,
      source_origin: origin,
      full_success: fullOracle.success,
      context_success: contextOracle.success,
      regression,
      missing_in_full: fullOracle.missing,
      missing_in_context: contextOracle.missing,
      counterfactuals,
      counterfactuals_detected: detectedCounterfactuals.length,
      task_outcome: summarizeTaskOutcome(taskOutcome),
      fallback_used: pack.fallbackUsed,
      fallback_mode: pack.fallbackMode,
      on_demand_loads: 0,
      cache_hit: false,
      quality_status: pack.receipt.quality.status,
      quality_risky: pack.receipt.quality.risky,
      original_tokens: pack.receipt.original_tokens,
      savings_percent: pack.receipt.savings.delivered.percent,
      saved_tokens: pack.receipt.savings.delivered.saved_tokens,
      delivered_tokens: pack.receipt.delivered_tokens,
      gate_status: pack.receipt.gate.status,
      critical_anchor_retention: pack.receipt.critical_anchors.retention_percent,
      source_evidence_coverage: pack.receipt.source_evidence.coverage,
      oracle: {
        type: oracle.type,
        expectations: oracle.expectations
      }
    });
  }

  const regressions = cases.filter((item) => item.regression);
  const fullSuccesses = cases.filter((item) => item.full_success);
  const successes = cases.filter((item) => item.context_success);
  const failureCorpusCases = cases.filter((item) => item.category === "failure-corpus");
  const failureCorpusSuccesses = failureCorpusCases.filter((item) => item.context_success);
  const failureCorpusCoverage = buildFailureCorpusCoverage(failureCorpusCases);
  const contextPackQuality = buildBenchmarkContextPackQuality(cases);
  const efficiency = buildBenchmarkEfficiencyMetrics(cases);
  const totalCounterfactuals = cases.reduce((sum, item) => sum + item.counterfactuals.length, 0);
  const detectedCounterfactuals = cases.reduce((sum, item) => sum + item.counterfactuals_detected, 0);
  const verifiedTaskOutcomes = cases.filter((item) => item.task_outcome.verified);
  const averageSavings = Math.round(cases.reduce((sum, item) => sum + item.savings_percent, 0) / cases.length);
  const totalDeliveredTokens = cases.reduce((sum, item) => sum + item.delivered_tokens, 0);
  const oracleSensitive = totalCounterfactuals > 0 && totalCounterfactuals === detectedCounterfactuals;
  const allContextsSuccessful = successes.length === cases.length;

  return {
    schema: "SparkompassBenchmarkV1",
    root,
    target_percent: targetPercent,
    totals: {
      cases: cases.length,
      full_context_successes: fullSuccesses.length,
      context_successes: successes.length,
      failure_corpus_cases: failureCorpusCases.length,
      failure_corpus_successes: failureCorpusSuccesses.length,
      failure_corpus_coverage: failureCorpusCoverage,
      context_pack_quality: contextPackQuality,
      efficiency,
      regressions: regressions.length,
      task_outcomes_verified: verifiedTaskOutcomes.length,
      counterfactuals: totalCounterfactuals,
      counterfactuals_detected: detectedCounterfactuals,
      oracle_sensitive: oracleSensitive,
      average_savings_percent: averageSavings,
      worst_case_savings_percent: minimum(cases.map((item) => item.savings_percent)),
      p95_delivered_tokens: percentile(cases.map((item) => item.delivered_tokens), 95),
      total_delivered_tokens: totalDeliveredTokens,
      tokens_per_successful_case: successes.length ? Math.round(totalDeliveredTokens / successes.length) : 0,
      worst_case: buildWorstCaseSummary(cases),
      verified: allContextsSuccessful
        && regressions.length === 0
        && failureCorpusCoverage.verified
        && contextPackQuality.verified
        && oracleSensitive
        && verifiedTaskOutcomes.length === cases.length
    },
    cases
  };
}

async function readBenchmarkSource(root, benchmark) {
  const absolutePath = path.join(root, benchmark.file);
  try {
    return {
      source: await fs.readFile(absolutePath, "utf8"),
      origin: "file"
    };
  } catch (error) {
    if (error?.code !== "ENOENT" || typeof benchmark.source !== "string") {
      throw error;
    }
    return {
      source: benchmark.source,
      origin: "built-in-fixture"
    };
  }
}

export function formatBenchmarkReport(benchmark) {
  const rows = benchmark.cases.map((item) => (
    `- ${item.id}: ${item.context_success ? "bestanden" : "fehlgeschlagen"}, Regression: ${item.regression ? "ja" : "nein"}, ${item.savings_percent}% gespart, ${formatNumber(item.delivered_tokens)} Tokens geliefert`
  )).join("\n");

  return `
# Sparkompass Benchmark

Pfad: ${benchmark.root}

- Fälle: ${benchmark.totals.cases}
- Kontext-Erfolge: ${benchmark.totals.context_successes}/${benchmark.totals.cases}
- TaskOutcome-Erfolge: ${benchmark.totals.task_outcomes_verified}/${benchmark.totals.cases}
- Failure-Corpus-Erfolge: ${benchmark.totals.failure_corpus_successes}/${benchmark.totals.failure_corpus_cases}
- Failure-Corpus-Klassen: ${formatFailureCorpusCoverage(benchmark.totals.failure_corpus_coverage)}
- ContextPack-Qualität: ${formatBenchmarkContextPackQuality(benchmark.totals.context_pack_quality)}
- Effizienz: ${formatBenchmarkEfficiency(benchmark.totals.efficiency)}
- Regressionen gegen Vollkontext: ${benchmark.totals.regressions}
- Gegenfakten erkannt: ${formatNumber(benchmark.totals.counterfactuals_detected)}/${formatNumber(benchmark.totals.counterfactuals)}
- Durchschnittliche Ersparnis: ${benchmark.totals.average_savings_percent}%
- Schlechteste Ersparnis: ${benchmark.totals.worst_case_savings_percent}%
- Tokens pro bestandenem Fall: ${formatNumber(benchmark.totals.tokens_per_successful_case)}
- p95 geliefert/gespart: ${formatNumber(benchmark.totals.p95_delivered_tokens)} / ${formatNumber(benchmark.totals.efficiency.p95_saved_tokens)}
- Schlechtester Einzelfall: ${formatWorstCase(benchmark.totals.worst_case)}
- Gate: ${benchmark.totals.verified ? "verified-benchmark" : "benchmark-regression"}

## Fälle

${rows}
`.trim();
}

function buildBenchmarkContextPackQuality(cases) {
  const caseReports = cases.map((benchmarkCase) => {
    const failures = [];
    if (!["verified-publishable", "verified-expanded-context"].includes(benchmarkCase.gate_status)) {
      failures.push(`gate:${benchmarkCase.gate_status}`);
    }
    if (Number(benchmarkCase.critical_anchor_retention) !== 100) {
      failures.push(`critical-anchor-retention:${benchmarkCase.critical_anchor_retention}`);
    }
    if (Number(benchmarkCase.source_evidence_coverage) !== 1) {
      failures.push(`source-evidence-coverage:${benchmarkCase.source_evidence_coverage}`);
    }
    if (benchmarkCase.quality_risky) {
      failures.push("risky-context-pack");
    }
    if (benchmarkCase.fallback_mode === "full-context") {
      failures.push("full-context-fallback");
    }

    return {
      id: benchmarkCase.id,
      gate_status: benchmarkCase.gate_status,
      fallback_mode: benchmarkCase.fallback_mode,
      quality_status: benchmarkCase.quality_status,
      critical_anchor_retention_percent: benchmarkCase.critical_anchor_retention,
      source_evidence_coverage_percent: Math.round(Number(benchmarkCase.source_evidence_coverage) * 100),
      risky: Boolean(benchmarkCase.quality_risky),
      verified: failures.length === 0,
      failures
    };
  });
  const failedCases = caseReports.filter((item) => !item.verified);
  const minCriticalRetention = minimum(caseReports.map((item) => item.critical_anchor_retention_percent));
  const minSourceCoverage = minimum(caseReports.map((item) => item.source_evidence_coverage_percent));

  return {
    schema: "BenchmarkContextPackQualityV1",
    verified: failedCases.length === 0,
    cases: caseReports.length,
    verified_cases: caseReports.length - failedCases.length,
    failed_cases: failedCases.map((item) => ({
      id: item.id,
      failures: item.failures
    })),
    gate_status_counts: countBy(caseReports.map((item) => item.gate_status)),
    minimum_critical_anchor_retention_percent: minCriticalRetention,
    minimum_source_evidence_coverage_percent: minSourceCoverage,
    risky_cases: caseReports.filter((item) => item.risky).map((item) => item.id),
    full_context_fallbacks: caseReports.filter((item) => item.fallback_mode === "full-context").map((item) => item.id),
    expanded_contexts: caseReports.filter((item) => item.fallback_mode === "expanded-context").map((item) => item.id),
    requirements: {
      allowed_gate_statuses: ["verified-publishable", "verified-expanded-context"],
      critical_anchor_retention_percent: 100,
      source_evidence_coverage_percent: 100,
      risky_cases: 0,
      full_context_fallbacks: 0
    },
    case_reports: caseReports
  };
}

function buildBenchmarkEfficiencyMetrics(cases) {
  const verifiedTasks = cases.filter((item) => item.task_outcome.verified);
  const fullContextSuccesses = cases.filter((item) => item.full_success).length;
  const sparkompassSuccesses = cases.filter((item) => item.context_success).length;
  const totalOriginalTokens = sum(cases, "original_tokens");
  const totalDeliveredTokens = sum(cases, "delivered_tokens");
  const totalSavedTokens = sum(cases, "saved_tokens");
  const totalOutputTokens = cases.reduce((total, item) => total + (Number(item.task_outcome.output_tokens) || 0), 0);
  const verifiedCount = verifiedTasks.length;

  return {
    schema: "BenchmarkEfficiencyMetricsV1",
    verified: verifiedCount === cases.length
      && sparkompassSuccesses === fullContextSuccesses
      && cases.every((item) => item.fallback_mode !== "full-context"),
    cases: cases.length,
    verified_tasks: verifiedCount,
    full_context_success_rate_percent: percentage(fullContextSuccesses, cases.length),
    sparkompass_context_success_rate_percent: percentage(sparkompassSuccesses, cases.length),
    task_success_delta_percent: cases.length
      ? Math.round(((sparkompassSuccesses - fullContextSuccesses) / cases.length) * 100)
      : 0,
    total_original_tokens: totalOriginalTokens,
    total_delivered_tokens: totalDeliveredTokens,
    total_saved_tokens: totalSavedTokens,
    total_output_tokens: totalOutputTokens,
    p95_delivered_tokens: percentile(cases.map((item) => item.delivered_tokens), 95),
    p95_saved_tokens: percentile(cases.map((item) => item.saved_tokens), 95),
    tokens_per_verified_task: verifiedCount ? Math.round(totalDeliveredTokens / verifiedCount) : 0,
    output_tokens_per_verified_task: verifiedCount ? Math.round(totalOutputTokens / verifiedCount) : 0,
    total_cost_tokens_per_verified_task: verifiedCount ? Math.round((totalDeliveredTokens + totalOutputTokens) / verifiedCount) : 0,
    fallback_rate_percent: percentage(cases.filter((item) => item.fallback_used).length, cases.length),
    expanded_context_rate_percent: percentage(cases.filter((item) => item.fallback_mode === "expanded-context").length, cases.length),
    full_context_fallback_rate_percent: percentage(cases.filter((item) => item.fallback_mode === "full-context").length, cases.length),
    on_demand_load_rate_percent: percentage(cases.filter((item) => Number(item.on_demand_loads) > 0).length, cases.length),
    cache_hit_rate_percent: percentage(cases.filter((item) => item.cache_hit).length, cases.length),
    measurement_scope: {
      total_cost_tokens_per_verified_task: "delivered ContextPack tokens plus benchmark output tokens; excludes model reasoning and billing.",
      on_demand_load_rate_percent: "0 means this fixture benchmark did not need MCP follow-up loading.",
      cache_hit_rate_percent: "0 means this fixture benchmark intentionally ran without semantic-cache reuse."
    }
  };
}

function formatBenchmarkEfficiency(efficiency) {
  if (!efficiency || efficiency.schema !== "BenchmarkEfficiencyMetricsV1") {
    return "nicht berechnet";
  }
  return `${formatNumber(efficiency.total_cost_tokens_per_verified_task)} Tokens/verifiziertem Task (${formatNumber(efficiency.tokens_per_verified_task)} Kontext + ${formatNumber(efficiency.output_tokens_per_verified_task)} Output), Erfolgsdelta ${efficiency.task_success_delta_percent}%, Fallback ${efficiency.fallback_rate_percent}%, Nachladen ${efficiency.on_demand_load_rate_percent}%, Cache-Hits ${efficiency.cache_hit_rate_percent}%`;
}

function formatBenchmarkContextPackQuality(quality) {
  if (!quality || quality.schema !== "BenchmarkContextPackQualityV1") {
    return "nicht berechnet";
  }
  const summary = `${quality.verified_cases}/${quality.cases} verifiziert, kritische Anker min. ${quality.minimum_critical_anchor_retention_percent}%, Belege min. ${quality.minimum_source_evidence_coverage_percent}%`;
  if (quality.verified) return summary;
  const failures = quality.failed_cases.map((item) => `${item.id}: ${item.failures.join(",")}`).join("; ");
  return failures ? `${summary}, Fehler: ${failures}` : summary;
}

function buildFailureCorpusCoverage(failureCorpusCases) {
  const casesByClass = new Map();
  const requiredIds = new Set(REQUIRED_FAILURE_CORPUS_CLASSES.map((item) => item.id));

  for (const benchmarkCase of failureCorpusCases) {
    const classId = benchmarkCase.failure_class || "unclassified";
    const classCases = casesByClass.get(classId) || [];
    classCases.push(benchmarkCase);
    casesByClass.set(classId, classCases);
  }

  const classes = REQUIRED_FAILURE_CORPUS_CLASSES.map((requiredClass) => {
    const classCases = casesByClass.get(requiredClass.id) || [];
    const successfulCases = classCases.filter((item) => item.context_success && !item.regression);
    return {
      id: requiredClass.id,
      label: requiredClass.label,
      required: true,
      cases: classCases.map((item) => item.id),
      case_count: classCases.length,
      successful_cases: successfulCases.length,
      covered: classCases.length > 0,
      verified: classCases.length > 0 && successfulCases.length === classCases.length
    };
  });
  const unexpectedClasses = [...casesByClass.keys()]
    .filter((classId) => !requiredIds.has(classId))
    .sort();
  const missingClasses = classes.filter((item) => !item.covered).map((item) => item.id);
  const failedClasses = classes.filter((item) => item.covered && !item.verified).map((item) => item.id);
  const coveredClasses = classes.filter((item) => item.covered).map((item) => item.id);
  const verifiedClasses = classes.filter((item) => item.verified).map((item) => item.id);

  return {
    schema: "FailureCorpusCoverageV1",
    required_classes: REQUIRED_FAILURE_CORPUS_CLASSES.map((item) => item.id),
    covered_classes: coveredClasses,
    verified_classes: verifiedClasses,
    missing_classes: missingClasses,
    failed_classes: failedClasses,
    unexpected_classes: unexpectedClasses,
    coverage_percent: REQUIRED_FAILURE_CORPUS_CLASSES.length
      ? Math.round((coveredClasses.length / REQUIRED_FAILURE_CORPUS_CLASSES.length) * 100)
      : 100,
    verified: missingClasses.length === 0 && failedClasses.length === 0,
    classes
  };
}

function formatFailureCorpusCoverage(coverage) {
  if (!coverage || coverage.schema !== "FailureCorpusCoverageV1") {
    return "nicht berechnet";
  }
  const summary = `${coverage.verified_classes.length}/${coverage.required_classes.length} verifiziert`;
  if (coverage.verified) return summary;
  const details = [
    coverage.missing_classes.length ? `fehlend: ${coverage.missing_classes.join(", ")}` : "",
    coverage.failed_classes.length ? `fehlgeschlagen: ${coverage.failed_classes.join(", ")}` : ""
  ].filter(Boolean).join("; ");
  return details ? `${summary}, ${details}` : summary;
}

function buildWorstCaseSummary(cases) {
  if (!cases.length) {
    return {
      id: "",
      file: "",
      savings_percent: 0,
      delivered_tokens: 0,
      context_success: false,
      regression: false
    };
  }

  const worst = cases.reduce((currentWorst, item) => {
    if (item.regression && !currentWorst.regression) return item;
    if (item.context_success !== currentWorst.context_success) {
      return item.context_success ? currentWorst : item;
    }
    return item.savings_percent < currentWorst.savings_percent ? item : currentWorst;
  }, cases[0]);

  return {
    id: worst.id,
    file: worst.file,
    savings_percent: worst.savings_percent,
    delivered_tokens: worst.delivered_tokens,
    context_success: worst.context_success,
    regression: worst.regression
  };
}

async function buildBenchmarkTaskOutcome(input) {
  const counterfactualsOk = input.counterfactuals.length > 0
    && input.detectedCounterfactuals.length === input.counterfactuals.length;
  const outputText = [
    `BENCHMARK_CASE_ID=${input.benchmark.id}`,
    `FULL_CONTEXT_OK=${input.fullOracle.success}`,
    `SPARKOMPASS_CONTEXT_OK=${input.contextOracle.success}`,
    `REGRESSION=${input.regression}`,
    `COUNTERFACTUALS_DETECTED=${input.detectedCounterfactuals.length}/${input.counterfactuals.length}`,
    `COUNTERFACTUALS_OK=${counterfactualsOk}`,
    `TASK_SUCCESS=${input.taskSuccess}`
  ].join("\n");

  return buildTaskOutcomeReceipt({
    command: `sparkompass benchmark ${input.benchmark.id}`,
    exitCode: input.taskSuccess ? 0 : 1,
    expectedExitCode: 0,
    stdout: outputText,
    expectOutput: [
      "TASK_SUCCESS=true",
      "REGRESSION=false",
      "COUNTERFACTUALS_OK=true"
    ],
    receipt: input.pack.receipt,
    sourceText: input.source,
    contextText: input.pack.context.text
  });
}

function summarizeTaskOutcome(outcome) {
  return {
    schema: "BenchmarkTaskOutcomeSummaryV1",
    task_id: outcome.task_id,
    status: outcome.gate.status,
    verified: outcome.gate.verified,
    exit_code: outcome.result.exit_code,
    output_hash: outcome.result.combined.hash,
    output_tokens: outcome.result.combined.estimated_tokens,
    duration_ms: outcome.result.duration_ms,
    output_oracle_success: outcome.output_oracle.result.success,
    receipt_verification_status: outcome.context_pack?.receipt_verification?.status || "not-linked",
    reasons: outcome.gate.reasons
  };
}

function formatWorstCase(worstCase) {
  if (!worstCase?.id) return "keiner";
  return `${worstCase.id}, ${worstCase.savings_percent}% gespart, ${formatNumber(worstCase.delivered_tokens)} Tokens geliefert`;
}

function minimum(values) {
  const finite = values.filter((value) => Number.isFinite(value));
  return finite.length ? Math.min(...finite) : 0;
}

function countBy(values) {
  return values.reduce((counts, value) => {
    const key = String(value || "unknown");
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function sum(items, field) {
  return items.reduce((total, item) => total + (Number(item[field]) || 0), 0);
}

function percentage(part, total) {
  return total ? Math.round((part / total) * 100) : 0;
}

function percentile(values, rank) {
  const sorted = values
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);

  if (!sorted.length) return 0;

  const index = Math.ceil((rank / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
}
