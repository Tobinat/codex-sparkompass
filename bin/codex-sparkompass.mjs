#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { analyzeScan } from "../src/analyzer.mjs";
import { formatBenchmarkReport, runBenchmark } from "../src/benchmark.mjs";
import { compressText, formatCompressionReport } from "../src/compressor.mjs";
import { buildContextBOM, formatContextBOMReport } from "../src/context-bom.mjs";
import { buildCalibratedContextPack, calibrateContext, formatCalibrationReport } from "../src/context-calibration.mjs";
import { buildContextDelta, formatCacheReport, formatDeltaReport, formatLookupReport, lookupContext, writeContextCache } from "../src/context-cache.mjs";
import { buildContextControlReport, formatContextControlReport } from "../src/context-control.mjs";
import { buildContextAblationAudit, formatContextAblationAuditReport } from "../src/context-ablation.mjs";
import { buildContextSlimmingPlan, formatContextSlimmingPlanReport } from "../src/context-slimming.mjs";
import { buildCodexUsageLedgerReport, compareCodexUsageFiles, DEFAULT_CODEX_USAGE_LEDGER_PATH, formatCodexUsageComparisonReport, formatCodexUsageLedgerReport, formatCodexUsageReceipt, recordCodexUsageFromJsonl } from "../src/codex-usage.mjs";
import { buildContextEvidenceAudit, formatContextEvidenceAuditReport } from "../src/evidence-audit.mjs";
import { buildContextEnvelope, formatContextEnvelopeReport } from "../src/context-envelope.mjs";
import { buildContextGraph, findSymbolNeighborhood, formatGraphReport } from "../src/context-graph.mjs";
import { buildContextHandoffReceipt, formatContextHandoffReceipt } from "../src/context-handoff.mjs";
import { buildContextPackFormat, formatContextPackFormatReport, formatContextPackFormatValidationReport, validateContextPackFormat } from "../src/context-pack-format.mjs";
import { buildContextPackRegistryReport, DEFAULT_CONTEXT_PACK_REGISTRY_PATH, formatContextPackRegistryReport, formatContextPackRegistryVerificationReport, registerContextPack, verifyRegisteredContextPack } from "../src/context-pack-registry.mjs";
import { buildContextPack, formatContextPackReport } from "../src/context-pack.mjs";
import { buildContextPlan, formatContextPlanReport } from "../src/context-plan.mjs";
import { buildDataFlowTrace, formatDataFlowTraceReport } from "../src/data-flow.mjs";
import { formatDogfoodReport, runDogfood } from "../src/dogfood.mjs";
import { buildDoctorOverhead, formatDoctorOverheadReport } from "../src/doctor-overhead.mjs";
import { appendEnvelopeToLedger, buildEnvelopeLedgerReport, DEFAULT_ENVELOPE_LEDGER_PATH, formatEnvelopeLedgerReport, loadEnvelopeJson } from "../src/envelope-ledger.mjs";
import { buildSparkompassExperimentEvidenceAudit, formatSparkompassExperimentEvidenceAudit, writeSparkompassExperimentEvidenceAudit } from "../src/experiment-evidence-audit.mjs";
import { buildSparkompassExperimentPlan, formatSparkompassExperimentPlan, writeSparkompassExperimentPlan } from "../src/experiment-plan.mjs";
import { buildSparkompassExperimentRun, formatSparkompassExperimentRun, writeSparkompassExperimentRun } from "../src/experiment-run.mjs";
import { buildSparkompassExperimentScript, formatSparkompassExperimentScript, writeSparkompassExperimentScript } from "../src/experiment-script.mjs";
import { appendHandoffToLedger, buildHandoffLedgerReport, DEFAULT_HANDOFF_LEDGER_PATH, formatHandoffLedgerReport, loadHandoffReceiptJson } from "../src/handoff-ledger.mjs";
import { buildSparkompassImpactReport, formatSparkompassImpactReport } from "../src/impact-report.mjs";
import { buildContextInventory, formatInventoryReport } from "../src/inventory.mjs";
import { buildPackageDryRunAudit, buildPackageInstallSmokeAudit, formatPackageDryRunAudit, formatPackageInstallSmokeAudit } from "../src/package-audit.mjs";
import { buildPluginInstallSmokeAudit, formatPluginInstallSmokeAudit } from "../src/plugin-audit.mjs";
import { buildCompactPrompt } from "../src/prompt.mjs";
import { buildReceiptVerificationFromFiles, formatReceiptVerificationReport } from "../src/receipt-verifier.mjs";
import { formatPilotRunReport, runPilot } from "../src/pilot-run.mjs";
import { buildProgramSlice, formatProgramSliceReport } from "../src/program-slice.mjs";
import { buildPromptAdvisory, formatPromptAdvisory } from "../src/prompt-advisory.mjs";
import { buildPromptPreparation, formatPromptPreparation } from "../src/prompt-prepare.mjs";
import { appendPromptPreparationToLedger, buildPromptPreparationLedgerReport, DEFAULT_PROMPT_PREPARATION_LEDGER_PATH, formatPromptPreparationLedgerReport, loadPromptPreparationJson } from "../src/prompt-preparation-ledger.mjs";
import { buildReleaseAudit, formatReleaseAuditReport } from "../src/release-audit.mjs";
import { buildRunRecommendation, formatRunRecommendation } from "../src/recommend.mjs";
import { formatAuditReport } from "../src/reporter.mjs";
import { buildSparkompassRouterDecision, formatSparkompassRouterDecision } from "../src/router-decision.mjs";
import { appendReceiptToLedger, buildSavingsLedgerReport, DEFAULT_SAVINGS_LEDGER_PATH, formatSavingsLedgerReport, loadReceiptJson } from "../src/savings-ledger.mjs";
import { buildSparkompassScorecard, formatSparkompassScorecard } from "../src/scorecard.mjs";
import { scanProject } from "../src/scanner.mjs";
import { addSemanticCacheEntry, formatSemanticCacheAddReport, formatSemanticCacheLookupReport, lookupSemanticCache } from "../src/semantic-cache.mjs";
import { formatShadowReport, runShadowComparison } from "../src/shadow.mjs";
import { formatSourceHashEvidenceReport, loadSourceByHash } from "../src/source-hash.mjs";
import { appendTaskOutcomeToLedger, buildTaskOutcomeLedgerReport, DEFAULT_TASK_OUTCOME_LEDGER_PATH, formatTaskOutcomeLedgerReport, loadTaskOutcomeJson } from "../src/task-outcome-ledger.mjs";
import { formatTaskOutcomeReport, recordTaskOutcome, runTaskOutcome } from "../src/task-outcome.mjs";
import { formatToolOutputEvidence, formatToolOutputSummary, loadToolOutputEvidence, summarizeToolOutput, writeToolOutputEvidence } from "../src/tool-output.mjs";

const HELP = `
Codex Sparkompass

Nutzung:
  sparkompass audit [pfad] [--json] [--top 12] [--include-lockfiles]
  sparkompass recommend [pfad] --goal "..." [--file "src/app.ts"] [--done "..."] [--json]
  sparkompass plan [pfad] --goal "..." [--budget 800] [--risk-profile balanced] [--file "src/app.ts"] [--cache .sparkompass/context-cache.json] [--graph] [--done "..."] [--expect "..."] [--expect-regex "..."] [--json]
  sparkompass bom [pfad] --goal "..." [--budget 800] [--risk-profile balanced] [--file "src/app.ts"] [--cache .sparkompass/context-cache.json] [--graph] [--done "..."] [--expect "..."] [--expect-regex "..."] [--json]
  sparkompass control [pfad] --goal "..." [--budget 800] [--risk-profile balanced] [--file "src/app.ts"] [--cache .sparkompass/context-cache.json] [--graph] [--done "..."] [--expect "..."] [--expect-regex "..."] [--previous-envelope envelope.json] [--min-cache-prefix-tokens 1024] [--json]
  sparkompass evidence-audit [pfad] --goal "..." [--budget 800] [--risk-profile balanced] [--file "src/app.ts"] [--cache .sparkompass/context-cache.json] [--graph] [--done "..."] [--expect "..."] [--expect-regex "..."] [--max-evidence 180] [--json]
  sparkompass ablation-audit [pfad] --goal "..." --expect "..." [--budget 800] [--risk-profile balanced] [--file "src/app.ts"] [--cache .sparkompass/context-cache.json] [--graph] [--done "..."] [--expect-regex "..."] [--max-units 80] [--json]
  sparkompass slim [pfad] --goal "..." --expect "..." [--budget 800] [--risk-profile balanced] [--file "src/app.ts"] [--cache .sparkompass/context-cache.json] [--graph] [--done "..."] [--expect-regex "..."] [--max-units 80] [--max-moves 24] [--json]
  sparkompass handoff [pfad] --goal "..." [--budget 800] [--risk-profile balanced] [--file "src/app.ts"] [--cache .sparkompass/context-cache.json] [--graph] [--done "..."] [--expect "..."] [--expect-regex "..."] [--previous-envelope envelope.json] [--min-cache-prefix-tokens 1024] [--print-prompt] [--ledger .sparkompass/handoff-ledger.json] [--json]
  sparkompass envelope [pfad] --goal "..." [--budget 800] [--risk-profile balanced] [--file "src/app.ts"] [--cache .sparkompass/context-cache.json] [--graph] [--expect "..."] [--expect-regex "..."] [--previous-envelope envelope.json] [--ledger .sparkompass/envelope-ledger.json] [--min-cache-prefix-tokens 1024] [--json]
  sparkompass compress [--file "notes.txt"] [--text "..."] [--target 35] [--mode auto] [--keep "..."] [--json]
  sparkompass pack [--file "notes.txt"] [--text "..."] [--target 35|auto] [--auto-target] [--risk-profile balanced] [--mode auto] [--keep "..."] [--expect "..."] [--expect-regex "..."] [--ledger .sparkompass/savings-ledger.json] [--registry .sparkompass/context-pack-registry.json] [--json]
  sparkompass receipt schema [--json]
  sparkompass receipt lint --receipt "pack.json" [--json]
  sparkompass receipt verify --receipt "pack.json" [--file "notes.txt"|--text "..."] [--context "delivered.txt"] [--json]
  sparkompass contextpack report [pfad] [--registry .sparkompass/context-pack-registry.json] [--json]
  sparkompass contextpack register [pfad] --pack "pack.json" [--source-file "notes.txt"] [--context "delivered.txt"] [--registry .sparkompass/context-pack-registry.json] [--store-source-text] [--json]
  sparkompass contextpack verify [pfad] --context-pack-id "ctx-..." [--source-file "notes.txt"] [--context "delivered.txt"] [--registry .sparkompass/context-pack-registry.json] [--json]
  sparkompass task run [pfad] --command "npm test" [--expected-exit-code 0] [--expect-output "..."] [--expect-output-regex "..."] [--receipt pack.json] [--source-file notes.txt] [--context delivered.txt] [--ledger .sparkompass/task-outcome-ledger.json] [--json]
  sparkompass task record [pfad] --command "npm test" --exit-code 0 [--output-file test.log|--output-text "..."] [--expect-output "..."] [--receipt pack.json] [--source-file notes.txt] [--ledger .sparkompass/task-outcome-ledger.json] [--json]
  sparkompass calibrate [--file "notes.txt"] [--text "..."] [--risk-profile balanced] [--min-target 10] [--max-target 90] [--step 5] [--keep "..."] [--expect "..."] [--expect-regex "..."] [--json]
  sparkompass ledger report [pfad] [--ledger .sparkompass/savings-ledger.json] [--json]
  sparkompass ledger add [pfad] --receipt "pack.json" [--out .sparkompass/savings-ledger.json] [--kind pack] [--note "..."] [--json]
  sparkompass task-ledger report [pfad] [--ledger .sparkompass/task-outcome-ledger.json] [--json]
  sparkompass task-ledger add [pfad] --outcome "task.json" [--out .sparkompass/task-outcome-ledger.json] [--kind task] [--note "..."] [--json]
  sparkompass codex-usage record [pfad] --file "codex-run.jsonl" [--ledger .sparkompass/codex-usage-ledger.json] [--label "..."] [--json]
  sparkompass codex-usage compare [pfad] --baseline "raw.jsonl" --optimized "compact.jsonl" [--baseline-label "..."] [--optimized-label "..."] [--json]
  sparkompass codex-usage report [pfad] [--ledger .sparkompass/codex-usage-ledger.json] [--json]
  sparkompass experiment plan [pfad] --raw-prompt-file raw.txt --compact-prompt-file compact.txt --model gpt-5 --reasoning-effort medium --sandbox-mode workspace-write [--task-command "npm test"] [--evidence-dir evidence/codex-experiment] [--repeat 3] [--out evidence/experiment-plan.json] [--json]
  sparkompass experiment script [pfad] --plan evidence/experiment-plan.json [--out evidence/codex-experiment/run-experiment.sh] [--json]
  sparkompass experiment audit [pfad] --plan evidence/experiment-plan.json [--out evidence/experiment-evidence-audit.json] [--json]
  sparkompass experiment run [pfad] --variant basis_raw=raw.jsonl --variant basis_kompakt=compact.jsonl --variant plugin_raw=plugin-raw.jsonl --variant plugin_kompakt=plugin-compact.jsonl [--repeat 3] [--task-passed plugin_kompakt=true] [--task-outcome plugin_kompakt=task.json] [--context-pack-hash sha256:...] [--require-metadata true] [--require-context-pack-hash true] [--out evidence/experiment.json] [--json]
  sparkompass router decide [pfad] --experiment evidence/experiment.json [--overhead evidence/overhead.json] [--min-net-gain-tokens 1] [--require-quality-evidence true] [--out evidence/router.json] [--json]
  sparkompass handoff-ledger report [pfad] [--ledger .sparkompass/handoff-ledger.json] [--json]
  sparkompass handoff-ledger add [pfad] --receipt "handoff.json" [--out .sparkompass/handoff-ledger.json] [--kind handoff] [--note "..."] [--json]
  sparkompass envelope-ledger report [pfad] [--ledger .sparkompass/envelope-ledger.json] [--json]
  sparkompass envelope-ledger add [pfad] --envelope "envelope.json" [--out .sparkompass/envelope-ledger.json] [--kind envelope] [--note "..."] [--json]
  sparkompass shadow [--file "notes.txt"] [--text "..."] --expect "AUTH_RESET_TOKEN_EXPIRED" [--expect-regex "src/auth/.+\\.ts"] [--target 35] [--risk-profile balanced] [--keep "..."] [--json]
  sparkompass tool-output [--file "pytest.log"] [--text "..."] [--command "pytest -q"] [--exit-code 1] [--store .sparkompass/tool-output] [--json]
  sparkompass tool-output load [--summary .sparkompass/tool-output/abc.summary.json|--raw .sparkompass/tool-output/abc.raw.txt|--id abc] [--pattern "..."] [--line 42] [--context-lines 6] [--json]
  sparkompass inventory [pfad] [--max-files 300] [--json]
  sparkompass cache [pfad] [--out .sparkompass/context-cache.json] [--json]
  sparkompass delta [pfad] [--cache .sparkompass/context-cache.json] [--json]
  sparkompass lookup [pfad] --query "..." [--budget 400] [--json]
  sparkompass source [pfad] --source-hash "sha256:..." [--file "..."] [--file-hash "sha256:..."] [--context-lines 6] [--max-matches 5] [--json]
  sparkompass graph [pfad] [--query "..."] [--max-files 300] [--json]
  sparkompass slice [pfad] --query "..." [--max-files 300] [--json]
  sparkompass flow [pfad] --query "..." [--depth 2] [--json]
  sparkompass semantic-cache add [pfad] --query "..." [--file notes.txt|--text "..."] [--oracle "..."] [--expect "..."] [--expect-regex "..."] [--tool-version "node --test=20"] [--risk-profile balanced] [--registry .sparkompass/context-pack-registry.json] [--json]
  sparkompass semantic-cache lookup [pfad] --query "..." [--oracle "..."] [--expect "..."] [--expect-regex "..."] [--tool-version "node --test=20"] [--min-similarity 0.6] [--json]
  sparkompass prompt-advisory [--file prompt.json|--text "..."] [--hook-payload] [--min-tokens 1600] [--min-lines 120] [--quiet-ok] [--json]
  sparkompass prompt-prepare [--file prompt.txt|--text "..."] [--hook-payload] [--goal "..."] [--target 35|auto] [--auto-target] [--risk-profile balanced] [--keep "..."] [--expect "..."] [--expect-regex "..."] [--include-receipt] [--ledger .sparkompass/prompt-preparation-ledger.json] [--json]
  sparkompass prompt-ledger report [pfad] [--ledger .sparkompass/prompt-preparation-ledger.json] [--json]
  sparkompass prompt-ledger add [pfad] --preparation "prompt-preparation.json" [--out .sparkompass/prompt-preparation-ledger.json] [--kind prompt-prepare] [--note "..."] [--json]
  sparkompass pilot [pfad] [--ledger-dir .sparkompass/pilot-run] [--file README.md] [--goal "..."] [--task-command "npm test"] [--json]
  sparkompass impact [pfad] [--savings-ledger .sparkompass/savings-ledger.json] [--task-outcome-ledger .sparkompass/task-outcome-ledger.json] [--handoff-ledger .sparkompass/handoff-ledger.json] [--prompt-preparation-ledger .sparkompass/prompt-preparation-ledger.json] [--json]
  sparkompass package-audit [pfad] [--max-package-size-kb 1000] [--max-unpacked-size-kb 3000] [--max-files 120] [--json]
  sparkompass package-smoke [pfad] [--keep-temp] [--json]
  sparkompass plugin-smoke [pfad] [--keep-temp] [--json]
  sparkompass release-audit [pfad] [--ledger-dir /tmp/sparkompass-release-audit] [--pilot false] [--max-moves 24] [--json]
  sparkompass scorecard [pfad] [--target 35] [--min-saving 35] [--min-anchors 75] [--savings-ledger .sparkompass/savings-ledger.json] [--task-outcome-ledger .sparkompass/task-outcome-ledger.json] [--envelope-ledger .sparkompass/envelope-ledger.json] [--handoff-ledger .sparkompass/handoff-ledger.json] [--prompt-preparation-ledger .sparkompass/prompt-preparation-ledger.json] [--json]
  sparkompass benchmark [pfad] [--target 35] [--json]
  sparkompass dogfood [pfad] [--target 35] [--min-saving 35] [--min-anchors 75] [--fail-on-risk] [--json]
  sparkompass prompt --goal "..." [--context "..."] [--constraint "..."] [--done "..."] [--file "src/app.ts"]
  sparkompass doctor overhead [pfad] [--profile minimal|standard|benchmark|release|debug] [--json]
  sparkompass doctor

Beispiele:
  sparkompass audit .
  sparkompass recommend . --goal "Login-Bug beheben" --file src/auth.ts
  sparkompass plan . --goal "Login-Bug beheben" --file src/auth.ts --budget 600 --expect AUTH_RESET_TOKEN_EXPIRED
  sparkompass plan . --goal "Auth-Token löschen" --risk-profile strict --budget 600
  sparkompass bom . --goal "Login-Bug beheben" --file src/auth.ts --budget 600 --expect AUTH_RESET_TOKEN_EXPIRED
  sparkompass plan . --goal "Login-Bug beheben" --cache .sparkompass/context-cache.json
  sparkompass plan . --goal "Login-Bug beheben" --graph
  sparkompass control . --goal "Login-Bug beheben" --file src/auth.ts --expect AUTH_RESET_TOKEN_EXPIRED
  sparkompass evidence-audit . --goal "Login-Bug beheben" --file src/auth.ts --expect AUTH_RESET_TOKEN_EXPIRED
  sparkompass ablation-audit . --goal "Login-Bug beheben" --file src/auth.ts --expect AUTH_RESET_TOKEN_EXPIRED
  sparkompass slim . --goal "Login-Bug beheben" --file src/auth.ts --expect AUTH_RESET_TOKEN_EXPIRED
  sparkompass handoff . --goal "Login-Bug beheben" --file src/auth.ts --expect AUTH_RESET_TOKEN_EXPIRED
  sparkompass handoff . --goal "Login-Bug beheben" --print-prompt
  sparkompass handoff . --goal "Login-Bug beheben" --ledger
  sparkompass handoff-ledger report .
  sparkompass envelope . --goal "Login-Bug beheben" --cache .sparkompass/context-cache.json --graph
  sparkompass envelope . --goal "Login-Bug beheben" --previous-envelope previous-envelope.json
  sparkompass envelope . --goal "Login-Bug beheben" --ledger
  sparkompass compress --file README.md --target 30 --keep Codex
  sparkompass pack --file error.log --keep AUTH_RESET_TOKEN_EXPIRED --expect "Done when: Auth reset test passes"
  sparkompass pack --file error.log --registry
  sparkompass contextpack verify . --context-pack-id ctx-...
  sparkompass receipt schema
  sparkompass receipt lint --receipt pack.json
  sparkompass receipt verify --receipt pack.json --file error.log
  sparkompass task run . --command "npm test" --expect-output "pass"
  sparkompass task-ledger report .
  codex exec --json "antworte nur: ok" > .sparkompass/codex-run.jsonl
  sparkompass codex-usage record . --file .sparkompass/codex-run.jsonl --ledger
  sparkompass codex-usage compare . --baseline raw.jsonl --optimized compact.jsonl
  sparkompass codex-usage report .
  sparkompass experiment plan . --raw-prompt-file evidence/prompts/raw.txt --compact-prompt-file evidence/prompts/compact.txt --model gpt-5 --reasoning-effort medium --sandbox-mode workspace-write --task-command "npm test" --out evidence/experiment-plan.json
  sparkompass experiment script . --plan evidence/experiment-plan.json --out evidence/codex-experiment/run-experiment.sh
  sparkompass experiment audit . --plan evidence/experiment-plan.json --out evidence/experiment-evidence-audit.json
  sparkompass experiment run . --variant basis_raw=raw.jsonl --variant basis_kompakt=compact.jsonl --variant plugin_raw=plugin-raw.jsonl --variant plugin_kompakt=plugin-compact.jsonl --repeat 3
  sparkompass experiment run . --variant basis_raw=raw.jsonl --variant basis_kompakt=compact.jsonl --variant plugin_raw=plugin-raw.jsonl --variant plugin_kompakt=plugin-compact.jsonl --task-outcome basis_raw=task-raw.json --task-outcome plugin_kompakt=task-compact.json --context-pack-hash sha256:... --require-metadata true --require-context-pack-hash true
  sparkompass router decide . --experiment evidence/experiment.json --overhead evidence/overhead.json
  sparkompass pack --file error.log --ledger
  sparkompass ledger report .
  sparkompass pack --file security.log --risk-profile strict --keep E_AUTH_104
  sparkompass calibrate --file error.log --keep AUTH_RESET_TOKEN_EXPIRED --expect "Done when: safe"
  sparkompass shadow --file error.log --expect AUTH_RESET_TOKEN_EXPIRED --expect "Done when: Auth reset test passes" --expect-regex "src/auth/.+\\.ts"
  sparkompass tool-output --file pytest.log --command "pytest -q" --exit-code 1
  sparkompass tool-output load --id 1a2b3c4d5e6f --pattern E_AUTH_104
  sparkompass inventory .
  sparkompass cache .
  sparkompass lookup . --query compressText
  sparkompass source . --source-hash "sha256:..."
  sparkompass graph . --query compressText
  sparkompass slice . --query compressText
  sparkompass flow . --query compressText --depth 2
  sparkompass semantic-cache add . --query compressText --file test/fixtures/code-sample.mjs --oracle "npm test" --tool-version "npm=10" --registry
  sparkompass semantic-cache lookup . --query compressText --oracle "npm test" --tool-version "npm=10"
  sparkompass prompt-advisory --text "großer Prompt ..."
  sparkompass prompt-prepare --file "großer-prompt.txt" --target auto --expect "AUTH_RESET_TOKEN_EXPIRED"
  sparkompass prompt-prepare --file "großer-prompt.txt" --target auto --ledger
  sparkompass prompt-ledger report .
  sparkompass pilot . --ledger-dir .sparkompass/pilot-run
  sparkompass impact . --savings-ledger .sparkompass/pilot-run/savings-ledger.json --task-outcome-ledger .sparkompass/pilot-run/task-outcome-ledger.json --handoff-ledger .sparkompass/pilot-run/handoff-ledger.json --prompt-preparation-ledger .sparkompass/pilot-run/prompt-preparation-ledger.json
  sparkompass package-audit .
  sparkompass package-smoke .
  sparkompass plugin-smoke .
  sparkompass release-audit .
  sparkompass scorecard .
  sparkompass doctor overhead . --profile standard
  sparkompass benchmark .
  sparkompass dogfood .
  cat error.log | sparkompass compress --target 25
  sparkompass audit ~/repo --json
  sparkompass prompt --goal "Bug im Login beheben" --file src/auth.ts --done "Tests laufen grün"
`.trim();

const args = process.argv.slice(2);
const command = args[0] ?? "help";

try {
  if (command === "audit") {
    const options = parseOptions(args.slice(1), {
      json: false,
      top: 12,
      includeLockfiles: false
    });
    const targetPath = options.positionals[0] ?? ".";
    const scan = await scanProject(targetPath, {
      includeLockfiles: options.includeLockfiles
    });
    const analysis = analyzeScan(scan, {
      top: Number(options.top) || 12
    });

    if (options.json) {
      console.log(JSON.stringify({ scan, analysis }, null, 2));
    } else {
      console.log(formatAuditReport(scan, analysis));
    }
  } else if (command === "recommend") {
    const options = parseOptions(args.slice(1), {
      json: false,
      top: 8,
      goal: "",
      file: [],
      done: [],
      includeLockfiles: false
    });
    if (!options.goal) {
      fail("Bitte gib ein Ziel an: sparkompass recommend --goal \"...\"");
    }
    const targetPath = options.positionals[0] ?? ".";
    const scan = await scanProject(targetPath, {
      includeLockfiles: options.includeLockfiles
    });
    const analysis = analyzeScan(scan, {
      top: Number(options.top) || 8
    });
    const recommendation = buildRunRecommendation({
      goal: String(options.goal),
      files: asArray(options.file),
      done: asArray(options.done),
      scan,
      analysis
    });

    if (options.json) {
      console.log(JSON.stringify(recommendation, null, 2));
    } else {
      console.log(formatRunRecommendation(recommendation));
    }
  } else if (command === "plan") {
    const options = parseOptions(args.slice(1), {
      json: false,
      goal: "",
      file: [],
      done: [],
      expect: [],
      expectRegex: [],
      budget: "",
      riskProfile: "balanced",
      cache: "",
      graph: false,
      maxFiles: 300
    });
    if (!options.goal) {
      fail("Bitte gib ein Ziel an: sparkompass plan . --goal \"...\"");
    }
    const targetPath = options.positionals[0] ?? ".";
    const plan = await buildContextPlan(targetPath, {
      goal: String(options.goal),
      file: asArray(options.file),
      done: asArray(options.done),
      expect: asArray(options.expect),
      expectRegex: asArray(options.expectRegex),
      budget: parseBudgetOption(options.budget),
      riskProfile: String(options.riskProfile || "balanced"),
      cache: options.cache ? String(options.cache) : "",
      includeGraph: Boolean(options.graph),
      maxFiles: Number(options.maxFiles) || 300
    });

    if (options.json) {
      console.log(JSON.stringify(plan, null, 2));
    } else {
      console.log(formatContextPlanReport(plan));
    }
    if (!plan.gate.verified) {
      process.exitCode = 2;
    }
  } else if (command === "bom" || command === "context-bom") {
    const options = parseOptions(args.slice(1), {
      json: false,
      goal: "",
      file: [],
      done: [],
      expect: [],
      expectRegex: [],
      budget: "",
      riskProfile: "balanced",
      cache: "",
      graph: false,
      maxFiles: 300
    });
    if (!options.goal) {
      fail("Bitte gib ein Ziel an: sparkompass bom . --goal \"...\"");
    }
    const targetPath = options.positionals[0] ?? ".";
    const bom = await buildContextBOM(targetPath, {
      goal: String(options.goal),
      file: asArray(options.file),
      done: asArray(options.done),
      expect: asArray(options.expect),
      expectRegex: asArray(options.expectRegex),
      budget: parseBudgetOption(options.budget),
      riskProfile: String(options.riskProfile || "balanced"),
      cache: options.cache ? String(options.cache) : "",
      includeGraph: Boolean(options.graph),
      maxFiles: Number(options.maxFiles) || 300
    });

    if (options.json) {
      console.log(JSON.stringify(bom, null, 2));
    } else {
      console.log(formatContextBOMReport(bom));
    }
    if (!bom.gate.verified) {
      process.exitCode = 2;
    }
  } else if (command === "control") {
    const options = parseOptions(args.slice(1), {
      json: false,
      goal: "",
      file: [],
      done: [],
      expect: [],
      expectRegex: [],
      budget: "",
      riskProfile: "balanced",
      cache: "",
      graph: false,
      maxFiles: 300,
      previousEnvelope: "",
      minCachePrefixTokens: 1024
    });
    if (!options.goal) {
      fail("Bitte gib ein Ziel an: sparkompass control . --goal \"...\"");
    }
    const targetPath = options.positionals[0] ?? ".";
    const controlExcludeFiles = [
      options.previousEnvelope ? String(options.previousEnvelope) : ""
    ].filter(Boolean);
    const report = await buildContextControlReport(targetPath, {
      goal: String(options.goal),
      file: asArray(options.file),
      done: asArray(options.done),
      expect: asArray(options.expect),
      expectRegex: asArray(options.expectRegex),
      budget: parseBudgetOption(options.budget),
      riskProfile: String(options.riskProfile || "balanced"),
      cache: options.cache ? String(options.cache) : "",
      includeGraph: Boolean(options.graph),
      excludeFiles: controlExcludeFiles,
      maxFiles: Number(options.maxFiles) || 300,
      previousEnvelope: options.previousEnvelope ? await readJsonFile(String(options.previousEnvelope)) : null,
      minCachePrefixTokens: Number(options.minCachePrefixTokens) || 1024
    });

    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(formatContextControlReport(report));
    }
    if (!report.readiness.verified) {
      process.exitCode = 2;
    }
  } else if (command === "evidence-audit") {
    const options = parseOptions(args.slice(1), {
      json: false,
      goal: "",
      file: [],
      done: [],
      expect: [],
      expectRegex: [],
      budget: "",
      riskProfile: "balanced",
      cache: "",
      graph: false,
      maxFiles: 300,
      maxEvidence: 180,
      previousEnvelope: "",
      minCachePrefixTokens: 1024
    });
    if (!options.goal) {
      fail("Bitte gib ein Ziel an: sparkompass evidence-audit . --goal \"...\"");
    }
    const targetPath = options.positionals[0] ?? ".";
    const evidenceExcludeFiles = [
      options.previousEnvelope ? String(options.previousEnvelope) : ""
    ].filter(Boolean);
    const audit = await buildContextEvidenceAudit(targetPath, {
      goal: String(options.goal),
      file: asArray(options.file),
      done: asArray(options.done),
      expect: asArray(options.expect),
      expectRegex: asArray(options.expectRegex),
      budget: parseBudgetOption(options.budget),
      riskProfile: String(options.riskProfile || "balanced"),
      cache: options.cache ? String(options.cache) : "",
      includeGraph: Boolean(options.graph),
      excludeFiles: evidenceExcludeFiles,
      maxFiles: Number(options.maxFiles) || 300,
      maxEvidence: Number(options.maxEvidence) || 180,
      previousEnvelope: options.previousEnvelope ? await readJsonFile(String(options.previousEnvelope)) : null,
      minCachePrefixTokens: Number(options.minCachePrefixTokens) || 1024
    });

    if (options.json) {
      console.log(JSON.stringify(audit, null, 2));
    } else {
      console.log(formatContextEvidenceAuditReport(audit));
    }
    if (!audit.gate.verified) {
      process.exitCode = 2;
    }
  } else if (command === "ablation-audit") {
    const options = parseOptions(args.slice(1), {
      json: false,
      goal: "",
      file: [],
      done: [],
      expect: [],
      expectRegex: [],
      budget: "",
      riskProfile: "balanced",
      cache: "",
      graph: false,
      maxFiles: 300,
      maxUnits: 80
    });
    if (!options.goal) {
      fail("Bitte gib ein Ziel an: sparkompass ablation-audit . --goal \"...\" --expect \"...\"");
    }
    const targetPath = options.positionals[0] ?? ".";
    const audit = await buildContextAblationAudit(targetPath, {
      goal: String(options.goal),
      file: asArray(options.file),
      done: asArray(options.done),
      expect: asArray(options.expect),
      expectRegex: asArray(options.expectRegex),
      budget: parseBudgetOption(options.budget),
      riskProfile: String(options.riskProfile || "balanced"),
      cache: options.cache ? String(options.cache) : "",
      includeGraph: Boolean(options.graph),
      maxFiles: Number(options.maxFiles) || 300,
      maxUnits: Number(options.maxUnits) || 80
    });

    if (options.json) {
      console.log(JSON.stringify(audit, null, 2));
    } else {
      console.log(formatContextAblationAuditReport(audit));
    }
    if (!audit.gate.verified) {
      process.exitCode = 2;
    }
  } else if (command === "slim" || command === "slimming-plan") {
    const options = parseOptions(args.slice(1), {
      json: false,
      goal: "",
      file: [],
      done: [],
      expect: [],
      expectRegex: [],
      budget: "",
      riskProfile: "balanced",
      cache: "",
      graph: false,
      maxFiles: 300,
      maxUnits: 80,
      maxMoves: 24
    });
    if (!options.goal) {
      fail("Bitte gib ein Ziel an: sparkompass slim . --goal \"...\" --expect \"...\"");
    }
    const targetPath = options.positionals[0] ?? ".";
    const slimming = await buildContextSlimmingPlan(targetPath, {
      goal: String(options.goal),
      file: asArray(options.file),
      done: asArray(options.done),
      expect: asArray(options.expect),
      expectRegex: asArray(options.expectRegex),
      budget: parseBudgetOption(options.budget),
      riskProfile: String(options.riskProfile || "balanced"),
      cache: options.cache ? String(options.cache) : "",
      includeGraph: Boolean(options.graph),
      maxFiles: Number(options.maxFiles) || 300,
      maxUnits: Number(options.maxUnits) || 80,
      maxMoves: Number(options.maxMoves) || 24
    });

    if (options.json) {
      console.log(JSON.stringify(slimming, null, 2));
    } else {
      console.log(formatContextSlimmingPlanReport(slimming));
    }
    if (!slimming.gate.verified) {
      process.exitCode = 2;
    }
  } else if (command === "handoff") {
    const options = parseOptions(args.slice(1), {
      json: false,
      goal: "",
      file: [],
      done: [],
      expect: [],
      expectRegex: [],
      budget: "",
      riskProfile: "balanced",
      cache: "",
      graph: false,
      maxFiles: 300,
      previousEnvelope: "",
      minCachePrefixTokens: 1024,
      printPrompt: false,
      ledger: false
    });
    if (!options.goal) {
      fail("Bitte gib ein Ziel an: sparkompass handoff . --goal \"...\"");
    }
    const targetPath = options.positionals[0] ?? ".";
    const handoffExcludeFiles = [
      options.previousEnvelope ? String(options.previousEnvelope) : "",
      options.ledger ? (options.ledger === true ? DEFAULT_HANDOFF_LEDGER_PATH : String(options.ledger)) : ""
    ].filter(Boolean);
    const receipt = await buildContextHandoffReceipt(targetPath, {
      goal: String(options.goal),
      file: asArray(options.file),
      done: asArray(options.done),
      expect: asArray(options.expect),
      expectRegex: asArray(options.expectRegex),
      budget: parseBudgetOption(options.budget),
      riskProfile: String(options.riskProfile || "balanced"),
      cache: options.cache ? String(options.cache) : "",
      includeGraph: Boolean(options.graph),
      excludeFiles: handoffExcludeFiles,
      maxFiles: Number(options.maxFiles) || 300,
      previousEnvelope: options.previousEnvelope ? await readJsonFile(String(options.previousEnvelope)) : null,
      minCachePrefixTokens: Number(options.minCachePrefixTokens) || 1024
    });
    const ledgerWrite = options.ledger
      ? await appendHandoffToLedger(targetPath, receipt, {
        out: options.ledger === true ? DEFAULT_HANDOFF_LEDGER_PATH : String(options.ledger),
        runType: "handoff"
      })
      : null;

    if (options.json) {
      console.log(JSON.stringify(ledgerWrite ? { ...receipt, ledger: ledgerWrite } : receipt, null, 2));
    } else {
      const report = formatContextHandoffReceipt(receipt, {
        includePrompt: Boolean(options.printPrompt)
      });
      console.log(ledgerWrite ? `${report}\n\nHandoff-Ledger: ${ledgerWrite.path}` : report);
    }
    if (!receipt.gate.verified) {
      process.exitCode = 2;
    }
  } else if (command === "envelope") {
    const options = parseOptions(args.slice(1), {
      json: false,
      goal: "",
      file: [],
      done: [],
      expect: [],
      expectRegex: [],
      budget: "",
      riskProfile: "balanced",
      cache: "",
      graph: false,
      maxFiles: 300,
      previousEnvelope: "",
      ledger: false,
      minCachePrefixTokens: 1024
    });
    if (!options.goal) {
      fail("Bitte gib ein Ziel an: sparkompass envelope . --goal \"...\"");
    }
    const targetPath = options.positionals[0] ?? ".";
    const envelopeExcludeFiles = [
      options.previousEnvelope ? String(options.previousEnvelope) : "",
      options.ledger ? (options.ledger === true ? DEFAULT_ENVELOPE_LEDGER_PATH : String(options.ledger)) : ""
    ].filter(Boolean);
    const envelope = await buildContextEnvelope(targetPath, {
      goal: String(options.goal),
      file: asArray(options.file),
      done: asArray(options.done),
      expect: asArray(options.expect),
      expectRegex: asArray(options.expectRegex),
      budget: parseBudgetOption(options.budget),
      riskProfile: String(options.riskProfile || "balanced"),
      cache: options.cache ? String(options.cache) : "",
      includeGraph: Boolean(options.graph),
      excludeFiles: envelopeExcludeFiles,
      maxFiles: Number(options.maxFiles) || 300,
      previousEnvelope: options.previousEnvelope ? await readJsonFile(String(options.previousEnvelope)) : null,
      minCachePrefixTokens: Number(options.minCachePrefixTokens) || 1024
    });
    const ledgerWrite = options.ledger
      ? await appendEnvelopeToLedger(targetPath, envelope, {
        out: options.ledger === true ? DEFAULT_ENVELOPE_LEDGER_PATH : String(options.ledger),
        runType: "envelope"
      })
      : null;

    if (options.json) {
      console.log(JSON.stringify(ledgerWrite ? { ...envelope, ledger: ledgerWrite } : envelope, null, 2));
    } else {
      const report = ledgerWrite
        ? `${formatContextEnvelopeReport(envelope)}\n\nEnvelope-Ledger: ${ledgerWrite.path}`
        : formatContextEnvelopeReport(envelope);
      console.log(report);
    }
    if (!envelope.gate.verified) {
      process.exitCode = 2;
    }
  } else if (command === "compress") {
    const options = parseOptions(args.slice(1), {
      json: false,
      target: 35,
      riskProfile: "balanced",
      mode: "auto",
      keep: [],
      expect: [],
      expectRegex: [],
      file: [],
      text: []
    });
    const input = await readCompressionInput(options);
    const result = compressText(input.text, {
      label: input.label,
      targetPercent: Number(options.target) || 35,
      riskProfile: String(options.riskProfile || "balanced"),
      mode: String(options.mode || "auto"),
      keep: asArray(options.keep),
      expect: asArray(options.expect),
      expectRegex: asArray(options.expectRegex)
    });

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(formatCompressionReport(result));
    }
  } else if (command === "pack") {
    const options = parseOptions(args.slice(1), {
      json: false,
      target: 35,
      autoTarget: false,
      autoMinTarget: 10,
      autoMaxTarget: 90,
      autoStep: 5,
      riskProfile: "balanced",
      mode: "auto",
      keep: [],
      expect: [],
      expectRegex: [],
      file: [],
      text: [],
      ledger: false,
      registry: false,
      storeSourceText: false
    });
    const input = await readCompressionInput(options);
    const autoTarget = shouldAutoTarget(options);
    const packOptions = {
      label: input.label,
      targetPercent: autoTarget ? undefined : Number(options.target) || 35,
      autoMinTargetPercent: Number(options.autoMinTarget) || 10,
      autoMaxTargetPercent: Number(options.autoMaxTarget) || 90,
      autoStepPercent: Number(options.autoStep) || 5,
      riskProfile: String(options.riskProfile || "balanced"),
      mode: String(options.mode || "auto"),
      keep: asArray(options.keep),
      expect: asArray(options.expect),
      expectRegex: asArray(options.expectRegex)
    };
    const pack = autoTarget
      ? buildCalibratedContextPack(input.text, packOptions)
      : buildContextPack(input.text, packOptions);
    const ledgerWrite = options.ledger
      ? await appendReceiptToLedger(process.cwd(), pack.receipt, {
        out: options.ledger === true ? DEFAULT_SAVINGS_LEDGER_PATH : String(options.ledger),
        runType: "pack"
      })
      : null;
    const registryWrite = options.registry
      ? await registerContextPack(process.cwd(), pack, {
        registry: options.registry === true ? DEFAULT_CONTEXT_PACK_REGISTRY_PATH : String(options.registry),
        sourceFile: asArray(options.file).length === 1 ? String(asArray(options.file)[0]) : "",
        sourceText: input.text,
        storeSourceText: Boolean(options.storeSourceText),
        note: "pack-command"
      })
      : null;

    if (options.json) {
      console.log(JSON.stringify({ ...pack, ...(ledgerWrite ? { ledger: ledgerWrite } : {}), ...(registryWrite ? { registry: registryWrite } : {}) }, null, 2));
    } else {
      const suffixes = [
        ledgerWrite ? `Ledger: ${ledgerWrite.path}` : "",
        registryWrite ? `ContextPack-Registry: ${registryWrite.path}` : ""
      ].filter(Boolean);
      console.log(suffixes.length ? `${formatContextPackReport(pack)}\n\n${suffixes.join("\n")}` : formatContextPackReport(pack));
    }
  } else if (command === "receipt") {
    const options = parseOptions(args.slice(1), {
      json: false,
      receipt: "",
      file: "",
      text: "",
      context: "",
      contextText: ""
    });
    const action = options.positionals[0] || "verify";
    if (!["schema", "format", "lint", "verify"].includes(action)) {
      fail(`Unbekannte receipt Aktion: ${action}`);
    }

    if (action === "schema" || action === "format") {
      const format = buildContextPackFormat();
      if (options.json) {
        console.log(JSON.stringify(format, null, 2));
      } else {
        console.log(formatContextPackFormatReport(format));
      }
    } else if (action === "lint") {
      if (!options.receipt) {
        fail("Bitte gib ein Receipt an: sparkompass receipt lint --receipt pack.json");
      }
      const validation = validateContextPackFormat(await readJsonFile(String(options.receipt)));
      if (options.json) {
        console.log(JSON.stringify(validation, null, 2));
      } else {
        console.log(formatContextPackFormatValidationReport(validation));
      }
      if (!validation.verified) {
        process.exitCode = 2;
      }
    } else {
      if (!options.receipt) {
        fail("Bitte gib ein Receipt an: sparkompass receipt verify --receipt pack.json --file original.txt");
      }
      const verification = await buildReceiptVerificationFromFiles({
        receiptFile: String(options.receipt),
        file: options.file ? String(options.file) : "",
        text: options.text ? String(options.text) : "",
        contextFile: options.context ? String(options.context) : "",
        contextText: options.contextText ? String(options.contextText) : ""
      });

      if (options.json) {
        console.log(JSON.stringify(verification, null, 2));
      } else {
        console.log(formatReceiptVerificationReport(verification));
      }
      if (!verification.verified) {
        process.exitCode = 2;
      }
    }
  } else if (command === "contextpack" || command === "context-pack") {
    const options = parseOptions(args.slice(1), {
      json: false,
      registry: DEFAULT_CONTEXT_PACK_REGISTRY_PATH,
      pack: "",
      sourceFile: "",
      file: "",
      sourceText: "",
      text: "",
      context: "",
      contextFile: "",
      contextText: "",
      contextPackId: "",
      storeSourceText: false,
      note: "",
      out: ""
    });
    const action = options.positionals[0] || "report";
    const targetPath = options.positionals[1] ?? ".";
    const registry = options.out || options.registry || DEFAULT_CONTEXT_PACK_REGISTRY_PATH;

    if (!["report", "register", "add", "verify"].includes(action)) {
      fail(`Unbekannte contextpack Aktion: ${action}`);
    }

    if (action === "register" || action === "add") {
      if (!options.pack) {
        fail("Bitte gib ein Pack an: sparkompass contextpack register --pack pack.json");
      }
      const write = await registerContextPack(targetPath, await readJsonFile(String(options.pack)), {
        registry,
        sourceFile: options.sourceFile || options.file || "",
        sourceText: options.sourceText || options.text || "",
        contextFile: options.contextFile || options.context || "",
        contextText: options.contextText || "",
        storeSourceText: Boolean(options.storeSourceText),
        note: options.note || ""
      });

      if (options.json) {
        console.log(JSON.stringify(write, null, 2));
      } else {
        console.log(`ContextPack registriert: ${write.entry.context_pack_id}\nRegistry: ${write.path}`);
      }
    } else if (action === "verify") {
      if (!options.contextPackId) {
        fail("Bitte gib eine ContextPack-ID an: sparkompass contextpack verify --context-pack-id ctx-...");
      }
      const verification = await verifyRegisteredContextPack(targetPath, {
        registry,
        contextPackId: String(options.contextPackId),
        sourceFile: options.sourceFile || options.file || "",
        sourceText: options.sourceText || options.text || "",
        contextFile: options.contextFile || options.context || "",
        contextText: options.contextText || ""
      });

      if (options.json) {
        console.log(JSON.stringify(verification, null, 2));
      } else {
        console.log(formatContextPackRegistryVerificationReport(verification));
      }
      if (!verification.verified) {
        process.exitCode = 2;
      }
    } else {
      const registryReport = await buildContextPackRegistryReport(targetPath, {
        registry
      });
      if (options.json) {
        console.log(JSON.stringify(registryReport, null, 2));
      } else {
        console.log(formatContextPackRegistryReport(registryReport));
      }
    }
  } else if (command === "task") {
    const options = parseOptions(args.slice(1), {
      json: false,
      command: "",
      exitCode: "",
      expectedExitCode: 0,
      outputFile: "",
      outputText: "",
      receipt: "",
      sourceFile: "",
      sourceText: "",
      context: "",
      contextText: "",
      expectOutput: [],
      expectOutputRegex: [],
      timeoutMs: 30000,
      maxOutputBytes: 200000,
      durationMs: "",
      timedOut: false,
      ledger: false
    });
    const action = options.positionals[0] || "run";
    const targetPath = options.positionals[1] ?? ".";
    const common = {
      rootPath: targetPath,
      cwd: targetPath,
      command: String(options.command || ""),
      expectedExitCode: options.expectedExitCode,
      receiptFile: options.receipt ? String(options.receipt) : "",
      sourceFile: options.sourceFile ? String(options.sourceFile) : "",
      sourceText: options.sourceText ? String(options.sourceText) : "",
      contextFile: options.context ? String(options.context) : "",
      contextText: options.contextText ? String(options.contextText) : "",
      expectOutput: asArray(options.expectOutput),
      expectOutputRegex: asArray(options.expectOutputRegex)
    };
    const outcome = action === "run"
      ? await runTaskOutcome({
        ...common,
        timeoutMs: Number(options.timeoutMs) || 30000,
        maxOutputBytes: Number(options.maxOutputBytes) || 200000
      })
      : action === "record"
        ? await recordTaskOutcome({
          ...common,
          outputFile: options.outputFile ? String(options.outputFile) : "",
          outputText: options.outputText ? String(options.outputText) : "",
          exitCode: options.exitCode,
          durationMs: options.durationMs,
          timedOut: Boolean(options.timedOut)
        })
        : fail(`Unbekannte task Aktion: ${action}`);
    const ledgerWrite = options.ledger
      ? await appendTaskOutcomeToLedger(targetPath, outcome, {
        out: options.ledger === true ? DEFAULT_TASK_OUTCOME_LEDGER_PATH : String(options.ledger),
        runType: `task-${action}`
      })
      : null;

    if (options.json) {
      console.log(JSON.stringify(ledgerWrite ? { ...outcome, ledger: ledgerWrite } : outcome, null, 2));
    } else {
      const report = ledgerWrite
        ? `${formatTaskOutcomeReport(outcome)}\n\nTaskOutcome-Ledger: ${ledgerWrite.path}`
        : formatTaskOutcomeReport(outcome);
      console.log(report);
    }
    if (!outcome.gate.verified) {
      process.exitCode = 2;
    }
  } else if (command === "calibrate") {
    const options = parseOptions(args.slice(1), {
      json: false,
      minTarget: 10,
      maxTarget: 90,
      step: 5,
      riskProfile: "balanced",
      mode: "auto",
      keep: [],
      expect: [],
      expectRegex: [],
      file: [],
      text: []
    });
    const input = await readCompressionInput(options);
    const calibration = calibrateContext(input.text, {
      label: input.label,
      minTargetPercent: Number(options.minTarget) || 10,
      maxTargetPercent: Number(options.maxTarget) || 90,
      stepPercent: Number(options.step) || 5,
      riskProfile: String(options.riskProfile || "balanced"),
      mode: String(options.mode || "auto"),
      keep: asArray(options.keep),
      expect: asArray(options.expect),
      expectRegex: asArray(options.expectRegex)
    });

    if (options.json) {
      console.log(JSON.stringify(calibration, null, 2));
    } else {
      console.log(formatCalibrationReport(calibration));
    }
    if (!calibration.verified) {
      process.exitCode = 2;
    }
  } else if (command === "ledger") {
    const options = parseOptions(args.slice(1), {
      json: false,
      ledger: DEFAULT_SAVINGS_LEDGER_PATH,
      out: DEFAULT_SAVINGS_LEDGER_PATH,
      receipt: "",
      kind: "manual",
      note: ""
    });
    const action = options.positionals[0] || "report";
    const targetPath = options.positionals[1] ?? ".";

    if (action === "add") {
      if (!options.receipt) {
        fail("Bitte gib ein Receipt an: sparkompass ledger add --receipt pack.json");
      }
      const receipt = await loadReceiptJson(String(options.receipt));
      const result = await appendReceiptToLedger(targetPath, receipt, {
        out: String(options.out || options.ledger || DEFAULT_SAVINGS_LEDGER_PATH),
        runType: String(options.kind || "manual"),
        note: String(options.note || "")
      });

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(formatSavingsLedgerReport(await buildSavingsLedgerReport(targetPath, {
          ledger: String(options.out || options.ledger || DEFAULT_SAVINGS_LEDGER_PATH)
        })));
      }
    } else if (action === "report") {
      const report = await buildSavingsLedgerReport(targetPath, {
        ledger: String(options.ledger || options.out || DEFAULT_SAVINGS_LEDGER_PATH)
      });

      if (options.json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.log(formatSavingsLedgerReport(report));
      }
    } else {
      fail(`Unbekannte ledger Aktion: ${action}`);
    }
  } else if (command === "task-ledger") {
    const options = parseOptions(args.slice(1), {
      json: false,
      ledger: DEFAULT_TASK_OUTCOME_LEDGER_PATH,
      out: DEFAULT_TASK_OUTCOME_LEDGER_PATH,
      outcome: "",
      kind: "manual",
      note: ""
    });
    const action = options.positionals[0] || "report";
    const targetPath = options.positionals[1] ?? ".";

    if (action === "add") {
      if (!options.outcome) {
        fail("Bitte gib ein TaskOutcome-Receipt an: sparkompass task-ledger add --outcome task.json");
      }
      const outcome = await loadTaskOutcomeJson(String(options.outcome));
      const result = await appendTaskOutcomeToLedger(targetPath, outcome, {
        out: String(options.out || options.ledger || DEFAULT_TASK_OUTCOME_LEDGER_PATH),
        runType: String(options.kind || "manual"),
        note: String(options.note || "")
      });

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(formatTaskOutcomeLedgerReport(await buildTaskOutcomeLedgerReport(targetPath, {
          ledger: String(options.out || options.ledger || DEFAULT_TASK_OUTCOME_LEDGER_PATH)
        })));
      }
    } else if (action === "report") {
      const report = await buildTaskOutcomeLedgerReport(targetPath, {
        ledger: String(options.ledger || options.out || DEFAULT_TASK_OUTCOME_LEDGER_PATH)
      });

      if (options.json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.log(formatTaskOutcomeLedgerReport(report));
      }
    } else {
      fail(`Unbekannte task-ledger Aktion: ${action}`);
    }
  } else if (command === "codex-usage") {
    const options = parseOptions(args.slice(1), {
      json: false,
      ledger: false,
      out: DEFAULT_CODEX_USAGE_LEDGER_PATH,
      file: "",
      jsonl: "",
      baseline: "",
      optimized: "",
      baselineLabel: "",
      optimizedLabel: "",
      label: "",
      kind: "codex-exec-jsonl",
      note: ""
    });
    const action = options.positionals[0] || "report";
    const targetPath = options.positionals[1] ?? ".";

    if (action === "record") {
      const receipt = await recordCodexUsageFromJsonl(targetPath, {
        file: options.file || options.jsonl,
        ledger: options.ledger,
        label: String(options.label || ""),
        runType: String(options.kind || "codex-exec-jsonl"),
        note: String(options.note || "")
      });

      if (options.json) {
        console.log(JSON.stringify(receipt, null, 2));
      } else {
        const ledgerLine = receipt.ledger ? `\n\nCodexUsage-Ledger: ${receipt.ledger.path}` : "";
        console.log(`${formatCodexUsageReceipt(receipt)}${ledgerLine}`);
      }
      if (!receipt.gate.verified) {
        process.exitCode = 2;
      }
    } else if (action === "compare") {
      const comparison = await compareCodexUsageFiles(targetPath, {
        baseline: String(options.baseline || ""),
        optimized: String(options.optimized || ""),
        baselineLabel: String(options.baselineLabel || ""),
        optimizedLabel: String(options.optimizedLabel || "")
      });

      if (options.json) {
        console.log(JSON.stringify(comparison, null, 2));
      } else {
        console.log(formatCodexUsageComparisonReport(comparison));
      }
      if (!comparison.gate.verified) {
        process.exitCode = 2;
      }
    } else if (action === "report") {
      const report = await buildCodexUsageLedgerReport(targetPath, {
        ledger: String(options.ledger || options.out || DEFAULT_CODEX_USAGE_LEDGER_PATH)
      });

      if (options.json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.log(formatCodexUsageLedgerReport(report));
      }
    } else {
      fail(`Unbekannte codex-usage Aktion: ${action}`);
    }
  } else if (command === "experiment") {
    const options = parseOptions(args.slice(1), {
      json: false,
      variant: [],
      promptVariant: [],
      promptFileVariant: [],
      contextPackVariant: [],
      taskPassed: [],
      taskOutcome: [],
      taskOutcomeVariant: [],
      basisRaw: "",
      basisKompakt: "",
      basisCompact: "",
      pluginRaw: "",
      pluginKompakt: "",
      pluginCompact: "",
      experimentId: "",
      repeat: "",
      out: "",
      output: "",
      codexPath: "codex",
      codexVersion: "",
      model: "",
      reasoningEffort: "",
      reasoning: "",
      cacheMode: "",
      sandboxMode: "",
      sandbox: "",
      promptFile: "",
      contextPack: "",
      promptHash: "",
      contextPackHash: "",
      configurationHash: "",
      pluginHash: "",
      skillHash: "",
      toolCatalogHash: "",
      repositoryCommit: "",
      requireAllVariants: true,
      requireMetadata: false,
      requireContextPackHash: false,
      rawPromptFile: "",
      compactPromptFile: "",
      rawPrompt: "",
      compactPrompt: "",
      rawPromptOut: "",
      compactPromptOut: "",
      taskCommand: "",
      expectOutput: [],
      expectOutputRegex: [],
      evidenceDir: "",
      auditJson: "",
      experimentJson: "",
      routerJson: "",
      overheadJson: "",
      toolProfile: "",
      configurationFile: "",
      plan: "",
      planFile: ""
    });
    const action = options.positionals[0] || "run";
    const targetPath = options.positionals[1] ?? ".";

    if (action === "plan") {
      const plan = await buildSparkompassExperimentPlan(targetPath, options);
      const outPath = await writeSparkompassExperimentPlan(targetPath, plan, {
        out: options.out || options.output
      });

      if (options.json) {
        console.log(JSON.stringify({ ...plan, output_path: outPath }, null, 2));
      } else {
        const outputLine = outPath ? `\n\nPlan-Datei: ${outPath}` : "";
        console.log(`${formatSparkompassExperimentPlan(plan)}${outputLine}`);
      }
      if (!plan.gate.verified) {
        process.exitCode = 2;
      }
    } else if (action === "run") {
      const experiment = await buildSparkompassExperimentRun(targetPath, options);
      const outPath = await writeSparkompassExperimentRun(targetPath, experiment, {
        out: options.out || options.output
      });

      if (options.json) {
        console.log(JSON.stringify({ ...experiment, output_path: outPath }, null, 2));
      } else {
        const outputLine = outPath ? `\n\nExperiment-Datei: ${outPath}` : "";
        console.log(`${formatSparkompassExperimentRun(experiment)}${outputLine}`);
      }
      if (!experiment.gate.verified) {
        process.exitCode = 2;
      }
    } else if (action === "script") {
      const script = await buildSparkompassExperimentScript(targetPath, options);
      const outPath = await writeSparkompassExperimentScript(targetPath, script, {
        out: options.out || options.output
      });

      if (options.json) {
        const { script: _scriptText, ...payload } = script;
        console.log(JSON.stringify({ ...payload, output_path: outPath }, null, 2));
      } else {
        const outputLine = outPath ? `\n\nScript-Datei: ${outPath}` : "";
        console.log(`${formatSparkompassExperimentScript(script)}${outputLine}`);
      }
      if (!script.gate.verified) {
        process.exitCode = 2;
      }
    } else if (action === "audit") {
      const audit = await buildSparkompassExperimentEvidenceAudit(targetPath, options);
      const outPath = await writeSparkompassExperimentEvidenceAudit(targetPath, audit, {
        out: options.out || options.output
      });

      if (options.json) {
        console.log(JSON.stringify({ ...audit, output_path: outPath }, null, 2));
      } else {
        const outputLine = outPath ? `\n\nAudit-Datei: ${outPath}` : "";
        console.log(`${formatSparkompassExperimentEvidenceAudit(audit)}${outputLine}`);
      }
      if (!audit.gate.verified) {
        process.exitCode = 2;
      }
    } else {
      fail(`Unbekannte experiment Aktion: ${action}`);
    }
  } else if (command === "router") {
    const options = parseOptions(args.slice(1), {
      json: false,
      experiment: "",
      overhead: "",
      minNetGainTokens: 1,
      requireQualityEvidence: true,
      out: "",
      output: ""
    });
    const action = options.positionals[0] || "decide";
    const targetPath = options.positionals[1] ?? ".";

    if (action === "decide") {
      if (!options.experiment) {
        fail("Bitte gib ein Experiment an: sparkompass router decide . --experiment evidence/experiment.json");
      }
      const root = path.resolve(targetPath);
      const experiment = await readJsonFile(resolveCliPath(root, String(options.experiment)));
      const overhead = options.overhead
        ? await readJsonFile(resolveCliPath(root, String(options.overhead)))
        : null;
      const decision = buildSparkompassRouterDecision({
        experiment,
        overhead
      }, {
        minNetGainTokens: Number(options.minNetGainTokens) || 1,
        requireQualityEvidence: options.requireQualityEvidence !== false
      });
      const outPath = options.out || options.output
        ? resolveCliPath(root, String(options.out || options.output))
        : "";
      if (outPath) {
        await fs.mkdir(path.dirname(outPath), { recursive: true });
        await fs.writeFile(outPath, `${JSON.stringify(decision, null, 2)}\n`, "utf8");
      }

      if (options.json) {
        console.log(JSON.stringify({ ...decision, output_path: outPath || null }, null, 2));
      } else {
        const outputLine = outPath ? `\n\nRouter-Datei: ${outPath}` : "";
        console.log(`${formatSparkompassRouterDecision(decision)}${outputLine}`);
      }
      if (!decision.gate.verified) {
        process.exitCode = 2;
      }
    } else {
      fail(`Unbekannte router Aktion: ${action}`);
    }
  } else if (command === "handoff-ledger") {
    const options = parseOptions(args.slice(1), {
      json: false,
      ledger: DEFAULT_HANDOFF_LEDGER_PATH,
      out: DEFAULT_HANDOFF_LEDGER_PATH,
      receipt: "",
      kind: "manual",
      note: ""
    });
    const action = options.positionals[0] || "report";
    const targetPath = options.positionals[1] ?? ".";

    if (action === "add") {
      if (!options.receipt) {
        fail("Bitte gib ein Handoff-Receipt an: sparkompass handoff-ledger add --receipt handoff.json");
      }
      const receipt = await loadHandoffReceiptJson(String(options.receipt));
      const result = await appendHandoffToLedger(targetPath, receipt, {
        out: String(options.out || options.ledger || DEFAULT_HANDOFF_LEDGER_PATH),
        runType: String(options.kind || "manual"),
        note: String(options.note || "")
      });

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(formatHandoffLedgerReport(await buildHandoffLedgerReport(targetPath, {
          ledger: String(options.out || options.ledger || DEFAULT_HANDOFF_LEDGER_PATH)
        })));
      }
    } else if (action === "report") {
      const report = await buildHandoffLedgerReport(targetPath, {
        ledger: String(options.ledger || options.out || DEFAULT_HANDOFF_LEDGER_PATH)
      });

      if (options.json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.log(formatHandoffLedgerReport(report));
      }
    } else {
      fail(`Unbekannte handoff-ledger Aktion: ${action}`);
    }
  } else if (command === "envelope-ledger") {
    const options = parseOptions(args.slice(1), {
      json: false,
      ledger: DEFAULT_ENVELOPE_LEDGER_PATH,
      out: DEFAULT_ENVELOPE_LEDGER_PATH,
      envelope: "",
      kind: "manual",
      note: ""
    });
    const action = options.positionals[0] || "report";
    const targetPath = options.positionals[1] ?? ".";

    if (action === "add") {
      if (!options.envelope) {
        fail("Bitte gib eine Envelope an: sparkompass envelope-ledger add --envelope envelope.json");
      }
      const envelope = await loadEnvelopeJson(String(options.envelope));
      const result = await appendEnvelopeToLedger(targetPath, envelope, {
        out: String(options.out || options.ledger || DEFAULT_ENVELOPE_LEDGER_PATH),
        runType: String(options.kind || "manual"),
        note: String(options.note || "")
      });

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(formatEnvelopeLedgerReport(await buildEnvelopeLedgerReport(targetPath, {
          ledger: String(options.out || options.ledger || DEFAULT_ENVELOPE_LEDGER_PATH)
        })));
      }
    } else if (action === "report") {
      const report = await buildEnvelopeLedgerReport(targetPath, {
        ledger: String(options.ledger || options.out || DEFAULT_ENVELOPE_LEDGER_PATH)
      });

      if (options.json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.log(formatEnvelopeLedgerReport(report));
      }
    } else {
      fail(`Unbekannte envelope-ledger Aktion: ${action}`);
    }
  } else if (command === "shadow") {
    const options = parseOptions(args.slice(1), {
      json: false,
      target: 35,
      riskProfile: "balanced",
      mode: "auto",
      keep: [],
      expect: [],
      expectRegex: [],
      file: [],
      text: []
    });
    const input = await readCompressionInput(options);
    const shadow = runShadowComparison(input.text, {
      label: input.label,
      targetPercent: Number(options.target) || 35,
      riskProfile: String(options.riskProfile || "balanced"),
      mode: String(options.mode || "auto"),
      keep: asArray(options.keep),
      expect: asArray(options.expect),
      expectRegex: asArray(options.expectRegex)
    });

    if (options.json) {
      console.log(JSON.stringify(shadow, null, 2));
    } else {
      console.log(formatShadowReport(shadow));
    }
    if (!shadow.gate.verified) {
      process.exitCode = 2;
    }
  } else if (command === "tool-output") {
    const options = parseOptions(args.slice(1), {
      json: false,
      command: "",
      exitCode: "",
      store: false,
      summary: "",
      raw: "",
      id: "",
      out: ".sparkompass/tool-output",
      line: "",
      pattern: "",
      contextLines: 6,
      maxLines: 80,
      expectedHash: "",
      file: [],
      text: []
    });
    const action = options.positionals[0] || "summary";

    if (action === "load") {
      const evidence = await loadToolOutputEvidence(process.cwd(), {
        summary: options.summary || "",
        raw: options.raw || "",
        id: options.id || "",
        out: options.out || ".sparkompass/tool-output",
        line: options.line,
        pattern: options.pattern || "",
        contextLines: Number(options.contextLines) || 6,
        maxLines: Number(options.maxLines) || 80,
        expectedHash: options.expectedHash || ""
      });

      if (options.json) {
        console.log(JSON.stringify(evidence, null, 2));
      } else {
        console.log(formatToolOutputEvidence(evidence));
      }
    } else {
      const input = await readCompressionInput(options);
      let summary = summarizeToolOutput(input.text, {
        label: input.label,
        command: String(options.command || ""),
        exitCode: options.exitCode
      });
      if (options.store) {
        summary = await writeToolOutputEvidence(process.cwd(), input.text, summary, {
          out: options.store === true ? ".sparkompass/tool-output" : String(options.store)
        });
      }

      if (options.json) {
        console.log(JSON.stringify(summary, null, 2));
      } else {
        console.log(formatToolOutputSummary(summary));
      }
    }
  } else if (command === "inventory") {
    const options = parseOptions(args.slice(1), {
      json: false,
      maxFiles: 300
    });
    const targetPath = options.positionals[0] ?? ".";
    const inventory = await buildContextInventory(targetPath, {
      maxFiles: Number(options.maxFiles) || 300
    });

    if (options.json) {
      console.log(JSON.stringify(inventory, null, 2));
    } else {
      console.log(formatInventoryReport(inventory));
    }
  } else if (command === "cache") {
    const options = parseOptions(args.slice(1), {
      json: false,
      out: ".sparkompass/context-cache.json",
      maxFiles: 300
    });
    const targetPath = options.positionals[0] ?? ".";
    const result = await writeContextCache(targetPath, {
      out: String(options.out),
      maxFiles: Number(options.maxFiles) || 300
    });

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(formatCacheReport(result));
    }
  } else if (command === "delta") {
    const options = parseOptions(args.slice(1), {
      json: false,
      cache: ".sparkompass/context-cache.json",
      maxFiles: 300
    });
    const targetPath = options.positionals[0] ?? ".";
    const delta = await buildContextDelta(targetPath, {
      cache: String(options.cache),
      maxFiles: Number(options.maxFiles) || 300
    });

    if (options.json) {
      console.log(JSON.stringify(delta, null, 2));
    } else {
      console.log(formatDeltaReport(delta));
    }
  } else if (command === "lookup") {
    const options = parseOptions(args.slice(1), {
      json: false,
      query: "",
      budget: 400,
      maxFiles: 300
    });
    const targetPath = options.positionals[0] ?? ".";
    const result = await lookupContext(targetPath, {
      query: String(options.query || ""),
      budget: Number(options.budget) || 400,
      maxFiles: Number(options.maxFiles) || 300
    });

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(formatLookupReport(result));
    }
  } else if (command === "source" || command === "source-hash") {
    const options = parseOptions(args.slice(1), {
      json: false,
      sourceHash: "",
      fileHash: "",
      file: "",
      contextLines: 6,
      maxMatches: 5,
      maxFiles: 300
    });
    const targetPath = options.positionals[0] ?? ".";
    const evidence = await loadSourceByHash(targetPath, {
      sourceHash: String(options.sourceHash || ""),
      fileHash: String(options.fileHash || ""),
      file: String(options.file || ""),
      contextLines: Number(options.contextLines) || 6,
      maxMatches: Number(options.maxMatches) || 5,
      maxFiles: Number(options.maxFiles) || 300
    });

    if (options.json) {
      console.log(JSON.stringify(evidence, null, 2));
    } else {
      console.log(formatSourceHashEvidenceReport(evidence));
    }
    if (!evidence.gate.verified) {
      process.exitCode = 2;
    }
  } else if (command === "graph") {
    const options = parseOptions(args.slice(1), {
      json: false,
      query: "",
      maxFiles: 300,
      limit: 80
    });
    const targetPath = options.positionals[0] ?? ".";
    const graph = await buildContextGraph(targetPath, {
      maxFiles: Number(options.maxFiles) || 300
    });
    const neighborhood = options.query
      ? findSymbolNeighborhood(graph, String(options.query), {
        limit: Number(options.limit) || 80
      })
      : null;

    if (options.json) {
      console.log(JSON.stringify({ graph, neighborhood }, null, 2));
    } else {
      console.log(formatGraphReport(graph, neighborhood));
    }
  } else if (command === "slice") {
    const options = parseOptions(args.slice(1), {
      json: false,
      query: "",
      maxFiles: 300
    });
    const targetPath = options.positionals[0] ?? ".";
    const slice = await buildProgramSlice(targetPath, {
      query: String(options.query || ""),
      maxFiles: Number(options.maxFiles) || 300
    });

    if (options.json) {
      console.log(JSON.stringify(slice, null, 2));
    } else {
      console.log(formatProgramSliceReport(slice));
    }
  } else if (command === "flow") {
    const options = parseOptions(args.slice(1), {
      json: false,
      query: "",
      depth: 2,
      maxEdges: 60,
      maxFiles: 300
    });
    const targetPath = options.positionals[0] ?? ".";
    const trace = await buildDataFlowTrace(targetPath, {
      query: String(options.query || ""),
      depth: Number(options.depth) || 2,
      maxEdges: Number(options.maxEdges) || 60,
      maxFiles: Number(options.maxFiles) || 300
    });

    if (options.json) {
      console.log(JSON.stringify(trace, null, 2));
    } else {
      console.log(formatDataFlowTraceReport(trace));
    }
  } else if (command === "semantic-cache") {
    const options = parseOptions(args.slice(1), {
      json: false,
      query: "",
      file: "",
      text: "",
      label: "",
      oracle: [],
      expect: [],
      expectRegex: [],
      keep: [],
      toolVersion: [],
      target: 35,
      riskProfile: "balanced",
      mode: "auto",
      out: ".sparkompass/semantic-cache.json",
      cache: ".sparkompass/semantic-cache.json",
      budget: 400,
      maxFiles: 300,
      minSimilarity: undefined,
      registry: false,
      storeSourceText: false
    });
    const action = options.positionals[0] || "lookup";
    const targetPath = options.positionals[1] ?? ".";

    if (action === "add") {
      const result = await addSemanticCacheEntry(targetPath, {
        query: String(options.query || ""),
        file: options.file ? String(options.file) : "",
        text: options.text ? String(options.text) : "",
        label: options.label ? String(options.label) : "",
        oracle: asArray(options.oracle),
        expect: asArray(options.expect),
        expectRegex: asArray(options.expectRegex),
        keep: asArray(options.keep),
        toolVersion: asArray(options.toolVersion),
        targetPercent: Number(options.target) || 35,
        riskProfile: String(options.riskProfile || "balanced"),
        mode: String(options.mode || "auto"),
        out: String(options.out),
        registry: options.registry ? (options.registry === true ? DEFAULT_CONTEXT_PACK_REGISTRY_PATH : String(options.registry)) : "",
        storeSourceText: Boolean(options.storeSourceText),
        budget: Number(options.budget) || 400,
        maxFiles: Number(options.maxFiles) || 300
      });

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(formatSemanticCacheAddReport(result));
      }
    } else if (action === "lookup") {
      const result = await lookupSemanticCache(targetPath, {
        query: String(options.query || ""),
        oracle: asArray(options.oracle),
        expect: asArray(options.expect),
        expectRegex: asArray(options.expectRegex),
        toolVersion: asArray(options.toolVersion),
        cache: String(options.cache),
        budget: Number(options.budget) || 400,
        maxFiles: Number(options.maxFiles) || 300,
        minSimilarity: options.minSimilarity === undefined ? undefined : Number(options.minSimilarity)
      });

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(formatSemanticCacheLookupReport(result));
      }
    } else {
      fail(`Unbekannte semantic-cache Aktion: ${action}`);
    }
  } else if (command === "prompt-advisory" || command === "preflight") {
    const options = parseOptions(args.slice(1), {
      json: false,
      file: [],
      text: [],
      hookPayload: false,
      minTokens: "",
      minLines: "",
      quietOk: false,
      always: false
    });
    const input = await readCompressionInput(options);
    const advisory = buildPromptAdvisory(input.text, {
      hookPayload: Boolean(options.hookPayload),
      minTokens: options.minTokens,
      minLines: options.minLines
    });

    if (options.json) {
      console.log(JSON.stringify(advisory, null, 2));
    } else if (!options.quietOk || options.always || advisory.status === "advisory") {
      console.log(formatPromptAdvisory(advisory));
    }
  } else if (command === "prompt-prepare" || command === "prepare-prompt") {
    const options = parseOptions(args.slice(1), {
      json: false,
      file: [],
      text: [],
      hookPayload: false,
      minTokens: "",
      minLines: "",
      goal: "",
      target: 35,
      autoTarget: false,
      autoMinTarget: 10,
      autoMaxTarget: 90,
      autoStep: 5,
      riskProfile: "balanced",
      mode: "auto",
      keep: [],
      expect: [],
      expectRegex: [],
      includeReceipt: false,
      ledger: false,
      note: ""
    });
    const input = await readCompressionInput(options);
    const preparation = buildPromptPreparation(input.text, {
      label: input.label,
      hookPayload: Boolean(options.hookPayload),
      minTokens: options.minTokens,
      minLines: options.minLines,
      goal: String(options.goal || ""),
      autoTarget: shouldAutoTarget(options),
      targetPercent: shouldAutoTarget(options) ? undefined : Number(options.target) || 35,
      autoMinTargetPercent: Number(options.autoMinTarget) || 10,
      autoMaxTargetPercent: Number(options.autoMaxTarget) || 90,
      autoStepPercent: Number(options.autoStep) || 5,
      riskProfile: String(options.riskProfile || "balanced"),
      mode: String(options.mode || "auto"),
      keep: asArray(options.keep),
      expect: asArray(options.expect),
      expectRegex: asArray(options.expectRegex),
      includeReceipt: Boolean(options.includeReceipt)
    });
    const ledgerWrite = options.ledger
      ? await appendPromptPreparationToLedger(process.cwd(), preparation, {
        out: options.ledger === true ? DEFAULT_PROMPT_PREPARATION_LEDGER_PATH : String(options.ledger),
        runType: "prompt-prepare",
        note: String(options.note || "")
      })
      : null;

    if (options.json) {
      console.log(JSON.stringify(ledgerWrite ? { ...preparation, ledger: ledgerWrite } : preparation, null, 2));
    } else {
      const report = formatPromptPreparation(preparation);
      console.log(ledgerWrite ? `${report}\n\nPromptPreparation-Ledger: ${ledgerWrite.path}` : report);
    }
    if (!preparation.gate.verified) {
      process.exitCode = 2;
    }
  } else if (command === "prompt-ledger" || command === "prompt-preparation-ledger") {
    const options = parseOptions(args.slice(1), {
      json: false,
      ledger: DEFAULT_PROMPT_PREPARATION_LEDGER_PATH,
      out: "",
      preparation: "",
      kind: "prompt-prepare",
      note: ""
    });
    const action = options.positionals[0] || "report";
    const targetPath = options.positionals[1] ?? ".";

    if (action === "add") {
      if (!options.preparation) {
        fail("Bitte PromptPreparation angeben: sparkompass prompt-ledger add --preparation prompt.json");
      }
      const write = await appendPromptPreparationToLedger(targetPath, await loadPromptPreparationJson(String(options.preparation)), {
        out: options.out || options.ledger || DEFAULT_PROMPT_PREPARATION_LEDGER_PATH,
        runType: String(options.kind || "prompt-prepare"),
        note: String(options.note || "")
      });

      if (options.json) {
        console.log(JSON.stringify(write, null, 2));
      } else {
        console.log(`PromptPreparation-Ledger: ${write.path}\nEinträge: ${write.totals.entries}`);
      }
    } else if (action === "report") {
      const ledger = await buildPromptPreparationLedgerReport(targetPath, {
        ledger: options.ledger || DEFAULT_PROMPT_PREPARATION_LEDGER_PATH
      });

      if (options.json) {
        console.log(JSON.stringify(ledger, null, 2));
      } else {
        console.log(formatPromptPreparationLedgerReport(ledger));
      }
    } else {
      fail(`Unbekannte prompt-ledger Aktion: ${action}`);
    }
  } else if (command === "pilot") {
    const options = parseOptions(args.slice(1), {
      json: false,
      ledgerDir: ".sparkompass/pilot-run",
      target: 35,
      minSaving: 35,
      minAnchors: 75,
      riskProfile: "balanced",
      mode: "auto",
      allowRisk: false,
      goal: "",
      file: [],
      keep: [],
      expect: [],
      expectRegex: [],
      done: [],
      handoffExpect: [],
      handoffExpectRegex: [],
      budget: 900,
      graph: false,
      maxFiles: 300,
      maxPackFiles: "",
      minCachePrefixTokens: 1024,
      taskCommand: "",
      expectedExitCode: 0,
      expectOutput: [],
      expectOutputRegex: [],
      timeoutMs: 30000,
      maxOutputBytes: 200000
    });
    const targetPath = options.positionals[0] ?? ".";
    const pilot = await runPilot(targetPath, {
      ledgerDir: String(options.ledgerDir || ".sparkompass/pilot-run"),
      targetPercent: Number(options.target) || 35,
      minSaving: Number(options.minSaving) || 35,
      minAnchors: Number(options.minAnchors) || 75,
      riskProfile: String(options.riskProfile || "balanced"),
      mode: String(options.mode || "auto"),
      allowRisk: Boolean(options.allowRisk),
      goal: options.goal ? String(options.goal) : "",
      file: asArray(options.file),
      keep: asArray(options.keep),
      expect: asArray(options.expect),
      expectRegex: asArray(options.expectRegex),
      done: asArray(options.done),
      handoffExpect: asArray(options.handoffExpect),
      handoffExpectRegex: asArray(options.handoffExpectRegex),
      budget: Number(options.budget) || 900,
      includeGraph: Boolean(options.graph),
      maxFiles: Number(options.maxFiles) || 300,
      maxPackFiles: options.maxPackFiles === "" ? undefined : Number(options.maxPackFiles),
      minCachePrefixTokens: Number(options.minCachePrefixTokens) || 1024,
      taskCommand: options.taskCommand ? String(options.taskCommand) : "",
      expectedExitCode: options.expectedExitCode,
      expectOutput: asArray(options.expectOutput),
      expectOutputRegex: asArray(options.expectOutputRegex),
      timeoutMs: Number(options.timeoutMs) || 30000,
      maxOutputBytes: Number(options.maxOutputBytes) || 200000
    });

    if (options.json) {
      console.log(JSON.stringify(pilot, null, 2));
    } else {
      console.log(formatPilotRunReport(pilot));
    }
    if (!pilot.gate.verified) {
      process.exitCode = 2;
    }
  } else if (command === "impact") {
    const options = parseOptions(args.slice(1), {
      json: false,
      savingsLedger: DEFAULT_SAVINGS_LEDGER_PATH,
      taskOutcomeLedger: DEFAULT_TASK_OUTCOME_LEDGER_PATH,
      handoffLedger: DEFAULT_HANDOFF_LEDGER_PATH,
      promptPreparationLedger: DEFAULT_PROMPT_PREPARATION_LEDGER_PATH
    });
    const targetPath = options.positionals[0] ?? ".";
    const report = await buildSparkompassImpactReport(targetPath, {
      savingsLedger: String(options.savingsLedger || DEFAULT_SAVINGS_LEDGER_PATH),
      taskOutcomeLedger: String(options.taskOutcomeLedger || DEFAULT_TASK_OUTCOME_LEDGER_PATH),
      handoffLedger: String(options.handoffLedger || DEFAULT_HANDOFF_LEDGER_PATH),
      promptPreparationLedger: String(options.promptPreparationLedger || DEFAULT_PROMPT_PREPARATION_LEDGER_PATH)
    });

    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(formatSparkompassImpactReport(report));
    }
    if (!report.gate.verified) {
      process.exitCode = 2;
    }
  } else if (command === "package-audit" || command === "pack-audit") {
    const options = parseOptions(args.slice(1), {
      json: false,
      maxPackageSizeKb: 1000,
      maxUnpackedSizeKb: 3000,
      maxFiles: 120
    });
    const targetPath = options.positionals[0] ?? ".";
    const audit = await buildPackageDryRunAudit(targetPath, {
      maxPackageSizeBytes: Number(options.maxPackageSizeKb) * 1000 || 1_000_000,
      maxUnpackedSizeBytes: Number(options.maxUnpackedSizeKb) * 1000 || 3_000_000,
      maxFiles: Number(options.maxFiles) || 120
    });

    if (options.json) {
      console.log(JSON.stringify(audit, null, 2));
    } else {
      console.log(formatPackageDryRunAudit(audit));
    }
    if (!audit.verified) {
      process.exitCode = 2;
    }
  } else if (command === "package-smoke" || command === "install-smoke") {
    const options = parseOptions(args.slice(1), {
      json: false,
      keepTemp: false
    });
    const targetPath = options.positionals[0] ?? ".";
    const audit = await buildPackageInstallSmokeAudit(targetPath, {
      keepTemp: Boolean(options.keepTemp)
    });

    if (options.json) {
      console.log(JSON.stringify(audit, null, 2));
    } else {
      console.log(formatPackageInstallSmokeAudit(audit));
    }
    if (!audit.verified) {
      process.exitCode = 2;
    }
  } else if (command === "plugin-smoke" || command === "plugin-install-smoke") {
    const options = parseOptions(args.slice(1), {
      json: false,
      keepTemp: false
    });
    const targetPath = options.positionals[0] ?? ".";
    const audit = await buildPluginInstallSmokeAudit(targetPath, {
      keepTemp: Boolean(options.keepTemp)
    });

    if (options.json) {
      console.log(JSON.stringify(audit, null, 2));
    } else {
      console.log(formatPluginInstallSmokeAudit(audit));
    }
    if (!audit.verified) {
      process.exitCode = 2;
    }
  } else if (command === "release-audit") {
    const options = parseOptions(args.slice(1), {
      json: false,
      target: 35,
      minSaving: 35,
      minAnchors: 75,
      allowRisk: false,
      pilot: true,
      ledgerDir: "",
      riskProfile: "balanced",
      maxFiles: 300,
      maxPackFiles: 1,
      maxMoves: 24,
      savingsLedger: DEFAULT_SAVINGS_LEDGER_PATH,
      taskOutcomeLedger: DEFAULT_TASK_OUTCOME_LEDGER_PATH,
      envelopeLedger: DEFAULT_ENVELOPE_LEDGER_PATH,
      handoffLedger: DEFAULT_HANDOFF_LEDGER_PATH,
      promptPreparationLedger: DEFAULT_PROMPT_PREPARATION_LEDGER_PATH
    });
    const targetPath = options.positionals[0] ?? ".";
    const audit = await buildReleaseAudit(targetPath, {
      targetPercent: Number(options.target) || 35,
      minSaving: Number(options.minSaving) || 35,
      minAnchors: Number(options.minAnchors) || 75,
      allowRisk: Boolean(options.allowRisk),
      includePilot: Boolean(options.pilot),
      ledgerDir: options.ledgerDir ? String(options.ledgerDir) : "",
      riskProfile: String(options.riskProfile || "balanced"),
      maxFiles: Number(options.maxFiles) || 300,
      maxPackFiles: Number(options.maxPackFiles) || 1,
      maxMoves: Number(options.maxMoves) || 24,
      savingsLedger: String(options.savingsLedger || DEFAULT_SAVINGS_LEDGER_PATH),
      taskOutcomeLedger: String(options.taskOutcomeLedger || DEFAULT_TASK_OUTCOME_LEDGER_PATH),
      envelopeLedger: String(options.envelopeLedger || DEFAULT_ENVELOPE_LEDGER_PATH),
      handoffLedger: String(options.handoffLedger || DEFAULT_HANDOFF_LEDGER_PATH),
      promptPreparationLedger: String(options.promptPreparationLedger || DEFAULT_PROMPT_PREPARATION_LEDGER_PATH)
    });

    if (options.json) {
      console.log(JSON.stringify(audit, null, 2));
    } else {
      console.log(formatReleaseAuditReport(audit));
    }
    if (!audit.gate.verified) {
      process.exitCode = 2;
    }
  } else if (command === "scorecard") {
    const options = parseOptions(args.slice(1), {
      json: false,
      target: 35,
      minSaving: 35,
      minAnchors: 75,
      allowRisk: false,
      savingsLedger: DEFAULT_SAVINGS_LEDGER_PATH,
      taskOutcomeLedger: DEFAULT_TASK_OUTCOME_LEDGER_PATH,
      envelopeLedger: DEFAULT_ENVELOPE_LEDGER_PATH,
      handoffLedger: DEFAULT_HANDOFF_LEDGER_PATH,
      promptPreparationLedger: DEFAULT_PROMPT_PREPARATION_LEDGER_PATH
    });
    const targetPath = options.positionals[0] ?? ".";
    const scorecard = await buildSparkompassScorecard(targetPath, {
      targetPercent: Number(options.target) || 35,
      minSaving: Number(options.minSaving) || 35,
      minAnchors: Number(options.minAnchors) || 75,
      allowRisk: Boolean(options.allowRisk),
      savingsLedger: String(options.savingsLedger || DEFAULT_SAVINGS_LEDGER_PATH),
      taskOutcomeLedger: String(options.taskOutcomeLedger || DEFAULT_TASK_OUTCOME_LEDGER_PATH),
      envelopeLedger: String(options.envelopeLedger || DEFAULT_ENVELOPE_LEDGER_PATH),
      handoffLedger: String(options.handoffLedger || DEFAULT_HANDOFF_LEDGER_PATH),
      promptPreparationLedger: String(options.promptPreparationLedger || DEFAULT_PROMPT_PREPARATION_LEDGER_PATH)
    });

    if (options.json) {
      console.log(JSON.stringify(scorecard, null, 2));
    } else {
      console.log(formatSparkompassScorecard(scorecard));
    }
    if (!scorecard.release_readiness.verified) {
      process.exitCode = 2;
    }
  } else if (command === "benchmark") {
    const options = parseOptions(args.slice(1), {
      json: false,
      target: 35
    });
    const targetPath = options.positionals[0] ?? ".";
    const benchmark = await runBenchmark(targetPath, {
      targetPercent: Number(options.target) || 35
    });

    if (options.json) {
      console.log(JSON.stringify(benchmark, null, 2));
    } else {
      console.log(formatBenchmarkReport(benchmark));
    }
    if (!benchmark.totals.verified) {
      process.exitCode = 2;
    }
  } else if (command === "dogfood") {
    const options = parseOptions(args.slice(1), {
      json: false,
      target: 35,
      minSaving: 35,
      minAnchors: 75,
      failOnRisk: false
    });
    const targetPath = options.positionals[0] ?? ".";
    const report = await runDogfood(targetPath, {
      targetPercent: Number(options.target) || 35,
      minSaving: Number(options.minSaving) || 35,
      minAnchors: Number(options.minAnchors) || 75,
      allowRisk: !options.failOnRisk
    });

    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(formatDogfoodReport(report));
    }
    if (!report.gate.publishable) {
      process.exitCode = 2;
    }
  } else if (command === "prompt") {
    const options = parseOptions(args.slice(1), {
      goal: "",
      context: [],
      constraint: [],
      done: [],
      file: []
    });
    if (!options.goal) {
      fail("Bitte gib ein Ziel an: sparkompass prompt --goal \"...\"");
    }
    console.log(buildCompactPrompt({
      goal: String(options.goal),
      context: asArray(options.context),
      constraints: asArray(options.constraint),
      done: asArray(options.done),
      files: asArray(options.file)
    }));
  } else if (command === "doctor") {
    const action = args[1] || "";
    if (action === "overhead") {
      const options = parseOptions(args.slice(2), {
        json: false,
        profile: ""
      });
      const targetPath = options.positionals[0] ?? ".";
      const report = await buildDoctorOverhead(targetPath, {
        profile: options.profile ? String(options.profile) : ""
      });
      if (options.json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.log(formatDoctorOverheadReport(report));
      }
      if (!report.gate.verified) {
        process.exitCode = 2;
      }
    } else {
      console.log(formatDoctor());
    }
  } else if (command === "help" || command === "--help" || command === "-h") {
    console.log(HELP);
  } else {
    fail(`Unbekannter Befehl: ${command}\n\n${HELP}`);
  }
} catch (error) {
  fail(error?.message ?? String(error));
}

function parseOptions(argv, defaults = {}) {
  const result = { ...defaults, positionals: [] };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      result.positionals.push(arg);
      continue;
    }

    const [rawKey, inlineValue] = arg.slice(2).split("=", 2);
    const key = toCamelCase(rawKey);
    const next = argv[index + 1];
    const hasInlineValue = inlineValue !== undefined;
    const hasNextValue = next !== undefined && !next.startsWith("--");

    let value;
    if (hasInlineValue) {
      value = coerceValue(inlineValue);
    } else if (hasNextValue) {
      value = coerceValue(next);
      index += 1;
    } else {
      value = true;
    }

    if (Array.isArray(result[key])) {
      result[key] = [...result[key], value];
    } else {
      result[key] = value;
    }
  }

  return result;
}

function toCamelCase(value) {
  return value.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
}

function coerceValue(value) {
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^\d+$/.test(value)) return Number(value);
  return value;
}

function asArray(value) {
  if (value === undefined || value === "") return [];
  return Array.isArray(value) ? value : [value];
}

function shouldAutoTarget(options) {
  return Boolean(options.autoTarget) || String(options.target || "").trim().toLowerCase() === "auto";
}

function parseBudgetOption(value) {
  if (value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function formatDoctor() {
  return `
# Codex Sparkompass Doctor

Sparsame Codex-Läufe beginnen mit vier Fragen:

1. Ist das Ziel eng genug formuliert?
2. Sind nur die wirklich relevanten Dateien genannt?
3. Ist AGENTS.md kurz, konkret und nah am betroffenen Unterordner?
4. Sind MCP-Server, Skills und Subagents nur aktiv, wenn sie für diese Aufgabe gebraucht werden?

Soforttest:
  sparkompass audit .

Prompt-Vorlage:
  sparkompass prompt --goal "..." --file "..." --done "..."

Nächster Codex-Lauf:
  sparkompass recommend . --goal "..."

Kontextplan vor dem Lesen:
  sparkompass plan . --goal "..." --budget 800

Kontext-BOM vor dem Handoff:
  sparkompass bom . --goal "..." --budget 800

Control-Plane-Vorflugbericht:
  sparkompass control . --goal "..." --budget 800 --expect "MUSS_FAKT"

Handoff-Receipt mit Sparbalken:
  sparkompass handoff . --goal "..." --budget 800 --expect "MUSS_FAKT"

Handoff-Verlauf auswerten:
  sparkompass handoff . --goal "..." --ledger
  sparkompass handoff-ledger report .

Cache-freundliche Kontextübergabe bauen:
  sparkompass envelope . --goal "..." --cache .sparkompass/context-cache.json

Envelope-Verlauf auswerten:
  sparkompass envelope-ledger report .

Text vor Codex verdichten:
  sparkompass compress --file notes.txt

Verifiziertes ContextPack erstellen:
  sparkompass pack --file notes.txt --target auto --keep WICHTIGER_ANKER --expect "Done when: sicher"

ContextPack-Receipt nachprüfen:
  sparkompass receipt verify --receipt pack.json --file notes.txt

Lokales Task-Ergebnis belegen:
  sparkompass task run . --command "npm test" --expect-output "pass"

Offizielle Codex-Usage aus JSONL belegen:
  codex exec --json "antworte nur: ok" > .sparkompass/codex-run.jsonl
  sparkompass codex-usage record . --file .sparkompass/codex-run.jsonl --ledger
  sparkompass codex-usage report .

Kausale Codex-Usage-Matrix auswerten:
  sparkompass experiment plan . --raw-prompt-file evidence/prompts/raw.txt --compact-prompt-file evidence/prompts/compact.txt --model gpt-5 --reasoning-effort medium --sandbox-mode workspace-write
  sparkompass experiment script . --plan evidence/experiment-plan.json
  sparkompass experiment audit . --plan evidence/experiment-plan.json
  sparkompass experiment run . --variant "basis_raw=raw.jsonl" --variant "basis_kompakt=compact.jsonl" --variant "plugin_raw=plugin-raw.jsonl" --variant "plugin_kompakt=plugin-compact.jsonl" --repeat 3

Plugin-, Skill-, Hook- und MCP-Grundlast messen:
  sparkompass doctor overhead . --profile standard

Semantisches Inventar erstellen:
  sparkompass inventory .

Kontext-Cache und Delta-Kontext:
  sparkompass cache .
  sparkompass delta .

Kontext gezielt nachladen:
  sparkompass lookup . --query "compressText"
  sparkompass source . --source-hash "sha256:..."

Kontext-Graph prüfen:
  sparkompass graph . --query "compressText"

Program-Slice prüfen:
  sparkompass slice . --query "compressText"

Interfunktionalen Datenfluss prüfen:
  sparkompass flow . --query "compressText" --depth 2

Verifiziertes semantisches Caching:
  sparkompass semantic-cache add . --query "compressText" --file notes.txt --oracle "npm test"
  sparkompass semantic-cache lookup . --query "compressText" --oracle "npm test"

Benchmark gegen Vollkontext prüfen:
  sparkompass benchmark .

Release-Scorecard aus Dogfood, Benchmark und Ledgers:
  sparkompass scorecard .

Shadow-Vergleich für eine konkrete Eingabe:
  sparkompass shadow --file notes.txt --expect "WICHTIGER_ANKER" --expect-regex "src/.+"

Sparkompass an sich selbst testen:
  sparkompass dogfood .
`.trim();
}

async function readCompressionInput(options) {
  const files = asArray(options.file);
  const texts = asArray(options.text);
  const chunks = [];
  const labels = [];

  for (const file of files) {
    chunks.push(await fs.readFile(String(file), "utf8"));
    labels.push(String(file));
  }

  if (texts.length) {
    chunks.push(texts.join("\n"));
    labels.push("--text");
  }

  if (!chunks.length) {
    const stdin = await readStdinIfAvailable();
    if (stdin.trim()) {
      chunks.push(stdin);
      labels.push("stdin");
    }
  }

  if (!chunks.length) {
    fail("Bitte Text übergeben: sparkompass compress --file notes.txt oder echo \"...\" | sparkompass compress");
  }

  return {
    text: chunks.join("\n\n"),
    label: labels.join(", ")
  };
}

async function readStdinIfAvailable() {
  if (process.stdin.isTTY) return "";
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function resolveCliPath(root, candidate) {
  if (!candidate) return "";
  return path.isAbsolute(candidate) ? candidate : path.resolve(root, candidate);
}

async function readJsonFile(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
