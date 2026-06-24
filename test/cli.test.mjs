import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";

describe("codex-sparkompass CLI", () => {
  it("honors --target for compression", () => {
    const result = spawnSync(process.execPath, [
      "./bin/codex-sparkompass.mjs",
      "compress",
      "--text",
      "# Fehler\n- Problem: Login kaputt\n- Done when: Tests grün",
      "--target",
      "20"
    ], {
      encoding: "utf8"
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Zielgröße: ca\. 20%/);
  });

  it("keeps requested terms during compression", () => {
    const result = spawnSync(process.execPath, [
      "./bin/codex-sparkompass.mjs",
      "compress",
      "--text",
      "viel normaler text\nAUTH_RESET_TOKEN_EXPIRED muss bleiben\nnoch mehr text",
      "--target",
      "10",
      "--keep",
      "AUTH_RESET_TOKEN_EXPIRED"
    ], {
      encoding: "utf8"
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /AUTH_RESET_TOKEN_EXPIRED/);
    assert.match(result.stdout, /Ergebnis: ausgegeben, nicht blockiert/);
  });

  it("runs dogfood checks", () => {
    const result = spawnSync(process.execPath, [
      "./bin/codex-sparkompass.mjs",
      "dogfood",
      ".",
      "--target",
      "35"
    ], {
      encoding: "utf8"
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Sparkompass Dogfood/);
    assert.match(result.stdout, /Durchschnittliche Ersparnis/);
  });

  it("fails dogfood when quality gates are impossible", () => {
    const result = spawnSync(process.execPath, [
      "./bin/codex-sparkompass.mjs",
      "dogfood",
      ".",
      "--min-saving",
      "99",
      "--min-anchors",
      "100",
      "--fail-on-risk"
    ], {
      encoding: "utf8"
    });

    assert.equal(result.status, 2);
    assert.match(result.stdout, /Gate: nicht verified-publishable/);
    assert.match(result.stdout, /Gate-Probleme/);
  });
});
