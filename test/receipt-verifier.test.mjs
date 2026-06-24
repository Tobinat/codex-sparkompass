import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { buildContextPack } from "../src/context-pack.mjs";
import { buildReceiptVerification } from "../src/receipt-verifier.mjs";

describe("ContextPackReceiptVerificationV1", () => {
  it("verifies receipt source hash, evidence hashes, and delivered context hash", () => {
    const source = [
      "ERROR AUTH_RESET_TOKEN_EXPIRED in src/auth/session.ts",
      "Done when: Auth reset test passes.",
      "Noise that can be removed."
    ].join("\n");
    const pack = buildContextPack(source, {
      label: "auth.log",
      mode: "log",
      targetPercent: 35,
      keep: ["AUTH_RESET_TOKEN_EXPIRED", "src/auth/session.ts"],
      expect: ["AUTH_RESET_TOKEN_EXPIRED"]
    });

    const verification = buildReceiptVerification(pack.receipt, {
      sourceText: source,
      deliveredText: pack.context.text
    });

    assert.equal(verification.schema, "ContextPackReceiptVerificationV1");
    assert.equal(verification.status, "verified-receipt");
    assert.equal(verification.verified, true);
    assert.equal(verification.checks.source_hash.status, "passed");
    assert.equal(verification.checks.source_evidence.status, "passed");
    assert.equal(verification.checks.delivered_context_hash.status, "passed");
    assert.equal(verification.failures.length, 0);
  });

  it("detects changed original source text", () => {
    const source = [
      "ERROR AUTH_RESET_TOKEN_EXPIRED in src/auth/session.ts",
      "Done when: Auth reset test passes."
    ].join("\n");
    const pack = buildContextPack(source, {
      label: "auth.log",
      mode: "log",
      targetPercent: 35,
      keep: ["AUTH_RESET_TOKEN_EXPIRED"]
    });
    const verification = buildReceiptVerification(pack.receipt, {
      sourceText: source.replace("AUTH_RESET_TOKEN_EXPIRED", "AUTH_CHANGED"),
      deliveredText: pack.context.text
    });

    assert.equal(verification.status, "receipt-needs-review");
    assert.equal(verification.verified, false);
    assert.equal(verification.checks.source_hash.status, "failed");
    assert.equal(verification.checks.source_evidence.status, "failed");
  });

  it("CLI receipt verify accepts a pack JSON and original file", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-receipt-verify-"));
    const source = [
      "ERROR AUTH_RESET_TOKEN_EXPIRED in src/auth/session.ts",
      "Done when: Auth reset test passes."
    ].join("\n");
    const sourcePath = path.join(root, "auth.log");
    const packPath = path.join(root, "pack.json");
    const pack = buildContextPack(source, {
      label: "auth.log",
      mode: "log",
      targetPercent: 35,
      keep: ["AUTH_RESET_TOKEN_EXPIRED", "src/auth/session.ts"]
    });
    await fs.writeFile(sourcePath, source, "utf8");
    await fs.writeFile(packPath, JSON.stringify(pack, null, 2), "utf8");

    const result = spawnSync(process.execPath, [
      "./bin/codex-sparkompass.mjs",
      "receipt",
      "verify",
      "--receipt",
      packPath,
      "--file",
      sourcePath,
      "--json"
    ], {
      encoding: "utf8"
    });

    assert.equal(result.status, 0, result.stderr);
    const verification = JSON.parse(result.stdout);
    assert.equal(verification.schema, "ContextPackReceiptVerificationV1");
    assert.equal(verification.verified, true);
  });
});
