import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { compressText } from "../src/compressor.mjs";
import { buildCompactPrompt } from "../src/prompt.mjs";
import { buildRunRecommendation, formatRunRecommendation } from "../src/recommend.mjs";

describe("buildCompactPrompt", () => {
  it("builds a scoped German Codex prompt", () => {
    const prompt = buildCompactPrompt({
      goal: "Login-Fehler beheben",
      files: ["src/auth.ts"],
      done: ["npm test läuft grün"]
    });

    assert.match(prompt, /Ziel:/);
    assert.match(prompt, /Login-Fehler beheben/);
    assert.match(prompt, /Datei: src\/auth\.ts/);
    assert.match(prompt, /Done when:/);
  });
});

describe("buildRunRecommendation", () => {
  it("combines audit data with a compact next prompt", () => {
    const recommendation = buildRunRecommendation({
      goal: "Login-Fehler beheben",
      files: ["src/auth.ts"],
      scan: {
        totals: {
          estimatedTextTokens: 1000
        },
        files: [
          {
            path: "src/auth.ts",
            estimatedTokens: 300
          }
        ]
      },
      analysis: {
        level: {
          color: "grün",
          title: "schlank",
          message: "Gut portionierbar."
        },
        topTokenFiles: [
          {
            path: "src/auth.ts",
            estimatedTokens: 300,
            bytes: 1200
          }
        ]
      }
    });

    assert.match(recommendation.prompt, /Login-Fehler beheben/);
    assert.match(recommendation.prompt, /Datei: src\/auth\.ts/);
    assert.ok(recommendation.savings.originalTokens > recommendation.savings.compactTokens);
    assert.match(formatRunRecommendation(recommendation), /Sparkompass Empfehlung/);
  });
});

describe("compressText", () => {
  it("keeps important lines and reports savings", () => {
    const source = `
# Fehlerbericht

Sehr langer Absatz mit vielen Details die nicht alle in den ersten Prompt müssen.

- Problem: Login bricht nach Passwort-Reset ab
- Done when: Auth-Tests laufen grün

export function login() {
  return true;
}
`.repeat(8);

    const result = compressText(source, {
      targetPercent: 30,
      label: "test",
      keep: ["Auth-Tests"]
    });

    assert.match(result.text, /Fehlerbericht/);
    assert.match(result.text, /Problem: Login/);
    assert.match(result.text, /Auth-Tests/);
    assert.equal(result.quality.status, "gut");
    assert.ok(result.savings.percent > 0);
  });

  it("returns a result with warnings instead of refusing risky compression", () => {
    const source = Array.from({ length: 20 }, (_, index) => (
      `AUTH_RESET_TOKEN_EXPIRED geschützte Zeile ${index} muss erhalten bleiben.`
    )).join("\n");

    const result = compressText(source, {
      targetPercent: 10,
      keep: ["AUTH_RESET_TOKEN_EXPIRED"]
    });

    assert.match(result.text, /AUTH_RESET_TOKEN_EXPIRED/);
    assert.ok(result.quality.targetExceeded);
    assert.ok(result.quality.warnings.length > 0);
  });
});
