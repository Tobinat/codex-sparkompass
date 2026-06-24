---
name: codex-sparkompass
description: "Use when a Codex run should save context or prepare a smaller prompt: audit a repo for token-heavy files, compress logs/notes/errors before sending them to Codex, protect important terms with --keep, generate a compact next prompt, and report savings/quality using the bundled Codex Sparkompass plugin script."
---

# Codex Sparkompass

Use the bundled plugin script when available. Do not invent token numbers.

## Workflow

1. Check for the plugin bridge:

   ```bash
   node plugins/codex-sparkompass/scripts/sparkompass.mjs --help
   ```

2. For a repository context check, run:

   ```bash
   node plugins/codex-sparkompass/scripts/sparkompass.mjs audit .
   ```

   For a semantic repository map, run:

   ```bash
   node plugins/codex-sparkompass/scripts/sparkompass.mjs inventory .
   ```

   For fixture-level regression checks, run:

   ```bash
   node plugins/codex-sparkompass/scripts/sparkompass.mjs benchmark .
   ```

   The benchmark must report zero full-context regressions, full
   counterfactual detection, all TaskOutcome successes, all Failure-Corpus cases
   passing, complete FailureCorpusCoverageV1 required classes, complete
   BenchmarkContextPackQualityV1 checks, verified BenchmarkEfficiencyMetricsV1,
   and worst-case token metrics. Treat `Gate: verified-benchmark` as
   the release signal for this fixture suite.

   For repository dogfood checks, run:

   ```bash
   node plugins/codex-sparkompass/scripts/sparkompass.mjs dogfood .
   ```

   Dogfood must report worst-case anchor retention, the weakest case, p95
   delivered tokens, and `Gate: verified-publishable`.

   For delta context and targeted context lookup, run:

   ```bash
   node plugins/codex-sparkompass/scripts/sparkompass.mjs cache .
   node plugins/codex-sparkompass/scripts/sparkompass.mjs delta .
   node plugins/codex-sparkompass/scripts/sparkompass.mjs plan . --goal "<goal>" --budget 800 --risk-profile "<compact|balanced|careful|strict>" --cache .sparkompass/context-cache.json --graph --expect "<must survive>" --expect-regex "<path-or-pattern>"
   node plugins/codex-sparkompass/scripts/sparkompass.mjs bom . --goal "<goal>" --budget 800 --risk-profile "<compact|balanced|careful|strict>" --cache .sparkompass/context-cache.json --graph --expect "<must survive>" --expect-regex "<path-or-pattern>"
	   node plugins/codex-sparkompass/scripts/sparkompass.mjs control . --goal "<goal>" --budget 800 --risk-profile "<compact|balanced|careful|strict>" --cache .sparkompass/context-cache.json --graph --expect "<must survive>" --expect-regex "<path-or-pattern>"
	   node plugins/codex-sparkompass/scripts/sparkompass.mjs evidence-audit . --goal "<goal>" --budget 800 --risk-profile "<compact|balanced|careful|strict>" --cache .sparkompass/context-cache.json --graph --expect "<must survive>" --expect-regex "<path-or-pattern>"
	   node plugins/codex-sparkompass/scripts/sparkompass.mjs ablation-audit . --goal "<goal>" --budget 800 --risk-profile "<compact|balanced|careful|strict>" --cache .sparkompass/context-cache.json --graph --expect "<must survive>" --expect-regex "<path-or-pattern>"
	   node plugins/codex-sparkompass/scripts/sparkompass.mjs slim . --goal "<goal>" --budget 800 --risk-profile "<compact|balanced|careful|strict>" --cache .sparkompass/context-cache.json --graph --expect "<must survive>" --expect-regex "<path-or-pattern>" --max-moves 24
	   node plugins/codex-sparkompass/scripts/sparkompass.mjs handoff . --goal "<goal>" --budget 800 --risk-profile "<compact|balanced|careful|strict>" --cache .sparkompass/context-cache.json --graph --expect "<must survive>" --expect-regex "<path-or-pattern>"
   node plugins/codex-sparkompass/scripts/sparkompass.mjs handoff-ledger report .
   node plugins/codex-sparkompass/scripts/sparkompass.mjs envelope . --goal "<goal>" --budget 800 --risk-profile "<compact|balanced|careful|strict>" --cache .sparkompass/context-cache.json --graph --expect "<must survive>" --previous-envelope "<previous-envelope.json>" --ledger
   node plugins/codex-sparkompass/scripts/sparkompass.mjs envelope-ledger report .
   node plugins/codex-sparkompass/scripts/sparkompass.mjs lookup . --query "<symbol or topic>"
   node plugins/codex-sparkompass/scripts/sparkompass.mjs source . --source-hash "<sha256:...>" --context-lines 6
   node plugins/codex-sparkompass/scripts/sparkompass.mjs graph . --query "<symbol or topic>"
   node plugins/codex-sparkompass/scripts/sparkompass.mjs slice . --query "<symbol>"
   node plugins/codex-sparkompass/scripts/sparkompass.mjs flow . --query "<symbol>"
   node plugins/codex-sparkompass/scripts/sparkompass.mjs calibrate --file "<path>" --risk-profile "<compact|balanced|careful|strict>" --keep "<important term>" --expect "<must survive>" --expect-regex "<path-or-pattern>"
	   node plugins/codex-sparkompass/scripts/sparkompass.mjs ledger report .
	   node plugins/codex-sparkompass/scripts/sparkompass.mjs pack --file "<path>" --expect "<must survive>" --expect-regex "<path-or-pattern>"
	   node plugins/codex-sparkompass/scripts/sparkompass.mjs receipt schema
	   node plugins/codex-sparkompass/scripts/sparkompass.mjs receipt lint --receipt "<pack.json>"
	   node plugins/codex-sparkompass/scripts/sparkompass.mjs receipt verify --receipt "<pack.json>" --file "<original-path>"
	   node plugins/codex-sparkompass/scripts/sparkompass.mjs contextpack verify . --context-pack-id "<ctx-...>"
   node plugins/codex-sparkompass/scripts/sparkompass.mjs task run . --command "<test-or-lint-command>" --expect-output "<success marker>"
   node plugins/codex-sparkompass/scripts/sparkompass.mjs task-ledger report .
   node plugins/codex-sparkompass/scripts/sparkompass.mjs shadow --file "<path>" --expect "<must survive>" --expect-regex "<path-or-pattern>"
   node plugins/codex-sparkompass/scripts/sparkompass.mjs tool-output --file "<log-path>" --command "<command>" --exit-code "<code>"
   node plugins/codex-sparkompass/scripts/sparkompass.mjs tool-output load --summary "<summary-path>" --pattern "<error or file>"
   node plugins/codex-sparkompass/scripts/sparkompass.mjs semantic-cache add . --query "<symbol or topic>" --file "<path>" --oracle "<check>" --expect "<must survive>" --tool-version "<tool=version>" --registry
   node plugins/codex-sparkompass/scripts/sparkompass.mjs semantic-cache lookup . --query "<symbol or topic>" --oracle "<check>" --expect "<must survive>" --tool-version "<tool=version>" --min-similarity 0.6
   node plugins/codex-sparkompass/scripts/sparkompass.mjs prompt-advisory --text "<planned prompt or hook payload>" --hook-payload
   node plugins/codex-sparkompass/scripts/sparkompass.mjs prompt-prepare --file "<large-prompt.txt>" --expect "<must survive>" --goal "<goal>"
   node plugins/codex-sparkompass/scripts/sparkompass.mjs prompt-prepare --file "<large-prompt.txt>" --expect "<must survive>" --goal "<goal>" --ledger
   node plugins/codex-sparkompass/scripts/sparkompass.mjs prompt-ledger report .
   node plugins/codex-sparkompass/scripts/sparkompass.mjs pilot . --ledger-dir ".sparkompass/pilot-run"
   node plugins/codex-sparkompass/scripts/sparkompass.mjs impact . --savings-ledger ".sparkompass/pilot-run/savings-ledger.json" --task-outcome-ledger ".sparkompass/pilot-run/task-outcome-ledger.json" --handoff-ledger ".sparkompass/pilot-run/handoff-ledger.json" --prompt-preparation-ledger ".sparkompass/pilot-run/prompt-preparation-ledger.json"
   node plugins/codex-sparkompass/scripts/sparkompass.mjs experiment plan . --raw-prompt-file "evidence/prompts/raw.txt" --compact-prompt-file "evidence/prompts/compact.txt" --model "<model>" --reasoning-effort "<effort>" --sandbox-mode "<mode>" --task-command "<test-or-lint-command>" --out "evidence/experiment-plan.json"
   node plugins/codex-sparkompass/scripts/sparkompass.mjs experiment script . --plan "evidence/experiment-plan.json" --out "evidence/codex-experiment/run-experiment.sh"
   node plugins/codex-sparkompass/scripts/sparkompass.mjs experiment audit . --plan "evidence/experiment-plan.json" --out "evidence/experiment-evidence-audit.json"
   node plugins/codex-sparkompass/scripts/sparkompass.mjs experiment run . --variant "basis_raw=raw.jsonl" --variant "basis_kompakt=compact.jsonl" --variant "plugin_raw=plugin-raw.jsonl" --variant "plugin_kompakt=plugin-compact.jsonl" --task-outcome "basis_raw=task-raw.json" --task-outcome "plugin_kompakt=task-compact.json" --repeat 3
   node plugins/codex-sparkompass/scripts/sparkompass.mjs doctor overhead . --profile "<minimal|standard|benchmark|release|debug>"
   node plugins/codex-sparkompass/scripts/sparkompass.mjs router decide . --experiment "evidence/experiment.json" --overhead "evidence/overhead.json"
   node plugins/codex-sparkompass/scripts/sparkompass.mjs package-audit .
   node plugins/codex-sparkompass/scripts/sparkompass.mjs package-smoke .
   node plugins/codex-sparkompass/scripts/sparkompass.mjs plugin-smoke .
   node plugins/codex-sparkompass/scripts/sparkompass.mjs release-audit . --ledger-dir ".sparkompass/release-audit"
   node plugins/codex-sparkompass/scripts/sparkompass.mjs scorecard .
   ```

   When the plugin MCP server is enabled, prefer the interactive MCP tools before
   reading large files:
   Pass `rootPath` for the target repository when the plugin is installed from
   the Codex plugin cache; `repoRoot` is accepted as an alias.

   - `sparkompass_lookup` selects relevant semantic units under a token budget.
   - `sparkompass_plan_context` splits immediate context, on-demand evidence, omitted units, must-survive requirement coverage, delta coverage, risk controls, and ContextDecisionTraceV1 under a token budget; pass a cache path when delta-aware planning matters and `includeGraph` when direct dependency neighbors matter. Report the ContextBudgetOptimizerV1 strategy, ContextDecisionTraceV1 status, ContextPlanDeltaCoverageV1 status, ContextPlanRiskControlsV1 status, requirement coverage, and any budget-limited deferred units.
   - `sparkompass_context_bom` inspects the context bill of materials by lane, file, type, decision reason, decision trace, risk register, and must-survive coverage before handoff.
   - `sparkompass_build_envelope` turns a ContextPlan into stable-prefix, variable-tail, and on-demand-index segments for cache-friendly handoff. Report segment hashes, prefix reuse against any previous envelope, and the caveat that cache-hit numbers are estimates.
	   - `sparkompass_control_report` combines ContextPlan and ContextEnvelope into a ready-for-handoff or needs-review preflight with evidence protocol and handoff hashes.
	   - `sparkompass_evidence_audit` verifies planned Control/Handoff evidence IDs against current files, lines, and source hashes before trusting a compact handoff.
	   - `sparkompass_ablation_audit` removes immediate context units one at a time and identifies oracle-critical units before further shrinking a handoff.
	   - `sparkompass_slim_context` turns ablation-safe immediate units into an On-Demand proposal while keeping oracle-critical and unchecked units immediate.
	   - `sparkompass_handoff_receipt` exposes the planned start prompt, visible savings bar, quality contract, prompt-cache layout, and MCP on-demand evidence before a Codex handoff.
   - `sparkompass_handoff_ledger` records and reports estimated start-context savings across multiple ContextHandoffReceipt runs.
   - `sparkompass_scorecard` combines Dogfood, Benchmark, TaskOutcome gates, PromptPreparation history, and local ledgers into a read-only release-readiness signal.
   - `sparkompass_pilot_run` writes a reproducible SparkompassPilotRunV1 with Savings, PromptPreparation, TaskOutcome, Envelope, and Handoff ledger evidence.
   - `sparkompass_impact_report` combines Savings, Handoff, PromptPreparation, and TaskOutcome ledgers into a quality-gated user impact report.
   - `sparkompass_experiment_plan` or CLI `experiment plan` prepares reproducible four-arm Codex JSONL measurement runs with prompt hashes, planned usage files, TaskOutcome paths, metadata, and follow-up commands before claiming any official savings.
   - `sparkompass_experiment_script` or CLI `experiment script` materializes an ExperimentPlan into an executable runbook for the planned Codex runs, TaskOutcome commands, DoctorOverhead, ExperimentEvidenceAudit, ExperimentRun, and RouterDecision.
   - `sparkompass_experiment_audit` or CLI `experiment audit` verifies planned usage JSONL files, Usage-Invariants, prompt hashes, and TaskOutcome receipts against an ExperimentPlan before running ExperimentRun.
   - `sparkompass_experiment_run` or CLI `experiment run` combines four official Codex JSONL usage arms and optional TaskOutcomeReceipt evidence into SparkompassRunManifestV1 records, strict metadata including ContextPack hash when required, experiment effects, verified task efficiency, quality gate, and router recommendation.
   - `sparkompass_doctor_overhead` or CLI `doctor overhead` measures local plugin, skill, hook, and MCP catalog overhead and compares MCP tool profiles. Mention that profile token values are estimates.
   - `sparkompass_router_decision` or CLI `router decide` turns ExperimentRun plus optional DoctorOverhead into `bypass`, `compact`, `lazy`, or `full`; report evidence gaps, safety blockers, expected net gain, verified task efficiency, and the recommended tool profile.
   - `sparkompass_package_audit` runs PackageDryRunAuditV1 with `npm pack --dry-run --json --ignore-scripts` and verifies required package paths, forbidden local artifacts, size limits, and executable bridges.
   - `sparkompass_package_install_smoke` packs the local package into a temporary tarball, installs it into a temporary project, and verifies installed CLI, benchmark, and MCP entrypoints.
   - `sparkompass_plugin_install_smoke` copies the plugin candidate into a temporary plugin directory and verifies its CLI bridge, MCP bridge, cache-install bridge, real `sparkompass_lookup` tool call, UserPromptSubmit hook, and hook redaction behavior.
   - `sparkompass_release_audit` maps the project objective to current Scorecard, Pilot, Impact Report, inventory, fallback, MCP, ExperimentPlan/ExperimentScript/ExperimentEvidenceAudit/ExperimentRun/router probe, GatePath, package dry-run, package install smoke, plugin shape, and plugin install smoke evidence.
   - `sparkompass_prompt_advisory` inspects a planned prompt or hook payload and routes large raw context toward tool-output, pack, or handoff without echoing prompt text.
   - `sparkompass_prepare_prompt` turns a large planned prompt into a sendable compact ContextPack-backed prompt with gate, hashes, acceptance oracle, and savings bars.
   - `sparkompass_prompt_preparation_ledger` records and reports sendable prompt savings, p95 values, verification rate, and fallbacks across prepared prompts.
   - `sparkompass_envelope_ledger` records and reports prefix reuse across multiple ContextEnvelope runs.
   - `sparkompass_expand_symbol` inspects a symbol neighborhood in the context graph.
   - `sparkompass_load_evidence` loads exact original lines for a selected unit.
   - `sparkompass_load_source_hash` loads bounded original excerpts from a `source_hash` or `file_hash` without sending whole files.
   - `sparkompass_summarize_tool_output` summarizes long logs or command output before raw output is sent into Codex.
   - `sparkompass_load_tool_output` loads a bounded raw log excerpt from stored ToolOutputSummary evidence when exact omitted output is needed.
   - `sparkompass_slice_symbol` loads a ProgramSliceV1 with AST-backed JS/MJS source span, calls, reads/writes, tests, and evidence.
   - `sparkompass_trace_flow` inspects DataFlowTraceV1 argument-to-parameter bindings across resolved calls.
   - `sparkompass_cache_write` and `sparkompass_delta` support stable/delta context.
	   - `sparkompass_pack` creates a verified ContextPack receipt with expand-before-full fallback attempts.
	   - `sparkompass_verify_receipt` verifies a saved ContextPack receipt against original source evidence and optional delivered context.
	   - `sparkompass_verify_context_pack` verifies a registered ContextPack by `context_pack_id` through ContextPackRegistryV1 and the underlying receipt/source hash checks.
	   - `sparkompass_contextpack_format` exposes ContextPackFormatV1 or lints portable receipt invariants without source text.
	   - `sparkompass_task_outcome` records observed test/lint/build output as a TaskOutcomeReceipt without executing shell commands through MCP.
   - `sparkompass_task_outcome_ledger` records and reports verified/review TaskOutcome history, verification rate, review reasons, p95 duration, and tokens per verified task.
   - `sparkompass_calibrate_context` finds the smallest directly verified target percent for a risk profile.
   - `sparkompass_savings_ledger` reports real delivered-token savings across ContextPack receipts.
   - `sparkompass_shadow_compare` compares full context and Sparkompass context against the same expected facts.
   - `sparkompass_semantic_cache_lookup` reuses a previous ContextPack only when adaptive similarity policy, dependencies, tool fingerprint, optional ContextPack registry contract, receipt, and oracle verify.
   - `sparkompass_semantic_cache_add` stores a verified ContextPack for repeated tasks; pass a registry path when later `context_pack_id` verification should be required for hits.

   If the bundled `UserPromptSubmit` hook emits
   `SparkompassUserPromptHookAdvisoryV1`, treat it as a non-blocking local
   recommendation. It does not rewrite Codex's request payload and should route
   large raw context toward `tool-output`, `pack`, or `handoff`.

3. When the user gives a concrete goal, prefer:

   ```bash
   node plugins/codex-sparkompass/scripts/sparkompass.mjs recommend . --goal "<goal>"
   ```

   Add `--file "<path>"` for files the user named and `--done "<criterion>"` for explicit completion criteria.

4. For long logs, notes, errors, docs, or pasted context, prefer a verified ContextPack:

   ```bash
   node plugins/codex-sparkompass/scripts/sparkompass.mjs pack --file "<path>" --keep "<important term>" --expect "<must survive>"
   ```

   Use `--risk-profile strict` for safety-critical logs, security context,
   destructive commands, config precedence, money, legal, or migration data.
   Use `careful` for ambiguous code/log context and `compact` only when
   aggressive savings are acceptable.
   When the target percent is unclear, run `calibrate` before `pack`, passing
   the same `--expect` and `--expect-regex` values you plan to use for `pack`.
   When the user asks what was saved over time, run `ledger report`. For
   dogfooding a pack run, add `--ledger` so the receipt is recorded.
   When the user gives exact facts or structured patterns that must survive,
   pass them directly to `pack` with repeated `--expect` terms and
   `--expect-regex` patterns so the ContextPack receipt can expand or fall back
   before handoff. Use `shadow` with the same expectations when you need a
   separate full-context regression comparison.

   Use `compress` only when the user wants compact text without a receipt:

   ```bash
   node plugins/codex-sparkompass/scripts/sparkompass.mjs compress --file "<path>" --keep "<important term>"
   ```

   Add `--keep` for error codes, file paths, requirements, or terms the user says must survive compression.

5. Report the savings bar, SavingsLedger totals when present, ShadowRun gate when present, receipt verification status when present, TaskOutcomeReceipt gate when present, TaskOutcomeLedger verified/review tasks, verification rate, review reasons, p95 duration, and tokens per verified task when present, ExperimentPlan/ExperimentScript/ExperimentEvidenceAudit/ExperimentRun gate/effects/verified task efficiency/router when present, GatePath current/next gate and end-to-end caveat when present, DoctorOverhead gate/profile/catalog savings when present, RouterDecision gate/mode/profile/verified task efficiency when present, Scorecard gate when present, quality status, critical anchor classes, warnings, and compact prompt or compact text.
   When inventory was requested, report semantic units such as functions, headings, imports, config entries, and log errors.
	   When cache, delta, plan, bom, control, evidence-audit, ablation-audit, slim, handoff, handoff-ledger, pilot, impact, package-audit, package-smoke, plugin-smoke, release-audit, scorecard, envelope, envelope-ledger, lookup, source, graph, slice, flow, tool-output, receipt verification, context-pack registry verification, context-pack-format, task outcome, task-outcome-ledger, hook advisory, prompt preparation, prompt-preparation-ledger, experiment-plan, experiment-script, experiment-evidence-audit, experiment-run, gate-path, router-decision, or semantic-cache was requested, report reuse percentage, changed units, planned immediate units, optimizer strategy, decision-trace status/budget rejections/uncertainty register, delta-coverage status, risk-control status, changed/added/stable status, selected evidence, source-hash gate/contract/file/line/hash-match status, BOM lane mix/top files/decision classes/decision-trace summary/risk register/must-survive coverage, control readiness/blocking warnings/evidence protocol/handoff hashes, evidence-audit gate/checked/failed counts/warnings, ablation-audit gate/oracle-critical units/ablation-safe candidates/counterfactual sensitivity, slim gate/On-Demand move candidates/kept critical units/additional start-context savings/blockers, handoff start prompt tokens/visible savings/quality contract/on-demand evidence, handoff-ledger verified/review handoffs/estimated start savings/p95 start tokens/blocked handoffs, pilot gate/ledger paths/verified task count/context tokens per verified task/delivered savings/handoff savings, impact gate/delivered savings/start savings/combined savings/verified packs-handoffs-tasks/p95 values/blockers, package-audit gate/package size/unpacked size/file count/required paths/forbidden paths/executable bridges, package-smoke gate/installed CLI status/installed benchmark gate/installed MCP tool count/temp retention, plugin-smoke gate/copied CLI bridge status/copied MCP bridge status/cache-install bridge status/MCP lookup tool-call status/hook advisory status/hook redaction status/MCP tool count/temp retention, release-audit gate/verified requirements/GatePath status/blockers/evidence ids/caveats, experiment-plan gate/planned runs/repeat/prompt hashes/planned Usage files/TaskOutcome paths/metadata coverage/non-measurement caveat, experiment-script gate/script path/planned Codex runs/TaskOutcome commands/audit-before-run/executable status/non-execution caveat, experiment-evidence-audit gate/planned runs/Usage coverage/Usage-Invariant coverage/prompt hash matches/TaskOutcome coverage/non-execution caveat, experiment-run gate/RunManifest count/four-arm coverage/official usage effects/Usage-Invariant coverage/metadata-completeness and ContextPack-hash coverage/TaskOutcome coverage/verified task efficiency/router mode, gate-path current gate/next gate/official A/B evidence/required end-to-end evidence/non-claim caveat, router-decision mode/evidence gaps/safety blockers/verified task efficiency/recommended profile, prompt-hook advisory signals/suggested command/non-rewrite caveat, prompt-preparation gate/context_pack_id/critical anchors/source evidence/delivered and sendable savings, prompt-preparation-ledger verified/review preparations/sendable savings/p95 values/fallbacks, scorecard blockers/warnings/Dogfood/Benchmark/TaskOutcome totals, envelope send order/segment hashes/prefix-reuse status/envelope-ledger totals/cache-readiness warnings, graph nodes, graph edges, program-slice calls/reads/writes/tests, data-flow bindings, tool-output status/raw hash/affected files/repeats/loaded excerpts, receipt source/evidence/delivered hash failures, registry verification status/context_pack_id/receipt verification status, format lint status/failed checks/source-free caveat, task exit code/output oracle/output hash, TaskOutcomeLedger verification rate/review reasons/p95 duration/output tokens per verified task/linked ContextPacks, and semantic-cache verification policy, tool-fingerprint status, registry-contract status, and hit/miss reasons.
   When MCP tools were used, report the selected units, evidence ids, and whether source hashes matched.

## Rules

- Treat all token numbers as estimates for planning, not billing.
- Treat ContextEnvelope prompt-cache numbers as layout estimates, not proof of a billed cache hit.
- Do not claim this rewrites Codex's internal request payload. It prepares smaller content before the user sends it.
- Do not reject a risky compression result. Show the result and explain the warning.
- For verified context handoff, prefer `pack` over `compress` because it can expand context, fall back to full context, and emit a receipt.
- Do not suggest disabling tests, safety, or review just to save tokens.
