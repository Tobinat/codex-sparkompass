import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { formatNumber } from "./token-estimator.mjs";
import { isKnownToolProfile, normalizeToolProfileName } from "./tool-profiles.mjs";

const REQUIRED_VARIANTS = [
  { name: "basis_raw", lane: "basis", prompt_kind: "raw", plugin_enabled: false, compact_enabled: false },
  { name: "basis_kompakt", lane: "basis", prompt_kind: "compact", plugin_enabled: false, compact_enabled: true },
  { name: "plugin_raw", lane: "plugin", prompt_kind: "raw", plugin_enabled: true, compact_enabled: false },
  { name: "plugin_kompakt", lane: "plugin", prompt_kind: "compact", plugin_enabled: true, compact_enabled: true }
];

export async function buildSparkompassExperimentPlan(rootPath, options = {}) {
  const root = path.resolve(rootPath || ".");
  const repeat = clampInteger(options.repeat, 3, 1, 100);
  const evidenceDir = normalizeRelativePath(options.evidenceDir || options.evidence || "evidence/codex-experiment");
  const planJson = normalizeRelativePath(options.planJson || options.planFile || options.out || options.output || path.join(evidenceDir, "experiment-plan.json"));
  const auditJson = normalizeRelativePath(options.auditJson || path.join(evidenceDir, "experiment-evidence-audit.json"));
  const experimentJson = normalizeRelativePath(options.experimentJson || path.join(evidenceDir, "experiment.json"));
  const routerJson = normalizeRelativePath(options.routerJson || path.join(evidenceDir, "router.json"));
  const overheadJson = normalizeRelativePath(options.overheadJson || path.join(evidenceDir, "overhead.json"));
  const toolProfile = normalizeToolProfileName(options.toolProfile || options.profile || "standard");
  const toolProfileKnown = isKnownToolProfile(options.toolProfile || options.profile || "standard");
  const rawPrompt = await buildPromptEvidence(root, {
    kind: "raw",
    file: options.rawPromptFile || options.promptFile || "",
    text: options.rawPrompt || options.prompt || "",
    plannedFile: normalizeRelativePath(options.rawPromptOut || path.join(evidenceDir, "prompts", "raw.txt"))
  });
  const compactPrompt = await buildPromptEvidence(root, {
    kind: "compact",
    file: options.compactPromptFile || "",
    text: options.compactPrompt || "",
    plannedFile: normalizeRelativePath(options.compactPromptOut || path.join(evidenceDir, "prompts", "compact.txt"))
  });
  const controls = await buildRunControls(root, {
    ...options,
    toolProfile,
    toolProfileKnown,
    rawPrompt,
    compactPrompt
  });
  const variants = buildPlannedRuns(root, {
    repeat,
    evidenceDir,
    toolProfile,
    rawPrompt,
    compactPrompt,
    controls,
    taskCommand: options.taskCommand || "",
    expectOutput: asArray(options.expectOutput),
    expectOutputRegex: asArray(options.expectOutputRegex)
  });
  const commands = buildPlanCommands(root, {
    variants,
    repeat,
    planJson,
    auditJson,
    experimentJson,
    routerJson,
    overheadJson,
    toolProfile,
    controls,
    rawPrompt,
    compactPrompt
  });
  const gate = buildPlanGate({
    repeat,
    toolProfileKnown,
    controls,
    rawPrompt,
    compactPrompt,
    variants
  });

  return {
    schema: "SparkompassExperimentPlanV1",
    plan_id: `experiment-plan-${sha256(JSON.stringify({
      root,
      evidenceDir,
      repeat,
      raw: rawPrompt.prompt_hash,
      compact: compactPrompt.prompt_hash,
      model: controls.model,
      sandbox: controls.sandbox_mode,
      profile: toolProfile
    })).slice(0, 12)}`,
    created_at: new Date().toISOString(),
    objective: "Reproduzierbare Vierarm-Codex-Messung vorbereiten: basis_raw, basis_kompakt, plugin_raw, plugin_kompakt.",
    root,
    evidence_dir: evidenceDir,
    matrix: REQUIRED_VARIANTS.map((variant) => variant.name),
    repeat,
    run_controls: controls,
    prompts: {
      raw: rawPrompt,
      compact: compactPrompt
    },
    variants,
    totals: {
      planned_runs: variants.length,
      planned_usage_files: variants.length,
      planned_task_outcomes: variants.filter((variant) => variant.task_outcome_command).length,
      expected_matrix_cells: REQUIRED_VARIANTS.length,
      repeat
    },
    commands,
    gate,
    caveats: [
      "Dieser Plan fuehrt Codex nicht aus und erzeugt keine offiziellen Usage-Werte.",
      "Offizielle Usage entsteht erst durch die geplanten codex exec --json Laeufe und die anschliessende Auswertung mit sparkompass experiment run.",
      "Die Basis-Arme nutzen --ignore-user-config, damit installierte Plugins und User-Konfigurationen die Baseline moeglichst wenig beeinflussen; pruefe trotzdem die realen Laufbedingungen.",
      "TaskOutcome-Dateien belegen Qualitaet nur, wenn die angegebene Task-Pruefung wirklich zur Aufgabe passt."
    ],
    next_actions: buildNextActions(gate, commands)
  };
}

export async function writeSparkompassExperimentPlan(rootPath, plan, options = {}) {
  const root = path.resolve(rootPath || ".");
  const outPath = resolveAgainstRoot(root, options.out || options.output || "");
  if (!outPath) return null;
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  return outPath;
}

export function formatSparkompassExperimentPlan(plan) {
  const variants = plan.variants
    .map((variant) => `- ${variant.variant} r${variant.repeat_index}: ${variant.prompt_kind}, Usage ${variant.expected_usage_jsonl}, TaskOutcome ${variant.expected_task_outcome_json || "nicht geplant"}`)
    .join("\n");
  const problems = plan.gate.reasons.length
    ? plan.gate.reasons.map((reason) => `- ${reason}`).join("\n")
    : "- keine";

  return `
# SparkompassExperimentPlanV1

Gate: ${plan.gate.status}
Plan: ${plan.plan_id}

- Matrix: ${plan.matrix.join(", ")}
- Geplante Runs: ${formatNumber(plan.totals.planned_runs)}
- Repeat: ${formatNumber(plan.repeat)}
- Tool-Profil: ${plan.run_controls.tool_profile}
- Codex-Version: ${plan.run_controls.codex_version}
- Modell: ${plan.run_controls.model || "nicht gesetzt"}
- Sandbox: ${plan.run_controls.sandbox_mode || "nicht gesetzt"}

## Varianten

${variants}

## Hauptbefehle

- Doctor: ${plan.commands.doctor_overhead}
- Experiment auswerten: ${plan.commands.experiment_run}
- Router entscheiden: ${plan.commands.router_decide}

## Gate-Probleme

${problems}

Hinweis: ${plan.caveats.join(" ")}
`.trim();
}

function buildPlannedRuns(root, options) {
  const variants = [];
  for (let repeatIndex = 1; repeatIndex <= options.repeat; repeatIndex += 1) {
    for (const definition of REQUIRED_VARIANTS) {
      const prompt = definition.prompt_kind === "raw" ? options.rawPrompt : options.compactPrompt;
      const usageFile = normalizeRelativePath(path.join(options.evidenceDir, "usage", `${definition.name}.r${repeatIndex}.jsonl`));
      const taskOutcomeFile = options.taskCommand
        ? normalizeRelativePath(path.join(options.evidenceDir, "tasks", `${definition.name}.r${repeatIndex}.task.json`))
        : "";
      variants.push({
        schema: "SparkompassPlannedExperimentRunV1",
        variant: definition.name,
        repeat_index: repeatIndex,
        lane: definition.lane,
        prompt_kind: definition.prompt_kind,
        plugin_enabled: definition.plugin_enabled,
        compact_enabled: definition.compact_enabled,
        prompt_hash: prompt.prompt_hash,
        prompt_source: prompt.source,
        prompt_file: prompt.command_file,
        expected_usage_jsonl: usageFile,
        expected_task_outcome_json: taskOutcomeFile || null,
        codex_command: buildCodexExecCommand(root, {
          definition,
          prompt,
          usageFile,
          controls: options.controls,
          toolProfile: options.toolProfile
        }),
        task_outcome_command: taskOutcomeFile
          ? buildTaskOutcomeCommand({
            taskCommand: options.taskCommand,
            expectOutput: options.expectOutput,
            expectOutputRegex: options.expectOutputRegex,
            taskOutcomeFile
          })
          : ""
      });
    }
  }
  return variants;
}

function buildCodexExecCommand(root, options) {
  const { definition, prompt, usageFile, controls, toolProfile } = options;
  const argv = [
    controls.codex_path || "codex",
    "exec",
    "--json",
    "-C",
    root
  ];
  if (!definition.plugin_enabled) argv.push("--ignore-user-config");
  if (controls.model) argv.push("-m", controls.model);
  if (controls.sandbox_mode) argv.push("-s", controls.sandbox_mode);
  argv.push("-");
  const shellPrefix = definition.plugin_enabled ? `SPARKOMPASS_TOOL_PROFILE=${shellQuote(toolProfile)} ` : "";
  const stdinFile = prompt.command_file || prompt.planned_file;
  return {
    argv,
    stdin_file: stdinFile,
    stdout_file: usageFile,
    shell: `${shellPrefix}${argv.map(shellQuote).join(" ")} < ${shellQuote(stdinFile)} > ${shellQuote(usageFile)}`,
    caveat: definition.plugin_enabled
      ? "Plugin-Arm: nutzt die aktuelle Codex-Plugin/User-Konfiguration plus SPARKOMPASS_TOOL_PROFILE."
      : "Basis-Arm: nutzt --ignore-user-config als lokale Baseline-Kontrolle."
  };
}

function buildTaskOutcomeCommand(options) {
  const argv = [
    "node",
    "./bin/codex-sparkompass.mjs",
    "task",
    "run",
    ".",
    "--command",
    String(options.taskCommand),
    "--json"
  ];
  for (const expected of options.expectOutput || []) {
    argv.push("--expect-output", String(expected));
  }
  for (const expected of options.expectOutputRegex || []) {
    argv.push("--expect-output-regex", String(expected));
  }
  return `${argv.map(shellQuote).join(" ")} > ${shellQuote(options.taskOutcomeFile)}`;
}

function buildPlanCommands(root, options) {
  const auditArgv = [
    "node",
    "./bin/codex-sparkompass.mjs",
    "experiment",
    "audit",
    ".",
    "--plan",
    options.planJson,
    "--out",
    options.auditJson
  ];
  const experimentArgv = [
    "node",
    "./bin/codex-sparkompass.mjs",
    "experiment",
    "run",
    "."
  ];
  for (const variant of options.variants) {
    experimentArgv.push("--variant", `${variant.variant}=${variant.expected_usage_jsonl}`);
  }
  if (options.rawPrompt.command_file) {
    experimentArgv.push("--prompt-file-variant", `basis_raw=${options.rawPrompt.command_file}`);
    experimentArgv.push("--prompt-file-variant", `plugin_raw=${options.rawPrompt.command_file}`);
  }
  if (options.compactPrompt.command_file) {
    experimentArgv.push("--prompt-file-variant", `basis_kompakt=${options.compactPrompt.command_file}`);
    experimentArgv.push("--prompt-file-variant", `plugin_kompakt=${options.compactPrompt.command_file}`);
  }
  for (const variant of options.variants) {
    if (variant.expected_task_outcome_json) {
      experimentArgv.push("--task-outcome", `${variant.variant}.r${variant.repeat_index}=${variant.expected_task_outcome_json}`);
    }
  }
  experimentArgv.push("--repeat", String(options.repeat));
  experimentArgv.push("--codex-version", options.controls.codex_version);
  experimentArgv.push("--model", options.controls.model);
  experimentArgv.push("--reasoning-effort", options.controls.reasoning_effort);
  experimentArgv.push("--sandbox-mode", options.controls.sandbox_mode);
  experimentArgv.push("--cache-mode", options.controls.cache_mode);
  experimentArgv.push("--repository-commit", options.controls.repository_commit);
  experimentArgv.push("--configuration-hash", options.controls.configuration_hash);
  experimentArgv.push("--plugin-hash", options.controls.plugin_hash);
  experimentArgv.push("--skill-hash", options.controls.skill_hash);
  experimentArgv.push("--tool-catalog-hash", options.controls.tool_catalog_hash);
  experimentArgv.push("--context-pack-hash", options.controls.context_pack_hash);
  experimentArgv.push("--require-metadata", "true");
  experimentArgv.push("--require-context-pack-hash", "true");
  experimentArgv.push("--out", options.experimentJson);

  const doctorArgv = [
    "node",
    "./bin/codex-sparkompass.mjs",
    "doctor",
    "overhead",
    ".",
    "--profile",
    options.toolProfile,
    "--json"
  ];
  const routerArgv = [
    "node",
    "./bin/codex-sparkompass.mjs",
    "router",
    "decide",
    ".",
    "--experiment",
    options.experimentJson,
    "--overhead",
    options.overheadJson,
    "--out",
    options.routerJson
  ];
  return {
    schema: "SparkompassExperimentPlanCommandsV1",
    preflight: [
      "codex --version",
      "codex exec --help",
      "codex mcp list"
    ],
    planned_codex_runs: options.variants.map((variant) => variant.codex_command.shell),
    planned_task_outcomes: options.variants
      .map((variant) => variant.task_outcome_command)
      .filter(Boolean),
    doctor_overhead: `${doctorArgv.map(shellQuote).join(" ")} > ${shellQuote(options.overheadJson)}`,
    experiment_audit: auditArgv.map(shellQuote).join(" "),
    experiment_run: experimentArgv.map(shellQuote).join(" "),
    router_decide: routerArgv.map(shellQuote).join(" "),
    working_directory: root
  };
}

async function buildRunControls(root, options) {
  const configuration = await resolveConfigurationEvidence(root, options);
  return {
    schema: "SparkompassExperimentRunControlsV1",
    codex_path: options.codexPath || "codex",
    codex_version: options.codexVersion || readCommandVersion(options.codexPath || "codex"),
    model: String(options.model || ""),
    reasoning_effort: String(options.reasoningEffort || options.reasoning || ""),
    sandbox_mode: String(options.sandboxMode || options.sandbox || ""),
    cache_mode: String(options.cacheMode || options.cache || "default"),
    repository_commit: String(options.repositoryCommit || readGit(root, ["rev-parse", "HEAD"]) || ""),
    repository_dirty: options.repositoryDirty ?? Boolean(readGit(root, ["status", "--porcelain"])),
    operating_system: `${os.platform()} ${os.release()}`,
    node_version: process.version,
    configuration_file: configuration.file,
    configuration_hash: options.configurationHash || configuration.hash,
    plugin_hash: options.pluginHash || await hashMaybeExisting(path.join(root, "plugins", "codex-sparkompass", ".codex-plugin", "plugin.json")),
    skill_hash: options.skillHash || await hashMaybeExisting(path.join(root, ".agents", "skills", "codex-sparkompass", "SKILL.md")),
    tool_catalog_hash: options.toolCatalogHash || await hashMaybeExisting(path.join(root, "src", "mcp-tools.mjs")),
    raw_prompt_hash: options.rawPromptHash || options.promptHash || options.rawPrompt?.prompt_hash || "",
    compact_prompt_hash: options.compactPromptHash || options.compactPrompt?.prompt_hash || "",
    context_pack_hash: options.contextPackHash || await hashOptionalFile(root, options.contextPack || ""),
    task_command_hash: options.taskCommand ? `sha256:${sha256(String(options.taskCommand))}` : "",
    tool_profile: options.toolProfile,
    tool_profile_known: options.toolProfileKnown
  };
}

async function buildPromptEvidence(root, options) {
  const file = options.file ? resolveAgainstRoot(root, options.file) : "";
  if (file) {
    const text = await fs.readFile(file, "utf8");
    return {
      schema: "SparkompassExperimentPromptEvidenceV1",
      kind: options.kind,
      source: "file",
      file,
      relative_file: relativeOrAbsolute(root, file),
      planned_file: normalizeRelativePath(options.plannedFile),
      command_file: relativeOrAbsolute(root, file),
      prompt_hash: `sha256:${sha256(text)}`,
      bytes: Buffer.byteLength(text, "utf8"),
      known: true
    };
  }

  const text = String(options.text || "");
  if (text) {
    return {
      schema: "SparkompassExperimentPromptEvidenceV1",
      kind: options.kind,
      source: "inline",
      file: null,
      relative_file: null,
      planned_file: normalizeRelativePath(options.plannedFile),
      command_file: normalizeRelativePath(options.plannedFile),
      prompt_hash: `sha256:${sha256(text)}`,
      bytes: Buffer.byteLength(text, "utf8"),
      known: true,
      materialization_required: true
    };
  }

  return {
    schema: "SparkompassExperimentPromptEvidenceV1",
    kind: options.kind,
    source: "missing",
    file: null,
    relative_file: null,
    planned_file: normalizeRelativePath(options.plannedFile),
    command_file: "",
    prompt_hash: "sha256:unknown",
    bytes: 0,
    known: false,
    materialization_required: true
  };
}

function buildPlanGate(options) {
  const reasons = [];
  if (options.repeat < 3) reasons.push(`repeat-under-target:${options.repeat}/3`);
  if (!options.toolProfileKnown) reasons.push(`unknown-tool-profile:${options.controls.tool_profile}`);
  if (!options.rawPrompt.known) reasons.push("raw-prompt-missing");
  if (!options.compactPrompt.known) reasons.push("compact-prompt-missing");
  if (options.rawPrompt.materialization_required || options.compactPrompt.materialization_required) {
    reasons.push("prompt-files-not-materialized");
  }

  const fields = [
    ["codex_version", options.controls.codex_version],
    ["model", options.controls.model],
    ["reasoning_effort", options.controls.reasoning_effort],
    ["sandbox_mode", options.controls.sandbox_mode],
    ["repository_commit", options.controls.repository_commit],
    ["configuration_hash", options.controls.configuration_hash],
    ["plugin_hash", options.controls.plugin_hash],
    ["skill_hash", options.controls.skill_hash],
    ["tool_catalog_hash", options.controls.tool_catalog_hash],
    ["context_pack_hash", options.controls.context_pack_hash]
  ];
  for (const [field, value] of fields) {
    if (!isKnownEvidenceValue(value)) reasons.push(`metadata-missing:${field}`);
  }
  const missingPromptCommands = options.variants.filter((variant) => !variant.prompt_file);
  if (missingPromptCommands.length) reasons.push("prompt-files-not-materialized");

  const uniqueReasons = [...new Set(reasons)];
  return {
    status: uniqueReasons.length ? "experiment-plan-needs-review" : "verified-experiment-plan",
    verified: uniqueReasons.length === 0,
    reasons: uniqueReasons,
    evidence_stage: uniqueReasons.length ? "plan-needs-review" : "ready-for-official-codex-runs"
  };
}

function buildNextActions(gate, commands) {
  if (gate.verified) {
    return [
      "Fuehre die geplanten Codex-Runs aus und behalte die JSONL-Dateien unveraendert.",
      "Fuehre danach den Doctor-, ExperimentRun- und Router-Befehl aus.",
      "Verwende die Ergebnisse erst im README, wenn experiment run quality-noninferior oder besser meldet."
    ];
  }
  return [
    "Ergaenze fehlende Prompt-Dateien, Modell, Reasoning, Sandbox und Hash-Metadaten.",
    "Erzeuge danach den Plan erneut, bis Gate verified-experiment-plan erreicht ist.",
    `Vorhandener Auswertungsbefehl: ${commands.experiment_run}`
  ];
}

async function resolveConfigurationEvidence(root, options) {
  const configured = options.configurationFile || options.configFile || "";
  const candidates = configured
    ? [resolveAgainstRoot(root, configured)]
    : [
      path.join(root, ".codex", "config.toml"),
      process.env.CODEX_HOME ? path.join(process.env.CODEX_HOME, "config.toml") : "",
      path.join(os.homedir(), ".codex", "config.toml")
    ].filter(Boolean);
  for (const candidate of candidates) {
    const hash = await hashMaybeExisting(candidate);
    if (isKnownEvidenceValue(hash)) {
      return { file: candidate, hash };
    }
  }
  return {
    file: candidates[0] || null,
    hash: "sha256:missing"
  };
}

async function hashOptionalFile(root, filePath) {
  if (!filePath) return "sha256:unknown";
  return hashMaybeExisting(resolveAgainstRoot(root, filePath));
}

async function hashMaybeExisting(filePath) {
  try {
    const bytes = await fs.readFile(filePath);
    return `sha256:${sha256(bytes)}`;
  } catch (error) {
    if (error.code === "ENOENT") return "sha256:missing";
    return "sha256:unavailable";
  }
}

function readCommandVersion(command) {
  try {
    const output = execFileSync(command, ["--version"], {
      encoding: "utf8",
      timeout: 2000,
      stdio: ["ignore", "pipe", "ignore"]
    });
    return output.trim() || "unknown";
  } catch {
    return "unknown";
  }
}

function readGit(root, args) {
  try {
    return execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      timeout: 2000,
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    return "";
  }
}

function isKnownEvidenceValue(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  const lower = text.toLowerCase();
  return ![
    "unknown",
    "sha256:unknown",
    "sha256:missing",
    "sha256:unavailable",
    "null",
    "undefined"
  ].includes(lower);
}

function normalizeRelativePath(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function relativeOrAbsolute(root, filePath) {
  if (!filePath) return "";
  const relative = path.relative(root, filePath);
  if (!relative.startsWith("..") && !path.isAbsolute(relative)) {
    return normalizeRelativePath(relative);
  }
  return filePath;
}

function resolveAgainstRoot(root, filePath) {
  if (!filePath) return "";
  if (path.isAbsolute(String(filePath))) return String(filePath);
  return path.resolve(root, String(filePath));
}

function clampInteger(value, fallback, min, max) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === "") return [];
  return [value];
}

function shellQuote(value) {
  const text = String(value ?? "");
  if (/^[A-Za-z0-9_./:=@%+-]+$/.test(text)) return text;
  return `'${text.replace(/'/g, "'\\''")}'`;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
