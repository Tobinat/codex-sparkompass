import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { formatNumber } from "./token-estimator.mjs";

const REQUIRED_PLUGIN_PATHS = [
  ".codex-plugin/plugin.json",
  ".mcp.json",
  "hooks/hooks.json",
  "scripts/sparkompass.mjs",
  "scripts/sparkompass-mcp.mjs",
  "scripts/sparkompass-resolve.mjs",
  "scripts/sparkompass-user-prompt-submit.mjs",
  "skills/codex-sparkompass/SKILL.md"
];

export async function buildPluginInstallSmokeAudit(rootPath, options = {}) {
  const root = path.resolve(rootPath || ".");
  const sourcePluginRoot = path.join(root, "plugins/codex-sparkompass");
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-plugin-install-smoke-"));
  const installedPluginRoot = path.join(tempRoot, "plugins/codex-sparkompass");
  const commands = [];
  const checks = [];
  const startedAt = Date.now();
  let manifest = null;
  let mcpConfig = null;
  let hooksConfig = null;
  let skillText = "";
  let mcpToolNames = [];
  let mcpLookupSelected = 0;
  let cacheMcpLookupSelected = 0;

  try {
    await fs.mkdir(path.dirname(installedPluginRoot), { recursive: true });
    await fs.cp(sourcePluginRoot, installedPluginRoot, { recursive: true });
    checks.push(check("plugin-copied", await exists(path.join(installedPluginRoot, ".codex-plugin/plugin.json")), installedPluginRoot));

    const missingPaths = [];
    for (const relativePath of REQUIRED_PLUGIN_PATHS) {
      if (!await exists(path.join(installedPluginRoot, relativePath))) missingPaths.push(relativePath);
    }
    checks.push(check("required-plugin-paths", missingPaths.length === 0, `missing=${missingPaths.join(",") || "none"}`));

    manifest = JSON.parse(await fs.readFile(path.join(installedPluginRoot, ".codex-plugin/plugin.json"), "utf8"));
    mcpConfig = JSON.parse(await fs.readFile(path.join(installedPluginRoot, ".mcp.json"), "utf8"));
    hooksConfig = JSON.parse(await fs.readFile(path.join(installedPluginRoot, "hooks/hooks.json"), "utf8"));
    skillText = await fs.readFile(path.join(installedPluginRoot, "skills/codex-sparkompass/SKILL.md"), "utf8");

    checks.push(check("manifest-shape", manifest.name === "codex-sparkompass"
      && manifest.skills === "./skills/"
      && manifest.mcpServers === "./.mcp.json"
      && !Object.hasOwn(manifest, "hooks"), manifest.name || "missing"));
    checks.push(check("mcp-config-shape", mcpConfig.mcpServers?.sparkompass?.command === "node"
      && mcpConfig.mcpServers?.sparkompass?.args?.includes("./scripts/sparkompass-mcp.mjs"), JSON.stringify(mcpConfig.mcpServers?.sparkompass || {})));
    checks.push(check("hook-config-shape", Boolean(hooksConfig.hooks?.UserPromptSubmit?.[0]?.hooks?.[0]?.command?.includes("sparkompass-user-prompt-submit.mjs")), "UserPromptSubmit"));
    checks.push(check("skill-shape", /^name:\s*codex-sparkompass/m.test(skillText)
      && skillText.includes("package-smoke"), "codex-sparkompass skill"));

    const cliPath = path.join(root, "bin/codex-sparkompass.mjs");
    const mcpPath = path.join(root, "bin/codex-sparkompass-mcp.mjs");
    const timeoutMs = Number(options.timeoutMs) || 120_000;
    const lookupWorkspace = path.join(tempRoot, "lookup-workspace");
    await fs.mkdir(path.join(lookupWorkspace, "src"), { recursive: true });
    await fs.writeFile(path.join(lookupWorkspace, "src/lookup-fixture.mjs"), [
      "export function compressText(input) {",
      "  return String(input).trim();",
      "}",
      "",
      "export function unrelatedHelper() {",
      "  return true;",
      "}"
    ].join("\n"), "utf8");

    const bridgeCommand = await runCommand(process.execPath, [
      path.join(installedPluginRoot, "scripts/sparkompass.mjs"),
      "doctor"
    ], {
      cwd: installedPluginRoot,
      timeoutMs,
      env: { SPARKOMPASS_CLI: cliPath }
    });
    commands.push(commandSummary("plugin-cli-bridge", bridgeCommand));
    checks.push(check("plugin-cli-bridge", bridgeCommand.exitCode === 0
      && bridgeCommand.stdout.includes("Codex Sparkompass Doctor"), `exit=${bridgeCommand.exitCode}`));

    const mcpCommand = await runCommand(process.execPath, [
      path.join(installedPluginRoot, "scripts/sparkompass-mcp.mjs")
    ], {
      cwd: installedPluginRoot,
      timeoutMs,
      env: { SPARKOMPASS_MCP: mcpPath },
      input: [
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
          params: {}
        },
        {
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: {
            name: "sparkompass_lookup",
            arguments: {
              rootPath: lookupWorkspace,
              query: "compressText",
              budget: 80
            }
          }
        }
      ].map((message) => JSON.stringify(message)).join("\n") + "\n"
    });
    commands.push(commandSummary("plugin-mcp-bridge", mcpCommand));
    const mcpResponses = mcpCommand.stdout.trim().split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const mcpListResponse = mcpResponses.find((response) => response.id === 1);
    const mcpLookupResponse = mcpResponses.find((response) => response.id === 2);
    const mcpLookupResult = mcpLookupResponse?.result?.structuredContent;
    mcpToolNames = (mcpListResponse?.result?.tools || []).map((tool) => tool.name);
    mcpLookupSelected = Number(mcpLookupResult?.selected?.length) || 0;
    checks.push(check("plugin-mcp-bridge", mcpCommand.exitCode === 0
      && mcpToolNames.includes("sparkompass_lookup")
      && mcpToolNames.includes("sparkompass_plugin_install_smoke"), `${mcpToolNames.length} tools`));
    checks.push(check("plugin-mcp-tool-call", mcpCommand.exitCode === 0
      && mcpLookupResponse?.result?.isError === false
      && mcpLookupResult?.schema === "SparkompassLookupToolResultV1"
      && path.resolve(mcpLookupResult.root || "") === path.resolve(lookupWorkspace)
      && (mcpLookupResult.selected || []).some((unit) => unit.name === "compressText"), `lookup selected=${mcpLookupSelected}`));

    const hookPayload = JSON.stringify({
      user_prompt: [
        "Bitte prüfe diesen Fehler.",
        "```",
        "Error: AUTH_RESET_TOKEN_EXPIRED in src/auth/session.mjs",
        "```",
        "Logzeile".repeat(300)
      ].join("\n")
    });
    const hookCommand = await runCommand(process.execPath, [
      path.join(installedPluginRoot, "scripts/sparkompass-user-prompt-submit.mjs"),
      "--min-tokens",
      "20"
    ], {
      cwd: installedPluginRoot,
      timeoutMs,
      env: { SPARKOMPASS_CLI: cliPath },
      input: hookPayload
    });
    commands.push(commandSummary("plugin-user-prompt-hook", hookCommand));
    checks.push(check("plugin-user-prompt-hook", hookCommand.exitCode === 0
      && hookCommand.stdout.includes("Sparkompass Prompt Advisory")
      && hookCommand.stdout.includes("sparkompass tool-output"), `exit=${hookCommand.exitCode}`));
    checks.push(check("hook-redacts-sensitive-anchor", !hookCommand.stdout.includes("AUTH_RESET_TOKEN_EXPIRED"), "AUTH_RESET_TOKEN_EXPIRED not echoed"));

    const codexHome = path.join(tempRoot, "codex-home");
    const cachedPluginRoot = path.join(codexHome, "plugins/cache/personal/codex-sparkompass/0.1.0");
    await fs.mkdir(path.dirname(cachedPluginRoot), { recursive: true });
    await fs.cp(sourcePluginRoot, cachedPluginRoot, { recursive: true });
    await fs.writeFile(path.join(codexHome, "config.toml"), [
      "[marketplaces.personal]",
      "source_type = \"local\"",
      `source = "${escapeTomlString(root)}"`
    ].join("\n"), "utf8");

    const cachedBridgeCommand = await runCommand(process.execPath, [
      path.join(cachedPluginRoot, "scripts/sparkompass.mjs"),
      "doctor"
    ], {
      cwd: cachedPluginRoot,
      timeoutMs,
      env: { CODEX_HOME: codexHome }
    });
    commands.push(commandSummary("plugin-cache-cli-bridge", cachedBridgeCommand));
    checks.push(check("plugin-cache-cli-bridge", cachedBridgeCommand.exitCode === 0
      && cachedBridgeCommand.stdout.includes("Codex Sparkompass Doctor"), `exit=${cachedBridgeCommand.exitCode}`));

    const cachedMcpCommand = await runCommand(process.execPath, [
      path.join(cachedPluginRoot, "scripts/sparkompass-mcp.mjs")
    ], {
      cwd: cachedPluginRoot,
      timeoutMs,
      env: { CODEX_HOME: codexHome },
      input: [
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
          params: {}
        },
        {
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: {
            name: "sparkompass_lookup",
            arguments: {
              repoRoot: lookupWorkspace,
              query: "compressText",
              budget: 80
            }
          }
        }
      ].map((message) => JSON.stringify(message)).join("\n") + "\n"
    });
    commands.push(commandSummary("plugin-cache-mcp-bridge", cachedMcpCommand));
    const cachedMcpResponses = cachedMcpCommand.stdout.trim().split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const cachedMcpListResponse = cachedMcpResponses.find((response) => response.id === 1);
    const cachedMcpLookupResponse = cachedMcpResponses.find((response) => response.id === 2);
    const cachedMcpLookupResult = cachedMcpLookupResponse?.result?.structuredContent;
    const cachedMcpToolNames = (cachedMcpListResponse?.result?.tools || []).map((tool) => tool.name);
    cacheMcpLookupSelected = Number(cachedMcpLookupResult?.selected?.length) || 0;
    checks.push(check("plugin-cache-mcp-bridge", cachedMcpCommand.exitCode === 0
      && cachedMcpToolNames.includes("sparkompass_lookup")
      && cachedMcpToolNames.includes("sparkompass_plugin_install_smoke"), `${cachedMcpToolNames.length} tools`));
    checks.push(check("plugin-cache-mcp-tool-call", cachedMcpCommand.exitCode === 0
      && cachedMcpLookupResponse?.result?.isError === false
      && cachedMcpLookupResult?.schema === "SparkompassLookupToolResultV1"
      && path.resolve(cachedMcpLookupResult.root || "") === path.resolve(lookupWorkspace)
      && (cachedMcpLookupResult.selected || []).some((unit) => unit.name === "compressText"), `lookup selected=${cacheMcpLookupSelected}`));
  } catch (error) {
    checks.push(check("plugin-install-smoke-error", false, error?.message || String(error)));
  } finally {
    if (!options.keepTemp) {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  }

  const verified = checks.length > 0 && checks.every((item) => item.passed);

  return {
    schema: "PluginInstallSmokeAuditV1",
    status: verified ? "verified-plugin-install-smoke" : "plugin-install-smoke-needs-review",
    verified,
    root,
    generated_at: new Date().toISOString(),
    duration_ms: Date.now() - startedAt,
    command: "copy plugin to <tmp> && run plugin CLI bridge, MCP tools/list, MCP lookup tools/call, and UserPromptSubmit hook",
    plugin: {
      name: manifest?.name || "",
      display_name: manifest?.interface?.displayName || "",
      capabilities: manifest?.interface?.capabilities || [],
      mcp_server: Boolean(mcpConfig?.mcpServers?.sparkompass),
      user_prompt_hook: Boolean(hooksConfig?.hooks?.UserPromptSubmit),
      skill_present: Boolean(skillText)
    },
    installed: {
      plugin_path: options.keepTemp ? installedPluginRoot : null,
      cli_bridge_ok: checks.some((item) => item.id === "plugin-cli-bridge" && item.passed),
      mcp_bridge_ok: checks.some((item) => item.id === "plugin-mcp-bridge" && item.passed),
      mcp_tool_call_ok: checks.some((item) => item.id === "plugin-mcp-tool-call" && item.passed),
      cache_cli_bridge_ok: checks.some((item) => item.id === "plugin-cache-cli-bridge" && item.passed),
      cache_mcp_bridge_ok: checks.some((item) => item.id === "plugin-cache-mcp-bridge" && item.passed),
      cache_mcp_tool_call_ok: checks.some((item) => item.id === "plugin-cache-mcp-tool-call" && item.passed),
      hook_advisory_ok: checks.some((item) => item.id === "plugin-user-prompt-hook" && item.passed),
      hook_redacts_sensitive_anchor: checks.some((item) => item.id === "hook-redacts-sensitive-anchor" && item.passed),
      mcp_tool_count: mcpToolNames.length,
      mcp_lookup_selected: mcpLookupSelected,
      cache_mcp_lookup_selected: cacheMcpLookupSelected,
      mcp_required_tools_present: mcpToolNames.includes("sparkompass_lookup")
        && mcpToolNames.includes("sparkompass_prepare_prompt")
        && mcpToolNames.includes("sparkompass_plugin_install_smoke")
    },
    checks,
    commands,
    temp: {
      retained: Boolean(options.keepTemp),
      path: options.keepTemp ? tempRoot : null
    },
    caveats: [
      "This copies the local plugin candidate into a temporary directory; it is not Codex Plugin Directory publication.",
      "The copied-plugin bridge smoke uses SPARKOMPASS_CLI/SPARKOMPASS_MCP; the cache-install bridge resolves the marketplace source through Codex config."
    ]
  };
}

export function formatPluginInstallSmokeAudit(audit) {
  return `
# PluginInstallSmokeAuditV1

Gate: ${audit.status}
Pfad: ${audit.root}

- Plugin: ${audit.plugin.name} (${audit.plugin.display_name || "ohne Anzeigename"})
- Capabilities: ${audit.plugin.capabilities.join(", ") || "keine"}
- CLI-Bridge: ${audit.installed.cli_bridge_ok ? "ok" : "needs-review"}
- MCP-Bridge: ${audit.installed.mcp_bridge_ok ? "ok" : "needs-review"}, ${formatNumber(audit.installed.mcp_tool_count)} Tools
- MCP-Tool-Call: ${audit.installed.mcp_tool_call_ok ? "ok" : "needs-review"}, ${formatNumber(audit.installed.mcp_lookup_selected)} Lookup-Treffer
- Cache-Install-Bridge: ${audit.installed.cache_cli_bridge_ok && audit.installed.cache_mcp_bridge_ok && audit.installed.cache_mcp_tool_call_ok ? "ok" : "needs-review"}, ${formatNumber(audit.installed.cache_mcp_lookup_selected)} Lookup-Treffer
- UserPromptSubmit-Hook: ${audit.installed.hook_advisory_ok ? "ok" : "needs-review"}
- Hook-Redaktion: ${audit.installed.hook_redacts_sensitive_anchor ? "ok" : "needs-review"}
- Dauer: ${formatNumber(audit.duration_ms)} ms

## Checks

${audit.checks.map((item) => `- ${item.passed ? "[x]" : "[ ]"} ${item.id}: ${item.evidence}`).join("\n")}

## Caveats

${audit.caveats.map((item) => `- ${item}`).join("\n")}
`.trim();
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: {
        ...process.env,
        ...options.env
      },
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeoutMs = Number(options.timeoutMs) || 120_000;
    const timer = setTimeout(() => {
      settled = true;
      child.kill("SIGTERM");
      resolve({
        command,
        args,
        exitCode: 124,
        stdout,
        stderr,
        durationMs: Date.now() - startedAt,
        timedOut: true
      });
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        command,
        args,
        exitCode: 1,
        stdout,
        stderr: stderr || error.message,
        durationMs: Date.now() - startedAt,
        timedOut: false
      });
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        command,
        args,
        exitCode: code ?? 0,
        stdout,
        stderr,
        durationMs: Date.now() - startedAt,
        timedOut: false
      });
    });

    if (options.input) child.stdin.write(options.input);
    child.stdin.end();
  });
}

function commandSummary(id, result) {
  return {
    id,
    command: [result.command, ...result.args].join(" "),
    exit_code: result.exitCode,
    duration_ms: result.durationMs,
    timed_out: result.timedOut,
    stdout_excerpt: excerpt(result.stdout),
    stderr_excerpt: excerpt(result.stderr)
  };
}

function excerpt(text, limit = 500) {
  const value = String(text || "").trim();
  return value.length > limit ? `${value.slice(0, limit)}...` : value;
}

function check(id, passed, evidence) {
  return {
    id,
    passed: Boolean(passed),
    status: passed ? "verified" : "needs-review",
    evidence
  };
}

function escapeTomlString(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}
