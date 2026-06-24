import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { buildCodexUsageReceipt } from "./codex-usage.mjs";
import { loadTaskOutcomeJson } from "./task-outcome-ledger.mjs";
import { formatNumber } from "./token-estimator.mjs";

const REQUIRED_VARIANTS = ["basis_raw", "basis_kompakt", "plugin_raw", "plugin_kompakt"];

export async function buildSparkompassExperimentEvidenceAudit(rootPath, options = {}) {
  const root = path.resolve(rootPath || ".");
  const planPath = resolveAgainstRoot(root, options.plan || options.planFile || "");
  if (!planPath) {
    throw new Error("Bitte Plan-Datei angeben: sparkompass experiment audit . --plan evidence/experiment-plan.json");
  }
  const rawPlan = await fs.readFile(planPath, "utf8");
  const plan = JSON.parse(rawPlan);
  const promptChecks = await buildPromptChecks(root, plan);
  const runs = [];
  for (const plannedRun of plan.variants || []) {
    runs.push(await auditPlannedRun(root, plannedRun));
  }
  const summary = summarizeEvidenceAudit(plan, runs, promptChecks);
  const gate = buildAuditGate(plan, summary, {
    root,
    planPath
  });

  return {
    schema: "SparkompassExperimentEvidenceAuditV1",
    audit_id: `experiment-evidence-audit-${sha256(`${planPath}:${rawPlan}:${runs.map((run) => run.audit_hash).join("|")}`).slice(0, 12)}`,
    created_at: new Date().toISOString(),
    root,
    plan: {
      file: planPath,
      relative_file: path.relative(root, planPath),
      schema: plan.schema || "unknown",
      plan_id: plan.plan_id || "",
      gate_status: plan.gate?.status || "unknown",
      gate_verified: Boolean(plan.gate?.verified),
      root: plan.root || "",
      root_matches_audit_root: plan.root ? path.resolve(plan.root) === root : null,
      repeat: Number(plan.repeat) || 0,
      matrix: Array.isArray(plan.matrix) ? plan.matrix : [],
      raw_sha256: `sha256:${sha256(rawPlan)}`
    },
    prompt_checks: promptChecks,
    runs,
    summary,
    gate,
    commands: {
      experiment_run: plan.commands?.experiment_run || "",
      doctor_overhead: plan.commands?.doctor_overhead || "",
      router_decide: plan.commands?.router_decide || ""
    },
    caveats: [
      "Dieser Audit startet Codex nicht und erzeugt keine offiziellen Usage-Werte.",
      "Er prueft nur, ob die durch experiment plan erwarteten lokalen Artefakte vorhanden, hashbar und rechnerisch konsistent sind.",
      "Erst experiment run baut daraus RunManifests, Effekte, Gate und Router-Empfehlung."
    ],
    next_actions: buildNextActions(gate, plan)
  };
}

export async function writeSparkompassExperimentEvidenceAudit(rootPath, audit, options = {}) {
  const root = path.resolve(rootPath || ".");
  const outPath = resolveAgainstRoot(root, options.out || options.output || "");
  if (!outPath) return null;
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
  return outPath;
}

export function formatSparkompassExperimentEvidenceAudit(audit) {
  const rows = Object.entries(audit.summary.by_variant).map(([variant, stats]) => (
    `- ${variant}: Usage ${formatNumber(stats.usage_verified_runs)}/${formatNumber(stats.runs)}, Invarianten ${formatNumber(stats.usage_invariant_verified_runs)}/${formatNumber(stats.runs)}, TaskOutcome ${formatNumber(stats.task_outcomes_verified)}/${formatNumber(stats.task_outcomes_planned)}, Prompt ${formatNumber(stats.prompt_hash_matches)}/${formatNumber(stats.runs)}`
  )).join("\n") || "- keine Varianten";
  const problems = audit.gate.reasons.length
    ? audit.gate.reasons.map((reason) => `- ${reason}`).join("\n")
    : "- keine";

  return `
# SparkompassExperimentEvidenceAuditV1

Gate: ${audit.gate.status}
Plan: ${audit.plan.relative_file || audit.plan.file}

- Geplante Runs: ${formatNumber(audit.summary.planned_runs)}
- Usage-Dateien: ${formatNumber(audit.summary.usage_files_present)}/${formatNumber(audit.summary.planned_runs)} vorhanden, ${formatNumber(audit.summary.usage_verified_runs)}/${formatNumber(audit.summary.planned_runs)} verifiziert
- Usage-Invarianten: ${formatNumber(audit.summary.usage_invariant_verified_runs)}/${formatNumber(audit.summary.planned_runs)}
- TaskOutcomes: ${formatNumber(audit.summary.task_outcomes_verified)}/${formatNumber(audit.summary.task_outcomes_planned)} verifiziert
- Prompt-Hashes: ${formatNumber(audit.summary.prompt_hash_matches)}/${formatNumber(audit.summary.planned_runs)} passend

## Varianten

${rows}

## Gate-Probleme

${problems}

Hinweis: ${audit.caveats.join(" ")}
`.trim();
}

async function buildPromptChecks(root, plan) {
  const checks = [];
  for (const [kind, prompt] of Object.entries(plan.prompts || {})) {
    const file = prompt.command_file || prompt.relative_file || prompt.planned_file || "";
    checks.push(await auditPromptFile(root, {
      kind,
      file,
      expectedHash: prompt.prompt_hash || ""
    }));
  }
  return checks;
}

async function auditPlannedRun(root, plannedRun) {
  const prompt = await auditPromptFile(root, {
    kind: plannedRun.prompt_kind || "",
    file: plannedRun.prompt_file || plannedRun.codex_command?.stdin_file || "",
    expectedHash: plannedRun.prompt_hash || ""
  });
  const usage = await auditUsageFile(root, plannedRun.expected_usage_jsonl || "");
  const taskOutcome = plannedRun.expected_task_outcome_json
    ? await auditTaskOutcomeFile(root, plannedRun.expected_task_outcome_json)
    : {
      planned: false,
      present: false,
      verified: true,
      gate_status: "not-planned",
      reasons: []
    };
  const reasons = [
    ...prompt.reasons.map((reason) => `prompt:${reason}`),
    ...usage.reasons.map((reason) => `usage:${reason}`),
    ...taskOutcome.reasons.map((reason) => `task-outcome:${reason}`)
  ];
  const verified = reasons.length === 0;

  return {
    schema: "SparkompassExperimentEvidenceRunAuditV1",
    variant: plannedRun.variant || "",
    repeat_index: plannedRun.repeat_index || null,
    prompt_kind: plannedRun.prompt_kind || "",
    expected_usage_jsonl: plannedRun.expected_usage_jsonl || "",
    expected_task_outcome_json: plannedRun.expected_task_outcome_json || null,
    prompt,
    usage,
    task_outcome: taskOutcome,
    gate: {
      status: verified ? "verified-planned-experiment-run" : "planned-experiment-run-needs-review",
      verified,
      reasons
    },
    audit_hash: `sha256:${sha256(JSON.stringify({
      plannedRun,
      prompt,
      usage,
      taskOutcome
    }))}`
  };
}

async function auditPromptFile(root, options) {
  const relativeFile = normalizeRelativePath(options.file || "");
  const filePath = resolveAgainstRoot(root, relativeFile);
  const reasons = [];
  if (!relativeFile) reasons.push("missing-prompt-file");

  let text = "";
  let present = false;
  let actualHash = "";
  if (relativeFile) {
    try {
      text = await fs.readFile(filePath, "utf8");
      present = true;
      actualHash = `sha256:${sha256(text)}`;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      reasons.push("prompt-file-not-found");
    }
  }
  const hashMatches = Boolean(present && options.expectedHash && actualHash === options.expectedHash);
  if (present && options.expectedHash && !hashMatches) reasons.push("prompt-hash-mismatch");
  if (present && !options.expectedHash) reasons.push("prompt-hash-missing");

  return {
    schema: "SparkompassExperimentPromptAuditV1",
    kind: options.kind || "",
    file: relativeFile,
    absolute_file: relativeFile ? filePath : "",
    present,
    expected_hash: options.expectedHash || "",
    actual_hash: actualHash,
    hash_matches: hashMatches,
    bytes: Buffer.byteLength(text, "utf8"),
    verified: reasons.length === 0,
    reasons
  };
}

async function auditUsageFile(root, relativeFile) {
  const normalizedFile = normalizeRelativePath(relativeFile || "");
  const filePath = resolveAgainstRoot(root, normalizedFile);
  const reasons = [];
  if (!normalizedFile) reasons.push("missing-usage-file");

  let receipt = null;
  let rawHash = "";
  let present = false;
  if (normalizedFile) {
    try {
      const raw = await fs.readFile(filePath, "utf8");
      rawHash = `sha256:${sha256(raw)}`;
      present = true;
      receipt = buildCodexUsageReceipt(raw, {
        sourceFile: filePath,
        label: normalizedFile
      });
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      reasons.push("usage-file-not-found");
    }
  }

  if (receipt && !receipt.gate.verified) {
    reasons.push(...receipt.gate.reasons);
  }
  const invariants = receipt?.official_usage?.invariants || null;
  if (receipt && !invariants?.verified) {
    reasons.push("usage-invariant-failures");
  }

  return {
    schema: "SparkompassExperimentUsageAuditV1",
    file: normalizedFile,
    absolute_file: normalizedFile ? filePath : "",
    present,
    raw_sha256: rawHash,
    gate_status: receipt?.gate?.status || "not-read",
    gate_verified: Boolean(receipt?.gate?.verified),
    invariant_status: invariants?.status || "not-read",
    invariant_verified: Boolean(invariants?.verified),
    invariant_failed_checks: invariants?.failed_checks || [],
    total_tokens: receipt?.official_usage?.totals?.total_tokens || 0,
    input_tokens: receipt?.official_usage?.totals?.input_tokens || 0,
    cached_input_tokens: receipt?.official_usage?.totals?.cached_input_tokens || 0,
    output_tokens: receipt?.official_usage?.totals?.output_tokens || 0,
    reasoning_output_tokens: receipt?.official_usage?.totals?.reasoning_output_tokens || 0,
    verified: reasons.length === 0,
    reasons: unique(reasons)
  };
}

async function auditTaskOutcomeFile(root, relativeFile) {
  const normalizedFile = normalizeRelativePath(relativeFile || "");
  const filePath = resolveAgainstRoot(root, normalizedFile);
  const reasons = [];
  if (!normalizedFile) reasons.push("missing-task-outcome-file");

  let rawHash = "";
  let present = false;
  let outcome = null;
  if (normalizedFile) {
    try {
      const raw = await fs.readFile(filePath, "utf8");
      rawHash = `sha256:${sha256(raw)}`;
      present = true;
      outcome = await loadTaskOutcomeJson(filePath);
    } catch (error) {
      if (error.code === "ENOENT") {
        reasons.push("task-outcome-file-not-found");
      } else {
        reasons.push("task-outcome-parse-failed");
      }
    }
  }
  if (outcome && !outcome.gate?.verified) {
    reasons.push(...(outcome.gate?.reasons || ["task-outcome-needs-review"]));
  }

  return {
    schema: "SparkompassExperimentTaskOutcomeAuditV1",
    planned: true,
    file: normalizedFile,
    absolute_file: normalizedFile ? filePath : "",
    present,
    raw_sha256: rawHash,
    task_id: outcome?.task_id || "",
    gate_status: outcome?.gate?.status || "not-read",
    gate_verified: Boolean(outcome?.gate?.verified),
    verified: reasons.length === 0,
    reasons: unique(reasons)
  };
}

function summarizeEvidenceAudit(plan, runs, promptChecks) {
  const byVariant = {};
  for (const variant of unique(runs.map((run) => run.variant))) {
    const variantRuns = runs.filter((run) => run.variant === variant);
    byVariant[variant] = summarizeVariantRuns(variantRuns);
  }

  return {
    planned_runs: runs.length,
    expected_runs: (Number(plan.repeat) || 0) * (Array.isArray(plan.matrix) ? plan.matrix.length : 0),
    variants: Object.keys(byVariant).length,
    expected_variants: REQUIRED_VARIANTS.length,
    prompt_files_present: promptChecks.filter((check) => check.present).length,
    prompt_files_verified: promptChecks.filter((check) => check.verified).length,
    usage_files_present: runs.filter((run) => run.usage.present).length,
    usage_verified_runs: runs.filter((run) => run.usage.gate_verified).length,
    usage_invariant_verified_runs: runs.filter((run) => run.usage.invariant_verified).length,
    task_outcomes_planned: runs.filter((run) => run.task_outcome.planned).length,
    task_outcomes_present: runs.filter((run) => run.task_outcome.planned && run.task_outcome.present).length,
    task_outcomes_verified: runs.filter((run) => run.task_outcome.planned && run.task_outcome.verified).length,
    prompt_hash_matches: runs.filter((run) => run.prompt.hash_matches).length,
    verified_runs: runs.filter((run) => run.gate.verified).length,
    by_variant: byVariant
  };
}

function summarizeVariantRuns(runs) {
  return {
    runs: runs.length,
    usage_files_present: runs.filter((run) => run.usage.present).length,
    usage_verified_runs: runs.filter((run) => run.usage.gate_verified).length,
    usage_invariant_verified_runs: runs.filter((run) => run.usage.invariant_verified).length,
    task_outcomes_planned: runs.filter((run) => run.task_outcome.planned).length,
    task_outcomes_present: runs.filter((run) => run.task_outcome.planned && run.task_outcome.present).length,
    task_outcomes_verified: runs.filter((run) => run.task_outcome.planned && run.task_outcome.verified).length,
    prompt_hash_matches: runs.filter((run) => run.prompt.hash_matches).length,
    verified_runs: runs.filter((run) => run.gate.verified).length,
    total_tokens: {
      median: median(runs.map((run) => run.usage.total_tokens)),
      sum: sum(runs.map((run) => run.usage.total_tokens))
    }
  };
}

function buildAuditGate(plan, summary, options = {}) {
  const reasons = [];
  if (plan.schema !== "SparkompassExperimentPlanV1") reasons.push("invalid-plan-schema");
  if (!plan.gate?.verified) reasons.push("plan-not-verified");
  if (plan.root && path.resolve(plan.root) !== options.root) reasons.push("plan-root-mismatch");
  if (summary.expected_runs && summary.planned_runs !== summary.expected_runs) reasons.push(`planned-run-count-mismatch:${summary.planned_runs}/${summary.expected_runs}`);
  const missingVariants = REQUIRED_VARIANTS.filter((variant) => !Object.hasOwn(summary.by_variant, variant));
  if (missingVariants.length) reasons.push(`missing-variants:${missingVariants.join(",")}`);
  if (summary.prompt_files_verified !== summary.prompt_files_present || summary.prompt_files_verified === 0) reasons.push("prompt-files-need-review");
  if (summary.usage_files_present !== summary.planned_runs) reasons.push("missing-usage-files");
  if (summary.usage_verified_runs !== summary.planned_runs) reasons.push("usage-files-need-review");
  if (summary.usage_invariant_verified_runs !== summary.planned_runs) reasons.push("usage-invariant-failures");
  if (summary.prompt_hash_matches !== summary.planned_runs) reasons.push("prompt-hash-mismatch");
  if (summary.task_outcomes_planned > 0 && summary.task_outcomes_present !== summary.task_outcomes_planned) reasons.push("missing-task-outcomes");
  if (summary.task_outcomes_planned > 0 && summary.task_outcomes_verified !== summary.task_outcomes_planned) reasons.push("task-outcome-needs-review");

  return {
    status: reasons.length ? "experiment-evidence-needs-review" : "verified-experiment-evidence",
    verified: reasons.length === 0,
    reasons: unique(reasons),
    evidence_stage: reasons.length ? "artifacts-need-review" : "ready-for-experiment-run"
  };
}

function buildNextActions(gate, plan) {
  if (gate.verified) {
    return [
      "Fuehre jetzt den im Plan gespeicherten experiment-run-Befehl aus.",
      "Pruefe danach router decide gegen den Doctor-Overhead-Beleg.",
      "Verwende GitHub-Zahlen erst, wenn experiment run mindestens paired-reproducible und fuer Qualitaet quality-noninferior meldet."
    ];
  }
  const actions = [
    "Erzeuge fehlende Codex-JSONL-Dateien mit den geplanten codex exec --json Befehlen.",
    "Erzeuge fehlende TaskOutcome-Dateien mit den geplanten task run Befehlen.",
    "Fuehre experiment audit erneut aus, bevor experiment run als Beleg verwendet wird."
  ];
  if (plan?.commands?.doctor_overhead) actions.push(`Doctor-Befehl aus Plan: ${plan.commands.doctor_overhead}`);
  return actions;
}

function resolveAgainstRoot(root, filePath) {
  if (!filePath) return "";
  if (path.isAbsolute(String(filePath))) return String(filePath);
  return path.resolve(root, String(filePath));
}

function normalizeRelativePath(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function median(values) {
  const sorted = values.map(Number).filter(Number.isFinite).sort((left, right) => left - right);
  if (!sorted.length) return 0;
  return sorted[Math.ceil(sorted.length / 2) - 1];
}

function sum(values) {
  return values.reduce((total, value) => total + (Number(value) || 0), 0);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
