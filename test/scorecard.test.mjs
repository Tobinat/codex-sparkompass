import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { buildSparkompassScorecard, formatSparkompassScorecard } from "../src/scorecard.mjs";
import { appendTaskOutcomeToLedger } from "../src/task-outcome-ledger.mjs";
import { recordTaskOutcome } from "../src/task-outcome.mjs";

describe("SparkompassScorecardV1", () => {
  it("combines Dogfood, Benchmark, TaskOutcome, and ledger readiness", async () => {
    const scorecard = await buildSparkompassScorecard(".", {
      targetPercent: 35,
      minSaving: 35,
      minAnchors: 75
    });

    assert.equal(scorecard.schema, "SparkompassScorecardV1");
    assert.equal(scorecard.release_readiness.status, "verified-scorecard");
    assert.equal(scorecard.release_readiness.verified, true);
    assert.deepEqual(scorecard.release_readiness.blockers, []);
    assert.equal(scorecard.gates.dogfood.status, "verified-publishable");
    assert.equal(scorecard.gates.benchmark.status, "verified-benchmark");
    assert.equal(scorecard.gates.task_outcome.verified_count, scorecard.gates.task_outcome.total);
    assert.equal(scorecard.metrics.dogfood.minimum_critical_anchor_retention_percent, 100);
    assert.equal(scorecard.metrics.dogfood.minimum_source_evidence_coverage_percent, 100);
    assert.equal(scorecard.metrics.benchmark.regressions, 0);
    assert.equal(scorecard.metrics.benchmark.counterfactuals_detected, scorecard.metrics.benchmark.counterfactuals);
    assert.equal(scorecard.metrics.benchmark.failure_corpus_coverage.schema, "FailureCorpusCoverageV1");
    assert.equal(scorecard.metrics.benchmark.failure_corpus_coverage.verified, true);
    assert.equal(scorecard.metrics.benchmark.context_pack_quality.schema, "BenchmarkContextPackQualityV1");
    assert.equal(scorecard.metrics.benchmark.context_pack_quality.verified, true);
    assert.equal(scorecard.metrics.benchmark.efficiency.schema, "BenchmarkEfficiencyMetricsV1");
    assert.equal(scorecard.metrics.benchmark.efficiency.verified, true);
    assert.equal(scorecard.metrics.benchmark.efficiency.task_success_delta_percent, 0);
    assert.ok(scorecard.metrics.benchmark.efficiency.total_cost_tokens_per_verified_task > 0);
    assert.deepEqual(scorecard.metrics.benchmark.context_pack_quality.risky_cases, []);
    assert.deepEqual(scorecard.metrics.benchmark.context_pack_quality.full_context_fallbacks, []);
    assert.equal(scorecard.artifacts.dogfood.cases.length, 4);
    assert.equal(scorecard.artifacts.benchmark.cases.length, scorecard.metrics.benchmark.cases);
    assert.equal(scorecard.metrics.handoff_ledger.schema, "ContextHandoffLedgerV1");
    assert.equal(scorecard.metrics.task_outcome_ledger.schema, "TaskOutcomeLedgerV1");
    assert.equal(scorecard.metrics.prompt_preparation_ledger.schema, "PromptPreparationLedgerV1");
    assert.ok(scorecard.release_readiness.warnings.includes("no-task-outcome-ledger-entries"));
    assert.ok(scorecard.release_readiness.warnings.includes("no-handoff-ledger-entries"));
    assert.ok(scorecard.release_readiness.warnings.includes("no-prompt-preparation-ledger-entries"));
    assert.ok(scorecard.next_actions.some((action) => action.includes("sparkompass handoff")));
    assert.ok(scorecard.next_actions.some((action) => action.includes("prompt-prepare --ledger")));
  });

  it("formats a human scorecard report", async () => {
    const scorecard = await buildSparkompassScorecard(".");
    const report = formatSparkompassScorecard(scorecard);

    assert.match(report, /SparkompassScorecardV1/);
    assert.match(report, /Gate: verified-scorecard/);
    assert.match(report, /TaskOutcome 10\/10/);
    assert.match(report, /Failure-Corpus-Klassen: 7\/7 verifiziert/);
    assert.match(report, /ContextPack-Qualität: 10\/10 verifiziert/);
    assert.match(report, /Benchmark-Effizienz:/);
    assert.match(report, /SavingsLedger/);
    assert.match(report, /TaskOutcomeLedger/);
    assert.match(report, /HandoffLedger/);
    assert.match(report, /PromptPreparationLedger/);
  });

  it("surfaces review risk from real task outcome ledgers", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-scorecard-task-ledger-"));
    const ledgerPath = path.join(root, "task-outcome-ledger.json");
    const review = await recordTaskOutcome({
      rootPath: root,
      command: "npm test",
      exitCode: 1,
      outputText: "FAIL\n",
      expectOutput: ["TASK_OK"]
    });

    await appendTaskOutcomeToLedger(".", review, {
      out: ledgerPath,
      runType: "scorecard-test"
    });

    const scorecard = await buildSparkompassScorecard(".", {
      taskOutcomeLedger: ledgerPath
    });

    assert.equal(scorecard.metrics.task_outcome_ledger.entries, 1);
    assert.equal(scorecard.metrics.task_outcome_ledger.verified_tasks, 0);
    assert.equal(scorecard.metrics.task_outcome_ledger.review_rate_percent, 100);
    assert.ok(scorecard.release_readiness.warnings.includes("task-outcome-ledger-no-verified-tasks"));
    assert.ok(scorecard.release_readiness.warnings.includes("task-outcome-ledger-review-tasks"));
    assert.ok(scorecard.release_readiness.warnings.includes("task-outcome-ledger-output-oracle-failures"));
    assert.deepEqual(scorecard.metrics.task_outcome_ledger.review_reasons, [
      { reason: "exit-code-mismatch:1!=0", count: 1 },
      { reason: "output-oracle-missing:TASK_OK", count: 1 }
    ]);
  });

  it("CLI scorecard emits JSON and exits successfully", () => {
    const result = spawnSync(process.execPath, [
      "./bin/codex-sparkompass.mjs",
      "scorecard",
      ".",
      "--json"
    ], {
      encoding: "utf8"
    });

    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.schema, "SparkompassScorecardV1");
    assert.equal(payload.release_readiness.status, "verified-scorecard");
    assert.equal(payload.gates.task_outcome.verified, true);
    assert.equal(payload.metrics.prompt_preparation_ledger.schema, "PromptPreparationLedgerV1");
  });
});
