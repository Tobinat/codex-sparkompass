# Release Checklist

Use this before publishing a package or opening the first public repository release.

## Required Gates

```bash
npm run lint
npm test
npm run dogfood
npm run benchmark
npm run scorecard
npm run evidence-audit
npm run ablation-audit
npm run slim
npm run pilot
npm run impact
npm run doctor-overhead
npm run package-audit
npm run package-smoke
npm run plugin-smoke
npm run release-audit
printf '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}\n' | node ./bin/codex-sparkompass-mcp.mjs
npm pack --dry-run
```

`npm run dogfood` must report:

- `Gate: verified-publishable`
- no riskante Verdichtungen
- average saving at or above 35%
- worst-case anchor retention at or above 75%
- worst-case critical anchor retention at 100%
- worst-case source evidence coverage at 100%
- worst-case case and p95 token metrics visible
- expanded ContextPacks reported separately
- full-context fallbacks at 0

`npm run benchmark` must report:

- `Gate: verified-benchmark`
- TaskOutcome successes for all benchmark cases
- all Failure-Corpus cases pass
- all FailureCorpusCoverageV1 required classes are covered and verified
- BenchmarkContextPackQualityV1 verifies all benchmark ContextPacks with 100% critical anchors, 100% source evidence, no risky packs, and no full-context fallbacks
- built-in benchmark fixtures pass when repository fixture files are absent
- zero regressions against full context
- counterfactuals detected for all exact facts and regex expectations
- oracle sensitivity set to true
- BenchmarkEfficiencyMetricsV1 is verified
- tokens per successful case, total cost tokens per verified task, p95 delivered/saved tokens, fallback/retrieval/cache rates, and worst-case case visible

`npm run scorecard` must report:

- `Gate: verified-scorecard`
- Dogfood gate is `verified-publishable`
- Benchmark gate is `verified-benchmark`
- TaskOutcome successes cover all benchmark cases
- no blocking release-readiness items
- missing savings/task-outcome/envelope/handoff/prompt-preparation ledger history is shown as a warning, not hidden

`npm run doctor-overhead` must report:

- `Gate: verified-doctor-overhead`
- Plugin manifest, MCP config, hook config, repository skill, plugin skill, full MCP catalog, and active MCP catalog are present and hashed
- visible MCP tool count, estimated catalog tokens, and profile savings are visible
- available profiles include `minimal`, `standard`, `benchmark`, `release`, and `debug`
- caveats state that overhead tokens are local estimates, not official billing

`npm run package-audit` must report:

- `Gate: verified-package-dry-run`
- `PackageDryRunAuditV1` was built from `npm pack --dry-run --json --ignore-scripts`
- package name and version match `package.json`
- required CLI, MCP, docs, skill, plugin, hook, and example paths are included
- plugin `dist` bundle and redacted evidence case-study paths are included
- test fixtures, caches, private files, generated tarballs, and local ledgers are excluded
- CLI and plugin bridge scripts are executable
- package size, unpacked size, and file count remain under the configured limits

`npm run package-smoke` must report:

- `Gate: verified-package-install-smoke`
- `PackageInstallSmokeAuditV1` packed the local package into a temporary tarball
- the tarball was installed into a fresh temporary project
- installed `sparkompass doctor` and installed `sparkompass benchmark --json` succeed
- installed MCP `tools/list` includes the Sparkompass lookup and package-smoke tools
- no generated tarball is left in the workspace root

`npm run plugin-smoke` must report:

- `Gate: verified-plugin-install-smoke`
- `PluginInstallSmokeAuditV1` copied the local plugin candidate into a temporary plugin directory
- the copied CLI bridge can run `sparkompass doctor`
- the copied MCP bridge serves `tools/list`
- the copied MCP bridge can call `sparkompass_lookup` through `tools/call`
- the simulated cache-installed plugin bridge can run CLI and MCP lookup against the requested repo via `rootPath`/`repoRoot`
- the Git-marketplace smoke runs from a fresh `CODEX_HOME` without a global `sparkompass` CLI in `PATH`
- the Git-marketplace smoke verifies MCP `tools/list`, `sparkompass_lookup`, hook execution through `PLUGIN_ROOT`, and prompt redaction
- the copied UserPromptSubmit hook emits an advisory for a large prompt
- the hook output does not echo sensitive prompt anchors

`npm run release-audit` must report:

- `Gate: verified-release-audit`
- all project objective requirements are verified
- Scorecard, Pilot, Impact Report, inventory, fallback probes, MCP tools, ExperimentPlan probe, ExperimentScript probe, ExperimentEvidenceAudit probe, ExperimentRun/router probe, GatePath probe, package shape, PackageDryRunAuditV1, PackageInstallSmokeAuditV1, plugin shape, and PluginInstallSmokeAuditV1 are represented as evidence
- ContextDecisionTraceV1 is represented as objective evidence for context-control decisions
- ContextEvidenceAuditV1 is represented as objective evidence for hash-verified source loading
- ContextAblationAuditV1 is represented as objective evidence for oracle-critical planned context
- ContextSlimmingPlanV1 is represented as objective evidence for ablation-driven immediate-context slimming
- ContextPackFormatV1 is represented as objective evidence for an open, lintable ContextPack receipt contract
- ContextPackIdVerificationProbeV1 is represented as objective evidence for `context_pack_id` based verification
- SemanticCache registry contract is represented as objective evidence for cache-hit ContextPack ID verification
- SparkompassImpactReportV1 is represented as objective evidence for quality-gated user impact, including sendable prompt savings
- SparkompassExperimentPlanV1 is represented as objective evidence for reproducibly planned four-arm official Codex JSONL runs
- SparkompassExperimentScriptV1 is represented as objective evidence that the planned four-arm Codex runs can be materialized into an executable runbook with audit before ExperimentRun
- SparkompassExperimentEvidenceAuditV1 is represented as objective evidence that planned Usage JSONL, prompt hashes, Usage invariants, and TaskOutcome files are complete before ExperimentRun
- SparkompassExperimentRunV1 is represented as objective evidence for a four-arm usage matrix, TaskOutcome-backed quality gate, and router recommendation
- caveats state that the audit is local evidence, not proof of publication or billing

`npm run evidence-audit` must report:

- `Gate: verified-evidence-audit`
- checked evidence count is greater than 0
- failed evidence count is 0
- any truncation or Control readiness warnings are visible

`npm run ablation-audit` must report:

- `Gate: verified-ablation-audit`
- at least one Oracle expectation
- baseline Oracle success
- counterfactuals detected for all Oracle expectations
- oracle-critical and ablation-safe counts are visible

`npm run slim` must report:

- `Gate: verified-slimming-plan`
- at least one ablation-safe unit moved to On-Demand
- at least one oracle-critical unit kept in immediate context
- additional start-context savings are visible
- blockers are visible when the plan cannot be verified

`npm run pilot` and `npm run impact` must report:

- `Gate: verified-pilot-run`
- `Gate: verified-impact`
- at least one verified pack, prompt preparation, handoff, and task
- delivered ContextPack savings, sendable prompt savings, and estimated start-context savings are visible
- combined context savings, p95 values, and blockers are visible
- no full-context fallbacks, risky compressions, blocked handoffs, review prompts, or review tasks

`npm test` must prove the MCP path:

- `sparkompass_inventory`, `sparkompass_lookup`, `sparkompass_plan_context`, `sparkompass_context_bom`, `sparkompass_build_envelope`, `sparkompass_control_report`, `sparkompass_evidence_audit`, `sparkompass_ablation_audit`, `sparkompass_slim_context`, `sparkompass_handoff_receipt`, `sparkompass_handoff_ledger`, `sparkompass_scorecard`, `sparkompass_pilot_run`, `sparkompass_impact_report`, `sparkompass_release_audit`, `sparkompass_prompt_advisory`, `sparkompass_prepare_prompt`, `sparkompass_prompt_preparation_ledger`, `sparkompass_envelope_ledger`, `sparkompass_expand_symbol`, `sparkompass_load_evidence`, `sparkompass_load_source_hash`, `sparkompass_summarize_tool_output`, `sparkompass_load_tool_output`, `sparkompass_cache_write`, `sparkompass_delta`, `sparkompass_pack`, `sparkompass_verify_receipt`, `sparkompass_verify_context_pack`, `sparkompass_contextpack_format`, `sparkompass_task_outcome`, `sparkompass_task_outcome_ledger`, `sparkompass_calibrate_context`, `sparkompass_savings_ledger`, and `sparkompass_shadow_compare` are listed
- `sparkompass_semantic_cache_add` and `sparkompass_semantic_cache_lookup` are listed
- `sparkompass_lookup` can select fixture units under budget
- `sparkompass_plan_context` can split immediate context and on-demand evidence under budget
- `sparkompass_plan_context` reports `ContextDecisionTraceV1` with lane decisions, budget rejections, risk decisions, and uncertainty register
- `sparkompass_plan_context` reports `ContextPlanRequirementCoverageV1` for exact and regex expectations
- `sparkompass_plan_context` reports `ContextPlanDeltaCoverageV1`, and partial changed/added coverage makes the plan review-required
- `sparkompass_plan_context` reports `ContextPlanRiskControlsV1`, and `strict` plans become review-required when relevant risk units are deferred
- `sparkompass_context_bom` and `sparkompass bom` report `ContextBOMV1` with lanes, files, decision classes, risk register, must-survive facts, and evidence protocol
- `sparkompass_context_bom` and `sparkompass bom` summarize the source plan's Decision Trace
- `sparkompass_build_envelope` can order stable prefix, variable tail, and on-demand evidence with deterministic hashes
- `sparkompass_control_report` and `sparkompass control` report `ContextControlReportV1` with `ready-for-handoff`/`needs-review`
- `sparkompass_evidence_audit` and `sparkompass evidence-audit` report `ContextEvidenceAuditV1` with checked, verified, and failed evidence counts
- `sparkompass_ablation_audit` and `sparkompass ablation-audit` report `ContextAblationAuditV1` with oracle-critical and ablation-safe units
- `sparkompass_slim_context` and `sparkompass slim` report `ContextSlimmingPlanV1` with kept critical units, On-Demand move candidates, and additional start-context savings
- `sparkompass_handoff_receipt` and `sparkompass handoff` report `ContextHandoffReceiptV1` with start prompt, visible savings, quality contract, prompt-cache layout, and MCP on-demand evidence
- `sparkompass_handoff_ledger`, `sparkompass handoff --ledger`, and `sparkompass handoff-ledger report` report `ContextHandoffLedgerV1` with estimated start-context savings across handoffs
- `sparkompass_scorecard` and `sparkompass scorecard` report `SparkompassScorecardV1` with release readiness, Dogfood/Benchmark gates, TaskOutcome totals, PromptPreparation totals, and ledger warnings
- `sparkompass_pilot_run` and `sparkompass pilot` report `SparkompassPilotRunV1` and write verified Savings, PromptPreparation, TaskOutcome, Envelope, and Handoff pilot ledgers
- `sparkompass_impact_report` and `sparkompass impact` report `SparkompassImpactReportV1` with delivered ContextPack savings, sendable prompt savings, start-context savings, verified prompts/tasks, p95 values, and quality blockers
- `sparkompass_package_audit` and `sparkompass package-audit` report `PackageDryRunAuditV1` with dry-run package contents, required paths, forbidden paths, executable bridge checks, and size limits
- `sparkompass_package_install_smoke` and `sparkompass package-smoke` report `PackageInstallSmokeAuditV1` with installed CLI, benchmark, and MCP smoke checks
- `sparkompass_plugin_install_smoke` and `sparkompass plugin-smoke` report `PluginInstallSmokeAuditV1` with copied plugin CLI bridge, MCP bridge, cache-install bridge, real lookup tool-call, hook, and prompt-redaction checks
- `sparkompass_release_audit` and `sparkompass release-audit` report `SparkompassReleaseAuditV1` with objective requirements mapped to local evidence, including ExperimentPlan, ExperimentScript, ExperimentEvidenceAudit, ExperimentRun/router, GatePath, package dry-run, package install-smoke, and plugin install-smoke evidence
- `sparkompass_prompt_advisory`, `sparkompass prompt-advisory`, and the plugin hook report `SparkompassUserPromptHookAdvisoryV1` without echoing prompt contents
- `sparkompass_prepare_prompt` and `sparkompass prompt-prepare` report `SparkompassPromptPreparationV1` with a sendable compact prompt, ContextPack gate, hashes, acceptance oracle, and savings bars
- `sparkompass_prompt_preparation_ledger`, `sparkompass prompt-prepare --ledger`, and `sparkompass prompt-ledger report` report `PromptPreparationLedgerV1` with sendable prompt savings, verified/review preparations, p95 values, and fallbacks
- `sparkompass_build_envelope` and `sparkompass envelope --previous-envelope` report `ContextEnvelopePrefixReuseV1`
- `sparkompass_envelope_ledger` and `sparkompass envelope --ledger` report `ContextEnvelopeLedgerV1`
- `sparkompass plan --cache` marks changed/added/stable units and prioritizes changed context
- `sparkompass plan --cache` reports Delta-Coverage for changed/added units
- cache files passed to `plan`, `delta`, or `cache` are excluded from the active inventory
- `sparkompass plan --graph` can include direct graph neighbors without making every risk-looking unit relevant
- `ContextBudgetOptimizerV1` prefers useful small units over oversized high-score units under tight budgets
- `sparkompass_expand_symbol` can return a symbol neighborhood from `ContextGraphV1`
- `sparkompass_load_evidence` verifies a selected unit hash
- `sparkompass_load_source_hash` verifies bounded raw source retrieval from a `source_hash`
- ContextPlan, ContextBOM, ContextControlReport, ContextEnvelope, and ContextHandoffReceipt expose `source_hash_load_hint` or `raw=sparkompass_load_source_hash` for on-demand evidence
- `sparkompass_summarize_tool_output` reports raw hash, errors, affected files, repeats, and savings for long command output
- `sparkompass_load_tool_output` loads bounded raw excerpts and verifies the stored raw hash
- `sparkompass_slice_symbol` can return AST-backed `ProgramSliceV1` for JS/MJS with source span, calls, data hints, tests, and evidence
- `sparkompass_trace_flow` can return `DataFlowTraceV1` with argument-to-parameter bindings across resolved calls
- `sparkompass_savings_ledger` records and reports delivered-token savings from a receipt
- `sparkompass_pack` records `acceptance_oracle`, supports `expectRegex`, and falls back when compact context misses an expected fact
- `sparkompass_verify_receipt` and `sparkompass receipt verify` report `ContextPackReceiptVerificationV1` against original source evidence and optional delivered-context hash
- `sparkompass_verify_context_pack` and `sparkompass contextpack verify` report `ContextPackRegistryVerificationV1` by `context_pack_id` and run the underlying receipt/source hash verification
- `sparkompass_contextpack_format`, `sparkompass receipt schema`, and `sparkompass receipt lint` report `ContextPackFormatV1` and `ContextPackFormatValidationV1` for portable receipt linting without source text
- `sparkompass_task_outcome` and `sparkompass task run/record` report `TaskOutcomeReceiptV1` with exit-code gate, output oracle, output hash, and optional receipt verification
- `sparkompass_task_outcome_ledger`, `sparkompass task run/record --ledger`, and `sparkompass task-ledger report` report `TaskOutcomeLedgerV1` with verified tasks, verification rate, review reasons, p95 duration, and tokens per verified task
- `sparkompass_calibrate_context` uses `expectRegex` while searching for the smallest verified target
- `sparkompass_shadow_compare` verifies a no-regression run against full context, supports `expectRegex`, and detects a fixture regression
- semantic cache lookup returns a hit for matching adaptive policy, dependencies, tool fingerprint, oracle, and ContextPack expectations
- semantic cache lookup returns a miss for changed dependency files, mismatched tool fingerprint, mismatched oracle, mismatched ContextPack expectations, or below-policy query similarity
- `plugins/codex-sparkompass/dist/sparkompass-mcp.mjs` starts and serves `tools/list`
- `plugins/codex-sparkompass/scripts/sparkompass-mcp.mjs` remains available as the local bridge fallback
- `plugins/codex-sparkompass/hooks/hooks.json` wires `UserPromptSubmit` to `sparkompass-user-prompt-submit.mjs`
- `sparkompass-user-prompt-submit.mjs` emits `SparkompassUserPromptHookAdvisoryV1` in JSON mode, stays quiet for small prompts, and does not echo prompt contents in human advisory mode

## Manual Review

- README explains CLI vs Skill vs Plugin vs MCP vs Hook clearly.
- `plan` is documented as the budgeted ContextPlanV1 step between recommendation and evidence loading, including cache-aware delta status, graph-aware direct neighbors, RiskControls, and BudgetOptimizer output.
- `ContextDecisionTraceV1` is documented as the explanation layer for plan decisions, budget rejections, uncertainty, and evidence loading.
- `bom` is documented as ContextBOMV1, the bounded material list for planned context lanes, files, decisions, risk units, and must-survive facts.
- `plan --expect` and `plan --expect-regex` are documented as source-backed requirement coverage before packing.
- `control` is documented as the ContextControlReportV1 preflight that combines Plan, Envelope, Readiness, Evidence protocol, and Handoff hashes.
- `evidence-audit` is documented as ContextEvidenceAuditV1, the hash check for planned Control/Handoff evidence.
- `ablation-audit` is documented as ContextAblationAuditV1, the Oracle-based removal test for immediate context units.
- `slim` is documented as ContextSlimmingPlanV1, the ablation-driven On-Demand proposal before handoff.
- `handoff` is documented as ContextHandoffReceiptV1 with start prompt, savings bar, quality contract, and MCP on-demand evidence.
- `handoff-ledger` is documented as ContextHandoffLedgerV1 with estimated start-context savings history across handoffs.
- `scorecard` is documented as the read-only release-readiness view across Dogfood, Benchmark, TaskOutcome, PromptPreparation, and ledgers.
- `release-audit` is documented as an objective-evidence audit, not proof of publication.
- `benchmark` is documented as package-runnable through built-in fallback fixtures when `test/fixtures` is absent.
- `envelope` is documented as ContextEnvelopeV1 for stable-prefix, variable-tail, on-demand-index handoff, previous-envelope prefix reuse, and EnvelopeLedger history, including the caveat that prompt-cache numbers are estimates.
- `compress` output says that compression is heuristic and not official billing.
- `--keep` examples exist for error codes and must-keep terms.
- `pack --expect` and `pack --expect-regex` are documented as direct ContextPack quality gates.
- `pack --risk-profile` examples explain `compact`, `balanced`, `careful`, and `strict`.
- `receipt verify` is documented as saved ContextPack receipt verification against original source and optional delivered context.
- `receipt schema` and `receipt lint` are documented as the open ContextPackFormatV1 contract and source-free format validation.
- `contextpack verify` is documented as ContextPackRegistryVerificationV1 for `context_pack_id` based lookup plus receipt/source verification.
- `task run` and `task record` are documented as local TaskOutcomeReceipt generation for test, lint, build, or compiler checks.
- `task-ledger` is documented as TaskOutcomeLedgerV1 history for verified/review tasks, verification rate, review reasons, p95 duration, and tokens per verified task.
- `calibrate` is documented as the safe-target search for pack budgets including `--expect` and `--expect-regex`.
- `ledger` is documented as delivered-token savings history, not theoretical compact-candidate savings.
- `shadow` is documented as a concrete full-context comparison against exact facts and regex expectations.
- `inventory`, `cache`, `delta`, and `lookup` commands are documented as Control-Plane building blocks.
- `graph` is documented as the first Context Graph and symbol-neighborhood command.
- `slice` is documented as the first ProgramSlice command with Acorn-backed JS/MJS parsing and conservative `review-needed` warnings.
- `flow` is documented as a bounded DataFlowTrace command, not as complete static analysis.
- `tool-output` is documented as structured log/tool-output handling with optional local raw storage and bounded raw evidence loading.
- `semantic-cache` is documented as adaptive verified reuse with optional ContextPackRegistry verification, not as a pure similarity cache.
- `prompt-advisory` is documented as a CLI/MCP/Hook preflight, not as a Codex request rewriter.
- `prompt-prepare` is documented as a conscious compact handoff builder, not as a Codex request rewriter.
- `prompt-ledger` is documented as local sendable-prompt savings history, not as billing proof.
- `pilot` is documented as a CLI/MCP ledger-writing measurement run, not as billing proof.
- `impact` is documented as a read-only user-impact report over Savings, Handoff, PromptPreparation, and TaskOutcome ledgers, not as billing proof.
- Plugin manifest includes `mcpServers` and the MCP config points at the bridge script.
- Plugin hook config is documented as a non-blocking advisory, not as a Codex request rewriter.
- No test fixtures, caches, or private files are included in `npm pack --dry-run`.
- Version in `package.json` matches the intended release.

## Current Quality Baseline

As of this checkpoint:

- average saving: 41%
- average anchor retention: 100%
- worst-case anchor retention: 100%
- critical anchor retention: 100%
- source evidence coverage: 100%
- Dogfood p95 delivered tokens: 15,796
- expanded ContextPacks: 0
- full-context fallbacks: 0
- risky compressions: 0
- tests: 227
- test suites: 55
- benchmark cases: 10
- Failure-Corpus successes: 7/7
- Failure-Corpus classes: 7/7
- BenchmarkContextPackQualityV1 verified cases: 10/10
- benchmark regressions: 0
- benchmark counterfactuals detected: 42/42
- benchmark TaskOutcome successes: 10/10
- BenchmarkEfficiencyMetricsV1: verified
- benchmark total cost tokens per verified task: 120
- benchmark task success delta: 0%
- benchmark fallback/retrieval/cache-hit rate: 0% / 0% / 0%
- scorecard gate: verified-scorecard
- release-audit gate: verified-release-audit
- evidence-audit gate: verified-evidence-audit
- ablation-audit gate: verified-ablation-audit
- slimming-plan gate: verified-slimming-plan
- impact gate: verified-impact
- package dry-run gate: verified-package-dry-run
- package install smoke gate: verified-package-install-smoke
- plugin install smoke gate: verified-plugin-install-smoke
- pilot PromptPreparationLedger: 1/1 verified
- pilot context tokens per verified task: 1026
- pilot start-context savings: 49%
- pilot sendable prompt savings: 24%
- impact sendable prompt savings: 24%
- release-audit requirements: 30/30
- release-audit ExperimentPlan: verified-experiment-plan, 12 planned runs
- release-audit ExperimentScript: verified-experiment-script, 12 planned runs, executable
- release-audit ExperimentEvidenceAudit: verified-experiment-evidence, 12/12 Usage, 12/12 TaskOutcomes
- release-audit ExperimentRun usage invariants: 4/4
- release-audit ExperimentRun metadata completeness: 4/4
- release-audit ExperimentRun ContextPack hash coverage: 4/4
- release-audit ExperimentRun task efficiency: verified-task-efficiency, 830 tokens per verified task, 270 tokens saved per verified task
- release-audit GatePath: verified-gate-path-prepared, next gate verified-end-to-end-noninferior prepared
- ContextPackFormat gate: verified-context-pack-format
- ContextPack-ID gate: verified-context-pack-id
- SourceHashEvidence gate: verified-source-hash-evidence
- SourceHashContract gate: verified-source-hash-contract
- SemanticCacheRegistry gate: verified-semantic-cache-registry-contract
- MCP tools: 48
- DoctorOverhead gate: verified-doctor-overhead
- DoctorOverhead standard profile: 20/48 MCP tools, about 11,716 estimated catalog tokens saved
- package size: 601.3 kB
- unpacked size: 2519.4 kB
- package files: 107
- benchmark average saving: 55%
- benchmark tokens per successful case: 83
- benchmark p95 saved tokens: 163
- AcceptanceOracleV1 exact/regex/counterfactual tests: passing
- ContextPackAcceptanceOracleV1 CLI/MCP/fallback tests: passing
- ContextPackReceiptVerificationV1 CLI/MCP tests: passing
- ContextPackFormatV1 CLI/MCP/lint tests: passing
- ContextPackRegistryV1 and ContextPackRegistryVerificationV1 CLI/MCP/release-audit tests: passing
- TaskOutcomeReceiptV1 CLI/MCP tests: passing
- TaskOutcomeLedgerV1 CLI/MCP tests: passing
- AnchorClassBreakdownV1 and dangerous CLI-option retention tests: passing
- ContextCalibrationV1 expectation-aware target tests: passing
- VerifiedSemanticCacheV1 context-expectation and registry-contract hit/miss tests: passing
- SemanticCacheToolFingerprintV1 mismatch tests: passing
- ContextPolicyV1 API/CLI/MCP tests: passing
- ContextPlanV1 CLI/MCP tests: passing
- ContextDecisionTraceV1 plan/BOM/release-audit tests: passing
- ContextPlanDeltaCoverageV1 CLI/MCP tests: passing
- ContextPlanRiskControlsV1 strict deferred-risk tests: passing
- ContextPlanRequirementCoverageV1 CLI/MCP tests: passing
- ContextBOMV1 CLI/MCP tests: passing
- ContextControlReportV1 CLI/MCP tests: passing
- ContextEvidenceAuditV1 CLI/MCP tests: passing
- SourceHashEvidenceV1 and SourceHashHandoffContractProbeV1 CLI/MCP/release-audit tests: passing
- ContextAblationAuditV1 CLI/MCP tests: passing
- ContextSlimmingPlanV1 CLI/MCP tests: passing
- ContextHandoffReceiptV1 CLI/MCP tests: passing
- ContextHandoffLedgerV1 CLI/MCP tests: passing
- SparkompassScorecardV1 CLI/MCP tests: passing
- SparkompassPilotRunV1 CLI/MCP tests: passing
- SparkompassImpactReportV1 CLI/MCP tests: passing
- PackageDryRunAuditV1 CLI/MCP/release-audit tests: passing
- PackageInstallSmokeAuditV1 CLI/MCP/release-audit tests: passing
- PluginInstallSmokeAuditV1 CLI/MCP/release-audit tests: passing
- SparkompassReleaseAuditV1 CLI/MCP tests: passing
- SparkompassUserPromptHookAdvisoryV1 CLI/MCP/plugin-hook tests: passing
- SparkompassPromptPreparationV1 CLI/MCP/release-audit tests: passing
- PromptPreparationLedgerV1 CLI/MCP/release-audit tests: passing
- ContextEnvelopeV1, ContextEnvelopePrefixReuseV1, and ContextEnvelopeLedgerV1 CLI/MCP tests: passing
- CodexOfficialUsageReceiptV1, CodexUsageInvariantsV1, reasoning sub-bucket, and CodexOfficialUsageComparisonV1 CLI tests: passing
- SparkompassExperimentPlanV1, reproducible four-arm Codex run planning, and CLI plan-file tests: passing
- SparkompassExperimentScriptV1 executable runbook and CLI script-file tests: passing
- SparkompassExperimentEvidenceAuditV1 artifact-completeness and CLI audit-file tests: passing
- SparkompassExperimentRunV1, SparkompassRunManifestV1, SparkompassExperimentEfficiencyV1, UsageInvariant-gated evidence, metadata-gated evidence with required ContextPack hash, and TaskOutcome-backed quality gate CLI tests: passing
- SparkompassDoctorOverheadV1 and ToolProfileV1 CLI/MCP tests: passing
- SparkompassRouterDecisionV1 CLI/router-mode tests: passing
- Official Codex A/B usage evidence: `docs/official-codex-usage-evidence.md`, 8,417 total tokens saved, 21% total usage reduction in the recorded local run
- Gate path evidence: SparkompassGatePathV1 ties that A/B evidence to quality-noninferior and prepares verified-end-to-end-noninferior without claiming the final gate yet
- ContextBudgetOptimizerV1 tight-budget test: passing
- ToolOutputSummaryV1 and ToolOutputEvidenceV1 CLI/MCP tests: passing
- ContextCalibrationV1 CLI/MCP tests: passing
- SavingsLedgerV1 CLI/MCP tests: passing
- ShadowRunV1 CLI/MCP tests: passing
- MCP protocol smoke test: passing
- plugin MCP bridge tools/list and tools/call smoke test: passing
- plugin UserPromptSubmit hook advisory tests: passing
- verified semantic cache hit/miss and tool-fingerprint tests: passing
- ProgramSliceV1 CLI/MCP tests: passing
- AST-backed ProgramSlice call resolution tests: passing
- DataFlowTraceV1 CLI/MCP binding tests: passing

If a later change lowers these values, either improve the compressor or update this file with a clear reason.
