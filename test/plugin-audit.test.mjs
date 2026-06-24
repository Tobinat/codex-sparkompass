import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";
import { buildPluginInstallSmokeAudit, formatPluginInstallSmokeAudit } from "../src/plugin-audit.mjs";

describe("PluginInstallSmokeAuditV1", () => {
  it("verifies the plugin candidate from a fresh temporary copy", async () => {
    const audit = await buildPluginInstallSmokeAudit(".");

    assert.equal(audit.schema, "PluginInstallSmokeAuditV1");
    assert.equal(audit.status, "verified-plugin-install-smoke");
    assert.equal(audit.verified, true);
    assert.equal(audit.plugin.name, "codex-sparkompass");
    assert.equal(audit.installed.cli_bridge_ok, true);
    assert.equal(audit.installed.mcp_bridge_ok, true);
    assert.equal(audit.installed.mcp_tool_call_ok, true);
    assert.equal(audit.installed.cache_cli_bridge_ok, true);
    assert.equal(audit.installed.cache_mcp_bridge_ok, true);
    assert.equal(audit.installed.cache_mcp_tool_call_ok, true);
    assert.equal(audit.installed.hook_advisory_ok, true);
    assert.equal(audit.installed.hook_redacts_sensitive_anchor, true);
    assert.ok(audit.installed.mcp_tool_count >= 42);
    assert.ok(audit.installed.mcp_lookup_selected > 0);
    assert.ok(audit.installed.cache_mcp_lookup_selected > 0);
    assert.equal(audit.installed.mcp_required_tools_present, true);
    assert.ok(audit.checks.every((item) => item.status === "verified"));
    assert.equal(audit.temp.retained, false);

    const report = formatPluginInstallSmokeAudit(audit);
    assert.match(report, /PluginInstallSmokeAuditV1/);
    assert.match(report, /Gate: verified-plugin-install-smoke/);
    assert.match(report, /MCP-Tool-Call: ok/);
    assert.match(report, /Cache-Install-Bridge: ok/);
  });

  it("CLI plugin-smoke emits JSON and exits successfully", () => {
    const result = spawnSync(process.execPath, [
      "./bin/codex-sparkompass.mjs",
      "plugin-smoke",
      ".",
      "--json"
    ], {
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024
    });

    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.schema, "PluginInstallSmokeAuditV1");
    assert.equal(payload.status, "verified-plugin-install-smoke");
    assert.equal(payload.installed.cli_bridge_ok, true);
    assert.equal(payload.installed.mcp_bridge_ok, true);
    assert.equal(payload.installed.mcp_tool_call_ok, true);
    assert.equal(payload.installed.cache_cli_bridge_ok, true);
    assert.equal(payload.installed.cache_mcp_bridge_ok, true);
    assert.equal(payload.installed.cache_mcp_tool_call_ok, true);
    assert.ok(payload.installed.mcp_lookup_selected > 0);
    assert.ok(payload.installed.cache_mcp_lookup_selected > 0);
    assert.equal(payload.installed.hook_advisory_ok, true);
  });
});
