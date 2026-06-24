import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { runBenchmark } from "./benchmark.mjs";
import { buildContextEnvelope } from "./context-envelope.mjs";
import { buildContextHandoffReceipt } from "./context-handoff.mjs";
import { buildContextPack } from "./context-pack.mjs";
import { runDogfood } from "./dogfood.mjs";
import { appendEnvelopeToLedger, buildEnvelopeLedgerReport, DEFAULT_ENVELOPE_LEDGER_PATH } from "./envelope-ledger.mjs";
import { appendHandoffToLedger, buildHandoffLedgerReport, DEFAULT_HANDOFF_LEDGER_PATH } from "./handoff-ledger.mjs";
import { buildPromptPreparation } from "./prompt-prepare.mjs";
import { appendPromptPreparationToLedger, buildPromptPreparationLedgerReport, DEFAULT_PROMPT_PREPARATION_LEDGER_PATH } from "./prompt-preparation-ledger.mjs";
import { appendReceiptToLedger, buildSavingsLedgerReport, DEFAULT_SAVINGS_LEDGER_PATH } from "./savings-ledger.mjs";
import { buildSparkompassScorecard } from "./scorecard.mjs";
import { appendTaskOutcomeToLedger, buildTaskOutcomeLedgerReport, DEFAULT_TASK_OUTCOME_LEDGER_PATH } from "./task-outcome-ledger.mjs";
import { recordTaskOutcome, runTaskOutcome } from "./task-outcome.mjs";
import { formatNumber } from "./token-estimator.mjs";

const DEFAULT_PILOT_LEDGER_DIR = ".sparkompass/pilot-run";
const DEFAULT_PILOT_GOAL = "Codex Sparkompass Pilot: verifizierten Kontextlauf messen";
const DEFAULT_PILOT_FILES = [
  {
    file: "README.md",
    keep: ["Sparkompass", "ContextPackReceiptV1", "Sparbalken"],
    expect: ["ContextPackReceiptV1"]
  },
  {
    file: "docs/strategy.md",
    keep: ["ContextPack Receipts", "semantic-cache", "prompt-advisory"],
    expect: ["ContextPack Receipts"]
  },
  {
    file: "src/compressor.mjs",
    keep: ["compressText", "formatCompressionReport", "quality"],
    expect: ["export function compressText"]
  }
];

export async function runPilot(rootPath, options = {}) {
  const root = path.resolve(rootPath || ".");
  const targetPercent = Number(options.targetPercent) || 35;
  const minSaving = Number(options.minSaving) || 35;
  const minAnchors = Number(options.minAnchors) || 75;
  const riskProfile = String(options.riskProfile || "balanced");
  const ledgerDir = resolveLedgerDir(root, options.ledgerDir || options.out || DEFAULT_PILOT_LEDGER_DIR);
  const ledgerPaths = buildLedgerPaths(ledgerDir);
  const selectedFiles = await selectPilotFiles(root, options);
  const runId = `pilot-${sha256(`${root}:${Date.now()}:${selectedFiles.map((item) => item.file).join("|")}`).slice(0, 12)}`;

  await fs.mkdir(ledgerDir, { recursive: true });

  const dogfood = await runDogfood(root, {
    targetPercent,
    minSaving,
    minAnchors,
    allowRisk: Boolean(options.allowRisk)
  });
  const benchmark = await runBenchmark(root, {
    targetPercent
  });
  const packs = [];

  for (const selected of selectedFiles) {
    const absolute = path.join(root, selected.file);
    const sourceText = await fs.readFile(absolute, "utf8");
    const pack = buildContextPack(sourceText, {
      label: selected.file,
      targetPercent,
      riskProfile,
      mode: String(options.mode || "auto"),
      keep: unique([
        ...asArray(options.keep),
        ...selected.keep
      ]),
      expect: unique([
        ...asArray(options.expect),
        ...selected.expect
      ]),
      expectRegex: asArray(options.expectRegex)
    });

    await appendReceiptToLedger(root, pack.receipt, {
      out: ledgerPaths.savings,
      runType: "pilot-pack",
      note: runId
    });
    packs.push({
      file: selected.file,
      sourceText,
      pack
    });
  }

  const handoffOptions = {
    goal: String(options.goal || DEFAULT_PILOT_GOAL),
    file: selectedFiles.map((item) => item.file),
    done: unique([
      ...asArray(options.done),
      "Pilot-Ledger enthalten verifizierte Savings-, Task-, Envelope- und Handoff-Einträge."
    ]),
    expect: unique([
      ...asArray(options.handoffExpect),
      ...asArray(options.expect).slice(0, 3),
      "ContextPackReceiptV1"
    ]),
    expectRegex: asArray(options.handoffExpectRegex),
    budget: parsePositiveInteger(options.budget, 900),
    riskProfile,
    includeGraph: Boolean(options.graph || options.includeGraph),
    maxFiles: parsePositiveInteger(options.maxFiles, 300),
    excludeFiles: Object.values(ledgerPaths),
    minCachePrefixTokens: parsePositiveInteger(options.minCachePrefixTokens, 1024)
  };
  const envelope = await buildContextEnvelope(root, handoffOptions);
  await appendEnvelopeToLedger(root, envelope, {
    out: ledgerPaths.envelope,
    runType: "pilot-envelope",
    note: runId
  });

  const handoff = await buildContextHandoffReceipt(root, handoffOptions);
  await appendHandoffToLedger(root, handoff, {
    out: ledgerPaths.handoff,
    runType: "pilot-handoff",
    note: runId
  });

  const linkedPack = packs[0];
  const promptPreparation = buildPromptPreparation(linkedPack?.sourceText || "", {
    label: `${linkedPack?.file || "pilot"}:prompt-preparation`,
    goal: String(options.goal || DEFAULT_PILOT_GOAL),
    targetPercent,
    riskProfile,
    mode: String(options.mode || "auto"),
    keep: unique([
      ...asArray(options.keep),
      ...asArray(selectedFiles[0]?.keep),
      "ContextPackReceiptV1"
    ]),
    expect: unique([
      ...asArray(options.expect).slice(0, 3),
      ...asArray(selectedFiles[0]?.expect),
      "ContextPackReceiptV1"
    ]),
    expectRegex: asArray(options.expectRegex)
  });
  await appendPromptPreparationToLedger(root, promptPreparation, {
    out: ledgerPaths.promptPreparation,
    runType: "pilot-prompt-preparation",
    note: runId
  });
  const taskOutput = buildPilotTaskOutput({
    dogfood,
    benchmark,
    packs,
    handoff,
    envelope,
    promptPreparation
  });
  const taskOutcome = options.taskCommand
    ? await runTaskOutcome({
      rootPath: root,
      cwd: root,
      command: String(options.taskCommand),
      expectedExitCode: options.expectedExitCode ?? 0,
      expectOutput: asArray(options.expectOutput),
      expectOutputRegex: asArray(options.expectOutputRegex),
      receipt: linkedPack?.pack,
      sourceText: linkedPack?.sourceText,
      contextText: linkedPack?.pack?.context?.text,
      timeoutMs: parsePositiveInteger(options.timeoutMs, 30000),
      maxOutputBytes: parsePositiveInteger(options.maxOutputBytes, 200000)
    })
    : await recordTaskOutcome({
      rootPath: root,
      cwd: root,
      command: "sparkompass pilot internal dogfood+benchmark",
      exitCode: 0,
      expectedExitCode: 0,
      outputText: taskOutput,
      expectOutput: [
        "Gate: verified-publishable",
        "Gate: verified-benchmark"
      ],
      receipt: linkedPack?.pack,
      sourceText: linkedPack?.sourceText,
      contextText: linkedPack?.pack?.context?.text
    });
  await appendTaskOutcomeToLedger(root, taskOutcome, {
    out: ledgerPaths.taskOutcome,
    runType: options.taskCommand ? "pilot-task-run" : "pilot-task-record",
    note: runId
  });

  const ledgers = {
    savings: await buildSavingsLedgerReport(root, { ledger: ledgerPaths.savings }),
    task_outcome: await buildTaskOutcomeLedgerReport(root, { ledger: ledgerPaths.taskOutcome }),
    envelope: await buildEnvelopeLedgerReport(root, { ledger: ledgerPaths.envelope }),
    handoff: await buildHandoffLedgerReport(root, { ledger: ledgerPaths.handoff }),
    prompt_preparation: await buildPromptPreparationLedgerReport(root, { ledger: ledgerPaths.promptPreparation })
  };
  const scorecard = await buildSparkompassScorecard(root, {
    targetPercent,
    minSaving,
    minAnchors,
    allowRisk: Boolean(options.allowRisk),
    savingsLedger: ledgerPaths.savings,
    taskOutcomeLedger: ledgerPaths.taskOutcome,
    envelopeLedger: ledgerPaths.envelope,
    handoffLedger: ledgerPaths.handoff,
    promptPreparationLedger: ledgerPaths.promptPreparation
  });
  const gate = buildPilotGate({
    dogfood,
    benchmark,
    ledgers,
    scorecard
  });

  return {
    schema: "SparkompassPilotRunV1",
    run_id: runId,
    root,
    generated_at: new Date().toISOString(),
    ledger_dir: ledgerDir,
    ledger_paths: ledgerPaths,
    gate,
    metrics: buildPilotMetrics({ dogfood, benchmark, ledgers }),
    selected_files: selectedFiles.map((item) => item.file),
    receipts: {
      context_pack_ids: packs.map((item) => item.pack.receipt.context_pack_id),
      task_id: taskOutcome.task_id,
      handoff_id: handoff.handoff_id,
      envelope_hash: envelope.assembly.full_prompt_hash,
      prompt_preparation_context_pack_id: promptPreparation.context_pack.context_pack_id
    },
    ledgers: {
      savings: summarizeLedger(ledgers.savings),
      task_outcome: summarizeLedger(ledgers.task_outcome),
      envelope: summarizeLedger(ledgers.envelope),
      handoff: summarizeLedger(ledgers.handoff),
      prompt_preparation: summarizeLedger(ledgers.prompt_preparation)
    },
    artifacts: {
      dogfood: summarizeDogfood(dogfood),
      benchmark: summarizeBenchmark(benchmark),
      task_outcome: taskOutcome,
      handoff: summarizeHandoff(handoff),
      envelope: summarizeEnvelope(envelope),
      scorecard: summarizeScorecard(scorecard)
    },
    caveats: [
      "Token counts are local estimates for planning, not billing data.",
      "The default pilot records Sparkompass's own deterministic gates; pass --task-command to attach a real project command."
    ],
    next_actions: buildNextActions(gate, ledgerPaths)
  };
}

export function formatPilotRunReport(pilot) {
  const metrics = pilot.metrics;
  return `
# SparkompassPilotRunV1

Run: ${pilot.run_id}
Gate: ${pilot.gate.status}

- Ledger-Verzeichnis: ${pilot.ledger_dir}
- Dateien: ${pilot.selected_files.join(", ")}
- Dogfood: ${pilot.artifacts.dogfood.gate.publishable ? "verified-publishable" : "needs-review"}, ${metrics.dogfood_average_saving_percent}% Ersparnis, p95 ${formatNumber(metrics.dogfood_p95_delivered_tokens)} Tokens
- Benchmark: ${pilot.artifacts.benchmark.totals.verified ? "verified-benchmark" : "needs-review"}, ${metrics.benchmark_context_successes}/${metrics.benchmark_cases} Kontext, Regressionen ${metrics.benchmark_regressions}
- SavingsLedger: ${metrics.savings_entries} Einträge, ${metrics.delivered_savings_percent}% echte Ersparnis, Fallbacks ${metrics.full_context_fallbacks}
- TaskOutcomeLedger: ${metrics.verified_tasks}/${metrics.task_entries} verifiziert, ${formatNumber(metrics.context_tokens_per_verified_task)} Context-Tokens/verifiziertem Task
- HandoffLedger: ${metrics.verified_handoffs}/${metrics.handoff_entries} verifiziert, ${metrics.start_context_savings_percent}% Startkontext-Ersparnis
- EnvelopeLedger: ${metrics.verified_envelopes}/${metrics.envelope_entries} verifiziert, ${metrics.prefix_reuse_percent}% Prefix-Reuse
- PromptPreparationLedger: ${metrics.verified_prompt_preparations}/${metrics.prompt_preparation_entries} verifiziert, ${metrics.sendable_prompt_savings_percent}% sendbare Prompt-Ersparnis

## Blocker

${pilot.gate.blockers.length ? pilot.gate.blockers.map((blocker) => `- ${blocker}`).join("\n") : "- keine"}

## Ledger

- Savings: ${pilot.ledger_paths.savings}
- TaskOutcome: ${pilot.ledger_paths.taskOutcome}
- Envelope: ${pilot.ledger_paths.envelope}
- Handoff: ${pilot.ledger_paths.handoff}
- PromptPreparation: ${pilot.ledger_paths.promptPreparation}

## Nächste Schritte

${pilot.next_actions.map((action) => `- ${action}`).join("\n")}
`.trim();
}

async function selectPilotFiles(root, options = {}) {
  const explicit = asArray(options.file);
  const candidates = explicit.length
    ? explicit.map((file) => ({
      file: String(file),
      keep: asArray(options.keep),
      expect: asArray(options.expect)
    }))
    : DEFAULT_PILOT_FILES;
  const selected = [];
  const limit = parsePositiveInteger(options.maxPackFiles, explicit.length || DEFAULT_PILOT_FILES.length);

  for (const candidate of candidates) {
    if (selected.length >= limit) break;
    try {
      const stat = await fs.stat(path.join(root, candidate.file));
      if (stat.isFile()) selected.push(candidate);
    } catch (error) {
      if (explicit.length) throw error;
    }
  }

  if (!selected.length) {
    throw new Error("Keine Pilot-Datei gefunden. Nutze sparkompass pilot . --file README.md");
  }
  return selected;
}

function buildLedgerPaths(ledgerDir) {
  return {
    savings: path.join(ledgerDir, path.basename(DEFAULT_SAVINGS_LEDGER_PATH)),
    taskOutcome: path.join(ledgerDir, path.basename(DEFAULT_TASK_OUTCOME_LEDGER_PATH)),
    envelope: path.join(ledgerDir, path.basename(DEFAULT_ENVELOPE_LEDGER_PATH)),
    handoff: path.join(ledgerDir, path.basename(DEFAULT_HANDOFF_LEDGER_PATH)),
    promptPreparation: path.join(ledgerDir, path.basename(DEFAULT_PROMPT_PREPARATION_LEDGER_PATH))
  };
}

function buildPilotTaskOutput({ dogfood, benchmark, packs, handoff, envelope, promptPreparation }) {
  const dogfoodGate = dogfood.gate.publishable ? "verified-publishable" : "needs-review";
  const benchmarkGate = benchmark.totals.verified ? "verified-benchmark" : "needs-review";
  return [
    "# Sparkompass Pilot Internal Checks",
    `Dogfood Gate: ${dogfoodGate}`,
    `Benchmark Gate: ${benchmarkGate}`,
    `Gate: ${dogfoodGate}`,
    `Gate: ${benchmarkGate}`,
    `Dogfood cases: ${dogfood.totals.completed}/${dogfood.totals.cases}`,
    `Benchmark context: ${benchmark.totals.context_successes}/${benchmark.totals.cases}`,
    `Benchmark task outcomes: ${benchmark.totals.task_outcomes_verified}/${benchmark.totals.cases}`,
    `ContextPacks recorded: ${packs.length}`,
    `Handoff gate: ${handoff.gate.status}`,
    `Envelope gate: ${envelope.gate.status}`,
    `PromptPreparation gate: ${promptPreparation.gate.status}`,
    `PromptPreparation sendable savings: ${promptPreparation.savings.sendable_prompt.percent}%`
  ].join("\n");
}

function buildPilotGate({ dogfood, benchmark, ledgers, scorecard }) {
  const blockers = [];
  if (!dogfood.gate.publishable) blockers.push("dogfood-not-publishable");
  if (!benchmark.totals.verified) blockers.push("benchmark-not-verified");
  if (!ledgers.savings.totals.verified_entries) blockers.push("no-verified-savings-ledger-entry");
  if (!ledgers.task_outcome.totals.verified_tasks) blockers.push("no-verified-task-outcome-ledger-entry");
  if (!ledgers.envelope.totals.verified_envelopes) blockers.push("no-verified-envelope-ledger-entry");
  if (!ledgers.handoff.totals.verified_handoffs) blockers.push("no-verified-handoff-ledger-entry");
  if (!ledgers.prompt_preparation.totals.verified_preparations) blockers.push("no-verified-prompt-preparation-ledger-entry");
  if (!scorecard.release_readiness.verified) blockers.push("scorecard-not-verified");

  return {
    status: blockers.length ? "pilot-needs-review" : "verified-pilot-run",
    verified: blockers.length === 0,
    blockers
  };
}

function buildPilotMetrics({ dogfood, benchmark, ledgers }) {
  return {
    dogfood_average_saving_percent: dogfood.totals.averageSaving,
    dogfood_p95_delivered_tokens: dogfood.totals.p95DeliveredTokens,
    benchmark_cases: benchmark.totals.cases,
    benchmark_context_successes: benchmark.totals.context_successes,
    benchmark_task_outcome_successes: benchmark.totals.task_outcomes_verified,
    benchmark_regressions: benchmark.totals.regressions,
    benchmark_tokens_per_successful_case: benchmark.totals.tokens_per_successful_case,
    savings_entries: ledgers.savings.totals.entries,
    verified_savings_entries: ledgers.savings.totals.verified_entries,
    delivered_savings_percent: ledgers.savings.totals.delivered_savings_percent,
    full_context_fallbacks: ledgers.savings.totals.full_context_fallbacks,
    task_entries: ledgers.task_outcome.totals.entries,
    verified_tasks: ledgers.task_outcome.totals.verified_tasks,
    verification_rate_percent: ledgers.task_outcome.totals.verification_rate_percent,
    context_tokens_per_verified_task: ledgers.task_outcome.totals.context_tokens_per_verified_task,
    output_tokens_per_verified_task: ledgers.task_outcome.totals.output_tokens_per_verified_task,
    envelope_entries: ledgers.envelope.totals.entries,
    verified_envelopes: ledgers.envelope.totals.verified_envelopes,
    prefix_reuse_percent: ledgers.envelope.totals.prefix_reuse_percent,
    handoff_entries: ledgers.handoff.totals.entries,
    verified_handoffs: ledgers.handoff.totals.verified_handoffs,
    start_context_savings_percent: ledgers.handoff.totals.start_context_savings_percent,
    prompt_preparation_entries: ledgers.prompt_preparation.totals.entries,
    verified_prompt_preparations: ledgers.prompt_preparation.totals.verified_preparations,
    sendable_prompt_savings_percent: ledgers.prompt_preparation.totals.sendable_prompt_savings_percent,
    sendable_prompt_saved_tokens: ledgers.prompt_preparation.totals.sendable_prompt_saved_tokens,
    p95_sendable_prompt_tokens: ledgers.prompt_preparation.totals.p95_sendable_prompt_tokens
  };
}

function summarizeLedger(ledger) {
  return {
    schema: ledger.schema,
    path: ledger.path,
    totals: ledger.totals
  };
}

function summarizeDogfood(dogfood) {
  return {
    root: dogfood.root,
    targetPercent: dogfood.targetPercent,
    gate: dogfood.gate,
    totals: dogfood.totals
  };
}

function summarizeBenchmark(benchmark) {
  return {
    root: benchmark.root,
    targetPercent: benchmark.targetPercent,
    totals: benchmark.totals
  };
}

function summarizeHandoff(handoff) {
  return {
    schema: handoff.schema,
    handoff_id: handoff.handoff_id,
    root: handoff.root,
    generated_at: handoff.generated_at,
    task_profile: handoff.task_profile,
    gate: handoff.gate,
    savings: handoff.savings,
    quality_contract: handoff.quality_contract,
    prompt_cache_layout: handoff.prompt_cache_layout,
    handoff: handoff.handoff,
    start_prompt: {
      estimated_tokens: handoff.start_prompt?.estimated_tokens || 0,
      hash: handoff.start_prompt?.hash || ""
    },
    on_demand_index: {
      estimated_tokens: handoff.on_demand_index?.estimated_tokens || 0,
      hash: handoff.on_demand_index?.hash || "",
      evidence_count: handoff.on_demand_index?.evidence?.length || 0
    }
  };
}

function summarizeEnvelope(envelope) {
  return {
    schema: envelope.schema,
    root: envelope.root,
    generated_at: envelope.generated_at,
    task_profile: envelope.task_profile,
    assembly: envelope.assembly,
    cache_metrics: envelope.cache_metrics,
    prefix_reuse: envelope.prefix_reuse,
    prompt: {
      estimated_tokens: envelope.prompt?.estimated_tokens || 0,
      hash: envelope.prompt?.hash || ""
    },
    on_demand_index: {
      estimated_tokens: envelope.on_demand_index?.estimated_tokens || 0,
      hash: envelope.on_demand_index?.hash || ""
    },
    gate: envelope.gate
  };
}

function summarizeScorecard(scorecard) {
  return {
    schema: scorecard.schema,
    root: scorecard.root,
    release_readiness: scorecard.release_readiness,
    metrics: scorecard.metrics,
    next_actions: scorecard.next_actions
  };
}

function buildNextActions(gate, ledgerPaths) {
  if (gate.verified) {
    return [
      `Nutze sparkompass scorecard . --savings-ledger "${ledgerPaths.savings}" --task-outcome-ledger "${ledgerPaths.taskOutcome}" --envelope-ledger "${ledgerPaths.envelope}" --handoff-ledger "${ledgerPaths.handoff}" --prompt-preparation-ledger "${ledgerPaths.promptPreparation}", um diesen Pilot als Release-Signal zu lesen.`,
      "Führe denselben Pilot mit --task-command gegen einen echten Projektcheck aus, wenn reale Task-Kosten gemessen werden sollen."
    ];
  }

  return [
    "Prüfe die Pilot-Blocker und erweitere Budget, Muss-Fakten oder Pilot-Dateien, bevor der Run als verifiziert gilt.",
    "Nutze die geschriebenen Ledger trotzdem zur Diagnose; sie sind die Belegspur, nicht nur ein Bericht."
  ];
}

function resolveLedgerDir(root, value) {
  if (path.isAbsolute(String(value))) return String(value);
  return path.resolve(root, String(value));
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
}

function asArray(value) {
  if (value === undefined || value === "") return [];
  return Array.isArray(value) ? value : [value];
}

function unique(values) {
  return [...new Set(values.filter((value) => value !== undefined && value !== "").map(String))];
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}
