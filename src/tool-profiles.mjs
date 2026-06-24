export const TOOL_PROFILE_DEFINITIONS = [
  {
    name: "minimal",
    description: "Kleinster Werkzeugkranz für reine Kontextauswahl und belegtes Nachladen.",
    use_case: "Schnelle Codex-Laeufe mit engem Ziel, Lookup, Pack und Source-Evidence.",
    tool_names: [
      "sparkompass_lookup",
      "sparkompass_load_evidence",
      "sparkompass_load_source_hash",
      "sparkompass_summarize_tool_output",
      "sparkompass_pack",
      "sparkompass_verify_receipt"
    ]
  },
  {
    name: "standard",
    description: "Alltagsprofil fuer normale Repo-Arbeit mit Plan, BOM, Handoff und Prompt-Vorbereitung.",
    use_case: "Normale Codex-Coding-Runs, bei denen Startkontext klein bleiben und Details on-demand kommen sollen.",
    tool_names: [
      "sparkompass_inventory",
      "sparkompass_lookup",
      "sparkompass_plan_context",
      "sparkompass_context_bom",
      "sparkompass_build_envelope",
      "sparkompass_control_report",
      "sparkompass_handoff_receipt",
      "sparkompass_load_evidence",
      "sparkompass_load_source_hash",
      "sparkompass_summarize_tool_output",
      "sparkompass_load_tool_output",
      "sparkompass_cache_write",
      "sparkompass_delta",
      "sparkompass_pack",
      "sparkompass_verify_receipt",
      "sparkompass_task_outcome",
      "sparkompass_doctor_overhead",
      "sparkompass_router_decision",
      "sparkompass_prompt_advisory",
      "sparkompass_prepare_prompt"
    ]
  },
  {
    name: "benchmark",
    description: "Messprofil fuer Regression, Oracle, Cache und Effizienzpruefung.",
    use_case: "Qualitaetsmessung, Shadow-Vergleich, Semantik-Cache und TaskOutcome-Ledger.",
    tool_names: [
      "sparkompass_inventory",
      "sparkompass_lookup",
      "sparkompass_plan_context",
      "sparkompass_context_bom",
      "sparkompass_build_envelope",
      "sparkompass_control_report",
      "sparkompass_evidence_audit",
      "sparkompass_ablation_audit",
      "sparkompass_slim_context",
      "sparkompass_handoff_receipt",
      "sparkompass_load_evidence",
      "sparkompass_load_source_hash",
      "sparkompass_summarize_tool_output",
      "sparkompass_load_tool_output",
      "sparkompass_expand_symbol",
      "sparkompass_slice_symbol",
      "sparkompass_trace_flow",
      "sparkompass_cache_write",
      "sparkompass_delta",
      "sparkompass_pack",
      "sparkompass_verify_receipt",
      "sparkompass_task_outcome",
      "sparkompass_task_outcome_ledger",
      "sparkompass_experiment_plan",
      "sparkompass_experiment_script",
      "sparkompass_experiment_audit",
      "sparkompass_experiment_run",
      "sparkompass_doctor_overhead",
      "sparkompass_router_decision",
      "sparkompass_calibrate_context",
      "sparkompass_savings_ledger",
      "sparkompass_shadow_compare",
      "sparkompass_semantic_cache_add",
      "sparkompass_semantic_cache_lookup"
    ]
  },
  {
    name: "release",
    description: "Releaseprofil fuer Paket-, Plugin-, Scorecard- und Audit-Belege.",
    use_case: "Veroeffentlichungsvorbereitung mit Package-Smoke, Plugin-Smoke, Impact und Release-Audit.",
    tool_names: [
      "sparkompass_inventory",
      "sparkompass_lookup",
      "sparkompass_plan_context",
      "sparkompass_context_bom",
      "sparkompass_build_envelope",
      "sparkompass_control_report",
      "sparkompass_evidence_audit",
      "sparkompass_ablation_audit",
      "sparkompass_slim_context",
      "sparkompass_handoff_receipt",
      "sparkompass_handoff_ledger",
      "sparkompass_scorecard",
      "sparkompass_pilot_run",
      "sparkompass_impact_report",
      "sparkompass_release_audit",
      "sparkompass_package_audit",
      "sparkompass_package_install_smoke",
      "sparkompass_plugin_install_smoke",
      "sparkompass_experiment_plan",
      "sparkompass_experiment_script",
      "sparkompass_experiment_audit",
      "sparkompass_experiment_run",
      "sparkompass_doctor_overhead",
      "sparkompass_router_decision",
      "sparkompass_prompt_advisory",
      "sparkompass_prepare_prompt",
      "sparkompass_prompt_preparation_ledger",
      "sparkompass_envelope_ledger",
      "sparkompass_expand_symbol",
      "sparkompass_load_evidence",
      "sparkompass_load_source_hash",
      "sparkompass_summarize_tool_output",
      "sparkompass_load_tool_output",
      "sparkompass_slice_symbol",
      "sparkompass_trace_flow",
      "sparkompass_cache_write",
      "sparkompass_delta",
      "sparkompass_pack",
      "sparkompass_verify_receipt",
      "sparkompass_verify_context_pack",
      "sparkompass_contextpack_format",
      "sparkompass_task_outcome",
      "sparkompass_task_outcome_ledger",
      "sparkompass_calibrate_context",
      "sparkompass_savings_ledger",
      "sparkompass_shadow_compare",
      "sparkompass_semantic_cache_add",
      "sparkompass_semantic_cache_lookup"
    ]
  },
  {
    name: "debug",
    description: "Vollprofil mit allen Werkzeugen; entspricht dem bisherigen Verhalten.",
    use_case: "Entwicklung, Fehlersuche und Rueckwaertskompatibilitaet.",
    tool_names: ["*"]
  }
];

const PROFILE_ALIASES = new Map([
  ["all", "debug"],
  ["full", "debug"],
  ["default", "debug"],
  ["normal", "standard"]
]);

export function isKnownToolProfile(name) {
  const requested = String(name || "").trim().toLowerCase();
  const normalized = PROFILE_ALIASES.get(requested) || requested;
  return TOOL_PROFILE_DEFINITIONS.some((profile) => profile.name === normalized);
}

export function normalizeToolProfileName(name) {
  const requested = String(name || "debug").trim().toLowerCase();
  const normalized = PROFILE_ALIASES.get(requested) || requested;
  return isKnownToolProfile(normalized) ? normalized : "debug";
}

export function getToolProfile(name = "debug") {
  const profileName = normalizeToolProfileName(name);
  return TOOL_PROFILE_DEFINITIONS.find((profile) => profile.name === profileName) || TOOL_PROFILE_DEFINITIONS.at(-1);
}

export function getMcpToolsForProfile(tools = [], profileName = "debug") {
  const profile = getToolProfile(profileName);
  if (profile.tool_names.includes("*")) return tools;
  const allowed = new Set(profile.tool_names);
  return tools.filter((tool) => allowed.has(tool.name));
}

export function buildToolProfileCatalog(tools = []) {
  const knownTools = new Set(tools.map((tool) => tool.name));
  const fullCount = tools.length;
  return TOOL_PROFILE_DEFINITIONS.map((profile) => {
    const toolNames = profile.tool_names.includes("*")
      ? [...knownTools]
      : profile.tool_names;
    const missing = toolNames.filter((name) => !knownTools.has(name));
    const visible = profile.tool_names.includes("*")
      ? tools
      : tools.filter((tool) => toolNames.includes(tool.name));
    return {
      name: profile.name,
      description: profile.description,
      use_case: profile.use_case,
      tool_count: visible.length,
      hidden_tool_count: Math.max(0, fullCount - visible.length),
      tool_names: visible.map((tool) => tool.name),
      missing_tool_names: missing
    };
  });
}
