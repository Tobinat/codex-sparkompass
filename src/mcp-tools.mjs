import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { buildContextDelta, lookupContext, writeContextCache } from "./context-cache.mjs";
import { buildContextBOM } from "./context-bom.mjs";
import { calibrateContext } from "./context-calibration.mjs";
import { buildContextAblationAudit } from "./context-ablation.mjs";
import { buildContextSlimmingPlan } from "./context-slimming.mjs";
import { buildContextControlReport } from "./context-control.mjs";
import { buildContextEvidenceAudit } from "./evidence-audit.mjs";
import { buildContextEnvelope } from "./context-envelope.mjs";
import { buildContextGraph, findSymbolNeighborhood } from "./context-graph.mjs";
import { buildContextHandoffReceipt } from "./context-handoff.mjs";
import { buildContextPackFormat, validateContextPackFormat } from "./context-pack-format.mjs";
import { DEFAULT_CONTEXT_PACK_REGISTRY_PATH, registerContextPack, verifyRegisteredContextPack } from "./context-pack-registry.mjs";
import { buildContextPack } from "./context-pack.mjs";
import { buildContextPlan } from "./context-plan.mjs";
import { buildDataFlowTrace } from "./data-flow.mjs";
import { buildDoctorOverhead } from "./doctor-overhead.mjs";
import { appendEnvelopeToLedger, buildEnvelopeLedgerReport, DEFAULT_ENVELOPE_LEDGER_PATH } from "./envelope-ledger.mjs";
import { buildSparkompassExperimentEvidenceAudit, writeSparkompassExperimentEvidenceAudit } from "./experiment-evidence-audit.mjs";
import { buildSparkompassExperimentPlan, writeSparkompassExperimentPlan } from "./experiment-plan.mjs";
import { buildSparkompassExperimentRun, writeSparkompassExperimentRun } from "./experiment-run.mjs";
import { buildSparkompassExperimentScript, writeSparkompassExperimentScript } from "./experiment-script.mjs";
import { appendHandoffToLedger, buildHandoffLedgerReport, DEFAULT_HANDOFF_LEDGER_PATH } from "./handoff-ledger.mjs";
import { buildSparkompassImpactReport } from "./impact-report.mjs";
import { buildContextInventory } from "./inventory.mjs";
import { buildPackageDryRunAudit, buildPackageInstallSmokeAudit } from "./package-audit.mjs";
import { buildPluginInstallSmokeAudit } from "./plugin-audit.mjs";
import { runPilot } from "./pilot-run.mjs";
import { buildProgramSlice } from "./program-slice.mjs";
import { buildPromptAdvisory } from "./prompt-advisory.mjs";
import { buildPromptPreparation } from "./prompt-prepare.mjs";
import { appendPromptPreparationToLedger, buildPromptPreparationLedgerReport, DEFAULT_PROMPT_PREPARATION_LEDGER_PATH } from "./prompt-preparation-ledger.mjs";
import { buildReceiptVerification } from "./receipt-verifier.mjs";
import { buildReleaseAudit } from "./release-audit.mjs";
import { buildSparkompassRouterDecision } from "./router-decision.mjs";
import { appendReceiptToLedger, buildSavingsLedgerReport, DEFAULT_SAVINGS_LEDGER_PATH } from "./savings-ledger.mjs";
import { buildSparkompassScorecard } from "./scorecard.mjs";
import { addSemanticCacheEntry, lookupSemanticCache } from "./semantic-cache.mjs";
import { runShadowComparison } from "./shadow.mjs";
import { loadSourceByHash } from "./source-hash.mjs";
import { appendTaskOutcomeToLedger, buildTaskOutcomeLedgerReport, DEFAULT_TASK_OUTCOME_LEDGER_PATH } from "./task-outcome-ledger.mjs";
import { recordTaskOutcome } from "./task-outcome.mjs";
import { loadToolOutputEvidence, summarizeToolOutput, writeToolOutputEvidence } from "./tool-output.mjs";

export const MCP_TOOLS = [
  {
    name: "sparkompass_inventory",
    description: "Build a semantic ContextInventoryV1 preview for a local repository path.",
    inputSchema: {
      type: "object",
      properties: {
        rootPath: { type: "string", description: "Repository or folder path. Defaults to the current working directory." },
        maxFiles: { type: "integer", minimum: 1, maximum: 2000, default: 300 },
        unitLimit: { type: "integer", minimum: 1, maximum: 500, default: 80 }
      },
      additionalProperties: false
    }
  },
  {
    name: "sparkompass_lookup",
    description: "Find relevant semantic units under a token budget and return source evidence ids.",
    inputSchema: {
      type: "object",
      required: ["query"],
      properties: {
        rootPath: { type: "string", description: "Repository or folder path. Defaults to the current working directory." },
        query: { type: "string", minLength: 1 },
        budget: { type: "integer", minimum: 1, maximum: 8000, default: 400 },
        maxFiles: { type: "integer", minimum: 1, maximum: 2000, default: 300 }
      },
      additionalProperties: false
    }
  },
  {
    name: "sparkompass_plan_context",
    description: "Build a ContextPlanV1 that separates immediate context, on-demand evidence, and omitted units under a token budget.",
    inputSchema: {
      type: "object",
      required: ["goal"],
      properties: {
        rootPath: { type: "string", description: "Repository or folder path. Defaults to the current working directory." },
        goal: { type: "string", minLength: 1 },
        budget: { type: "integer", minimum: 50, maximum: 100000, description: "Omit to use the ContextPolicyV1 start-budget default for the selected riskProfile." },
        file: {
          type: "array",
          items: { type: "string" },
          default: []
        },
        cache: { type: "string", description: "Optional ContextCacheV1 path for delta-aware planning." },
        includeGraph: { type: "boolean", default: false, description: "Include one-hop ContextGraph neighbors for base-relevant units." },
        done: {
          type: "array",
          items: { type: "string" },
          default: []
        },
        expect: {
          type: "array",
          items: { type: "string" },
          description: "Exact facts that the plan should locate as source-backed requirements.",
          default: []
        },
        expectRegex: {
          type: "array",
          items: { type: "string" },
          description: "Regex patterns that the plan should locate as source-backed requirements.",
          default: []
        },
        riskProfile: { type: "string", enum: ["compact", "balanced", "careful", "strict"], default: "balanced" },
        maxFiles: { type: "integer", minimum: 1, maximum: 2000, default: 300 }
      },
      additionalProperties: false
    }
  },
  {
    name: "sparkompass_context_bom",
    description: "Build a ContextBOMV1 that explains the planned context bill of materials by lane, file, type, decision reason, risk, and must-survive coverage.",
    inputSchema: {
      type: "object",
      required: ["goal"],
      properties: {
        rootPath: { type: "string", description: "Repository or folder path. Defaults to the current working directory." },
        goal: { type: "string", minLength: 1 },
        budget: { type: "integer", minimum: 50, maximum: 100000, description: "Omit to use the ContextPolicyV1 start-budget default for the selected riskProfile." },
        file: {
          type: "array",
          items: { type: "string" },
          default: []
        },
        cache: { type: "string", description: "Optional ContextCacheV1 path for delta-aware BOM decisions." },
        includeGraph: { type: "boolean", default: false, description: "Include one-hop ContextGraph neighbors for base-relevant units." },
        done: {
          type: "array",
          items: { type: "string" },
          default: []
        },
        expect: {
          type: "array",
          items: { type: "string" },
          description: "Exact facts that the BOM should locate as source-backed requirements.",
          default: []
        },
        expectRegex: {
          type: "array",
          items: { type: "string" },
          description: "Regex patterns that the BOM should locate as source-backed requirements.",
          default: []
        },
        riskProfile: { type: "string", enum: ["compact", "balanced", "careful", "strict"], default: "balanced" },
        maxFiles: { type: "integer", minimum: 1, maximum: 2000, default: 300 }
      },
      additionalProperties: false
    }
  },
  {
    name: "sparkompass_build_envelope",
    description: "Build a ContextEnvelopeV1 that orders ContextPlan output into reusable prefix, variable tail, and on-demand evidence segments, optionally comparing prefix reuse against a previous envelope.",
    inputSchema: {
      type: "object",
      required: ["goal"],
      properties: {
        rootPath: { type: "string", description: "Repository or folder path. Defaults to the current working directory." },
        goal: { type: "string", minLength: 1 },
        budget: { type: "integer", minimum: 50, maximum: 100000, description: "Omit to use the ContextPolicyV1 start-budget default for the selected riskProfile." },
        file: {
          type: "array",
          items: { type: "string" },
          default: []
        },
        cache: { type: "string", description: "Optional ContextCacheV1 path for delta-aware stable/volatile segment placement." },
        includeGraph: { type: "boolean", default: false, description: "Include one-hop ContextGraph neighbors for base-relevant units." },
        done: {
          type: "array",
          items: { type: "string" },
          default: []
        },
        expect: {
          type: "array",
          items: { type: "string" },
          description: "Exact facts that the envelope should locate as source-backed requirements.",
          default: []
        },
        expectRegex: {
          type: "array",
          items: { type: "string" },
          description: "Regex patterns that the envelope should locate as source-backed requirements.",
          default: []
        },
        riskProfile: { type: "string", enum: ["compact", "balanced", "careful", "strict"], default: "balanced" },
        previousEnvelope: {
          type: "object",
          description: "Optional previous ContextEnvelopeV1 object for exact prefix reuse comparison.",
          additionalProperties: true
        },
        previousEnvelopeFile: {
          type: "string",
          description: "Optional previous ContextEnvelopeV1 JSON file under rootPath."
        },
        minCachePrefixTokens: { type: "integer", minimum: 1, maximum: 1000000, default: 1024 },
        maxFiles: { type: "integer", minimum: 1, maximum: 2000, default: 300 }
      },
      additionalProperties: false
    }
  },
  {
    name: "sparkompass_control_report",
    description: "Build a ContextControlReportV1 preflight that combines ContextPlanV1, ContextEnvelopeV1, readiness gates, evidence protocol, and handoff hashes.",
    inputSchema: {
      type: "object",
      required: ["goal"],
      properties: {
        rootPath: { type: "string", description: "Repository or folder path. Defaults to the current working directory." },
        goal: { type: "string", minLength: 1 },
        budget: { type: "integer", minimum: 50, maximum: 100000, description: "Omit to use the ContextPolicyV1 start-budget default for the selected riskProfile." },
        file: {
          type: "array",
          items: { type: "string" },
          default: []
        },
        cache: { type: "string", description: "Optional ContextCacheV1 path for delta-aware planning and envelope layout." },
        includeGraph: { type: "boolean", default: false, description: "Include one-hop ContextGraph neighbors for base-relevant units." },
        done: {
          type: "array",
          items: { type: "string" },
          default: []
        },
        expect: {
          type: "array",
          items: { type: "string" },
          description: "Exact facts that the control report should locate as source-backed requirements.",
          default: []
        },
        expectRegex: {
          type: "array",
          items: { type: "string" },
          description: "Regex patterns that the control report should locate as source-backed requirements.",
          default: []
        },
        riskProfile: { type: "string", enum: ["compact", "balanced", "careful", "strict"], default: "balanced" },
        previousEnvelope: {
          type: "object",
          description: "Optional previous ContextEnvelopeV1 object for exact prefix reuse comparison.",
          additionalProperties: true
        },
        previousEnvelopeFile: {
          type: "string",
          description: "Optional previous ContextEnvelopeV1 JSON file under rootPath."
        },
        minCachePrefixTokens: { type: "integer", minimum: 1, maximum: 1000000, default: 1024 },
        maxFiles: { type: "integer", minimum: 1, maximum: 2000, default: 300 }
      },
      additionalProperties: false
    }
  },
  {
    name: "sparkompass_evidence_audit",
    description: "Build a ContextEvidenceAuditV1 that verifies planned Control/BOM evidence lines against current source hashes.",
    inputSchema: {
      type: "object",
      required: ["goal"],
      properties: {
        rootPath: { type: "string", description: "Repository or folder path. Defaults to the current working directory." },
        goal: { type: "string", minLength: 1 },
        budget: { type: "integer", minimum: 50, maximum: 100000, description: "Omit to use the ContextPolicyV1 start-budget default for the selected riskProfile." },
        file: { type: "array", items: { type: "string" }, default: [] },
        cache: { type: "string", description: "Optional ContextCacheV1 path for delta-aware planning and envelope layout." },
        includeGraph: { type: "boolean", default: false, description: "Include one-hop ContextGraph neighbors for base-relevant units." },
        done: { type: "array", items: { type: "string" }, default: [] },
        expect: {
          type: "array",
          items: { type: "string" },
          description: "Exact facts that the evidence audit should locate and verify as source-backed requirements.",
          default: []
        },
        expectRegex: {
          type: "array",
          items: { type: "string" },
          description: "Regex patterns that the evidence audit should locate and verify as source-backed requirements.",
          default: []
        },
        riskProfile: { type: "string", enum: ["compact", "balanced", "careful", "strict"], default: "balanced" },
        previousEnvelope: { type: "object", description: "Optional previous ContextEnvelopeV1 object for exact prefix reuse comparison.", additionalProperties: true },
        previousEnvelopeFile: { type: "string", description: "Optional previous ContextEnvelopeV1 JSON file under rootPath." },
        minCachePrefixTokens: { type: "integer", minimum: 1, maximum: 1000000, default: 1024 },
        maxFiles: { type: "integer", minimum: 1, maximum: 2000, default: 300 },
        maxEvidence: { type: "integer", minimum: 1, maximum: 1000, default: 180 }
      },
      additionalProperties: false
    }
  },
  {
    name: "sparkompass_ablation_audit",
    description: "Build a ContextAblationAuditV1 that removes immediate context units one by one and detects which are oracle-critical.",
    inputSchema: {
      type: "object",
      required: ["goal"],
      properties: {
        rootPath: { type: "string", description: "Repository or folder path. Defaults to the current working directory." },
        goal: { type: "string", minLength: 1 },
        budget: { type: "integer", minimum: 50, maximum: 100000, description: "Omit to use the ContextPolicyV1 start-budget default for the selected riskProfile." },
        file: { type: "array", items: { type: "string" }, default: [] },
        cache: { type: "string", description: "Optional ContextCacheV1 path for delta-aware planning." },
        includeGraph: { type: "boolean", default: false, description: "Include one-hop ContextGraph neighbors for base-relevant units." },
        done: { type: "array", items: { type: "string" }, default: [] },
        expect: {
          type: "array",
          items: { type: "string" },
          description: "Exact facts that the ablation oracle must preserve.",
          default: []
        },
        expectRegex: {
          type: "array",
          items: { type: "string" },
          description: "Regex patterns that the ablation oracle must preserve.",
          default: []
        },
        riskProfile: { type: "string", enum: ["compact", "balanced", "careful", "strict"], default: "balanced" },
        maxFiles: { type: "integer", minimum: 1, maximum: 2000, default: 300 },
        maxUnits: { type: "integer", minimum: 1, maximum: 500, default: 80 }
      },
      additionalProperties: false
    }
  },
  {
    name: "sparkompass_slim_context",
    description: "Build a ContextSlimmingPlanV1 that uses ablation-safe immediate units as candidates for on-demand evidence while keeping oracle-critical units immediate.",
    inputSchema: {
      type: "object",
      required: ["goal"],
      properties: {
        rootPath: { type: "string", description: "Repository or folder path. Defaults to the current working directory." },
        goal: { type: "string", minLength: 1 },
        budget: { type: "integer", minimum: 50, maximum: 100000, description: "Omit to use the ContextPolicyV1 start-budget default for the selected riskProfile." },
        file: { type: "array", items: { type: "string" }, default: [] },
        cache: { type: "string", description: "Optional ContextCacheV1 path for delta-aware planning." },
        includeGraph: { type: "boolean", default: false, description: "Include one-hop ContextGraph neighbors for base-relevant units." },
        done: { type: "array", items: { type: "string" }, default: [] },
        expect: { type: "array", items: { type: "string" }, description: "Exact facts that define the slimming oracle.", default: [] },
        expectRegex: { type: "array", items: { type: "string" }, description: "Regex patterns that define the slimming oracle.", default: [] },
        riskProfile: { type: "string", enum: ["compact", "balanced", "careful", "strict"], default: "balanced" },
        maxFiles: { type: "integer", minimum: 1, maximum: 2000, default: 300 },
        maxUnits: { type: "integer", minimum: 1, maximum: 500, default: 80 },
        maxMoves: { type: "integer", minimum: 1, maximum: 500, default: 24 }
      },
      additionalProperties: false
    }
  },
  {
    name: "sparkompass_handoff_receipt",
    description: "Build a ContextHandoffReceiptV1 with start-prompt text, visible savings, readiness gates, prompt-cache layout, and MCP on-demand evidence.",
    inputSchema: {
      type: "object",
      required: ["goal"],
      properties: {
        rootPath: { type: "string", description: "Repository or folder path. Defaults to the current working directory." },
        goal: { type: "string", minLength: 1 },
        budget: { type: "integer", minimum: 50, maximum: 100000, description: "Omit to use the ContextPolicyV1 start-budget default for the selected riskProfile." },
        file: {
          type: "array",
          items: { type: "string" },
          default: []
        },
        cache: { type: "string", description: "Optional ContextCacheV1 path for delta-aware planning and envelope layout." },
        includeGraph: { type: "boolean", default: false, description: "Include one-hop ContextGraph neighbors for base-relevant units." },
        done: {
          type: "array",
          items: { type: "string" },
          default: []
        },
        expect: {
          type: "array",
          items: { type: "string" },
          description: "Exact facts that the handoff should locate as source-backed requirements.",
          default: []
        },
        expectRegex: {
          type: "array",
          items: { type: "string" },
          description: "Regex patterns that the handoff should locate as source-backed requirements.",
          default: []
        },
        riskProfile: { type: "string", enum: ["compact", "balanced", "careful", "strict"], default: "balanced" },
        previousEnvelope: {
          type: "object",
          description: "Optional previous ContextEnvelopeV1 object for exact prefix reuse comparison.",
          additionalProperties: true
        },
        previousEnvelopeFile: {
          type: "string",
          description: "Optional previous ContextEnvelopeV1 JSON file under rootPath."
        },
        minCachePrefixTokens: { type: "integer", minimum: 1, maximum: 1000000, default: 1024 },
        maxFiles: { type: "integer", minimum: 1, maximum: 2000, default: 300 }
      },
      additionalProperties: false
    }
  },
  {
    name: "sparkompass_handoff_ledger",
    description: "Append a ContextHandoffReceiptV1 to ContextHandoffLedgerV1 or report estimated start-context savings across handoffs.",
    inputSchema: {
      type: "object",
      properties: {
        rootPath: { type: "string", description: "Repository or folder path. Defaults to the current working directory." },
        action: { type: "string", enum: ["report", "add"], default: "report" },
        ledger: { type: "string", default: DEFAULT_HANDOFF_LEDGER_PATH },
        receipt: {
          type: "object",
          description: "ContextHandoffReceiptV1 object when action is add.",
          additionalProperties: true
        },
        receiptFile: {
          type: "string",
          description: "ContextHandoffReceiptV1 JSON file under rootPath when action is add."
        },
        runType: { type: "string", default: "mcp" },
        note: { type: "string" }
      },
      additionalProperties: false
    }
  },
  {
    name: "sparkompass_scorecard",
    description: "Build a read-only SparkompassScorecardV1 release-quality summary from Dogfood, Benchmark, TaskOutcome gates, and local ledgers.",
    inputSchema: {
      type: "object",
      properties: {
        rootPath: { type: "string", description: "Repository or folder path. Defaults to the current working directory." },
        targetPercent: { type: "integer", minimum: 1, maximum: 95, default: 35 },
        minSaving: { type: "integer", minimum: 0, maximum: 100, default: 35 },
        minAnchors: { type: "integer", minimum: 0, maximum: 100, default: 75 },
        allowRisk: { type: "boolean", default: false },
        savingsLedger: { type: "string", default: DEFAULT_SAVINGS_LEDGER_PATH },
        taskOutcomeLedger: { type: "string", default: DEFAULT_TASK_OUTCOME_LEDGER_PATH },
        envelopeLedger: { type: "string", default: DEFAULT_ENVELOPE_LEDGER_PATH },
        handoffLedger: { type: "string", default: DEFAULT_HANDOFF_LEDGER_PATH },
        promptPreparationLedger: { type: "string", default: DEFAULT_PROMPT_PREPARATION_LEDGER_PATH }
      },
      additionalProperties: false
    }
  },
  {
    name: "sparkompass_pilot_run",
    description: "Run a reproducible SparkompassPilotRunV1 that records ContextPack, PromptPreparation, TaskOutcome, Envelope, and Handoff ledger evidence for release-readiness measurement.",
    inputSchema: {
      type: "object",
      properties: {
        rootPath: { type: "string", description: "Repository or folder path. Defaults to the current working directory." },
        ledgerDir: { type: "string", default: ".sparkompass/pilot-run", description: "Directory where pilot ledger files should be written." },
        targetPercent: { type: "integer", minimum: 1, maximum: 95, default: 35 },
        minSaving: { type: "integer", minimum: 0, maximum: 100, default: 35 },
        minAnchors: { type: "integer", minimum: 0, maximum: 100, default: 75 },
        riskProfile: { type: "string", enum: ["compact", "balanced", "careful", "strict"], default: "balanced" },
        goal: { type: "string", description: "Pilot handoff goal. Defaults to a Sparkompass self-measurement goal." },
        file: { type: "array", items: { type: "string" }, default: [] },
        keep: { type: "array", items: { type: "string" }, default: [] },
        expect: { type: "array", items: { type: "string" }, default: [] },
        expectRegex: { type: "array", items: { type: "string" }, default: [] },
        budget: { type: "integer", minimum: 50, maximum: 100000, default: 900 },
        includeGraph: { type: "boolean", default: false },
        maxFiles: { type: "integer", minimum: 1, maximum: 2000, default: 300 },
        maxPackFiles: { type: "integer", minimum: 1, maximum: 20 }
      },
      additionalProperties: false
    }
  },
  {
    name: "sparkompass_impact_report",
    description: "Build a SparkompassImpactReportV1 that combines Savings, Handoff, PromptPreparation, and TaskOutcome ledgers into a quality-gated user impact report.",
    inputSchema: {
      type: "object",
      properties: {
        rootPath: { type: "string", description: "Repository or folder path. Defaults to the current working directory." },
        savingsLedger: { type: "string", default: DEFAULT_SAVINGS_LEDGER_PATH },
        taskOutcomeLedger: { type: "string", default: DEFAULT_TASK_OUTCOME_LEDGER_PATH },
        handoffLedger: { type: "string", default: DEFAULT_HANDOFF_LEDGER_PATH },
        promptPreparationLedger: { type: "string", default: DEFAULT_PROMPT_PREPARATION_LEDGER_PATH }
      },
      additionalProperties: false
    }
  },
  {
    name: "sparkompass_release_audit",
    description: "Build a SparkompassReleaseAuditV1 that maps the project objective to current Scorecard, Pilot, Impact Report, ExperimentPlan/ExperimentScript/ExperimentEvidenceAudit/ExperimentRun/router, package, and plugin evidence.",
    inputSchema: {
      type: "object",
      properties: {
        rootPath: { type: "string", description: "Repository or folder path. Defaults to the current working directory." },
        targetPercent: { type: "integer", minimum: 1, maximum: 95, default: 35 },
        minSaving: { type: "integer", minimum: 0, maximum: 100, default: 35 },
        minAnchors: { type: "integer", minimum: 0, maximum: 100, default: 75 },
        allowRisk: { type: "boolean", default: false },
        includePilot: { type: "boolean", default: true },
        ledgerDir: { type: "string", description: "Optional directory for pilot ledgers. Omit to use a temporary directory." },
        riskProfile: { type: "string", enum: ["compact", "balanced", "careful", "strict"], default: "balanced" },
        maxFiles: { type: "integer", minimum: 1, maximum: 2000, default: 300 },
        maxPackFiles: { type: "integer", minimum: 1, maximum: 20, default: 1 },
        maxMoves: { type: "integer", minimum: 1, maximum: 500, default: 24 }
      },
      additionalProperties: false
    }
  },
  {
    name: "sparkompass_experiment_plan",
    description: "Build a SparkompassExperimentPlanV1 for a four-arm Codex usage matrix: basis_raw, basis_kompakt, plugin_raw, plugin_kompakt.",
    inputSchema: {
      type: "object",
      properties: {
        rootPath: { type: "string", description: "Repository or folder path. Defaults to the current working directory." },
        rawPromptFile: { type: "string", description: "Raw prompt file for basis_raw and plugin_raw." },
        compactPromptFile: { type: "string", description: "Compact prompt file for basis_kompakt and plugin_kompakt." },
        rawPrompt: { type: "string", description: "Raw prompt text when rawPromptFile is omitted." },
        compactPrompt: { type: "string", description: "Compact prompt text when compactPromptFile is omitted." },
        rawPromptOut: { type: "string", description: "Planned raw prompt output path when rawPrompt is supplied." },
        compactPromptOut: { type: "string", description: "Planned compact prompt output path when compactPrompt is supplied." },
        evidenceDir: { type: "string", default: "evidence/codex-experiment" },
        repeat: { type: "integer", minimum: 1, maximum: 100, default: 3 },
        taskCommand: { type: "string", description: "Optional local task command to measure quality with TaskOutcome receipts." },
        expectOutput: { type: "array", items: { type: "string" }, default: [] },
        expectOutputRegex: { type: "array", items: { type: "string" }, default: [] },
        toolProfile: { type: "string", enum: ["minimal", "standard", "benchmark", "release", "debug"], default: "standard" },
        codexPath: { type: "string", default: "codex" },
        codexVersion: { type: "string" },
        model: { type: "string" },
        reasoningEffort: { type: "string" },
        sandboxMode: { type: "string" },
        cacheMode: { type: "string" },
        repositoryCommit: { type: "string" },
        repositoryDirty: { type: "boolean" },
        configurationFile: { type: "string" },
        configurationHash: { type: "string" },
        pluginHash: { type: "string" },
        skillHash: { type: "string" },
        toolCatalogHash: { type: "string" },
        contextPack: { type: "string" },
        contextPackHash: { type: "string" },
        auditJson: { type: "string" },
        experimentJson: { type: "string" },
        routerJson: { type: "string" },
        overheadJson: { type: "string" },
        out: { type: "string", description: "Optional JSON file path for the plan." },
        output: { type: "string", description: "Alias for out." }
      },
      additionalProperties: false
    }
  },
  {
    name: "sparkompass_experiment_script",
    description: "Build a SparkompassExperimentScriptV1 executable runbook from a verified experiment plan without starting Codex.",
    inputSchema: {
      type: "object",
      properties: {
        rootPath: { type: "string", description: "Repository or folder path. Defaults to the current working directory." },
        plan: { type: "string", description: "SparkompassExperimentPlanV1 JSON path." },
        planFile: { type: "string", description: "Alias for plan." },
        out: { type: "string", description: "Optional shell script output path." },
        output: { type: "string", description: "Alias for out." },
        includeScript: { type: "boolean", default: false, description: "Return the full script text in the MCP response." }
      },
      additionalProperties: false
    }
  },
  {
    name: "sparkompass_experiment_audit",
    description: "Build a SparkompassExperimentEvidenceAuditV1 that checks planned Usage JSONL, prompt hashes, TaskOutcome files, and Usage invariants before experiment run.",
    inputSchema: {
      type: "object",
      properties: {
        rootPath: { type: "string", description: "Repository or folder path. Defaults to the current working directory." },
        plan: { type: "string", description: "SparkompassExperimentPlanV1 JSON path." },
        planFile: { type: "string", description: "Alias for plan." },
        out: { type: "string", description: "Optional JSON file path for the evidence audit." },
        output: { type: "string", description: "Alias for out." }
      },
      additionalProperties: false
    }
  },
  {
    name: "sparkompass_experiment_run",
    description: "Build a SparkompassExperimentRunV1 with RunManifests, official Codex JSONL usage totals, invariant checks, required ContextPack hash evidence when metadata is strict, effects, quality gate, and router recommendation.",
    inputSchema: {
      type: "object",
      properties: {
        rootPath: { type: "string", description: "Repository or folder path. Defaults to the current working directory." },
        variant: { type: "array", items: { type: "string" }, description: "Entries like basis_raw=usage.jsonl; repeat runs may repeat the same variant." },
        basisRaw: { type: "string" },
        basisKompakt: { type: "string" },
        basisCompact: { type: "string" },
        pluginRaw: { type: "string" },
        pluginKompakt: { type: "string" },
        pluginCompact: { type: "string" },
        taskPassed: { type: "array", items: { type: "string" }, default: [] },
        taskOutcome: { type: "array", items: { type: "string" }, default: [] },
        taskOutcomeVariant: { type: "array", items: { type: "string" }, default: [] },
        promptFile: { type: "string" },
        promptHash: { type: "string" },
        promptVariant: { type: "array", items: { type: "string" }, default: [] },
        promptFileVariant: { type: "array", items: { type: "string" }, default: [] },
        contextPack: { type: "string" },
        contextPackHash: { type: "string" },
        contextPackVariant: { type: "array", items: { type: "string" }, default: [] },
        experimentId: { type: "string" },
        repeat: { type: "integer", minimum: 1, maximum: 100, default: 1 },
        requireAllVariants: { type: "boolean", default: true },
        requireMetadata: { type: "boolean", default: false },
        requireContextPackHash: { type: "boolean", default: false },
        codexPath: { type: "string", default: "codex" },
        codexVersion: { type: "string" },
        model: { type: "string" },
        reasoningEffort: { type: "string" },
        sandboxMode: { type: "string" },
        cacheMode: { type: "string" },
        repositoryCommit: { type: "string" },
        repositoryDirty: { type: "boolean" },
        configurationHash: { type: "string" },
        pluginHash: { type: "string" },
        skillHash: { type: "string" },
        toolCatalogHash: { type: "string" },
        out: { type: "string", description: "Optional JSON file path for the experiment." },
        output: { type: "string", description: "Alias for out." }
      },
      additionalProperties: false
    }
  },
  {
    name: "sparkompass_doctor_overhead",
    description: "Build a SparkompassDoctorOverheadV1 report for plugin, skill, hook, and MCP tool catalog overhead with selectable tool profiles.",
    inputSchema: {
      type: "object",
      properties: {
        rootPath: { type: "string", description: "Repository or folder path. Defaults to the current working directory." },
        profile: { type: "string", enum: ["minimal", "standard", "benchmark", "release", "debug"], default: "debug" },
        toolProfile: { type: "string", enum: ["minimal", "standard", "benchmark", "release", "debug"], description: "Alias for profile." },
        out: { type: "string", description: "Optional JSON file path for the overhead report." },
        output: { type: "string", description: "Alias for out." }
      },
      additionalProperties: false
    }
  },
  {
    name: "sparkompass_router_decision",
    description: "Build a SparkompassRouterDecisionV1 from an ExperimentRun and optional DoctorOverhead evidence, choosing bypass, compact, lazy, or full.",
    inputSchema: {
      type: "object",
      properties: {
        rootPath: { type: "string", description: "Repository or folder path. Defaults to the current working directory." },
        experiment: {
          type: "object",
          description: "SparkompassExperimentRunV1 object.",
          additionalProperties: true
        },
        experimentFile: { type: "string", description: "SparkompassExperimentRunV1 JSON path under rootPath." },
        overhead: {
          type: "object",
          description: "Optional SparkompassDoctorOverheadV1 object.",
          additionalProperties: true
        },
        overheadFile: { type: "string", description: "Optional SparkompassDoctorOverheadV1 JSON path under rootPath." },
        minNetGainTokens: { type: "integer", minimum: 0, maximum: 1000000, default: 1 },
        requireQualityEvidence: { type: "boolean", default: true },
        out: { type: "string", description: "Optional JSON file path for the router decision." },
        output: { type: "string", description: "Alias for out." }
      },
      additionalProperties: false
    }
  },
  {
    name: "sparkompass_package_audit",
    description: "Run PackageDryRunAuditV1 using npm pack --dry-run --json --ignore-scripts and verify publishable package contents.",
    inputSchema: {
      type: "object",
      properties: {
        rootPath: { type: "string", description: "Repository or folder path. Defaults to the current working directory." },
        maxPackageSizeKb: { type: "integer", minimum: 1, maximum: 100000, default: 400 },
        maxUnpackedSizeKb: { type: "integer", minimum: 1, maximum: 100000, default: 1500 },
        maxFiles: { type: "integer", minimum: 1, maximum: 10000, default: 120 }
      },
      additionalProperties: false
    }
  },
  {
    name: "sparkompass_package_install_smoke",
    description: "Pack the local package into a temporary tarball, install it into a temporary project, and smoke-test installed CLI and MCP entrypoints.",
    inputSchema: {
      type: "object",
      properties: {
        rootPath: { type: "string", description: "Repository or folder path. Defaults to the current working directory." },
        keepTemp: { type: "boolean", default: false, description: "Keep the temporary install directory for debugging." }
      },
      additionalProperties: false
    }
  },
  {
    name: "sparkompass_plugin_install_smoke",
    description: "Copy the local Codex plugin candidate into a temporary plugin directory and smoke-test its CLI bridge, MCP bridge, lookup tool call, and UserPromptSubmit hook.",
    inputSchema: {
      type: "object",
      properties: {
        rootPath: { type: "string", description: "Repository or folder path. Defaults to the current working directory." },
        keepTemp: { type: "boolean", default: false, description: "Keep the temporary plugin directory for debugging." }
      },
      additionalProperties: false
    }
  },
  {
    name: "sparkompass_prompt_advisory",
    description: "Inspect proposed prompt or hook payload size and route large raw context toward tool-output, pack, or handoff without echoing prompt text.",
    inputSchema: {
      type: "object",
      properties: {
        rootPath: { type: "string", description: "Base path for resolving file. Defaults to the current working directory." },
        file: { type: "string", description: "Relative file path containing a prompt or hook payload." },
        text: { type: "string", description: "Direct prompt text or hook payload JSON." },
        hookPayload: { type: "boolean", default: false, description: "When true, parse text/file as Codex hook payload and extract user prompt fields." },
        minTokens: { type: "integer", minimum: 1, maximum: 100000, default: 1600 },
        minLines: { type: "integer", minimum: 1, maximum: 100000, default: 120 }
      },
      additionalProperties: false
    }
  },
  {
    name: "sparkompass_prepare_prompt",
    description: "Prepare a sendable compact prompt with ContextPack receipt, quality gate, and visible savings before a Codex handoff.",
    inputSchema: {
      type: "object",
      properties: {
        rootPath: { type: "string", description: "Base path for resolving file. Defaults to the current working directory." },
        file: { type: "string", description: "Relative file path containing a prompt or hook payload." },
        text: { type: "string", description: "Direct prompt text or hook payload JSON." },
        hookPayload: { type: "boolean", default: false, description: "When true, parse text/file as Codex hook payload and extract user prompt fields." },
        goal: { type: "string", description: "Optional goal to place at the top of the sendable prompt." },
        targetPercent: { type: "integer", minimum: 1, maximum: 95, default: 35 },
        riskProfile: { type: "string", enum: ["compact", "balanced", "careful", "strict"], default: "balanced" },
        keep: { type: "array", items: { type: "string" }, default: [] },
        expect: { type: "array", items: { type: "string" }, default: [] },
        expectRegex: { type: "array", items: { type: "string" }, default: [] },
        includeReceipt: { type: "boolean", default: false },
        minTokens: { type: "integer", minimum: 1, maximum: 100000, default: 1600 },
        minLines: { type: "integer", minimum: 1, maximum: 100000, default: 120 }
      },
      additionalProperties: false
    }
  },
  {
    name: "sparkompass_prompt_preparation_ledger",
    description: "Append SparkompassPromptPreparationV1 results to PromptPreparationLedgerV1 or report sendable prompt savings over prepared Codex prompts.",
    inputSchema: {
      type: "object",
      properties: {
        rootPath: { type: "string", description: "Repository or folder path. Defaults to the current working directory." },
        action: { type: "string", enum: ["report", "add"], default: "report" },
        ledger: { type: "string", default: DEFAULT_PROMPT_PREPARATION_LEDGER_PATH },
        preparation: {
          type: "object",
          description: "SparkompassPromptPreparationV1 object when action is add.",
          additionalProperties: true
        },
        preparationFile: {
          type: "string",
          description: "SparkompassPromptPreparationV1 JSON file under rootPath when action is add."
        },
        runType: { type: "string", default: "mcp" },
        note: { type: "string" }
      },
      additionalProperties: false
    }
  },
  {
    name: "sparkompass_envelope_ledger",
    description: "Append a ContextEnvelopeV1 to ContextEnvelopeLedgerV1 or report prefix reuse across envelope runs.",
    inputSchema: {
      type: "object",
      properties: {
        rootPath: { type: "string", description: "Repository or folder path. Defaults to the current working directory." },
        action: { type: "string", enum: ["report", "add"], default: "report" },
        ledger: { type: "string", default: DEFAULT_ENVELOPE_LEDGER_PATH },
        envelope: {
          type: "object",
          description: "ContextEnvelopeV1 object when action is add.",
          additionalProperties: true
        },
        envelopeFile: {
          type: "string",
          description: "ContextEnvelopeV1 JSON file under rootPath when action is add."
        },
        runType: { type: "string", default: "mcp" },
        note: { type: "string" }
      },
      additionalProperties: false
    }
  },
  {
    name: "sparkompass_expand_symbol",
    description: "Build a ContextGraphV1 neighborhood around a symbol, file, or topic.",
    inputSchema: {
      type: "object",
      required: ["query"],
      properties: {
        rootPath: { type: "string", description: "Repository or folder path. Defaults to the current working directory." },
        query: { type: "string", minLength: 1 },
        maxFiles: { type: "integer", minimum: 1, maximum: 2000, default: 300 },
        limit: { type: "integer", minimum: 1, maximum: 500, default: 80 }
      },
      additionalProperties: false
    }
  },
  {
    name: "sparkompass_load_evidence",
    description: "Load a bounded original source excerpt for a unit id or file and line number.",
    inputSchema: {
      type: "object",
      properties: {
        rootPath: { type: "string", description: "Repository or folder path. Defaults to the current working directory." },
        unitId: { type: "string", description: "Unit id from sparkompass_inventory or sparkompass_lookup." },
        file: { type: "string", description: "Relative file path under rootPath. Required when unitId is omitted." },
        line: { type: "integer", minimum: 1, description: "1-based source line. Required when unitId is omitted." },
        contextLines: { type: "integer", minimum: 0, maximum: 80, default: 6 },
        maxFiles: { type: "integer", minimum: 1, maximum: 2000, default: 300 },
        expectedSourceHash: { type: "string", description: "Optional sha256 hash for the target line to verify." }
      },
      additionalProperties: false
    }
  },
  {
    name: "sparkompass_load_source_hash",
    description: "Load bounded original source excerpts by source_hash or file_hash without sending whole files.",
    inputSchema: {
      type: "object",
      properties: {
        rootPath: { type: "string", description: "Repository or folder path. Defaults to the current working directory." },
        sourceHash: { type: "string", description: "sha256 source_hash from ContextInventory, ContextPlan, ContextBOM, or a receipt." },
        fileHash: { type: "string", description: "Optional sha256 file hash to verify and narrow retrieval." },
        file: { type: "string", description: "Optional relative file path under rootPath to narrow the hash lookup." },
        contextLines: { type: "integer", minimum: 0, maximum: 80, default: 6 },
        maxMatches: { type: "integer", minimum: 1, maximum: 50, default: 5 },
        maxFiles: { type: "integer", minimum: 1, maximum: 2000, default: 300 }
      },
      additionalProperties: false
    }
  },
  {
    name: "sparkompass_summarize_tool_output",
    description: "Summarize long logs or command output into ToolOutputSummaryV1 with raw hash, error lines, affected files, repeats, and optional local raw evidence storage.",
    inputSchema: {
      type: "object",
      properties: {
        rootPath: { type: "string", description: "Base path for resolving file and optional store path. Defaults to the current working directory." },
        file: { type: "string", description: "Relative file path to summarize. Use text for direct input instead." },
        text: { type: "string", description: "Direct command output or log text to summarize." },
        label: { type: "string" },
        command: { type: "string", description: "Command that produced the output, if known." },
        exitCode: { type: "integer", description: "Process exit code, if known." },
        store: { type: "boolean", default: false, description: "When true, stores raw text and summary under out." },
        out: { type: "string", default: ".sparkompass/tool-output" }
      },
      additionalProperties: false
    }
  },
  {
    name: "sparkompass_load_tool_output",
    description: "Load a bounded excerpt from locally stored ToolOutputSummaryV1 raw evidence and verify the raw hash.",
    inputSchema: {
      type: "object",
      properties: {
        rootPath: { type: "string", description: "Base path for resolving stored raw or summary files. Defaults to the current working directory." },
        summary: { type: "string", description: "Path to a stored .summary.json file." },
        raw: { type: "string", description: "Path to a stored .raw.txt file." },
        id: { type: "string", description: "Tool output id/hash prefix under out, for example 1a2b3c4d5e6f." },
        out: { type: "string", default: ".sparkompass/tool-output" },
        line: { type: "integer", minimum: 1 },
        pattern: { type: "string", description: "Find first raw line containing this text before applying contextLines." },
        contextLines: { type: "integer", minimum: 0, maximum: 120, default: 6 },
        maxLines: { type: "integer", minimum: 1, maximum: 500, default: 80 },
        expectedHash: { type: "string", description: "Optional sha256 hash to verify the raw text." }
      },
      additionalProperties: false
    }
  },
  {
    name: "sparkompass_slice_symbol",
    description: "Build a ProgramSliceV1 for a symbol with source span, calls, simple dataflow hints, imports, tests, and evidence hashes.",
    inputSchema: {
      type: "object",
      required: ["query"],
      properties: {
        rootPath: { type: "string", description: "Repository or folder path. Defaults to the current working directory." },
        query: { type: "string", minLength: 1 },
        maxFiles: { type: "integer", minimum: 1, maximum: 2000, default: 300 }
      },
      additionalProperties: false
    }
  },
  {
    name: "sparkompass_trace_flow",
    description: "Build a bounded DataFlowTraceV1 across resolved function calls, including argument-to-parameter bindings and evidence.",
    inputSchema: {
      type: "object",
      required: ["query"],
      properties: {
        rootPath: { type: "string", description: "Repository or folder path. Defaults to the current working directory." },
        query: { type: "string", minLength: 1 },
        depth: { type: "integer", minimum: 0, maximum: 5, default: 2 },
        maxEdges: { type: "integer", minimum: 1, maximum: 300, default: 60 },
        maxFiles: { type: "integer", minimum: 1, maximum: 2000, default: 300 }
      },
      additionalProperties: false
    }
  },
  {
    name: "sparkompass_cache_write",
    description: "Write a content-addressed ContextCacheV1 file for later delta context checks.",
    inputSchema: {
      type: "object",
      properties: {
        rootPath: { type: "string", description: "Repository or folder path. Defaults to the current working directory." },
        out: { type: "string", default: ".sparkompass/context-cache.json" },
        maxFiles: { type: "integer", minimum: 1, maximum: 2000, default: 300 }
      },
      additionalProperties: false
    }
  },
  {
    name: "sparkompass_delta",
    description: "Compare the current semantic inventory against a previously written ContextCacheV1.",
    inputSchema: {
      type: "object",
      properties: {
        rootPath: { type: "string", description: "Repository or folder path. Defaults to the current working directory." },
        cache: { type: "string", default: ".sparkompass/context-cache.json" },
        maxFiles: { type: "integer", minimum: 1, maximum: 2000, default: 300 }
      },
      additionalProperties: false
    }
  },
  {
    name: "sparkompass_pack",
    description: "Create a verified ContextPackReceiptV1 from text or a local file, with expand-before-full fallback on uncertainty.",
    inputSchema: {
      type: "object",
      properties: {
        rootPath: { type: "string", description: "Base path for resolving file. Defaults to the current working directory." },
        file: { type: "string", description: "Relative file path to pack. Use text for direct input instead." },
        text: { type: "string", description: "Direct text to pack." },
        label: { type: "string" },
        riskProfile: { type: "string", enum: ["compact", "balanced", "careful", "strict"], default: "balanced" },
        targetPercent: { type: "integer", minimum: 1, maximum: 95, default: 35 },
        mode: { type: "string", enum: ["auto", "extractive", "structural"], default: "auto" },
        keep: {
          type: "array",
          items: { type: "string" },
          default: []
        },
        expect: {
          type: "array",
          items: { type: "string" },
          description: "Exact terms that the delivered ContextPack must preserve.",
          default: []
        },
        expectRegex: {
          type: "array",
          items: { type: "string" },
          description: "Regex patterns that the delivered ContextPack must match.",
          default: []
        },
        includeContext: { type: "boolean", default: false },
        storeInRegistry: { type: "boolean", default: false, description: "Register the ContextPack in ContextPackRegistryV1 for later contextPackId verification." },
        registry: { type: "string", default: ".sparkompass/context-pack-registry.json" },
        storeSourceText: { type: "boolean", default: false, description: "Store original source text in the local registry when no source file should be used." }
      },
      additionalProperties: false
    }
  },
  {
    name: "sparkompass_verify_receipt",
    description: "Verify a ContextPackReceiptV1 against original source text and optional delivered context hashes.",
    inputSchema: {
      type: "object",
      required: ["receipt"],
      properties: {
        rootPath: { type: "string", description: "Base path for resolving files. Defaults to the current working directory." },
        receipt: {
          type: "object",
          description: "ContextPackReceiptV1 object or pack object with .receipt.",
          additionalProperties: true
        },
        file: { type: "string", description: "Relative original source file path under rootPath." },
        text: { type: "string", description: "Original source text when file is not provided." },
        contextFile: { type: "string", description: "Optional relative delivered context file path under rootPath." },
        contextText: { type: "string", description: "Optional delivered context text." }
      },
      additionalProperties: false
    }
  },
  {
    name: "sparkompass_verify_context_pack",
    description: "Verify a registered ContextPack by context_pack_id using ContextPackRegistryV1 and the underlying receipt/source hashes.",
    inputSchema: {
      type: "object",
      required: ["contextPackId"],
      properties: {
        rootPath: { type: "string", description: "Base path for resolving registry and evidence files. Defaults to the current working directory." },
        contextPackId: { type: "string", description: "ContextPack receipt id, for example ctx-..." },
        registry: { type: "string", default: ".sparkompass/context-pack-registry.json" },
        sourceFile: { type: "string", description: "Optional relative original source file path under rootPath when not stored in the registry." },
        file: { type: "string", description: "Alias for sourceFile." },
        sourceText: { type: "string", description: "Optional original source text when no source file is available." },
        text: { type: "string", description: "Alias for sourceText." },
        contextFile: { type: "string", description: "Optional relative delivered context file path under rootPath." },
        contextText: { type: "string", description: "Optional delivered context text." }
      },
      additionalProperties: false
    }
  },
  {
    name: "sparkompass_contextpack_format",
    description: "Return the open ContextPackFormatV1 contract or lint a ContextPackReceiptV1 against portable format invariants without source text.",
    inputSchema: {
      type: "object",
      properties: {
        rootPath: { type: "string", description: "Base path for resolving receiptFile. Defaults to the current working directory." },
        action: { type: "string", enum: ["schema", "lint"], default: "schema" },
        receipt: {
          type: "object",
          description: "ContextPackReceiptV1 object or pack object with .receipt when action is lint.",
          additionalProperties: true
        },
        receiptFile: { type: "string", description: "Optional ContextPack receipt/pack JSON file under rootPath when action is lint." }
      },
      additionalProperties: false
    }
  },
  {
    name: "sparkompass_task_outcome",
    description: "Record a local task/check output as TaskOutcomeReceiptV1, optionally linked to a verified ContextPack receipt. This MCP tool does not execute shell commands.",
    inputSchema: {
      type: "object",
      required: ["command", "exitCode"],
      properties: {
        rootPath: { type: "string", description: "Base path for resolving files. Defaults to the current working directory." },
        command: { type: "string", minLength: 1, description: "Command that produced the supplied output." },
        exitCode: { type: "integer", description: "Observed command exit code." },
        expectedExitCode: { type: "integer", default: 0 },
        outputFile: { type: "string", description: "Relative output/log file under rootPath. Use outputText for direct input instead." },
        outputText: { type: "string", description: "Observed stdout/stderr text." },
        expectOutput: { type: "array", items: { type: "string" }, default: [] },
        expectOutputRegex: { type: "array", items: { type: "string" }, default: [] },
        receipt: {
          type: "object",
          description: "Optional ContextPackReceiptV1 object or pack object with .receipt.",
          additionalProperties: true
        },
        receiptFile: { type: "string", description: "Optional ContextPack receipt/pack JSON file under rootPath." },
        sourceFile: { type: "string", description: "Original source file under rootPath for receipt verification." },
        sourceText: { type: "string", description: "Original source text when sourceFile is not provided." },
        contextFile: { type: "string", description: "Delivered context file under rootPath for receipt verification." },
        contextText: { type: "string", description: "Delivered context text." },
        durationMs: { type: "integer", minimum: 0 },
        timedOut: { type: "boolean", default: false }
      },
      additionalProperties: false
    }
  },
  {
    name: "sparkompass_task_outcome_ledger",
    description: "Append a TaskOutcomeReceiptV1 to TaskOutcomeLedgerV1 or report verified task outcomes across runs.",
    inputSchema: {
      type: "object",
      properties: {
        rootPath: { type: "string", description: "Repository or folder path. Defaults to the current working directory." },
        action: { type: "string", enum: ["report", "add"], default: "report" },
        ledger: { type: "string", default: DEFAULT_TASK_OUTCOME_LEDGER_PATH },
        outcome: {
          type: "object",
          description: "TaskOutcomeReceiptV1 object when action is add.",
          additionalProperties: true
        },
        outcomeFile: {
          type: "string",
          description: "TaskOutcomeReceiptV1 JSON file under rootPath when action is add."
        },
        runType: { type: "string", default: "mcp" },
        note: { type: "string" }
      },
      additionalProperties: false
    }
  },
  {
    name: "sparkompass_calibrate_context",
    description: "Find the smallest directly verified target percent for a ContextPack under a risk profile.",
    inputSchema: {
      type: "object",
      properties: {
        rootPath: { type: "string", description: "Base path for resolving file. Defaults to the current working directory." },
        file: { type: "string", description: "Relative file path to calibrate. Use text for direct input instead." },
        text: { type: "string", description: "Direct text to calibrate." },
        label: { type: "string" },
        riskProfile: { type: "string", enum: ["compact", "balanced", "careful", "strict"], default: "balanced" },
        minTargetPercent: { type: "integer", minimum: 1, maximum: 95, default: 10 },
        maxTargetPercent: { type: "integer", minimum: 1, maximum: 95, default: 90 },
        stepPercent: { type: "integer", minimum: 1, maximum: 25, default: 5 },
        mode: { type: "string", enum: ["auto", "extractive", "structural"], default: "auto" },
        keep: {
          type: "array",
          items: { type: "string" },
          default: []
        },
        expect: {
          type: "array",
          items: { type: "string" },
          description: "Exact terms that candidate ContextPacks must preserve.",
          default: []
        },
        expectRegex: {
          type: "array",
          items: { type: "string" },
          description: "Regex patterns that candidate ContextPacks must match.",
          default: []
        }
      },
      additionalProperties: false
    }
  },
  {
    name: "sparkompass_savings_ledger",
    description: "Append a ContextPack receipt to SavingsLedgerV1 or report accumulated real delivered-token savings.",
    inputSchema: {
      type: "object",
      properties: {
        rootPath: { type: "string", description: "Repository or folder path. Defaults to the current working directory." },
        action: { type: "string", enum: ["report", "add"], default: "report" },
        ledger: { type: "string", default: DEFAULT_SAVINGS_LEDGER_PATH },
        receipt: {
          type: "object",
          description: "ContextPackReceiptV1 object or a pack object with .receipt when action is add.",
          additionalProperties: true
        },
        runType: { type: "string", default: "mcp" },
        note: { type: "string" }
      },
      additionalProperties: false
    }
  },
  {
    name: "sparkompass_shadow_compare",
    description: "Compare full context and delivered Sparkompass ContextPack against the same deterministic acceptance oracle.",
    inputSchema: {
      type: "object",
      properties: {
        rootPath: { type: "string", description: "Base path for resolving file. Defaults to the current working directory." },
        file: { type: "string", description: "Relative file path to compare. Use text for direct input instead." },
        text: { type: "string", description: "Direct text to compare." },
        label: { type: "string" },
        expect: {
          type: "array",
          minItems: 1,
          items: { type: "string" },
          description: "Exact terms that both full context and Sparkompass context must contain.",
          default: []
        },
        expectRegex: {
          type: "array",
          items: { type: "string" },
          description: "Regex patterns that both full context and Sparkompass context must match.",
          default: []
        },
        riskProfile: { type: "string", enum: ["compact", "balanced", "careful", "strict"], default: "balanced" },
        targetPercent: { type: "integer", minimum: 1, maximum: 95, default: 35 },
        mode: { type: "string", enum: ["auto", "extractive", "structural"], default: "auto" },
        keep: {
          type: "array",
          items: { type: "string" },
          default: []
        },
        includeContext: { type: "boolean", default: false }
      },
      additionalProperties: false
    }
  },
  {
    name: "sparkompass_semantic_cache_add",
    description: "Store a verified ContextPack in a local semantic cache with dependency hashes and optional acceptance oracle.",
    inputSchema: {
      type: "object",
      required: ["query"],
      properties: {
        rootPath: { type: "string", description: "Repository or folder path. Defaults to the current working directory." },
        query: { type: "string", minLength: 1 },
        file: { type: "string", description: "Relative file path to pack and cache. Use text for direct input instead." },
        text: { type: "string", description: "Direct text to pack and cache." },
        label: { type: "string" },
        oracle: { type: "array", items: { type: "string" }, default: [] },
        expect: { type: "array", items: { type: "string" }, default: [] },
        expectRegex: { type: "array", items: { type: "string" }, default: [] },
        toolVersion: {
          type: "array",
          items: { type: "string" },
          description: "External tool/version signatures that must match for later cache reuse.",
          default: []
        },
        riskProfile: { type: "string", enum: ["compact", "balanced", "careful", "strict"], default: "balanced" },
        keep: { type: "array", items: { type: "string" }, default: [] },
        out: { type: "string", default: ".sparkompass/semantic-cache.json" },
        registry: { type: "string", description: "Optional ContextPackRegistryV1 path. When set, the cached ContextPack is registered and future hits verify it by context_pack_id." },
        storeSourceText: { type: "boolean", default: false, description: "Store source text in the local registry when no source file should be used." },
        budget: { type: "integer", minimum: 1, maximum: 8000, default: 400 },
        targetPercent: { type: "integer", minimum: 1, maximum: 95, default: 35 },
        mode: { type: "string", enum: ["auto", "extractive", "structural"], default: "auto" },
        maxFiles: { type: "integer", minimum: 1, maximum: 2000, default: 300 }
      },
      additionalProperties: false
    }
  },
  {
    name: "sparkompass_semantic_cache_lookup",
    description: "Look up a reusable semantic cache entry and verify adaptive query similarity, dependencies, oracle, and ContextPack receipt.",
    inputSchema: {
      type: "object",
      required: ["query"],
      properties: {
        rootPath: { type: "string", description: "Repository or folder path. Defaults to the current working directory." },
        query: { type: "string", minLength: 1 },
        oracle: { type: "array", items: { type: "string" }, default: [] },
        expect: { type: "array", items: { type: "string" }, default: [] },
        expectRegex: { type: "array", items: { type: "string" }, default: [] },
        toolVersion: {
          type: "array",
          items: { type: "string" },
          description: "External tool/version signatures that must match the cached entry.",
          default: []
        },
        cache: { type: "string", default: ".sparkompass/semantic-cache.json" },
        budget: { type: "integer", minimum: 1, maximum: 8000, default: 400 },
        minSimilarity: { type: "number", minimum: 0, maximum: 1, description: "Optional explicit similarity threshold. Omit to use SemanticCacheVerificationPolicyV1 adaptive mode." },
        maxFiles: { type: "integer", minimum: 1, maximum: 2000, default: 300 }
      },
      additionalProperties: false
    }
  }
];

export async function callMcpTool(name, args = {}) {
  args = normalizeMcpArgs(args);
  if (name === "sparkompass_inventory") return inventoryTool(args);
  if (name === "sparkompass_lookup") return lookupTool(args);
  if (name === "sparkompass_plan_context") return planContextTool(args);
  if (name === "sparkompass_context_bom") return contextBOMTool(args);
  if (name === "sparkompass_build_envelope") return buildEnvelopeTool(args);
  if (name === "sparkompass_control_report") return controlReportTool(args);
  if (name === "sparkompass_evidence_audit") return evidenceAuditTool(args);
  if (name === "sparkompass_ablation_audit") return ablationAuditTool(args);
  if (name === "sparkompass_slim_context") return slimContextTool(args);
  if (name === "sparkompass_handoff_receipt") return handoffReceiptTool(args);
  if (name === "sparkompass_handoff_ledger") return handoffLedgerTool(args);
  if (name === "sparkompass_scorecard") return scorecardTool(args);
  if (name === "sparkompass_pilot_run") return pilotRunTool(args);
  if (name === "sparkompass_impact_report") return impactReportTool(args);
  if (name === "sparkompass_release_audit") return releaseAuditTool(args);
  if (name === "sparkompass_experiment_plan") return experimentPlanTool(args);
  if (name === "sparkompass_experiment_script") return experimentScriptTool(args);
  if (name === "sparkompass_experiment_audit") return experimentAuditTool(args);
  if (name === "sparkompass_experiment_run") return experimentRunTool(args);
  if (name === "sparkompass_doctor_overhead") return doctorOverheadTool(args);
  if (name === "sparkompass_router_decision") return routerDecisionTool(args);
  if (name === "sparkompass_package_audit") return packageAuditTool(args);
  if (name === "sparkompass_package_install_smoke") return packageInstallSmokeTool(args);
  if (name === "sparkompass_plugin_install_smoke") return pluginInstallSmokeTool(args);
  if (name === "sparkompass_prompt_advisory") return promptAdvisoryTool(args);
  if (name === "sparkompass_prepare_prompt") return preparePromptTool(args);
  if (name === "sparkompass_prompt_preparation_ledger") return promptPreparationLedgerTool(args);
  if (name === "sparkompass_envelope_ledger") return envelopeLedgerTool(args);
  if (name === "sparkompass_expand_symbol") return expandSymbolTool(args);
  if (name === "sparkompass_load_evidence") return loadEvidenceTool(args);
  if (name === "sparkompass_load_source_hash") return loadSourceHashTool(args);
  if (name === "sparkompass_summarize_tool_output") return summarizeToolOutputTool(args);
  if (name === "sparkompass_load_tool_output") return loadToolOutputTool(args);
  if (name === "sparkompass_slice_symbol") return sliceSymbolTool(args);
  if (name === "sparkompass_trace_flow") return traceFlowTool(args);
  if (name === "sparkompass_cache_write") return cacheWriteTool(args);
  if (name === "sparkompass_delta") return deltaTool(args);
  if (name === "sparkompass_pack") return packTool(args);
  if (name === "sparkompass_verify_receipt") return verifyReceiptTool(args);
  if (name === "sparkompass_verify_context_pack") return verifyContextPackTool(args);
  if (name === "sparkompass_contextpack_format") return contextPackFormatTool(args);
  if (name === "sparkompass_task_outcome") return taskOutcomeTool(args);
  if (name === "sparkompass_task_outcome_ledger") return taskOutcomeLedgerTool(args);
  if (name === "sparkompass_calibrate_context") return calibrateTool(args);
  if (name === "sparkompass_savings_ledger") return savingsLedgerTool(args);
  if (name === "sparkompass_shadow_compare") return shadowCompareTool(args);
  if (name === "sparkompass_semantic_cache_add") return semanticCacheAddTool(args);
  if (name === "sparkompass_semantic_cache_lookup") return semanticCacheLookupTool(args);
  throw new Error(`Unknown Sparkompass MCP tool: ${name}`);
}

applyRootPathAlias(MCP_TOOLS);

function normalizeMcpArgs(args) {
  if (!args || typeof args !== "object" || Array.isArray(args)) return {};
  const rootPath = typeof args.rootPath === "string" ? args.rootPath.trim() : args.rootPath;
  const repoRoot = typeof args.repoRoot === "string" ? args.repoRoot.trim() : args.repoRoot;
  if ((rootPath === undefined || rootPath === null || rootPath === "") && repoRoot) {
    return {
      ...args,
      rootPath: repoRoot
    };
  }
  return args;
}

function applyRootPathAlias(tools) {
  for (const tool of tools) {
    const properties = tool.inputSchema?.properties;
    if (!properties?.rootPath || properties.repoRoot) continue;
    properties.repoRoot = {
      ...properties.rootPath,
      description: `Alias for rootPath. ${properties.rootPath.description || ""}`.trim()
    };
  }
}

async function sliceSymbolTool(args) {
  const root = resolveRoot(args.rootPath);
  return buildProgramSlice(root, {
    query: String(args.query || ""),
    maxFiles: clampInteger(args.maxFiles, 300, 1, 2000)
  });
}

async function traceFlowTool(args) {
  const root = resolveRoot(args.rootPath);
  return buildDataFlowTrace(root, {
    query: String(args.query || ""),
    depth: clampInteger(args.depth, 2, 0, 5),
    maxEdges: clampInteger(args.maxEdges, 60, 1, 300),
    maxFiles: clampInteger(args.maxFiles, 300, 1, 2000)
  });
}

async function expandSymbolTool(args) {
  const root = resolveRoot(args.rootPath);
  const query = String(args.query || "").trim();
  if (!query) throw new Error("query is required");

  const graph = await buildContextGraph(root, {
    maxFiles: clampInteger(args.maxFiles, 300, 1, 2000)
  });
  const neighborhood = findSymbolNeighborhood(graph, query, {
    limit: clampInteger(args.limit, 80, 1, 500)
  });

  return {
    schema: "SparkompassExpandSymbolToolResultV1",
    graph_schema: graph.schema,
    neighborhood_schema: neighborhood.schema,
    root,
    query,
    totals: graph.totals,
    nodes: neighborhood.nodes,
    edges: neighborhood.edges,
    next_actions: [
      "Use sparkompass_load_evidence or sparkompass_load_source_hash for any node whose exact source matters.",
      "Use sparkompass_lookup when the graph neighborhood is too broad for the task."
    ]
  };
}

async function inventoryTool(args) {
  const root = resolveRoot(args.rootPath);
  const unitLimit = clampInteger(args.unitLimit, 80, 1, 500);
  const inventory = await buildContextInventory(root, {
    maxFiles: clampInteger(args.maxFiles, 300, 1, 2000)
  });

  return {
    schema: "SparkompassInventoryToolResultV1",
    inventory: {
      ...inventory,
      units: inventory.units.slice(0, unitLimit)
    },
    omitted_units: Math.max(0, inventory.units.length - unitLimit),
    next_actions: [
      "Use sparkompass_lookup for task-specific unit selection.",
      "Use sparkompass_load_evidence with a unit id or sparkompass_load_source_hash with sourceHash before relying on exact source details."
    ]
  };
}

async function lookupTool(args) {
  const root = resolveRoot(args.rootPath);
  const query = String(args.query || "").trim();
  if (!query) throw new Error("query is required");

  const result = await lookupContext(root, {
    query,
    budget: clampInteger(args.budget, 400, 1, 8000),
    maxFiles: clampInteger(args.maxFiles, 300, 1, 2000)
  });

  return {
    ...result,
    schema: "SparkompassLookupToolResultV1",
    context_schema: result.schema,
    next_actions: [
      "Call sparkompass_load_evidence or sparkompass_load_source_hash for exact source lines that influence an answer.",
      "Increase budget only when selected_count is too low for the task."
    ]
  };
}

async function planContextTool(args) {
  const root = resolveRoot(args.rootPath);
  return buildContextPlan(root, {
    goal: String(args.goal || ""),
    budget: parseContextBudget(args.budget),
    file: Array.isArray(args.file) ? args.file : [],
    done: Array.isArray(args.done) ? args.done : [],
    expect: Array.isArray(args.expect) ? args.expect : [],
    expectRegex: Array.isArray(args.expectRegex) ? args.expectRegex : [],
    riskProfile: args.riskProfile || "balanced",
    cache: args.cache || "",
    includeGraph: Boolean(args.includeGraph),
    maxFiles: clampInteger(args.maxFiles, 300, 1, 2000)
  });
}

async function contextBOMTool(args) {
  const root = resolveRoot(args.rootPath);
  return buildContextBOM(root, {
    goal: String(args.goal || ""),
    budget: parseContextBudget(args.budget),
    file: Array.isArray(args.file) ? args.file : [],
    done: Array.isArray(args.done) ? args.done : [],
    expect: Array.isArray(args.expect) ? args.expect : [],
    expectRegex: Array.isArray(args.expectRegex) ? args.expectRegex : [],
    riskProfile: args.riskProfile || "balanced",
    cache: args.cache || "",
    includeGraph: Boolean(args.includeGraph),
    maxFiles: clampInteger(args.maxFiles, 300, 1, 2000)
  });
}

async function buildEnvelopeTool(args) {
  const root = resolveRoot(args.rootPath);
  const previousEnvelope = args.previousEnvelopeFile
    ? JSON.parse(await fs.readFile(resolveInsideRoot(root, String(args.previousEnvelopeFile)), "utf8"))
    : args.previousEnvelope || null;
  return buildContextEnvelope(root, {
    goal: String(args.goal || ""),
    budget: parseContextBudget(args.budget),
    file: Array.isArray(args.file) ? args.file : [],
    done: Array.isArray(args.done) ? args.done : [],
    expect: Array.isArray(args.expect) ? args.expect : [],
    expectRegex: Array.isArray(args.expectRegex) ? args.expectRegex : [],
    riskProfile: args.riskProfile || "balanced",
    cache: args.cache || "",
    includeGraph: Boolean(args.includeGraph),
    excludeFiles: args.previousEnvelopeFile ? [String(args.previousEnvelopeFile)] : [],
    previousEnvelope,
    minCachePrefixTokens: clampInteger(args.minCachePrefixTokens, 1024, 1, 1000000),
    maxFiles: clampInteger(args.maxFiles, 300, 1, 2000)
  });
}

async function controlReportTool(args) {
  const root = resolveRoot(args.rootPath);
  const previousEnvelope = args.previousEnvelopeFile
    ? JSON.parse(await fs.readFile(resolveInsideRoot(root, String(args.previousEnvelopeFile)), "utf8"))
    : args.previousEnvelope || null;
  return buildContextControlReport(root, {
    goal: String(args.goal || ""),
    budget: parseContextBudget(args.budget),
    file: Array.isArray(args.file) ? args.file : [],
    done: Array.isArray(args.done) ? args.done : [],
    expect: Array.isArray(args.expect) ? args.expect : [],
    expectRegex: Array.isArray(args.expectRegex) ? args.expectRegex : [],
    riskProfile: args.riskProfile || "balanced",
    cache: args.cache || "",
    includeGraph: Boolean(args.includeGraph),
    excludeFiles: args.previousEnvelopeFile ? [String(args.previousEnvelopeFile)] : [],
    previousEnvelope,
    minCachePrefixTokens: clampInteger(args.minCachePrefixTokens, 1024, 1, 1000000),
    maxFiles: clampInteger(args.maxFiles, 300, 1, 2000)
  });
}

async function evidenceAuditTool(args) {
  const root = resolveRoot(args.rootPath);
  const previousEnvelope = args.previousEnvelopeFile
    ? JSON.parse(await fs.readFile(resolveInsideRoot(root, String(args.previousEnvelopeFile)), "utf8"))
    : args.previousEnvelope || null;
  return buildContextEvidenceAudit(root, {
    goal: String(args.goal || ""),
    budget: parseContextBudget(args.budget),
    file: Array.isArray(args.file) ? args.file : [],
    done: Array.isArray(args.done) ? args.done : [],
    expect: Array.isArray(args.expect) ? args.expect : [],
    expectRegex: Array.isArray(args.expectRegex) ? args.expectRegex : [],
    riskProfile: args.riskProfile || "balanced",
    cache: args.cache || "",
    includeGraph: Boolean(args.includeGraph),
    excludeFiles: args.previousEnvelopeFile ? [String(args.previousEnvelopeFile)] : [],
    previousEnvelope,
    minCachePrefixTokens: clampInteger(args.minCachePrefixTokens, 1024, 1, 1000000),
    maxFiles: clampInteger(args.maxFiles, 300, 1, 2000),
    maxEvidence: clampInteger(args.maxEvidence, 180, 1, 1000)
  });
}

async function ablationAuditTool(args) {
  const root = resolveRoot(args.rootPath);
  return buildContextAblationAudit(root, {
    goal: String(args.goal || ""),
    budget: parseContextBudget(args.budget),
    file: Array.isArray(args.file) ? args.file : [],
    done: Array.isArray(args.done) ? args.done : [],
    expect: Array.isArray(args.expect) ? args.expect : [],
    expectRegex: Array.isArray(args.expectRegex) ? args.expectRegex : [],
    riskProfile: args.riskProfile || "balanced",
    cache: args.cache || "",
    includeGraph: Boolean(args.includeGraph),
    maxFiles: clampInteger(args.maxFiles, 300, 1, 2000),
    maxUnits: clampInteger(args.maxUnits, 80, 1, 500)
  });
}

async function slimContextTool(args) {
  const root = resolveRoot(args.rootPath);
  return buildContextSlimmingPlan(root, {
    goal: String(args.goal || ""),
    budget: parseContextBudget(args.budget),
    file: Array.isArray(args.file) ? args.file : [],
    done: Array.isArray(args.done) ? args.done : [],
    expect: Array.isArray(args.expect) ? args.expect : [],
    expectRegex: Array.isArray(args.expectRegex) ? args.expectRegex : [],
    riskProfile: args.riskProfile || "balanced",
    cache: args.cache || "",
    includeGraph: Boolean(args.includeGraph),
    maxFiles: clampInteger(args.maxFiles, 300, 1, 2000),
    maxUnits: clampInteger(args.maxUnits, 80, 1, 500),
    maxMoves: clampInteger(args.maxMoves, 24, 1, 500)
  });
}

async function handoffReceiptTool(args) {
  const root = resolveRoot(args.rootPath);
  const previousEnvelope = args.previousEnvelopeFile
    ? JSON.parse(await fs.readFile(resolveInsideRoot(root, String(args.previousEnvelopeFile)), "utf8"))
    : args.previousEnvelope || null;
  return buildContextHandoffReceipt(root, {
    goal: String(args.goal || ""),
    budget: parseContextBudget(args.budget),
    file: Array.isArray(args.file) ? args.file : [],
    done: Array.isArray(args.done) ? args.done : [],
    expect: Array.isArray(args.expect) ? args.expect : [],
    expectRegex: Array.isArray(args.expectRegex) ? args.expectRegex : [],
    riskProfile: args.riskProfile || "balanced",
    cache: args.cache || "",
    includeGraph: Boolean(args.includeGraph),
    excludeFiles: args.previousEnvelopeFile ? [String(args.previousEnvelopeFile)] : [],
    previousEnvelope,
    minCachePrefixTokens: clampInteger(args.minCachePrefixTokens, 1024, 1, 1000000),
    maxFiles: clampInteger(args.maxFiles, 300, 1, 2000)
  });
}

async function handoffLedgerTool(args) {
  const root = resolveRoot(args.rootPath);
  const action = args.action || "report";
  const ledger = args.ledger || DEFAULT_HANDOFF_LEDGER_PATH;

  if (action === "add") {
    const receipt = args.receiptFile
      ? JSON.parse(await fs.readFile(resolveInsideRoot(root, String(args.receiptFile)), "utf8"))
      : args.receipt;
    if (!receipt) throw new Error("receipt or receiptFile is required when action is add");
    return appendHandoffToLedger(root, receipt, {
      out: ledger,
      runType: args.runType || "mcp",
      note: args.note || ""
    });
  }

  if (action !== "report") {
    throw new Error(`Unknown handoff ledger action: ${action}`);
  }

  return buildHandoffLedgerReport(root, {
    ledger
  });
}

async function scorecardTool(args) {
  const root = resolveRoot(args.rootPath);
  return buildSparkompassScorecard(root, {
    targetPercent: clampInteger(args.targetPercent, 35, 1, 95),
    minSaving: clampInteger(args.minSaving, 35, 0, 100),
    minAnchors: clampInteger(args.minAnchors, 75, 0, 100),
    allowRisk: Boolean(args.allowRisk),
    savingsLedger: args.savingsLedger || DEFAULT_SAVINGS_LEDGER_PATH,
    taskOutcomeLedger: args.taskOutcomeLedger || DEFAULT_TASK_OUTCOME_LEDGER_PATH,
    envelopeLedger: args.envelopeLedger || DEFAULT_ENVELOPE_LEDGER_PATH,
    handoffLedger: args.handoffLedger || DEFAULT_HANDOFF_LEDGER_PATH,
    promptPreparationLedger: args.promptPreparationLedger || DEFAULT_PROMPT_PREPARATION_LEDGER_PATH
  });
}

async function pilotRunTool(args) {
  const root = resolveRoot(args.rootPath);
  return runPilot(root, {
    ledgerDir: args.ledgerDir || ".sparkompass/pilot-run",
    targetPercent: clampInteger(args.targetPercent, 35, 1, 95),
    minSaving: clampInteger(args.minSaving, 35, 0, 100),
    minAnchors: clampInteger(args.minAnchors, 75, 0, 100),
    riskProfile: args.riskProfile || "balanced",
    goal: args.goal || "",
    file: asArray(args.file),
    keep: asArray(args.keep),
    expect: asArray(args.expect),
    expectRegex: asArray(args.expectRegex),
    budget: clampInteger(args.budget, 900, 50, 100000),
    includeGraph: Boolean(args.includeGraph),
    maxFiles: clampInteger(args.maxFiles, 300, 1, 2000),
    maxPackFiles: args.maxPackFiles === undefined ? undefined : clampInteger(args.maxPackFiles, 3, 1, 20)
  });
}

async function impactReportTool(args) {
  const root = resolveRoot(args.rootPath);
  return buildSparkompassImpactReport(root, {
    savingsLedger: args.savingsLedger || DEFAULT_SAVINGS_LEDGER_PATH,
    taskOutcomeLedger: args.taskOutcomeLedger || DEFAULT_TASK_OUTCOME_LEDGER_PATH,
    handoffLedger: args.handoffLedger || DEFAULT_HANDOFF_LEDGER_PATH,
    promptPreparationLedger: args.promptPreparationLedger || DEFAULT_PROMPT_PREPARATION_LEDGER_PATH
  });
}

async function releaseAuditTool(args) {
  const root = resolveRoot(args.rootPath);
  return buildReleaseAudit(root, {
    targetPercent: clampInteger(args.targetPercent, 35, 1, 95),
    minSaving: clampInteger(args.minSaving, 35, 0, 100),
    minAnchors: clampInteger(args.minAnchors, 75, 0, 100),
    allowRisk: Boolean(args.allowRisk),
    includePilot: args.includePilot !== false,
    ledgerDir: args.ledgerDir || "",
    riskProfile: args.riskProfile || "balanced",
    maxFiles: clampInteger(args.maxFiles, 300, 1, 2000),
    maxPackFiles: clampInteger(args.maxPackFiles, 1, 1, 20),
    maxMoves: clampInteger(args.maxMoves, 24, 1, 500)
  });
}

async function experimentPlanTool(args) {
  const root = resolveRoot(args.rootPath);
  const plan = await buildSparkompassExperimentPlan(root, {
    ...args,
    expectOutput: asArray(args.expectOutput),
    expectOutputRegex: asArray(args.expectOutputRegex)
  });
  const outputPath = await writeSparkompassExperimentPlan(root, plan, {
    out: args.out || args.output || ""
  });
  return {
    ...plan,
    output_path: outputPath
  };
}

async function experimentScriptTool(args) {
  const root = resolveRoot(args.rootPath);
  const script = await buildSparkompassExperimentScript(root, {
    ...args,
    plan: args.plan || args.planFile || ""
  });
  const outputPath = await writeSparkompassExperimentScript(root, script, {
    out: args.out || args.output || ""
  });
  if (args.includeScript) {
    return {
      ...script,
      output_path: outputPath
    };
  }
  const { script: _scriptText, ...payload } = script;
  return {
    ...payload,
    output_path: outputPath
  };
}

async function experimentAuditTool(args) {
  const root = resolveRoot(args.rootPath);
  const audit = await buildSparkompassExperimentEvidenceAudit(root, {
    ...args,
    plan: args.plan || args.planFile || ""
  });
  const outputPath = await writeSparkompassExperimentEvidenceAudit(root, audit, {
    out: args.out || args.output || ""
  });
  return {
    ...audit,
    output_path: outputPath
  };
}

async function experimentRunTool(args) {
  const root = resolveRoot(args.rootPath);
  const experiment = await buildSparkompassExperimentRun(root, {
    ...args,
    variant: asArray(args.variant),
    promptVariant: asArray(args.promptVariant),
    promptFileVariant: asArray(args.promptFileVariant),
    contextPackVariant: asArray(args.contextPackVariant),
    taskPassed: asArray(args.taskPassed),
    taskOutcome: asArray(args.taskOutcome),
    taskOutcomeVariant: asArray(args.taskOutcomeVariant)
  });
  const outputPath = await writeSparkompassExperimentRun(root, experiment, {
    out: args.out || args.output || ""
  });
  return {
    ...experiment,
    output_path: outputPath
  };
}

async function doctorOverheadTool(args) {
  const root = resolveRoot(args.rootPath);
  const report = await buildDoctorOverhead(root, {
    profile: args.profile || args.toolProfile || "debug"
  });
  const outputPath = await writeJsonArtifact(root, report, args.out || args.output || "");
  return {
    ...report,
    output_path: outputPath
  };
}

async function routerDecisionTool(args) {
  const root = resolveRoot(args.rootPath);
  const experiment = args.experimentFile
    ? await readJsonArtifact(root, args.experimentFile)
    : args.experiment || null;
  if (!experiment) throw new Error("experiment or experimentFile is required for sparkompass_router_decision.");
  const overhead = args.overheadFile
    ? await readJsonArtifact(root, args.overheadFile)
    : args.overhead || null;
  const decision = buildSparkompassRouterDecision({
    experiment,
    overhead
  }, {
    minNetGainTokens: clampInteger(args.minNetGainTokens, 1, 0, 1000000),
    requireQualityEvidence: args.requireQualityEvidence !== false
  });
  const outputPath = await writeJsonArtifact(root, decision, args.out || args.output || "");
  return {
    ...decision,
    output_path: outputPath
  };
}

async function packageAuditTool(args) {
  const root = resolveRoot(args.rootPath);
  return buildPackageDryRunAudit(root, {
    maxPackageSizeBytes: clampInteger(args.maxPackageSizeKb, 400, 1, 100000) * 1000,
    maxUnpackedSizeBytes: clampInteger(args.maxUnpackedSizeKb, 1500, 1, 100000) * 1000,
    maxFiles: clampInteger(args.maxFiles, 120, 1, 10000)
  });
}

async function packageInstallSmokeTool(args) {
  const root = resolveRoot(args.rootPath);
  return buildPackageInstallSmokeAudit(root, {
    keepTemp: Boolean(args.keepTemp)
  });
}

async function pluginInstallSmokeTool(args) {
  const root = resolveRoot(args.rootPath);
  return buildPluginInstallSmokeAudit(root, {
    keepTemp: Boolean(args.keepTemp)
  });
}

async function promptAdvisoryTool(args) {
  const root = resolveRoot(args.rootPath);
  const { text } = await readTextInput(root, args, "sparkompass_prompt_advisory");
  return buildPromptAdvisory(text, {
    hookPayload: Boolean(args.hookPayload),
    minTokens: clampInteger(args.minTokens, 1600, 1, 100000),
    minLines: clampInteger(args.minLines, 120, 1, 100000)
  });
}

async function preparePromptTool(args) {
  const root = resolveRoot(args.rootPath);
  const input = await readTextInput(root, args, "sparkompass_prepare_prompt");
  return buildPromptPreparation(input.text, {
    label: input.label,
    hookPayload: Boolean(args.hookPayload),
    goal: args.goal || "",
    targetPercent: clampInteger(args.targetPercent, 35, 1, 95),
    riskProfile: args.riskProfile || "balanced",
    keep: Array.isArray(args.keep) ? args.keep : [],
    expect: Array.isArray(args.expect) ? args.expect : [],
    expectRegex: Array.isArray(args.expectRegex) ? args.expectRegex : [],
    includeReceipt: Boolean(args.includeReceipt),
    minTokens: clampInteger(args.minTokens, 1600, 1, 100000),
    minLines: clampInteger(args.minLines, 120, 1, 100000)
  });
}

async function promptPreparationLedgerTool(args) {
  const root = resolveRoot(args.rootPath);
  const action = args.action || "report";
  const ledger = args.ledger || DEFAULT_PROMPT_PREPARATION_LEDGER_PATH;

  if (action === "add") {
    const preparation = args.preparationFile
      ? JSON.parse(await fs.readFile(resolveInsideRoot(root, String(args.preparationFile)), "utf8"))
      : args.preparation;
    if (!preparation) throw new Error("preparation or preparationFile is required when action is add");
    return appendPromptPreparationToLedger(root, preparation, {
      out: ledger,
      runType: args.runType || "mcp",
      note: args.note || ""
    });
  }

  if (action !== "report") {
    throw new Error(`Unknown prompt preparation ledger action: ${action}`);
  }

  return buildPromptPreparationLedgerReport(root, {
    ledger
  });
}

async function envelopeLedgerTool(args) {
  const root = resolveRoot(args.rootPath);
  const action = args.action || "report";
  const ledger = args.ledger || DEFAULT_ENVELOPE_LEDGER_PATH;

  if (action === "add") {
    const envelope = args.envelopeFile
      ? JSON.parse(await fs.readFile(resolveInsideRoot(root, String(args.envelopeFile)), "utf8"))
      : args.envelope;
    if (!envelope) throw new Error("envelope or envelopeFile is required when action is add");
    return appendEnvelopeToLedger(root, envelope, {
      out: ledger,
      runType: args.runType || "mcp",
      note: args.note || ""
    });
  }

  if (action !== "report") {
    throw new Error(`Unknown envelope ledger action: ${action}`);
  }

  return buildEnvelopeLedgerReport(root, {
    ledger
  });
}

async function loadEvidenceTool(args) {
  const root = resolveRoot(args.rootPath);
  let file = args.file ? String(args.file) : "";
  let line = Number(args.line);
  let unit = null;

  if (args.unitId) {
    const inventory = await buildContextInventory(root, {
      maxFiles: clampInteger(args.maxFiles, 300, 1, 2000)
    });
    unit = inventory.units.find((candidate) => candidate.id === args.unitId);
    if (!unit) throw new Error(`unitId not found: ${args.unitId}`);
    file = unit.file;
    line = unit.line;
  }

  if (!file || !Number.isInteger(line) || line < 1) {
    throw new Error("Provide unitId or both file and line.");
  }

  const absolutePath = resolveInsideRoot(root, file);
  const text = await fs.readFile(absolutePath, "utf8");
  const lines = text.split(/\r\n|\r|\n/);
  const contextLines = clampInteger(args.contextLines, 6, 0, 80);
  const targetLine = Math.min(line, lines.length || 1);
  const start = Math.max(1, targetLine - contextLines);
  const end = Math.min(lines.length, targetLine + contextLines);
  const excerptLines = lines.slice(start - 1, end);
  const numberedText = excerptLines
    .map((value, index) => `${String(start + index).padStart(4, " ")} | ${value}`)
    .join("\n");
  const targetSource = lines[targetLine - 1] ?? "";
  const targetSourceHash = `sha256:${sha256(targetSource.trim())}`;
  const expectedSourceHash = args.expectedSourceHash || unit?.source_hash || "";

  return {
    schema: "ContextEvidenceV1",
    evidence_id: `ev-${sha256(`${file}:${start}:${end}:${numberedText}`).slice(0, 12)}`,
    root,
    file,
    line: targetLine,
    line_start: start,
    line_end: end,
    unit,
    source_hash: targetSourceHash,
    expected_source_hash: expectedSourceHash || null,
    hash_match: expectedSourceHash ? expectedSourceHash === targetSourceHash : null,
    file_hash: `sha256:${sha256(text)}`,
    excerpt_hash: `sha256:${sha256(numberedText)}`,
    text: numberedText
  };
}

async function loadSourceHashTool(args) {
  const root = resolveRoot(args.rootPath);
  return loadSourceByHash(root, {
    sourceHash: args.sourceHash || "",
    fileHash: args.fileHash || "",
    file: args.file || "",
    contextLines: clampInteger(args.contextLines, 6, 0, 80),
    maxMatches: clampInteger(args.maxMatches, 5, 1, 50),
    maxFiles: clampInteger(args.maxFiles, 300, 1, 2000)
  });
}

async function summarizeToolOutputTool(args) {
  const root = resolveRoot(args.rootPath);
  const { text, label } = await readPackInput(root, args);
  let summary = summarizeToolOutput(text, {
    label,
    command: args.command || "",
    exitCode: args.exitCode
  });

  if (args.store) {
    summary = await writeToolOutputEvidence(root, text, summary, {
      out: args.out || ".sparkompass/tool-output"
    });
  }

  return {
    ...summary,
    next_actions: [
      "Send summary_text first instead of the full raw output.",
      "Use raw_ref only when exact omitted output lines are needed."
    ]
  };
}

async function loadToolOutputTool(args) {
  const root = resolveRoot(args.rootPath);
  const evidence = await loadToolOutputEvidence(root, {
    summary: args.summary || "",
    raw: args.raw || "",
    id: args.id || "",
    out: args.out || ".sparkompass/tool-output",
    line: args.line,
    pattern: args.pattern || "",
    contextLines: clampInteger(args.contextLines, 6, 0, 120),
    maxLines: clampInteger(args.maxLines, 80, 1, 500),
    expectedHash: args.expectedHash || ""
  });

  return {
    ...evidence,
    next_actions: [
      "Use this bounded raw excerpt for exact log details.",
      "Load another pattern or line only when the current excerpt is insufficient."
    ]
  };
}

async function cacheWriteTool(args) {
  const root = resolveRoot(args.rootPath);
  const result = await writeContextCache(root, {
    out: args.out || ".sparkompass/context-cache.json",
    maxFiles: clampInteger(args.maxFiles, 300, 1, 2000)
  });

  return {
    schema: "SparkompassCacheWriteToolResultV1",
    path: result.path,
    cache_id: result.cache.cache_id,
    inventory_hash: result.cache.inventory_hash,
    totals: {
      files: result.cache.inventory.totals.files,
      units: result.cache.units.length,
      estimated_tokens: result.cache.inventory.totals.estimated_tokens
    }
  };
}

async function deltaTool(args) {
  const root = resolveRoot(args.rootPath);
  return {
    ...(await buildContextDelta(root, {
      cache: args.cache || ".sparkompass/context-cache.json",
      maxFiles: clampInteger(args.maxFiles, 300, 1, 2000)
    })),
    schema: "SparkompassDeltaToolResultV1",
    context_schema: "ContextDeltaV1"
  };
}

async function packTool(args) {
  const root = resolveRoot(args.rootPath);
  const { text, label } = await readPackInput(root, args);
  const pack = buildContextPack(text, {
    label,
    targetPercent: clampInteger(args.targetPercent, 35, 1, 95),
    riskProfile: args.riskProfile || "balanced",
    mode: args.mode || "auto",
    keep: Array.isArray(args.keep) ? args.keep : [],
    expect: Array.isArray(args.expect) ? args.expect : [],
    expectRegex: Array.isArray(args.expectRegex) ? args.expectRegex : []
  });

  const result = {
    schema: "SparkompassPackToolResultV1",
    contextPackId: pack.contextPackId,
    label: pack.label,
    sourceHash: pack.sourceHash,
    fallbackUsed: pack.fallbackUsed,
    fallbackReasons: pack.fallbackReasons,
    receipt: pack.receipt,
    context: {
      mode: pack.context.mode,
      stats: pack.context.stats
    }
  };

  if (args.includeContext) {
    result.context.text = pack.context.text;
  }

  if (args.storeInRegistry) {
    result.registry = await registerContextPack(root, pack, {
      registry: args.registry || DEFAULT_CONTEXT_PACK_REGISTRY_PATH,
      sourceFile: args.file ? resolveInsideRoot(root, String(args.file)) : "",
      sourceText: text,
      storeSourceText: Boolean(args.storeSourceText),
      note: "mcp-pack"
    });
  }

  return result;
}

async function verifyReceiptTool(args) {
  const root = resolveRoot(args.rootPath);
  if (!args.receipt) throw new Error("receipt is required for sparkompass_verify_receipt.");
  const sourceText = args.file
    ? await fs.readFile(resolveInsideRoot(root, String(args.file)), "utf8")
    : args.text;
  const deliveredText = args.contextFile
    ? await fs.readFile(resolveInsideRoot(root, String(args.contextFile)), "utf8")
    : args.contextText || args.receipt?.context?.text;

  return buildReceiptVerification(args.receipt, {
    sourceText,
    deliveredText
  });
}

async function verifyContextPackTool(args) {
  const root = resolveRoot(args.rootPath);
  const sourceFile = args.sourceFile || args.file
    ? resolveInsideRoot(root, String(args.sourceFile || args.file))
    : "";
  const contextFile = args.contextFile
    ? resolveInsideRoot(root, String(args.contextFile))
    : "";

  return verifyRegisteredContextPack(root, {
    registry: args.registry || DEFAULT_CONTEXT_PACK_REGISTRY_PATH,
    contextPackId: args.contextPackId,
    sourceFile,
    sourceText: args.sourceText || args.text || "",
    contextFile,
    contextText: args.contextText || ""
  });
}

async function contextPackFormatTool(args) {
  const root = resolveRoot(args.rootPath);
  const action = args.action || "schema";
  if (action === "schema") return buildContextPackFormat();
  if (action !== "lint") throw new Error(`Unknown contextpack format action: ${action}`);
  const receipt = args.receiptFile
    ? JSON.parse(await fs.readFile(resolveInsideRoot(root, String(args.receiptFile)), "utf8"))
    : args.receipt;
  if (!receipt) throw new Error("receipt or receiptFile is required when action is lint");
  return validateContextPackFormat(receipt);
}

async function taskOutcomeTool(args) {
  const root = resolveRoot(args.rootPath);
  const outputText = args.outputFile
    ? await fs.readFile(resolveInsideRoot(root, String(args.outputFile)), "utf8")
    : args.outputText || "";
  const receipt = args.receiptFile
    ? JSON.parse(await fs.readFile(resolveInsideRoot(root, String(args.receiptFile)), "utf8"))
    : args.receipt || null;
  const sourceText = args.sourceFile
    ? await fs.readFile(resolveInsideRoot(root, String(args.sourceFile)), "utf8")
    : args.sourceText;
  const contextText = args.contextFile
    ? await fs.readFile(resolveInsideRoot(root, String(args.contextFile)), "utf8")
    : args.contextText;

  return recordTaskOutcome({
    rootPath: root,
    cwd: root,
    command: String(args.command || ""),
    exitCode: args.exitCode,
    expectedExitCode: args.expectedExitCode ?? 0,
    outputText,
    expectOutput: Array.isArray(args.expectOutput) ? args.expectOutput : [],
    expectOutputRegex: Array.isArray(args.expectOutputRegex) ? args.expectOutputRegex : [],
    receipt,
    sourceText,
    contextText,
    durationMs: args.durationMs,
    timedOut: Boolean(args.timedOut)
  });
}

async function taskOutcomeLedgerTool(args) {
  const root = resolveRoot(args.rootPath);
  const action = args.action || "report";
  const ledger = args.ledger || DEFAULT_TASK_OUTCOME_LEDGER_PATH;

  if (action === "add") {
    const outcome = args.outcomeFile
      ? JSON.parse(await fs.readFile(resolveInsideRoot(root, String(args.outcomeFile)), "utf8"))
      : args.outcome;
    if (!outcome) throw new Error("outcome or outcomeFile is required when action is add");
    return appendTaskOutcomeToLedger(root, outcome, {
      out: ledger,
      runType: args.runType || "mcp",
      note: args.note || ""
    });
  }

  if (action !== "report") {
    throw new Error(`Unknown task outcome ledger action: ${action}`);
  }

  return buildTaskOutcomeLedgerReport(root, {
    ledger
  });
}

async function calibrateTool(args) {
  const root = resolveRoot(args.rootPath);
  const { text, label } = await readPackInput(root, args);
  return calibrateContext(text, {
    label,
    minTargetPercent: clampInteger(args.minTargetPercent, 10, 1, 95),
    maxTargetPercent: clampInteger(args.maxTargetPercent, 90, 1, 95),
    stepPercent: clampInteger(args.stepPercent, 5, 1, 25),
    riskProfile: args.riskProfile || "balanced",
    mode: args.mode || "auto",
    keep: Array.isArray(args.keep) ? args.keep : [],
    expect: Array.isArray(args.expect) ? args.expect : [],
    expectRegex: Array.isArray(args.expectRegex) ? args.expectRegex : []
  });
}

async function savingsLedgerTool(args) {
  const root = resolveRoot(args.rootPath);
  const action = args.action || "report";
  const ledger = args.ledger || DEFAULT_SAVINGS_LEDGER_PATH;

  if (action === "add") {
    if (!args.receipt) throw new Error("receipt is required when action is add");
    return appendReceiptToLedger(root, args.receipt, {
      out: ledger,
      runType: args.runType || "mcp",
      note: args.note || ""
    });
  }

  if (action !== "report") {
    throw new Error(`Unknown savings ledger action: ${action}`);
  }

  return buildSavingsLedgerReport(root, {
    ledger
  });
}

async function shadowCompareTool(args) {
  const root = resolveRoot(args.rootPath);
  const { text, label } = await readPackInput(root, args);
  return runShadowComparison(text, {
    label,
    expect: Array.isArray(args.expect) ? args.expect : [],
    expectRegex: Array.isArray(args.expectRegex) ? args.expectRegex : [],
    targetPercent: clampInteger(args.targetPercent, 35, 1, 95),
    riskProfile: args.riskProfile || "balanced",
    mode: args.mode || "auto",
    keep: Array.isArray(args.keep) ? args.keep : [],
    includeContext: Boolean(args.includeContext)
  });
}

async function semanticCacheAddTool(args) {
  const root = resolveRoot(args.rootPath);
  return addSemanticCacheEntry(root, {
    query: String(args.query || ""),
    file: args.file ? String(args.file) : "",
    text: args.text ? String(args.text) : "",
    label: args.label ? String(args.label) : "",
    oracle: Array.isArray(args.oracle) ? args.oracle : [],
    expect: Array.isArray(args.expect) ? args.expect : [],
    expectRegex: Array.isArray(args.expectRegex) ? args.expectRegex : [],
    toolVersion: Array.isArray(args.toolVersion) ? args.toolVersion : [],
    keep: Array.isArray(args.keep) ? args.keep : [],
    out: args.out || ".sparkompass/semantic-cache.json",
    registry: args.registry || "",
    storeSourceText: Boolean(args.storeSourceText),
    budget: clampInteger(args.budget, 400, 1, 8000),
    targetPercent: clampInteger(args.targetPercent, 35, 1, 95),
    riskProfile: args.riskProfile || "balanced",
    mode: args.mode || "auto",
    maxFiles: clampInteger(args.maxFiles, 300, 1, 2000)
  });
}

async function semanticCacheLookupTool(args) {
  const root = resolveRoot(args.rootPath);
  return lookupSemanticCache(root, {
    query: String(args.query || ""),
    oracle: Array.isArray(args.oracle) ? args.oracle : [],
    expect: Array.isArray(args.expect) ? args.expect : [],
    expectRegex: Array.isArray(args.expectRegex) ? args.expectRegex : [],
    toolVersion: Array.isArray(args.toolVersion) ? args.toolVersion : [],
    cache: args.cache || ".sparkompass/semantic-cache.json",
    budget: clampInteger(args.budget, 400, 1, 8000),
    minSimilarity: args.minSimilarity === undefined ? undefined : Number(args.minSimilarity),
    maxFiles: clampInteger(args.maxFiles, 300, 1, 2000)
  });
}

async function readPackInput(root, args) {
  return readTextInput(root, args, "sparkompass_pack");
}

async function readTextInput(root, args, commandName) {
  if (args.file) {
    const absolutePath = resolveInsideRoot(root, String(args.file));
    return {
      text: await fs.readFile(absolutePath, "utf8"),
      label: args.label || String(args.file)
    };
  }

  if (typeof args.text === "string" && args.text.trim()) {
    return {
      text: args.text,
      label: args.label || "mcp-text"
    };
  }

  throw new Error(`Provide file or text for ${commandName}.`);
}

function resolveRoot(rootPath) {
  return path.resolve(rootPath || process.cwd());
}

function resolveInsideRoot(root, relativePath) {
  const absolutePath = path.resolve(root, relativePath);
  const normalizedRoot = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (absolutePath !== root && !absolutePath.startsWith(normalizedRoot)) {
    throw new Error(`Path escapes rootPath: ${relativePath}`);
  }
  return absolutePath;
}

async function readJsonArtifact(root, relativePath) {
  return JSON.parse(await fs.readFile(resolveInsideRoot(root, String(relativePath)), "utf8"));
}

async function writeJsonArtifact(root, artifact, relativePath) {
  if (!relativePath) return null;
  const outputPath = resolveInsideRoot(root, String(relativePath));
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  return outputPath;
}

function parseContextBudget(value) {
  if (value === undefined || value === null || value === "") return undefined;
  return clampInteger(value, 800, 50, 100000);
}

function clampInteger(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(number)));
}

function asArray(value) {
  if (value === undefined || value === "") return [];
  return Array.isArray(value) ? value : [value];
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}
