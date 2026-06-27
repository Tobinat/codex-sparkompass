import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { describe, it } from "node:test";

describe("codex-sparkompass plugin", () => {
  it("has a valid local plugin manifest and marketplace entry", () => {
    const manifest = JSON.parse(fs.readFileSync("plugins/codex-sparkompass/.codex-plugin/plugin.json", "utf8"));
    const marketplace = JSON.parse(fs.readFileSync(".agents/plugins/marketplace.json", "utf8"));

    assert.equal(manifest.name, "codex-sparkompass");
    assert.equal(manifest.version, "0.1.0-alpha.1");
    assert.equal(manifest.skills, "./skills/");
    assert.equal(manifest.mcpServers, "./.mcp.json");
    assert.equal(manifest.interface.displayName, "Codex Sparkompass");
    assert.ok(Array.isArray(manifest.interface.defaultPrompt));
    assert.ok(manifest.interface.defaultPrompt.length > 0);
    assert.ok(manifest.interface.capabilities.includes("MCP"));
    assert.ok(manifest.interface.capabilities.includes("Hooks"));

    const mcp = JSON.parse(fs.readFileSync("plugins/codex-sparkompass/.mcp.json", "utf8"));
    assert.equal(mcp.mcpServers.sparkompass.command, "node");
    assert.deepEqual(mcp.mcpServers.sparkompass.args, ["./dist/sparkompass-mcp.mjs"]);

    const hooks = JSON.parse(fs.readFileSync("plugins/codex-sparkompass/hooks/hooks.json", "utf8"));
    const promptHook = hooks.hooks.UserPromptSubmit[0].hooks[0];
    assert.equal(promptHook.type, "command");
    assert.match(promptHook.command, /\$\{PLUGIN_ROOT\}/);
    assert.match(promptHook.command, /sparkompass-user-prompt-submit\.mjs/);
    assert.equal(promptHook.timeout, 5);

    const entry = marketplace.plugins.find((plugin) => plugin.name === "codex-sparkompass");
    assert.ok(entry);
    assert.equal(marketplace.name, "codex-sparkompass");
    assert.equal(marketplace.interface.displayName, "Codex Sparkompass");
    assert.equal(entry.source.path, "./plugins/codex-sparkompass");
    assert.equal(entry.policy.installation, "AVAILABLE");
    assert.equal(entry.policy.authentication, "ON_INSTALL");
  });

  it("runs the plugin bridge against the local CLI", () => {
    const result = spawnSync(process.execPath, [
      "plugins/codex-sparkompass/scripts/sparkompass.mjs",
      "compress",
      "--text",
      "AUTH_RESET_TOKEN_EXPIRED bleibt erhalten",
      "--keep",
      "AUTH_RESET_TOKEN_EXPIRED"
    ], {
      encoding: "utf8"
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /AUTH_RESET_TOKEN_EXPIRED/);
    assert.match(result.stdout, /Sparkompass Kompression/);
  });

  it("runs the plugin bridge for inventory", () => {
    const result = spawnSync(process.execPath, [
      "plugins/codex-sparkompass/scripts/sparkompass.mjs",
      "inventory",
      "test/fixtures",
      "--json"
    ], {
      encoding: "utf8"
    });

    assert.equal(result.status, 0, result.stderr);
    const inventory = JSON.parse(result.stdout);
    assert.equal(inventory.schema, "ContextInventoryV1");
  });

  it("runs the plugin MCP bridge", () => {
    const input = [
      JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05" } }),
      JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
      JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "sparkompass_lookup",
          arguments: {
            rootPath: "test/fixtures",
            query: "compressText",
            budget: 80
          }
        }
      })
    ].join("\n");
    const result = spawnSync(process.execPath, [
      "plugins/codex-sparkompass/scripts/sparkompass-mcp.mjs"
    ], {
      input: `${input}\n`,
      encoding: "utf8",
      maxBuffer: 1024 * 1024
    });

    assert.equal(result.status, 0, result.stderr);
    const responses = result.stdout.trim().split("\n").map((line) => JSON.parse(line));
    const tools = responses.find((response) => response.id === 2).result.tools;
    const lookup = responses.find((response) => response.id === 3).result.structuredContent;
    assert.ok(tools.some((tool) => tool.name === "sparkompass_lookup"));
    assert.equal(lookup.schema, "SparkompassLookupToolResultV1");
    assert.ok(lookup.selected.some((unit) => unit.name === "compressText"));
  });

  it("runs the UserPromptSubmit hook advisory without echoing prompt content", () => {
    const input = JSON.stringify({
      user_prompt: [
        "Bitte prüfe diesen Fehler.",
        "```",
        "Error: AUTH_RESET_TOKEN_EXPIRED in src/auth/session.mjs",
        "```",
        "Logzeile".repeat(300)
      ].join("\n")
    });
    const result = spawnSync(process.execPath, [
      "plugins/codex-sparkompass/scripts/sparkompass-user-prompt-submit.mjs",
      "--min-tokens",
      "20"
    ], {
      input,
      encoding: "utf8"
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Sparkompass Prompt Advisory/);
    assert.match(result.stdout, /sparkompass tool-output/);
    assert.doesNotMatch(result.stdout, /AUTH_RESET_TOKEN_EXPIRED/);
  });

  it("keeps the UserPromptSubmit hook quiet for small prompts unless JSON is requested", () => {
    const quiet = spawnSync(process.execPath, [
      "plugins/codex-sparkompass/scripts/sparkompass-user-prompt-submit.mjs"
    ], {
      input: JSON.stringify({ user_prompt: "kurze Frage" }),
      encoding: "utf8"
    });

    assert.equal(quiet.status, 0, quiet.stderr);
    assert.equal(quiet.stdout, "");

    const json = spawnSync(process.execPath, [
      "plugins/codex-sparkompass/scripts/sparkompass-user-prompt-submit.mjs",
      "--json",
      "--min-tokens",
      "20"
    ], {
      input: JSON.stringify({ user_prompt: "kurze Frage" }),
      encoding: "utf8"
    });

    assert.equal(json.status, 0, json.stderr);
    const advisory = JSON.parse(json.stdout);
    assert.equal(advisory.schema, "SparkompassUserPromptHookAdvisoryV1");
    assert.equal(advisory.status, "ok");
  });
});
