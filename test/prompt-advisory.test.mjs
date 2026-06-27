import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";
import { buildPromptAdvisory, extractPromptText, formatPromptAdvisory } from "../src/prompt-advisory.mjs";
import { buildPromptPreparation, formatPromptPreparation } from "../src/prompt-prepare.mjs";

describe("SparkompassUserPromptHookAdvisoryV1", () => {
  it("routes tool-output prompts without echoing prompt contents", () => {
    const advisory = buildPromptAdvisory("ERROR E_AUTH_104 failed in src/auth/session.mjs", {
      minTokens: 100000,
      minLines: 100000
    });
    const report = formatPromptAdvisory(advisory);

    assert.equal(advisory.schema, "SparkompassUserPromptHookAdvisoryV1");
    assert.equal(advisory.status, "advisory");
    assert.ok(advisory.signals.includes("tool-output"));
    assert.ok(advisory.signals.includes("repo-context"));
    assert.equal(advisory.suggested.action, "summarize-tool-output");
    assert.doesNotMatch(report, /E_AUTH_104/);
    assert.match(report, /sparkompass tool-output/);
  });

  it("extracts user prompt text from hook payloads", () => {
    const prompt = extractPromptText({
      messages: [
        { role: "system", content: "ignore" },
        { role: "user", content: [{ text: "Bitte prüfe src/app.mjs" }] }
      ]
    });

    assert.equal(prompt, "Bitte prüfe src/app.mjs");
  });

  it("CLI prompt-advisory emits JSON and respects quiet-ok", () => {
    const json = spawnSync(process.execPath, [
      "./bin/codex-sparkompass.mjs",
      "prompt-advisory",
      "--text",
      "function run() { return true; }",
      "--min-tokens",
      "1",
      "--json"
    ], {
      encoding: "utf8"
    });

    assert.equal(json.status, 0, json.stderr);
    const advisory = JSON.parse(json.stdout);
    assert.equal(advisory.schema, "SparkompassUserPromptHookAdvisoryV1");
    assert.equal(advisory.status, "advisory");
    assert.equal(advisory.suggested.action, "build-handoff");

    const quiet = spawnSync(process.execPath, [
      "./bin/codex-sparkompass.mjs",
      "prompt-advisory",
      "--text",
      "kurz",
      "--quiet-ok"
    ], {
      encoding: "utf8"
    });

    assert.equal(quiet.status, 0, quiet.stderr);
    assert.equal(quiet.stdout, "");
  });

  it("prepares a sendable compact prompt with ContextPack evidence", () => {
    const prompt = buildLargePrompt();
    const preparation = buildPromptPreparation(prompt, {
      goal: "Auth-Reset reparieren",
      keep: ["AUTH_RESET_TOKEN_EXPIRED"],
      expect: ["AUTH_RESET_TOKEN_EXPIRED"]
    });
    const report = formatPromptPreparation(preparation);

    assert.equal(preparation.schema, "SparkompassPromptPreparationV1");
    assert.equal(preparation.gate.verified, true);
    assert.match(preparation.gate.status, /^verified-/);
    assert.match(preparation.context_pack.context_pack_id, /^ctx-/);
    assert.equal(preparation.context_pack.critical_anchors.retention_percent, 100);
    assert.equal(preparation.context_pack.acceptance_oracle_success, true);
    assert.match(preparation.sendable_prompt.text, /AUTH_RESET_TOKEN_EXPIRED/);
    assert.match(preparation.sendable_prompt.text, /ContextPack: ctx-/);
    assert.ok(preparation.savings.delivered_context.percent > 0);
    assert.doesNotMatch(preparation.sendable_prompt.text, /Hintergrundnotiz 79/);
    assert.match(report, /Sendbarer Codex-Prompt/);
  });

  it("auto-calibrates prompt preparation before building the sendable prompt", () => {
    const prompt = buildLargePrompt();
    const preparation = buildPromptPreparation(prompt, {
      goal: "Auth-Reset reparieren",
      autoTarget: true,
      keep: ["AUTH_RESET_TOKEN_EXPIRED"],
      expect: ["AUTH_RESET_TOKEN_EXPIRED"]
    });
    const report = formatPromptPreparation(preparation);

    assert.equal(preparation.gate.verified, true);
    assert.equal(preparation.context_pack.auto_target.status, "verified-auto-target");
    assert.equal(preparation.context_pack.auto_target.oracle_gate, "verified-oracle");
    assert.equal(preparation.context_pack.auto_target.selected_target_percent, 10);
    assert.equal(preparation.context_pack.auto_target.savings_gate, "verified-additional-saving");
    assert.equal(preparation.context_pack.auto_target.selected_not_more_tokens_than_baseline, true);
    assert.ok(preparation.context_pack.auto_target.additional_saved_tokens_vs_baseline > 0);
    assert.equal(preparation.context_pack.critical_anchors.retention_percent, 100);
    assert.equal(preparation.context_pack.acceptance_oracle_success, true);
    assert.ok(preparation.savings.sendable_prompt.percent > 0);
    assert.match(report, /Auto-Target: verified-auto-target/);
  });

  it("CLI prompt-prepare emits JSON for hook payloads", () => {
    const payload = JSON.stringify({
      messages: [
        { role: "user", content: buildLargePrompt() }
      ]
    });
    const result = spawnSync(process.execPath, [
      "./bin/codex-sparkompass.mjs",
      "prompt-prepare",
      "--text",
      payload,
      "--hook-payload",
      "--expect",
      "AUTH_RESET_TOKEN_EXPIRED",
      "--json"
    ], {
      encoding: "utf8"
    });

    assert.equal(result.status, 0, result.stderr);
    const preparation = JSON.parse(result.stdout);
    assert.equal(preparation.schema, "SparkompassPromptPreparationV1");
    assert.equal(preparation.gate.verified, true);
    assert.match(preparation.sendable_prompt.text, /AUTH_RESET_TOKEN_EXPIRED/);
    assert.doesNotMatch(preparation.sendable_prompt.text, /Hintergrundnotiz 79/);
  });

  it("CLI prompt-prepare supports auto-target calibration", () => {
    const result = spawnSync(process.execPath, [
      "./bin/codex-sparkompass.mjs",
      "prompt-prepare",
      "--text",
      buildLargePrompt(),
      "--target",
      "auto",
      "--expect",
      "AUTH_RESET_TOKEN_EXPIRED",
      "--keep",
      "AUTH_RESET_TOKEN_EXPIRED",
      "--json"
    ], {
      encoding: "utf8"
    });

    assert.equal(result.status, 0, result.stderr);
    const preparation = JSON.parse(result.stdout);
    assert.equal(preparation.schema, "SparkompassPromptPreparationV1");
    assert.equal(preparation.gate.verified, true);
    assert.equal(preparation.context_pack.auto_target.status, "verified-auto-target");
    assert.equal(preparation.context_pack.auto_target.oracle_gate, "verified-oracle");
    assert.equal(preparation.context_pack.auto_target.selected_target_percent, 10);
    assert.equal(preparation.context_pack.auto_target.savings_gate, "verified-additional-saving");
    assert.ok(preparation.savings.sendable_prompt.percent > 0);
  });
});

function buildLargePrompt() {
  return [
    "# Ziel",
    "Bitte behebe AUTH_RESET_TOKEN_EXPIRED in src/auth/session.mjs.",
    "Done when: npm test ist grün und der Auth-Reset-Test bleibt stabil.",
    ...Array.from({ length: 80 }, (_, index) => `Hintergrundnotiz ${index}: allgemeiner Verlauf ohne neue Entscheidung.`)
  ].join("\n");
}
