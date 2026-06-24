---
name: codex-sparkompass
description: "Use when preparing, auditing, compressing, or tightening a Codex coding run in this repository: estimate local context size, identify token-heavy files, compress pasted context before a prompt, check AGENTS.md/Codex config context, and produce a compact next prompt with the repo's codex-sparkompass CLI."
---

# Codex Sparkompass

Use the repository CLI as the source of truth. Do not invent token numbers.

## Workflow

1. Check that `node ./bin/codex-sparkompass.mjs` exists.
2. For a general repository check, run:

   ```bash
   node ./bin/codex-sparkompass.mjs audit .
   ```

   For a semantic repository map, run:

   ```bash
   node ./bin/codex-sparkompass.mjs inventory .
   ```

   For fixture-level regression checks, run:

   ```bash
   node ./bin/codex-sparkompass.mjs benchmark .
   ```

   The benchmark must report zero full-context regressions, full
   counterfactual detection, all TaskOutcome successes, all Failure-Corpus cases
   passing, complete FailureCorpusCoverageV1 required classes, complete
   BenchmarkContextPackQualityV1 checks, verified BenchmarkEfficiencyMetricsV1,
   and worst-case token metrics. Treat `Gate: verified-benchmark` as
   the release signal for this fixture suite.

   For delta context and targeted context lookup, run:

   ```bash
   node ./bin/codex-sparkompass.mjs cache .
   node ./bin/codex-sparkompass.mjs delta .
   node ./bin/codex-sparkompass.mjs plan . --goal "<goal>" --budget 800 --risk-profile "<compact|balanced|careful|strict>" --cache .sparkompass/context-cache.json --graph --expect "<must survive>" --expect-regex "<path-or-pattern>"
   node ./bin/codex-sparkompass.mjs bom . --goal "<goal>" --budget 800 --risk-profile "<compact|balanced|careful|strict>" --cache .sparkompass/context-cache.json --graph --expect "<must survive>" --expect-regex "<path-or-pattern>"
	   node ./bin/codex-sparkompass.mjs control . --goal "<goal>" --budget 800 --risk-profile "<compact|balanced|careful|strict>" --cache .sparkompass/context-cache.json --graph --expect "<must survive>" --expect-regex "<path-or-pattern>"
	   node ./bin/codex-sparkompass.mjs evidence-audit . --goal "<goal>" --budget 800 --risk-profile "<compact|balanced|careful|strict>" --cache .sparkompass/context-cache.json --graph --expect "<must survive>" --expect-regex "<path-or-pattern>"
	   node ./bin/codex-sparkompass.mjs ablation-audit . --goal "<goal>" --budget 800 --risk-profile "<compact|balanced|careful|strict>" --cache .sparkompass/context-cache.json --graph --expect "<must survive>" --expect-regex "<path-or-pattern>"
	   node ./bin/codex-sparkompass.mjs slim . --goal "<goal>" --budget 800 --risk-profile "<compact|balanced|careful|strict>" --cache .sparkompass/context-cache.json --graph --expect "<must survive>" --expect-regex "<path-or-pattern>" --max-moves 24
	   node ./bin/codex-sparkompass.mjs handoff . --goal "<goal>" --budget 800 --risk-profile "<compact|balanced|careful|strict>" --cache .sparkompass/context-cache.json --graph --expect "<must survive>" --expect-regex "<path-or-pattern>"
   node ./bin/codex-sparkompass.mjs handoff-ledger report .
   node ./bin/codex-sparkompass.mjs envelope . --goal "<goal>" --budget 800 --risk-profile "<compact|balanced|careful|strict>" --cache .sparkompass/context-cache.json --graph --expect "<must survive>" --previous-envelope "<previous-envelope.json>" --ledger
   node ./bin/codex-sparkompass.mjs envelope-ledger report .
   node ./bin/codex-sparkompass.mjs lookup . --query "<symbol or topic>"
   node ./bin/codex-sparkompass.mjs source . --source-hash "<sha256:...>" --context-lines 6
   node ./bin/codex-sparkompass.mjs graph . --query "<symbol or topic>"
   node ./bin/codex-sparkompass.mjs slice . --query "<symbol>"
   node ./bin/codex-sparkompass.mjs flow . --query "<symbol>"
   node ./bin/codex-sparkompass.mjs calibrate --file "<path>" --risk-profile "<compact|balanced|careful|strict>" --keep "<important term>" --expect "<must survive>" --expect-regex "<path-or-pattern>"
	   node ./bin/codex-sparkompass.mjs ledger report .
	   node ./bin/codex-sparkompass.mjs pack --file "<path>" --expect "<must survive>" --expect-regex "<path-or-pattern>"
	   node ./bin/codex-sparkompass.mjs receipt schema
	   node ./bin/codex-sparkompass.mjs receipt lint --receipt "<pack.json>"
	   node ./bin/codex-sparkompass.mjs receipt verify --receipt "<pack.json>" --file "<original-path>"
	   node ./bin/codex-sparkompass.mjs contextpack verify . --context-pack-id "<ctx-...>"
   node ./bin/codex-sparkompass.mjs task run . --command "<test-or-lint-command>" --expect-output "<success marker>"
   node ./bin/codex-sparkompass.mjs task-ledger report .
   node ./bin/codex-sparkompass.mjs shadow --file "<path>" --expect "<must survive>" --expect-regex "<path-or-pattern>"
   node ./bin/codex-sparkompass.mjs tool-output --file "<log-path>" --command "<command>" --exit-code "<code>"
   node ./bin/codex-sparkompass.mjs tool-output load --summary "<summary-path>" --pattern "<error or file>"
   node ./bin/codex-sparkompass.mjs semantic-cache add . --query "<symbol or topic>" --file "<path>" --oracle "<check>" --expect "<must survive>" --tool-version "<tool=version>" --registry
   node ./bin/codex-sparkompass.mjs semantic-cache lookup . --query "<symbol or topic>" --oracle "<check>" --expect "<must survive>" --tool-version "<tool=version>" --min-similarity 0.6
   node ./bin/codex-sparkompass.mjs prompt-advisory --text "<planned prompt or hook payload>" --hook-payload
   node ./bin/codex-sparkompass.mjs prompt-prepare --file "<large-prompt.txt>" --expect "<must survive>" --goal "<goal>"
   node ./bin/codex-sparkompass.mjs prompt-prepare --file "<large-prompt.txt>" --expect "<must survive>" --goal "<goal>" --ledger
   node ./bin/codex-sparkompass.mjs prompt-ledger report .
   node ./bin/codex-sparkompass.mjs pilot . --ledger-dir ".sparkompass/pilot-run"
   node ./bin/codex-sparkompass.mjs impact . --savings-ledger ".sparkompass/pilot-run/savings-ledger.json" --task-outcome-ledger ".sparkompass/pilot-run/task-outcome-ledger.json" --handoff-ledger ".sparkompass/pilot-run/handoff-ledger.json" --prompt-preparation-ledger ".sparkompass/pilot-run/prompt-preparation-ledger.json"
   node ./bin/codex-sparkompass.mjs experiment plan . --raw-prompt-file "evidence/prompts/raw.txt" --compact-prompt-file "evidence/prompts/compact.txt" --model "<model>" --reasoning-effort "<effort>" --sandbox-mode "<mode>" --task-command "<test-or-lint-command>" --out "evidence/experiment-plan.json"
   node ./bin/codex-sparkompass.mjs experiment script . --plan "evidence/experiment-plan.json" --out "evidence/codex-experiment/run-experiment.sh"
   node ./bin/codex-sparkompass.mjs experiment audit . --plan "evidence/experiment-plan.json" --out "evidence/experiment-evidence-audit.json"
   node ./bin/codex-sparkompass.mjs experiment run . --variant "basis_raw=raw.jsonl" --variant "basis_kompakt=compact.jsonl" --variant "plugin_raw=plugin-raw.jsonl" --variant "plugin_kompakt=plugin-compact.jsonl" --task-outcome "basis_raw=task-raw.json" --task-outcome "plugin_kompakt=task-compact.json" --repeat 3
   node ./bin/codex-sparkompass.mjs doctor overhead . --profile "<minimal|standard|benchmark|release|debug>"
   node ./bin/codex-sparkompass.mjs router decide . --experiment "evidence/experiment.json" --overhead "evidence/overhead.json"
   node ./bin/codex-sparkompass.mjs package-audit .
   node ./bin/codex-sparkompass.mjs package-smoke .
   node ./bin/codex-sparkompass.mjs plugin-smoke .
   node ./bin/codex-sparkompass.mjs release-audit . --ledger-dir ".sparkompass/release-audit"
   node ./bin/codex-sparkompass.mjs scorecard .
   ```

   When the plugin MCP server is available, prefer its interactive tools for
   repository context selection:
   Pass `rootPath` for the target repository when the plugin is installed from
   the Codex plugin cache; `repoRoot` is accepted as an alias.

   - `sparkompass_lookup` to select semantic units under a token budget.
   - `sparkompass_plan_context` to split immediate context, on-demand evidence, omitted units, must-survive requirement coverage, delta coverage, risk controls, and ContextDecisionTraceV1 under a token budget; pass a cache path when delta-aware planning matters and `includeGraph` when direct dependency neighbors matter. Report the ContextBudgetOptimizerV1 strategy, ContextDecisionTraceV1 status, ContextPlanDeltaCoverageV1 status, ContextPlanRiskControlsV1 status, requirement coverage, and any budget-limited deferred units.
   - `sparkompass_context_bom` to inspect the context bill of materials by lane, file, type, decision reason, decision trace, risk register, and must-survive coverage before handoff.
   - `sparkompass_build_envelope` to turn a ContextPlan into stable-prefix, variable-tail, and on-demand-index segments for cache-friendly handoff. Report segment hashes, prefix reuse against any previous envelope, and the caveat that cache-hit numbers are estimates.
	   - `sparkompass_control_report` to combine ContextPlan and ContextEnvelope into a ready-for-handoff or needs-review preflight with evidence protocol and handoff hashes.
	   - `sparkompass_evidence_audit` to verify planned Control/Handoff evidence IDs against current files, lines, and source hashes before trusting a compact handoff.
	   - `sparkompass_ablation_audit` to remove immediate context units one at a time and identify oracle-critical units before further shrinking a handoff.
	   - `sparkompass_slim_context` to turn ablation-safe immediate units into an On-Demand proposal while keeping oracle-critical and unchecked units immediate.
	   - `sparkompass_handoff_receipt` to expose the planned start prompt, visible savings bar, quality contract, prompt-cache layout, and MCP on-demand evidence before a Codex handoff.
   - `sparkompass_handoff_ledger` to record and report estimated start-context savings across multiple ContextHandoffReceipt runs.
   - `sparkompass_scorecard` to combine Dogfood, Benchmark, TaskOutcome gates, PromptPreparation history, and local ledgers into a read-only release-readiness signal.
   - `sparkompass_pilot_run` to write a reproducible SparkompassPilotRunV1 with Savings, PromptPreparation, TaskOutcome, Envelope, and Handoff ledger evidence.
   - `sparkompass_impact_report` to combine Savings, Handoff, PromptPreparation, and TaskOutcome ledgers into a quality-gated user impact report.
   - `sparkompass_experiment_plan` or CLI `experiment plan` to prepare reproducible four-arm Codex JSONL measurement runs with prompt hashes, planned usage files, TaskOutcome paths, metadata, and follow-up commands before claiming any official savings.
   - `sparkompass_experiment_script` or CLI `experiment script` to materialize an ExperimentPlan into an executable runbook for the planned Codex runs, TaskOutcome commands, DoctorOverhead, ExperimentEvidenceAudit, ExperimentRun, and RouterDecision.
   - `sparkompass_experiment_audit` or CLI `experiment audit` to verify planned usage JSONL files, Usage-Invariants, prompt hashes, and TaskOutcome receipts against an ExperimentPlan before running ExperimentRun.
   - `sparkompass_experiment_run` or CLI `experiment run` to combine four official Codex JSONL usage arms and optional TaskOutcomeReceipt evidence into SparkompassRunManifestV1 records, strict metadata including ContextPack hash when required, experiment effects, verified task efficiency, quality gate, and router recommendation.
   - `sparkompass_doctor_overhead` or CLI `doctor overhead` to measure local plugin, skill, hook, and MCP catalog overhead and compare MCP tool profiles. Mention that profile token values are estimates.
   - `sparkompass_router_decision` or CLI `router decide` to turn ExperimentRun plus optional DoctorOverhead into `bypass`, `compact`, `lazy`, or `full`; report evidence gaps, safety blockers, expected net gain, verified task efficiency, and the recommended tool profile.
   - `sparkompass_package_audit` to run PackageDryRunAuditV1 with `npm pack --dry-run --json --ignore-scripts` and verify required package paths, forbidden local artifacts, size limits, and executable bridges.
   - `sparkompass_package_install_smoke` to pack the local package into a temporary tarball, install it into a temporary project, and verify installed CLI, benchmark, and MCP entrypoints.
   - `sparkompass_plugin_install_smoke` to copy the plugin candidate into a temporary plugin directory and verify its CLI bridge, MCP bridge, cache-install bridge, real `sparkompass_lookup` tool call, UserPromptSubmit hook, and hook redaction behavior.
   - `sparkompass_release_audit` to map the project objective to current Scorecard, Pilot, Impact Report, inventory, fallback, MCP, ExperimentPlan/ExperimentScript/ExperimentEvidenceAudit/ExperimentRun/router probe, GatePath, package dry-run, package install smoke, plugin shape, and plugin install smoke evidence.
   - `sparkompass_prompt_advisory` to inspect a planned prompt or hook payload and route large raw context toward tool-output, pack, or handoff without echoing prompt text.
   - `sparkompass_prepare_prompt` to turn a large planned prompt into a sendable compact ContextPack-backed prompt with gate, hashes, acceptance oracle, and savings bars.
   - `sparkompass_prompt_preparation_ledger` to record and report sendable prompt savings, p95 values, verification rate, and fallbacks across prepared prompts.
   - `sparkompass_envelope_ledger` to record and report prefix reuse across multiple ContextEnvelope runs.
   - `sparkompass_expand_symbol` to inspect a symbol neighborhood in the context graph.
   - `sparkompass_load_evidence` to load exact source lines before relying on details.
   - `sparkompass_load_source_hash` to load bounded original excerpts from a `source_hash` or `file_hash` without sending whole files.
   - `sparkompass_summarize_tool_output` to summarize long logs or command output before sending raw output into Codex.
   - `sparkompass_load_tool_output` to load a bounded raw log excerpt from stored ToolOutputSummary evidence when exact omitted output is needed.
   - `sparkompass_slice_symbol` to load a ProgramSliceV1 with AST-backed JS/MJS source span, calls, reads/writes, tests, and evidence.
   - `sparkompass_trace_flow` to inspect DataFlowTraceV1 argument-to-parameter bindings across resolved calls.
   - `sparkompass_cache_write` and `sparkompass_delta` to reuse stable context across turns.
	   - `sparkompass_pack` to create a verified ContextPack receipt with expand-before-full fallback attempts.
	   - `sparkompass_verify_receipt` to verify a saved ContextPack receipt against original source evidence and optional delivered context.
	   - `sparkompass_verify_context_pack` to verify a registered ContextPack by `context_pack_id` through ContextPackRegistryV1 and the underlying receipt/source hash checks.
	   - `sparkompass_contextpack_format` to expose ContextPackFormatV1 or lint portable receipt invariants without source text.
	   - `sparkompass_task_outcome` to record observed test/lint/build output as a TaskOutcomeReceipt without executing shell commands through MCP.
   - `sparkompass_task_outcome_ledger` to record and report verified/review TaskOutcome history, verification rate, review reasons, p95 duration, and tokens per verified task.
   - `sparkompass_calibrate_context` to find the smallest directly verified target percent for a risk profile.
   - `sparkompass_savings_ledger` to report real delivered-token savings across ContextPack receipts.
   - `sparkompass_shadow_compare` to compare full context and Sparkompass context against the same expected facts.
   - `sparkompass_semantic_cache_lookup` to reuse a previous ContextPack only when adaptive similarity policy, dependencies, tool fingerprint, optional ContextPack registry contract, receipt, and oracle verify.
   - `sparkompass_semantic_cache_add` to store a verified ContextPack for repeated tasks; pass a registry path when later `context_pack_id` verification should be required for hits.

   When the local plugin hook is enabled, a `SparkompassUserPromptHookAdvisoryV1`
   may appear before a large user prompt is processed. Treat it as a local
   recommendation, not as proof that Codex changed the prompt. If it points to
   `tool-output`, `pack`, or `handoff`, use that flow before sending more raw
   context.

3. When the user gives a concrete goal, prefer:

   ```bash
   node ./bin/codex-sparkompass.mjs recommend . --goal "<goal>"
   ```

   Add `--file "<path>"` for each file the user already named. Add `--done "<criterion>"` when the user gave a completion condition.

4. When the user wants to paste long logs, notes, errors, or docs into Codex, prefer a verified ContextPack:

   ```bash
   node ./bin/codex-sparkompass.mjs pack --file "<path>" --keep "<important term>" --expect "<must survive>"
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

   Use `compress` only when the user wants the compact text without a receipt:

   ```bash
   node ./bin/codex-sparkompass.mjs compress --file "<path>" --keep "<important term>"
   ```

   Add `--keep` for error codes, file paths, requirements, or terms the user says must survive compression. If the input is a long tool output or test log, run `tool-output` first and use `pack` only when a verified ContextPack of the raw text is still needed. If the content is not in a file, ask for the text or use stdin when available.

5. To evaluate this repository's own compression behavior, run:

   ```bash
   node ./bin/codex-sparkompass.mjs dogfood .
   ```

   Dogfood must report worst-case anchor retention, the weakest case, p95
   delivered tokens, and `Gate: verified-publishable`.

6. Read the report and give the user:
   - the context status
   - the inventory units when relevant
   - the top token drivers
   - the generated compact prompt
   - the savings bar when present
   - the SavingsLedger totals when present
	   - the ShadowRun gate and any regression reasons when present
	   - the ContextPack Receipt status and critical anchor classes when present
	   - the ContextPackReceiptVerification status, source hash, evidence hash, delivered context hash, and blocking failures when present
	   - the ContextPackRegistryVerification status, registry checks, receipt verification status, and context_pack_id when present
	   - the ContextPackFormatValidation status, failed checks, and source-free lint caveat when present
	   - the TaskOutcomeReceipt gate, exit code, output oracle, output hash, and linked receipt verification when present
   - the TaskOutcomeLedger verified/review tasks, verification rate, review reasons, p95 duration, output tokens per verified task, context tokens per verified task, and linked ContextPacks when present
   - cache/delta/lookup status when relevant
   - context-plan immediate and on-demand evidence units plus optimizer strategy, decision-trace status, budget rejections, uncertainty register, delta-coverage status, risk-control status, and changed/added/stable status when relevant
   - context-BOM lane mix, top files, decision classes, decision-trace summary, risk register, must-survive coverage, and evidence protocol when relevant
	   - context-control readiness, blocking warnings, evidence protocol, handoff hashes, and next actions when relevant
	   - context-evidence-audit gate, checked/failed evidence counts, warnings, and next actions when relevant
	   - context-ablation-audit gate, oracle-critical units, ablation-safe candidates, counterfactual sensitivity, and next actions when relevant
	   - context-slimming-plan gate, On-Demand move candidates, kept critical units, additional start-context savings, blockers, and next actions when relevant
	   - context-handoff start prompt tokens, visible savings bar, quality contract, prompt-cache layout, on-demand evidence, and caveat when relevant
	   - context-handoff-ledger verified/review handoffs, estimated start-context savings, p95 start tokens, blocked handoffs, and caveat when relevant
   - prompt-hook advisory status, signals, suggested command, and the caveat that the hook does not modify Codex prompts when relevant
   - prompt-preparation gate, context_pack_id, critical anchors, source evidence coverage, delivered/sendable savings bars, and non-rewrite caveat when relevant
   - prompt-preparation-ledger verified/review preparations, sendable prompt savings, p95 prompt tokens, p95 saved tokens, fallbacks, and caveat when relevant
   - experiment-plan gate, planned run count, repeat count, prompt hashes, planned Usage JSONL paths, TaskOutcome paths, required metadata coverage, and non-measurement caveat when relevant
   - experiment-script gate, script path, planned Codex runs, TaskOutcome commands, audit-before-run status, executable status, and non-execution caveat when relevant
   - experiment-evidence-audit gate, planned run count, Usage file coverage, Usage-Invariant coverage, prompt hash matches, TaskOutcome coverage, and non-execution caveat when relevant
   - experiment-run gate, RunManifest count, four-arm coverage, official usage effects, Usage-Invariant coverage, metadata-completeness and ContextPack-hash coverage, TaskOutcome coverage, verified task efficiency, router mode, and quality caveat when relevant
   - gate-path status, current gate, next gate, official A/B usage evidence, required end-to-end evidence, and the caveat that `verified-end-to-end-noninferior` is not claimed until real paired tasks prove non-inferior quality
   - doctor-overhead gate, active tool profile, visible MCP tools, estimated catalog savings, and local-estimate caveat when relevant
   - router-decision gate, mode, evidence gaps, safety blockers, expected net gain, verified task efficiency, recommended tool profile, and local-decision caveat when relevant
   - benchmark-efficiency verified status, task-success delta, total cost tokens per verified task, p95 saved tokens, fallback rate, on-demand load rate, cache-hit rate, and measurement-scope caveat when relevant
   - pilot-run gate, ledger paths, verified task count, context tokens per verified task, delivered savings, handoff savings, and caveat when relevant
   - impact-report gate, delivered ContextPack savings, start-context savings, sendable prompt savings, combined savings, verified packs/handoffs/prompts/tasks, p95 values, blockers, and caveats when relevant
   - package-audit gate, package size, unpacked size, file count, required paths, forbidden paths, executable bridges, and dry-run caveat when relevant
   - package-install-smoke gate, installed CLI status, installed benchmark gate, installed MCP tool count, temp retention, and install caveat when relevant
   - plugin-install-smoke gate, copied CLI bridge status, copied MCP bridge status, cache-install bridge status, MCP lookup tool-call status, hook advisory status, hook redaction status, MCP tool count, temp retention, and plugin caveat when relevant
   - release-audit gate, verified requirements, GatePath status, blockers, evidence ids, and caveats when relevant
   - scorecard gate, blockers, warnings, Dogfood/Benchmark/TaskOutcome totals, prompt-preparation ledger status, and ledger status when relevant
   - context-envelope stable prefix, variable tail, on-demand index, segment hashes, prefix-reuse status, envelope-ledger totals, cache-readiness warnings, and send order when relevant
   - graph neighborhood nodes and edges when relevant
   - program-slice calls, reads/writes, tests, and warnings when relevant
   - data-flow trace edges and argument-to-parameter bindings when relevant
   - source-hash evidence gate, source-hash handoff contract status, matched file/line, hash-match status, and bounded excerpt when relevant
   - semantic-cache verification policy, tool-fingerprint status, registry-contract status, and hit/miss reasons when relevant
   - tool-output status, first errors, affected files, repeats, raw hash, loaded raw excerpts, and savings when relevant
   - MCP evidence ids and loaded source excerpts when relevant
   - compression quality and warnings when present
   - any caveat that matters, especially that token counts are estimates

## Rules

- Keep the response practical and short.
- Treat the CLI output as an estimate for planning, not billing data.
- Treat ContextEnvelope prompt-cache numbers as layout estimates, not proof of a billed cache hit.
- Do not claim this rewrites Codex's internal request payload. It prepares smaller content before the user sends it.
- Do not reject a compression result only because it is risky. Show the result and explain the warnings.
- For verified context handoff, prefer `pack` over `compress` because it can expand context, fall back to full context, and emit a receipt.
- Do not suggest disabling safety, tests, or review just to save tokens.
- If the CLI is missing or broken, say that and fall back to manually recommending a compact prompt structure: goal, relevant files, constraints, done when.
