import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { runBenchmark } from "../src/benchmark.mjs";

const EXPECTED_FAILURE_CLASSES = new Set([
  "negation-flag",
  "version-priority",
  "stacktrace-cutoff",
  "same-symbols",
  "security-dataflow",
  "dynamic-import",
  "monorepo-dependency"
]);

describe("Sparkompass benchmark", () => {
  it("passes fixture acceptance tasks without context regression", async () => {
    const benchmark = await runBenchmark(".");

    assert.equal(benchmark.schema, "SparkompassBenchmarkV1");
    assert.equal(benchmark.totals.regressions, 0);
    assert.equal(benchmark.totals.context_successes, benchmark.totals.cases);
    assert.equal(benchmark.totals.task_outcomes_verified, benchmark.totals.cases);
    assert.equal(benchmark.totals.failure_corpus_cases, 7);
    assert.equal(benchmark.totals.failure_corpus_successes, 7);
    assert.equal(benchmark.totals.failure_corpus_coverage.schema, "FailureCorpusCoverageV1");
    assert.equal(benchmark.totals.failure_corpus_coverage.verified, true);
    assert.equal(benchmark.totals.failure_corpus_coverage.coverage_percent, 100);
    assert.deepEqual(new Set(benchmark.totals.failure_corpus_coverage.required_classes), EXPECTED_FAILURE_CLASSES);
    assert.deepEqual(new Set(benchmark.totals.failure_corpus_coverage.verified_classes), EXPECTED_FAILURE_CLASSES);
    assert.deepEqual(benchmark.totals.failure_corpus_coverage.missing_classes, []);
    assert.deepEqual(benchmark.totals.failure_corpus_coverage.failed_classes, []);
    assert.equal(benchmark.totals.context_pack_quality.schema, "BenchmarkContextPackQualityV1");
    assert.equal(benchmark.totals.context_pack_quality.verified, true);
    assert.equal(benchmark.totals.context_pack_quality.verified_cases, benchmark.totals.cases);
    assert.deepEqual(benchmark.totals.context_pack_quality.failed_cases, []);
    assert.deepEqual(benchmark.totals.context_pack_quality.risky_cases, []);
    assert.deepEqual(benchmark.totals.context_pack_quality.full_context_fallbacks, []);
    assert.equal(benchmark.totals.efficiency.schema, "BenchmarkEfficiencyMetricsV1");
    assert.equal(benchmark.totals.efficiency.verified, true);
    assert.equal(benchmark.totals.efficiency.verified_tasks, benchmark.totals.cases);
    assert.equal(benchmark.totals.efficiency.task_success_delta_percent, 0);
    assert.equal(benchmark.totals.efficiency.fallback_rate_percent, 0);
    assert.equal(benchmark.totals.efficiency.on_demand_load_rate_percent, 0);
    assert.equal(benchmark.totals.efficiency.cache_hit_rate_percent, 0);
    assert.ok(benchmark.totals.efficiency.total_cost_tokens_per_verified_task > benchmark.totals.efficiency.tokens_per_verified_task);
    assert.ok(benchmark.totals.efficiency.p95_saved_tokens > 0);
    assert.equal(benchmark.totals.context_pack_quality.minimum_critical_anchor_retention_percent, 100);
    assert.equal(benchmark.totals.context_pack_quality.minimum_source_evidence_coverage_percent, 100);
    assert.ok(benchmark.totals.counterfactuals > 0);
    assert.equal(benchmark.totals.counterfactuals_detected, benchmark.totals.counterfactuals);
    assert.equal(benchmark.totals.oracle_sensitive, true);
    assert.equal(benchmark.totals.verified, true);
    assert.ok(benchmark.totals.average_savings_percent > 0);
    assert.ok(benchmark.totals.worst_case_savings_percent > 0);
    assert.ok(benchmark.totals.p95_delivered_tokens > 0);
    assert.ok(benchmark.totals.tokens_per_successful_case > 0);
    assert.ok(benchmark.totals.worst_case.id);
    assert.ok(benchmark.cases.some((item) => item.oracle.expectations.some((expectation) => expectation.type === "regex")));

    for (const benchmarkCase of benchmark.cases) {
      assert.ok(benchmarkCase.counterfactuals.length > 0);
      assert.equal(benchmarkCase.counterfactuals_detected, benchmarkCase.counterfactuals.length);
      assert.equal(benchmarkCase.missing_in_context.length, 0);
      assert.equal(benchmarkCase.task_outcome.schema, "BenchmarkTaskOutcomeSummaryV1");
      assert.equal(benchmarkCase.task_outcome.status, "verified-task-outcome");
      assert.ok(benchmarkCase.task_outcome.output_tokens > 0);
      assert.equal(benchmarkCase.task_outcome.receipt_verification_status, "verified-receipt");
      if (benchmarkCase.category === "failure-corpus") {
        assert.ok(EXPECTED_FAILURE_CLASSES.has(benchmarkCase.failure_class));
      }
    }
  });

  it("CLI benchmark emits a verified gate", () => {
    const result = spawnSync(process.execPath, [
      "./bin/codex-sparkompass.mjs",
      "benchmark",
      "."
    ], {
      encoding: "utf8"
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Sparkompass Benchmark/);
    assert.match(result.stdout, /TaskOutcome-Erfolge: 10\/10/);
    assert.match(result.stdout, /Failure-Corpus-Erfolge: 7\/7/);
    assert.match(result.stdout, /Failure-Corpus-Klassen: 7\/7 verifiziert/);
    assert.match(result.stdout, /ContextPack-Qualität: 10\/10 verifiziert/);
    assert.match(result.stdout, /Effizienz:/);
    assert.match(result.stdout, /Gegenfakten erkannt/);
    assert.match(result.stdout, /Schlechtester Einzelfall/);
    assert.match(result.stdout, /Tokens pro bestandenem Fall/);
    assert.match(result.stdout, /Gate: verified-benchmark/);
  });

  it("uses built-in benchmark fixtures when repository fixture files are absent", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-benchmark-builtins-"));
    const benchmark = await runBenchmark(root);

    assert.equal(benchmark.totals.verified, true);
    assert.equal(benchmark.totals.cases, 10);
    assert.equal(benchmark.totals.failure_corpus_successes, 7);
    assert.equal(benchmark.totals.failure_corpus_coverage.verified, true);
    assert.equal(benchmark.totals.context_pack_quality.verified, true);
    assert.equal(benchmark.totals.efficiency.verified, true);
    assert.equal(benchmark.totals.counterfactuals_detected, benchmark.totals.counterfactuals);
    assert.deepEqual(
      new Set(benchmark.cases.map((item) => item.source_origin)),
      new Set(["built-in-fixture"])
    );
  });
});
