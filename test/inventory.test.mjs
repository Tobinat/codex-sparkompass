import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";
import { buildContextInventory } from "../src/inventory.mjs";

describe("Context Inventory", () => {
  it("extracts semantic units from fixtures", async () => {
    const inventory = await buildContextInventory("test/fixtures", {
      maxFiles: 20
    });

    const types = new Set(inventory.units.map((unit) => unit.type));
    assert.equal(inventory.schema, "ContextInventoryV1");
    assert.ok(types.has("function"));
    assert.ok(types.has("heading"));
    assert.ok(types.has("log-error"));
    assert.ok(inventory.units.every((unit) => unit.source_hash.startsWith("sha256:")));
  });

  it("CLI inventory emits JSON", () => {
    const result = spawnSync(process.execPath, [
      "./bin/codex-sparkompass.mjs",
      "inventory",
      "test/fixtures",
      "--json"
    ], {
      encoding: "utf8"
    });

    assert.equal(result.status, 0, result.stderr);
    const inventory = JSON.parse(result.stdout);
    assert.equal(inventory.schema, "ContextInventoryV1");
    assert.ok(inventory.totals.units > 0);
  });
});
