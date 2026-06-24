import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { buildContextPlan } from "../src/context-plan.mjs";
import { writeContextCache } from "../src/context-cache.mjs";

describe("ContextPlanV1", () => {
  it("selects immediate context under a budget and keeps evidence ids", async () => {
    const plan = await buildContextPlan(".", {
      goal: "compressText quality warnings",
      file: ["src/compressor.mjs"],
      done: ["compression tests pass"],
      budget: 120
    });

    assert.equal(plan.schema, "ContextPlanV1");
    assert.equal(plan.gate.status, "verified-plan");
    assert.ok(plan.budget.immediate_tokens <= plan.budget.requested_tokens);
    assert.ok(plan.lanes.immediate_context.length > 0);
    assert.ok(plan.lanes.immediate_context.some((unit) => unit.file === "src/compressor.mjs"));
    assert.ok(plan.evidence.every((entry) => entry.evidence_id.startsWith("immediate-")));
    assert.ok(plan.evidence.every((entry) => entry.source_hash_load_hint.includes("sparkompass_load_source_hash")));
    assert.ok(plan.evidence.every((entry) => entry.load_hints.source_hash === entry.source_hash_load_hint));
    assert.equal(plan.decision_trace.schema, "ContextDecisionTraceV1");
    assert.equal(plan.decision_trace.status, "verified-decision-trace");
    assert.equal(plan.decision_trace.coverage.immediate_units, plan.lanes.immediate_context.length);
    assert.equal(plan.decision_trace.coverage.deferred_units, plan.totals.deferred_units);
    assert.ok(plan.decision_trace.lane_decisions.some((lane) => lane.lane === "immediate_context"));
    assert.ok(plan.decision_trace.quality_contract.some((item) => item.includes("on_demand_evidence")));
    assert.ok(plan.decision_trace.lane_decisions.some((lane) => (
      lane.top_units.some((unit) => unit.source_hash_load_hint?.includes("sparkompass_load_source_hash"))
    )));
    assert.equal(
      new Set(plan.lanes.omitted.map((unit) => unit.evidence_id)).size,
      plan.lanes.omitted.length
    );
    assert.ok(plan.next_actions.some((action) => action.includes("sparkompass_shadow_compare")));
  });

  it("CLI plan emits JSON and human report", () => {
    const json = spawnSync(process.execPath, [
      "./bin/codex-sparkompass.mjs",
      "plan",
      ".",
      "--goal",
      "compressText quality warnings",
      "--file",
      "src/compressor.mjs",
      "--budget",
      "120",
      "--json"
    ], {
      encoding: "utf8"
    });

    assert.equal(json.status, 0, json.stderr);
    const plan = JSON.parse(json.stdout);
    assert.equal(plan.schema, "ContextPlanV1");
    assert.equal(plan.gate.status, "verified-plan");

    const human = spawnSync(process.execPath, [
      "./bin/codex-sparkompass.mjs",
      "plan",
      ".",
      "--goal",
      "compressText quality warnings",
      "--file",
      "src/compressor.mjs",
      "--budget",
      "120"
    ], {
      encoding: "utf8"
    });

    assert.equal(human.status, 0, human.stderr);
    assert.match(human.stdout, /ContextPlanV1/);
    assert.match(human.stdout, /Sofort Laden/);
    assert.match(human.stdout, /Bei Bedarf Nachladen/);
    assert.match(human.stdout, /Optimierer/);
    assert.match(human.stdout, /Decision Trace/);
    assert.match(human.stdout, /Muss-Fakten/);
    assert.match(human.stdout, /Delta-Coverage/);
  });

  it("tracks requirement coverage for exact and regex expectations", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-plan-requirements-"));
    await fs.writeFile(path.join(root, "auth.log"), [
      "ERROR AUTH_RESET_TOKEN_EXPIRED in src/auth/session.ts",
      "Done when: Auth reset test passes"
    ].join("\n"));

    const plan = await buildContextPlan(root, {
      goal: "auth reset token",
      expect: ["AUTH_RESET_TOKEN_EXPIRED"],
      expectRegex: ["src/auth/session\\.ts"],
      budget: 80
    });

    assert.equal(plan.requirements.schema, "ContextPlanRequirementCoverageV1");
    assert.equal(plan.requirements.status, "covered-immediately");
    assert.equal(plan.requirements.covered, 2);
    assert.equal(plan.requirements.items.every((item) => item.found), true);
    assert.ok(plan.requirements.items.every((item) => item.evidence[0].file === "auth.log"));
    assert.equal(plan.gate.status, "verified-plan");

    const missing = await buildContextPlan(root, {
      goal: "auth reset token",
      expect: ["MISSING_AUTH_FACT"],
      budget: 80
    });

    assert.equal(missing.requirements.status, "missing");
    assert.deepEqual(missing.requirements.missing, ["MISSING_AUTH_FACT"]);
    assert.equal(missing.gate.status, "plan-needs-review");
    assert.ok(missing.gate.reasons.includes("required-expectation-missing"));
  });

  it("uses utility per token when the immediate budget is tight", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-plan-budget-"));
    await fs.writeFile(path.join(root, "budget.mjs"), [
      `export function authTokenDeleteForceExpensive() { return "${"x".repeat(900)}"; }`,
      "export function auth() { return true; }"
    ].join("\n"));

    const plan = await buildContextPlan(root, {
      goal: "auth token",
      budget: 50
    });
    const immediateNames = plan.lanes.immediate_context.map((unit) => unit.name);
    const expensive = [
      ...plan.lanes.immediate_context,
      ...plan.lanes.on_demand_evidence
    ].find((unit) => unit.name === "authTokenDeleteForceExpensive");

    assert.equal(plan.optimizer.schema, "ContextBudgetOptimizerV1");
    assert.equal(plan.optimizer.strategy, "seed-then-density-greedy");
    assert.equal(plan.optimizer.density_sort, true);
    assert.equal(plan.gate.status, "verified-plan");
    assert.ok(plan.budget.immediate_tokens <= plan.budget.requested_tokens);
    assert.ok(immediateNames.includes("auth"));
    assert.ok(!immediateNames.includes("authTokenDeleteForceExpensive"));
    assert.ok(expensive.token_cost > plan.budget.requested_tokens);
    assert.equal(expensive.selection_lane_reason, "budget-limit");
    assert.ok(expensive.source_hash_load_hint.includes("sparkompass_load_source_hash"));
    assert.ok(plan.decision_trace.budget_decisions.skipped_for_budget >= 1);
    assert.ok(plan.decision_trace.budget_decisions.top_budget_rejections.some((unit) => unit.name === "authTokenDeleteForceExpensive"));
    assert.ok(plan.lanes.immediate_context.some((unit) => unit.selection_efficiency > expensive.selection_efficiency));
  });

  it("makes strict plans review-required when relevant risk units are deferred", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-plan-risk-"));
    await fs.writeFile(path.join(root, "risk.mjs"), [
      `export function authTokenDeleteForceExpensive() { return "${"x".repeat(900)}"; }`,
      "export function auth() { return true; }"
    ].join("\n"));

    const balanced = await buildContextPlan(root, {
      goal: "auth token delete",
      budget: 50,
      riskProfile: "balanced"
    });
    const strict = await buildContextPlan(root, {
      goal: "auth token delete",
      budget: 50,
      riskProfile: "strict"
    });

    assert.equal(balanced.risk_controls.schema, "ContextPlanRiskControlsV1");
    assert.equal(balanced.risk_controls.status, "risk-controls-satisfied");
    assert.equal(balanced.gate.status, "verified-plan");
    assert.equal(strict.risk_controls.status, "risk-review-required");
    assert.ok(strict.risk_controls.deferred_risk_units >= 1);
    assert.ok(strict.risk_controls.deferred_preview.some((unit) => unit.name === "authTokenDeleteForceExpensive"));
    assert.ok(strict.risk_controls.reasons.includes("strict-risk-unit-deferred"));
    assert.ok(strict.risk_controls.reasons.includes("strict-start-budget-below-risk-floor"));
    assert.equal(strict.gate.status, "plan-needs-review");
    assert.equal(strict.decision_trace.status, "decision-trace-needs-review");
    assert.ok(strict.decision_trace.uncertainty_register.some((item) => item.id === "strict-risk-unit-deferred"));
    assert.ok(strict.gate.reasons.includes("strict-risk-unit-deferred"));
    assert.equal(strict.gate.requirements.risk_controls_satisfied, false);
    assert.ok(strict.next_actions.some((action) => action.includes("risk units")));
  });

  it("uses risk-profile start budgets when no explicit plan budget is supplied", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-plan-policy-budget-"));
    await fs.writeFile(path.join(root, "feature.mjs"), "export function authTokenFlow() { return true; }\n");

    const balanced = await buildContextPlan(root, {
      goal: "auth token flow",
      riskProfile: "balanced"
    });
    const strict = await buildContextPlan(root, {
      goal: "auth token flow",
      riskProfile: "strict"
    });

    assert.equal(balanced.budget.requested_tokens, 800);
    assert.equal(strict.budget.requested_tokens, 1600);
    assert.equal(strict.context_policy.default_start_budget_tokens, 1600);
  });

  it("prioritizes changed and added units when a ContextCacheV1 is supplied", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-plan-delta-"));
    await fs.writeFile(path.join(root, "feature.mjs"), [
      "export function stableHelper() { return 'same'; }",
      "export function changedAuthFlow() { return 'old'; }"
    ].join("\n"));
    await writeContextCache(root, {
      out: "cache.json"
    });
    await fs.writeFile(path.join(root, "feature.mjs"), [
      "export function stableHelper() { return 'same'; }",
      "export function changedAuthFlow() { return 'new'; }",
      "export function addedAuthGuard() { return 'guard'; }"
    ].join("\n"));

    const plan = await buildContextPlan(root, {
      goal: "auth guard changed flow",
      budget: 120,
      cache: "cache.json"
    });

    assert.equal(plan.delta.enabled, true);
    assert.equal(plan.delta.status, "compared");
    assert.ok(plan.delta.changed >= 1);
    assert.ok(plan.delta.added >= 1);
    assert.equal(plan.delta_coverage.schema, "ContextPlanDeltaCoverageV1");
    assert.equal(plan.delta_coverage.status, "covered");
    assert.equal(plan.delta_coverage.verified, true);
    assert.equal(plan.delta_coverage.coverage_percent, 100);
    assert.equal(plan.delta_coverage.tracked_units, plan.delta.changed + plan.delta.added);
    assert.deepEqual(plan.delta_coverage.missing_units, []);
    assert.ok(plan.lanes.immediate_context.some((unit) => unit.name === "changedAuthFlow" && unit.delta_status === "changed"));
    assert.ok(plan.lanes.immediate_context.some((unit) => unit.name === "addedAuthGuard" && unit.delta_status === "added"));
    assert.ok(plan.lanes.immediate_context.some((unit) => unit.score_breakdown.novelty_value > 0));
  });

  it("marks delta coverage partial when changed units are not exposed as immediate or on-demand evidence", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-plan-delta-partial-"));
    const oldLines = [];
    const newLines = [];
    for (let index = 0; index < 120; index += 1) {
      oldLines.push(`export function changedHelper${index}() { return "old-${index}"; }`);
      newLines.push(`export function changedHelper${index}() { return "new-${index}"; }`);
    }
    await fs.writeFile(path.join(root, "many.mjs"), oldLines.join("\n"));
    await writeContextCache(root, {
      out: "cache.json"
    });
    await fs.writeFile(path.join(root, "many.mjs"), newLines.join("\n"));

    const plan = await buildContextPlan(root, {
      goal: "changed helper",
      budget: 50,
      cache: "cache.json"
    });

    assert.equal(plan.delta_coverage.schema, "ContextPlanDeltaCoverageV1");
    assert.equal(plan.delta_coverage.status, "partial");
    assert.equal(plan.delta_coverage.verified, false);
    assert.ok(plan.delta_coverage.tracked_units > plan.delta_coverage.covered_units);
    assert.ok(plan.delta_coverage.missing_units.length > 0);
    assert.equal(plan.gate.status, "plan-needs-review");
    assert.ok(plan.gate.reasons.includes("delta-coverage-incomplete"));
    assert.ok(plan.next_actions.some((action) => action.includes("missing delta evidence")));
  });

  it("can include graph neighbors for base-relevant units", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-plan-graph-"));
    await fs.writeFile(path.join(root, "main.mjs"), [
      "import { verifyToken } from \"./auth.mjs\";",
      "",
      "export function handleLogin(user) {",
      "  return verifyToken(user.token);",
      "}"
    ].join("\n"));
    await fs.writeFile(path.join(root, "auth.mjs"), [
      "export function verifyToken(token) {",
      "  return token === \"safe\";",
      "}"
    ].join("\n"));

    const plain = await buildContextPlan(root, {
      goal: "handleLogin",
      budget: 80
    });
    const graphAware = await buildContextPlan(root, {
      goal: "handleLogin",
      budget: 80,
      includeGraph: true
    });
    const selected = [
      ...graphAware.lanes.immediate_context,
      ...graphAware.lanes.on_demand_evidence
    ];
    const verifyToken = selected.find((unit) => unit.name === "verifyToken");

    assert.equal(plain.graph.enabled, false);
    assert.equal(graphAware.graph.enabled, true);
    assert.ok(graphAware.graph.related_units >= 1);
    assert.ok(verifyToken);
    assert.equal(verifyToken.graph_related, true);
    assert.ok(verifyToken.score_breakdown.graph_value > 0);
    assert.match(verifyToken.selection_reason, /graph neighbor/);
  });
});
