import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";
import { buildDoctorOverhead, formatDoctorOverheadReport } from "../src/doctor-overhead.mjs";
import { MCP_TOOLS } from "../src/mcp-tools.mjs";
import { getMcpToolsForProfile } from "../src/tool-profiles.mjs";

function rpc(id, method, params = {}) {
  return JSON.stringify({ jsonrpc: "2.0", id, method, params });
}

describe("SparkompassDoctorOverheadV1", () => {
  it("measures plugin, skill, hook, and MCP tool profile overhead", async () => {
    const report = await buildDoctorOverhead(".", {
      profile: "standard"
    });

    assert.equal(report.schema, "SparkompassDoctorOverheadV1");
    assert.equal(report.gate.status, "verified-doctor-overhead");
    assert.equal(report.active_profile, "standard");
    assert.equal(report.mcp.full_tool_count, MCP_TOOLS.length);
    assert.ok(report.mcp.active_tool_count < report.mcp.full_tool_count);
    assert.ok(report.mcp.profile_savings_tokens > 0);
    assert.ok(report.components.some((component) => component.id === "plugin_hook_config" && component.present));
    assert.ok(report.profiles.some((profile) => profile.name === "minimal" && profile.tool_count < report.mcp.full_tool_count));
    assert.match(formatDoctorOverheadReport(report), /SparkompassDoctorOverheadV1/);
  });

  it("CLI doctor overhead emits JSON", () => {
    const result = spawnSync(process.execPath, [
      "./bin/codex-sparkompass.mjs",
      "doctor",
      "overhead",
      ".",
      "--profile",
      "minimal",
      "--json"
    ], {
      encoding: "utf8"
    });

    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.schema, "SparkompassDoctorOverheadV1");
    assert.equal(report.active_profile, "minimal");
    assert.ok(report.mcp.profile_savings_tokens > 0);
  });

  it("filters MCP tools when SPARKOMPASS_TOOL_PROFILE is set", () => {
    const expectedMinimal = getMcpToolsForProfile(MCP_TOOLS, "minimal");
    const input = [
      rpc(1, "initialize", { protocolVersion: "2024-11-05" }),
      rpc(2, "tools/list", {}),
      rpc(3, "tools/call", {
        name: "sparkompass_lookup",
        arguments: {
          rootPath: "test/fixtures",
          query: "compressText",
          budget: 80
        }
      }),
      rpc(4, "tools/call", {
        name: "sparkompass_release_audit",
        arguments: {
          rootPath: "."
        }
      })
    ].join("\n");

    const result = spawnSync(process.execPath, [
      "bin/codex-sparkompass-mcp.mjs"
    ], {
      input: `${input}\n`,
      encoding: "utf8",
      env: {
        ...process.env,
        SPARKOMPASS_TOOL_PROFILE: "minimal"
      },
      maxBuffer: 1024 * 1024
    });

    assert.equal(result.status, 0, result.stderr);
    const responses = result.stdout.trim().split("\n").map((line) => JSON.parse(line));
    const tools = responses.find((response) => response.id === 2).result.tools;
    const lookup = responses.find((response) => response.id === 3).result.structuredContent;
    const hiddenCall = responses.find((response) => response.id === 4);
    assert.equal(tools.length, expectedMinimal.length);
    assert.ok(tools.some((tool) => tool.name === "sparkompass_lookup"));
    assert.equal(lookup.schema, "SparkompassLookupToolResultV1");
    assert.match(hiddenCall.error.message, /active profile minimal/);
  });
});
