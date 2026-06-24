import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { MCP_TOOLS } from "./mcp-tools.mjs";
import { estimateTextStats, formatBytes, formatNumber } from "./token-estimator.mjs";
import { buildToolProfileCatalog, getMcpToolsForProfile, isKnownToolProfile, normalizeToolProfileName } from "./tool-profiles.mjs";

const REQUIRED_COMPONENTS = [
  {
    id: "plugin_manifest",
    label: "Plugin-Manifest",
    relative_path: "plugins/codex-sparkompass/.codex-plugin/plugin.json",
    kind: "plugin",
    required: true
  },
  {
    id: "plugin_mcp_config",
    label: "Plugin-MCP-Konfiguration",
    relative_path: "plugins/codex-sparkompass/.mcp.json",
    kind: "mcp",
    required: true
  },
  {
    id: "plugin_hook_config",
    label: "Plugin-Hook-Konfiguration",
    relative_path: "plugins/codex-sparkompass/hooks/hooks.json",
    kind: "hook",
    required: true
  },
  {
    id: "repo_skill",
    label: "Repository-Skill",
    relative_path: ".agents/skills/codex-sparkompass/SKILL.md",
    kind: "skill",
    required: true
  },
  {
    id: "plugin_skill",
    label: "Plugin-Skill",
    relative_path: "plugins/codex-sparkompass/skills/codex-sparkompass/SKILL.md",
    kind: "skill",
    required: true
  }
];

export async function buildDoctorOverhead(rootPath, options = {}) {
  const root = path.resolve(rootPath || ".");
  const requestedProfile = String(options.profile || process.env.SPARKOMPASS_TOOL_PROFILE || "debug");
  const activeProfile = normalizeToolProfileName(requestedProfile);
  const profileKnown = isKnownToolProfile(requestedProfile);
  const components = [
    ...await readComponents(root),
    buildVirtualComponent("mcp_tool_catalog_full", "MCP-Tool-Katalog voll", "mcp", JSON.stringify(MCP_TOOLS, null, 2)),
    buildVirtualComponent("mcp_tool_catalog_active", `MCP-Tool-Katalog ${activeProfile}`, "mcp", JSON.stringify(getMcpToolsForProfile(MCP_TOOLS, activeProfile), null, 2))
  ];
  const profiles = buildProfiles(MCP_TOOLS, activeProfile);
  const fullMcp = components.find((component) => component.id === "mcp_tool_catalog_full");
  const activeMcp = components.find((component) => component.id === "mcp_tool_catalog_active");
  const missingRequired = components.filter((component) => component.required && !component.present);
  const reasons = [];
  if (missingRequired.length) reasons.push(`missing-components:${missingRequired.map((component) => component.id).join(",")}`);
  if (!profileKnown) reasons.push(`unknown-profile:${requestedProfile}`);
  if (!activeMcp || activeMcp.estimated_tokens <= 0) reasons.push("empty-active-tool-profile");

  const staticComponents = components.filter((component) => component.kind !== "mcp" || component.id === "plugin_mcp_config");
  const totalTokens = sum(components.map((component) => component.estimated_tokens));
  const staticTokens = sum(staticComponents.map((component) => component.estimated_tokens));
  const profileSavingsTokens = Math.max(0, (fullMcp?.estimated_tokens || 0) - (activeMcp?.estimated_tokens || 0));

  return {
    schema: "SparkompassDoctorOverheadV1",
    root,
    created_at: new Date().toISOString(),
    active_profile: activeProfile,
    requested_profile: requestedProfile,
    profile_known: profileKnown,
    components,
    mcp: {
      full_tool_count: MCP_TOOLS.length,
      active_tool_count: getMcpToolsForProfile(MCP_TOOLS, activeProfile).length,
      full_catalog_estimated_tokens: fullMcp?.estimated_tokens || 0,
      active_catalog_estimated_tokens: activeMcp?.estimated_tokens || 0,
      profile_savings_tokens: profileSavingsTokens,
      profile_savings_percent: percent(profileSavingsTokens, fullMcp?.estimated_tokens || 0)
    },
    profiles,
    totals: {
      estimated_overhead_tokens: totalTokens,
      static_setup_tokens: staticTokens,
      measured_catalog_tokens: fullMcp?.estimated_tokens || 0,
      active_catalog_tokens: activeMcp?.estimated_tokens || 0
    },
    gate: {
      status: reasons.length ? "doctor-overhead-needs-review" : "verified-doctor-overhead",
      verified: reasons.length === 0,
      reasons
    },
    caveats: [
      "Overhead-Tokens sind lokale Schaetzungen fuer Planung, keine offizielle Abrechnung.",
      "MCP-Tool-Profile wirken nur auf die sichtbare Tool-Liste, wenn der MCP-Server mit SPARKOMPASS_TOOL_PROFILE gestartet wird.",
      "Offizielle Usage muss weiterhin ueber Codex-JSONL-Usage-Events oder Workspace-Abrechnung belegt werden."
    ]
  };
}

export function formatDoctorOverheadReport(report) {
  const components = report.components
    .map((component) => {
      const pathLabel = component.relative_path ? ` (${component.relative_path})` : "";
      const status = component.present ? "ok" : "fehlt";
      return `- ${component.label}${pathLabel}: ${status}, ca. ${formatNumber(component.estimated_tokens)} Tokens, ${formatBytes(component.bytes)}`;
    })
    .join("\n");
  const profiles = report.profiles
    .map((profile) => `- ${profile.name}: ${formatNumber(profile.tool_count)}/${formatNumber(report.mcp.full_tool_count)} Tools, ca. ${formatNumber(profile.estimated_tokens)} Katalog-Tokens, spart ca. ${formatNumber(profile.saved_tokens_vs_full)} Tokens`)
    .join("\n");

  return `
# SparkompassDoctorOverheadV1

Gate: ${report.gate.status}
Profil: ${report.active_profile} (${formatNumber(report.mcp.active_tool_count)}/${formatNumber(report.mcp.full_tool_count)} MCP-Tools)

## Grundlast

${components}

## Tool-Profile

${profiles}

## Einschaetzung

- Aktiver MCP-Katalog: ca. ${formatNumber(report.mcp.active_catalog_estimated_tokens)} Tokens
- Voller MCP-Katalog: ca. ${formatNumber(report.mcp.full_catalog_estimated_tokens)} Tokens
- Profil-Ersparnis: ca. ${formatNumber(report.mcp.profile_savings_tokens)} Tokens (${formatNumber(report.mcp.profile_savings_percent)}%)
- Statische Plugin-/Skill-/Hook-Grundlast: ca. ${formatNumber(report.totals.static_setup_tokens)} Tokens

## Gate-Probleme

${report.gate.reasons.length ? report.gate.reasons.map((reason) => `- ${reason}`).join("\n") : "- keine"}

Hinweis: ${report.caveats.join(" ")}
`.trim();
}

async function readComponents(root) {
  const components = [];
  for (const spec of REQUIRED_COMPONENTS) {
    const absolutePath = path.join(root, spec.relative_path);
    try {
      const text = await fs.readFile(absolutePath, "utf8");
      components.push(buildComponent(spec, text, true));
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      components.push(buildComponent(spec, "", false));
    }
  }
  return components;
}

function buildComponent(spec, text, present) {
  const stats = estimateTextStats(text);
  return {
    id: spec.id,
    label: spec.label,
    kind: spec.kind,
    relative_path: spec.relative_path,
    required: Boolean(spec.required),
    present,
    bytes: stats.bytes,
    estimated_tokens: stats.estimatedTokens,
    sha256: present ? `sha256:${sha256(text)}` : ""
  };
}

function buildVirtualComponent(id, label, kind, text) {
  const stats = estimateTextStats(text);
  return {
    id,
    label,
    kind,
    relative_path: "",
    required: true,
    present: true,
    bytes: stats.bytes,
    estimated_tokens: stats.estimatedTokens,
    sha256: `sha256:${sha256(text)}`
  };
}

function buildProfiles(tools, activeProfile) {
  const fullStats = estimateTextStats(JSON.stringify(tools, null, 2));
  return buildToolProfileCatalog(tools).map((profile) => {
    const selectedTools = getMcpToolsForProfile(tools, profile.name);
    const stats = estimateTextStats(JSON.stringify(selectedTools, null, 2));
    const saved = Math.max(0, fullStats.estimatedTokens - stats.estimatedTokens);
    return {
      ...profile,
      active: profile.name === activeProfile,
      estimated_tokens: stats.estimatedTokens,
      saved_tokens_vs_full: saved,
      saved_percent_vs_full: percent(saved, fullStats.estimatedTokens)
    };
  });
}

function percent(part, whole) {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return 0;
  return Math.round((part / whole) * 100);
}

function sum(values) {
  return values.reduce((total, value) => total + (Number(value) || 0), 0);
}

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}
