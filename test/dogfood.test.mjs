import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";
import { runDogfood } from "../src/dogfood.mjs";

describe("Sparkompass dogfood", () => {
  it("reports worst-case quality metrics instead of relying only on averages", async () => {
    const report = await runDogfood(".", {
      targetPercent: 35,
      minSaving: 35,
      minAnchors: 75
    });

    assert.equal(report.gate.publishable, true);
    assert.ok(report.totals.minimumAnchorRetention >= 75);
    assert.equal(report.totals.minimumCriticalRetention, 100);
    assert.equal(report.totals.minimumSourceCoverage, 100);
    assert.ok(report.totals.p95DeliveredTokens > 0);
    assert.ok(report.totals.p95SavedTokens > 0);
    assert.ok(report.totals.totalDeliveredTokens > 0);
    assert.equal(report.totals.expandedContexts, 0);
    assert.equal(report.totals.fallbacks, 0);
    assert.ok(report.totals.worstCase.label);
  });

  it("CLI dogfood prints worst-case and p95 metrics", () => {
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
    assert.match(result.stdout, /Schlechteste Anker-Erhaltung/);
    assert.match(result.stdout, /Schlechtester Einzelfall/);
    assert.match(result.stdout, /p95 gelieferte Tokens/);
    assert.match(result.stdout, /Erweiterte ContextPacks/);
    assert.match(result.stdout, /Vollkontext-Fallbacks/);
  });
});
