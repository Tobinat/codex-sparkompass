import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { estimateTextStats, estimateTokensFromBytes } from "../src/token-estimator.mjs";

describe("estimateTextStats", () => {
  it("returns zeroes for empty input", () => {
    assert.deepEqual(estimateTextStats(""), {
      bytes: 0,
      chars: 0,
      lines: 0,
      lexicalUnits: 0,
      estimatedTokens: 0
    });
  });

  it("estimates German text without requiring external tokenizers", () => {
    const stats = estimateTextStats("Ziel: Tokenverbrauch in Codex senken.\nDone when: Tests laufen.");

    assert.equal(stats.lines, 2);
    assert.ok(stats.lexicalUnits >= 8);
    assert.ok(stats.estimatedTokens > 0);
  });
});

describe("estimateTokensFromBytes", () => {
  it("uses a conservative byte heuristic", () => {
    assert.equal(estimateTokensFromBytes(0), 0);
    assert.equal(estimateTokensFromBytes(8), 2);
  });
});
