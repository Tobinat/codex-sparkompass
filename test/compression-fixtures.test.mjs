import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { compressText } from "../src/compressor.mjs";

const FIXTURE_DIR = path.resolve("test/fixtures");

describe("compression fixtures", () => {
  it("keeps log error anchors while saving tokens", () => {
    const source = fs.readFileSync(path.join(FIXTURE_DIR, "error-log.txt"), "utf8");
    const result = compressText(source, {
      label: "error-log.txt",
      mode: "log",
      targetPercent: 35,
      keep: ["AUTH_RESET_TOKEN_EXPIRED", "src/auth/session.ts"]
    });

    assert.match(result.text, /AUTH_RESET_TOKEN_EXPIRED/);
    assert.match(result.text, /src\/auth\/session\.ts/);
    assert.match(result.text, /Done when: Auth reset test passes/);
    assert.ok(result.savings.percent >= 25);
    assert.notEqual(result.quality.status, "riskant");
  });

  it("keeps markdown commands and quality terms", () => {
    const source = fs.readFileSync(path.join(FIXTURE_DIR, "plan.md"), "utf8");
    const result = compressText(source, {
      label: "plan.md",
      mode: "markdown",
      targetPercent: 40,
      keep: ["sparkompass compress", "--keep AUTH_RESET_TOKEN_EXPIRED", "Qualität"]
    });

    assert.match(result.text, /sparkompass compress/);
    assert.match(result.text, /--keep AUTH_RESET_TOKEN_EXPIRED/);
    assert.match(result.text, /Qualität/);
    assert.ok(result.quality.anchorRetentionPercent >= 75);
  });

  it("reports critical anchor retention by class for dangerous CLI flags", () => {
    const source = [
      "Deployment reminder:",
      "Never run git push --force without a reviewed rollback plan.",
      "Keep AUTH_RESET_TOKEN_EXPIRED and src/auth/session.ts in the handoff.",
      "Repeated explanatory noise that can be shortened."
    ].join("\n");
    const result = compressText(source, {
      label: "deploy-note.md",
      mode: "markdown",
      targetPercent: 35,
      keep: ["AUTH_RESET_TOKEN_EXPIRED"]
    });
    const cliClass = result.quality.criticalAnchorClasses.find((entry) => entry.class === "cli-option");
    const errorClass = result.quality.criticalAnchorClasses.find((entry) => entry.class === "error-code");
    const pathClass = result.quality.criticalAnchorClasses.find((entry) => entry.class === "path");

    assert.match(result.text, /--force/);
    assert.equal(cliClass.retention_percent, 100);
    assert.equal(errorClass.retention_percent, 100);
    assert.equal(pathClass.retention_percent, 100);
  });

  it("keeps env assignments, URLs, and file permissions as critical anchors", () => {
    const source = fs.readFileSync(path.join(FIXTURE_DIR, "failure-corpus", "environment-url-permission.md"), "utf8");
    const result = compressText(source, {
      label: "environment-url-permission.md",
      mode: "markdown",
      targetPercent: 30,
      keep: [
        "DATABASE_URL=https://db.internal.example/v2?sslmode=require",
        "chmod 0600 .secrets/sparkompass-token"
      ]
    });
    const envClass = result.quality.criticalAnchorClasses.find((entry) => entry.class === "env-var");
    const urlClass = result.quality.criticalAnchorClasses.find((entry) => entry.class === "url");
    const permissionClass = result.quality.criticalAnchorClasses.find((entry) => entry.class === "permission");

    assert.match(result.text, /DATABASE_URL=https:\/\/db\.internal\.example\/v2\?sslmode=require/);
    assert.match(result.text, /https:\/\/hooks\.example\.com\/codex\/sparkompass/);
    assert.match(result.text, /chmod 0600 \.secrets\/sparkompass-token/);
    assert.equal(envClass.retention_percent, 100);
    assert.equal(urlClass.retention_percent, 100);
    assert.equal(permissionClass.retention_percent, 100);
    assert.equal(result.quality.criticalAnchorRetentionPercent, 100);
  });

  it("keeps numeric limits and units as critical anchors", () => {
    const source = fs.readFileSync(path.join(FIXTURE_DIR, "failure-corpus", "numeric-budget-unit.md"), "utf8");
    const result = compressText(source, {
      label: "numeric-budget-unit.md",
      mode: "markdown",
      targetPercent: 30,
      keep: [
        "p95_latency <= 250ms",
        "retry_budget=0"
      ]
    });
    const numericClass = result.quality.criticalAnchorClasses.find((entry) => entry.class === "numeric-constraint");

    assert.match(result.text, /p95_latency <= 250ms/);
    assert.match(result.text, /max_memory=512MiB/);
    assert.match(result.text, /retry_budget=0/);
    assert.match(result.text, /rate_limit=120\/min/);
    assert.match(result.text, /rollout_percent=5%/);
    assert.equal(numericClass.retention_percent, 100);
    assert.equal(result.quality.criticalAnchorRetentionPercent, 100);
  });

  it("keeps boolean policy and mode values as critical anchors", () => {
    const source = fs.readFileSync(path.join(FIXTURE_DIR, "failure-corpus", "boolean-policy-mode.md"), "utf8");
    const result = compressText(source, {
      label: "boolean-policy-mode.md",
      mode: "markdown",
      targetPercent: 30,
      keep: [
        "allow_production_writes=false",
        "policy=deny-by-default"
      ]
    });
    const configClass = result.quality.criticalAnchorClasses.find((entry) => entry.class === "config-value");

    assert.match(result.text, /allow_production_writes=false/);
    assert.match(result.text, /delete_users=false/);
    assert.match(result.text, /mode=read-only/);
    assert.match(result.text, /policy=deny-by-default/);
    assert.match(result.text, /migration_required=true/);
    assert.equal(configClass.retention_percent, 100);
    assert.equal(result.quality.criticalAnchorRetentionPercent, 100);
  });

  it("keeps diff polarity and hunk markers as critical anchors", () => {
    const source = fs.readFileSync(path.join(FIXTURE_DIR, "failure-corpus", "diff-polarity.patch"), "utf8");
    const result = compressText(source, {
      label: "diff-polarity.patch",
      mode: "diff",
      targetPercent: 30,
      keep: [
        "-  allow_admin=true",
        "+  allow_admin=false"
      ]
    });
    const markerClass = result.quality.criticalAnchorClasses.find((entry) => entry.class === "diff-marker");
    const changeClass = result.quality.criticalAnchorClasses.find((entry) => entry.class === "diff-change");

    assert.match(result.text, /diff --git a\/src\/auth\/guard\.ts b\/src\/auth\/guard\.ts/);
    assert.match(result.text, /@@ -12,9 \+12,9 @@/);
    assert.match(result.text, /-  allow_admin=true/);
    assert.match(result.text, /\+  allow_admin=false/);
    assert.match(result.text, /-  delete_users=true/);
    assert.match(result.text, /\+  delete_users=false/);
    assert.match(result.text, /-  mode=full/);
    assert.match(result.text, /\+  mode=read-only/);
    assert.equal(markerClass.retention_percent, 100);
    assert.equal(changeClass.retention_percent, 100);
    assert.equal(result.quality.criticalAnchorRetentionPercent, 100);
  });

  it("keeps precedence and execution order as critical anchors", () => {
    const source = fs.readFileSync(path.join(FIXTURE_DIR, "failure-corpus", "precedence-order.md"), "utf8");
    const result = compressText(source, {
      label: "precedence-order.md",
      mode: "markdown",
      targetPercent: 30,
      keep: [
        "precedence: env > repo config > default",
        "fallback order: cache -> database -> remote API"
      ]
    });
    const orderClass = result.quality.criticalAnchorClasses.find((entry) => entry.class === "order-rule");

    assert.match(result.text, /precedence: env > repo config > default/);
    assert.match(result.text, /fallback order: cache -> database -> remote API/);
    assert.match(result.text, /Must hash rawAuthorization before writing session_token_hash/);
    assert.match(result.text, /Run schema migration before enabling FEATURE_BILLING_V2/);
    assert.match(result.text, /First validate tenant, then load \.\/providers\/\$\{tenant\}\.mjs/);
    assert.equal(orderClass.retention_percent, 100);
    assert.equal(result.quality.criticalAnchorRetentionPercent, 100);
  });

  it("keeps temporal windows and expiry rules as critical anchors", () => {
    const source = fs.readFileSync(path.join(FIXTURE_DIR, "failure-corpus", "temporal-window.md"), "utf8");
    const result = compressText(source, {
      label: "temporal-window.md",
      mode: "markdown",
      targetPercent: 30,
      keep: [
        "deploy_window=2026-07-01T02:00:00+02:00..2026-07-01T03:00:00+02:00",
        "ttl=15m"
      ]
    });
    const temporalClass = result.quality.criticalAnchorClasses.find((entry) => entry.class === "temporal-constraint");

    assert.match(result.text, /deploy_window=2026-07-01T02:00:00\+02:00\.\.2026-07-01T03:00:00\+02:00/);
    assert.match(result.text, /not_before=2026-07-01T02:00:00\+02:00/);
    assert.match(result.text, /expires_at=2026-07-01T03:00:00\+02:00/);
    assert.match(result.text, /cron: "15 2 \* \* 1-5" Europe\/Berlin/);
    assert.match(result.text, /ttl=15m/);
    assert.equal(temporalClass.retention_percent, 100);
    assert.equal(result.quality.criticalAnchorRetentionPercent, 100);
  });

  it("keeps API contracts and schema requirements as critical anchors", () => {
    const source = fs.readFileSync(path.join(FIXTURE_DIR, "failure-corpus", "api-contract.md"), "utf8");
    const result = compressText(source, {
      label: "api-contract.md",
      mode: "markdown",
      targetPercent: 30,
      keep: [
        "POST /v1/context-packs/{context_pack_id}/verify -> 200 OK",
        "request.required: context_pack_id, receipt_hash, source_hash"
      ]
    });
    const apiClass = result.quality.criticalAnchorClasses.find((entry) => entry.class === "api-contract");

    assert.match(result.text, /POST \/v1\/context-packs\/\{context_pack_id\}\/verify -> 200 OK/);
    assert.match(result.text, /GET \/v1\/context-packs\/\{context_pack_id\}\/evidence\?source_hash=\{source_hash\} -> 206 Partial Content/);
    assert.match(result.text, /409 Conflict means receipt_hash mismatch; do not retry as success/);
    assert.match(result.text, /request\.required: context_pack_id, receipt_hash, source_hash/);
    assert.match(result.text, /response\.required: gate\.status, delivered_context\.hash, source_evidence\.coverage/);
    assert.equal(apiClass.retention_percent, 100);
    assert.equal(result.quality.criticalAnchorRetentionPercent, 100);
  });

  it("keeps database migration contracts as critical anchors", () => {
    const source = fs.readFileSync(path.join(FIXTURE_DIR, "failure-corpus", "data-migration-contract.md"), "utf8");
    const result = compressText(source, {
      label: "data-migration-contract.md",
      mode: "markdown",
      targetPercent: 30,
      keep: [
        "ON DELETE RESTRICT",
        "UPDATE invoices SET status='archived' WHERE paid_at < '2025-01-01' AND status='paid';"
      ]
    });
    const migrationClass = result.quality.criticalAnchorClasses.find((entry) => entry.class === "data-migration-contract");

    assert.match(result.text, /ALTER TABLE invoices ADD CONSTRAINT invoices_account_id_fkey FOREIGN KEY \(account_id\) REFERENCES accounts\(id\) ON DELETE RESTRICT;/);
    assert.match(result.text, /CREATE UNIQUE INDEX CONCURRENTLY idx_users_email_lower ON users \(lower\(email\)\) WHERE deleted_at IS NULL;/);
    assert.match(result.text, /UPDATE invoices SET status='archived' WHERE paid_at < '2025-01-01' AND status='paid';/);
    assert.match(result.text, /rollback: DROP INDEX CONCURRENTLY idx_users_email_lower;/);
    assert.match(result.text, /transaction: BEGIN; run backfill; COMMIT only after constraint validation/);
    assert.equal(migrationClass.retention_percent, 100);
    assert.equal(result.quality.criticalAnchorRetentionPercent, 100);
  });

  it("keeps idempotency and concurrency contracts as critical anchors", () => {
    const source = fs.readFileSync(path.join(FIXTURE_DIR, "failure-corpus", "idempotency-concurrency.md"), "utf8");
    const result = compressText(source, {
      label: "idempotency-concurrency.md",
      mode: "markdown",
      targetPercent: 30,
      keep: [
        "Idempotency-Key header is required for POST /v1/payments/capture.",
        "retry_on_conflict=false after charge_captured=true"
      ]
    });
    const concurrencyClass = result.quality.criticalAnchorClasses.find((entry) => entry.class === "idempotency-concurrency");

    assert.match(result.text, /Idempotency-Key header is required for POST \/v1\/payments\/capture\./);
    assert.match(result.text, /idempotency_key UNIQUE prevents duplicate charge capture\./);
    assert.match(result.text, /SELECT \* FROM payment_jobs WHERE status='queued' FOR UPDATE SKIP LOCKED;/);
    assert.match(result.text, /isolation_level=serializable/);
    assert.match(result.text, /retry_on_conflict=false after charge_captured=true/);
    assert.equal(concurrencyClass.retention_percent, 100);
    assert.equal(result.quality.criticalAnchorRetentionPercent, 100);
  });

  it("keeps locale, encoding, and umlaut normalization contracts as critical anchors", () => {
    const source = fs.readFileSync(path.join(FIXTURE_DIR, "failure-corpus", "locale-encoding.md"), "utf8");
    const result = compressText(source, {
      label: "locale-encoding.md",
      mode: "markdown",
      targetPercent: 30,
      keep: [
        "charset=UTF-8",
        "case_sensitive=true for query \"Ärger\" != \"ärger\""
      ]
    });
    const localeClass = result.quality.criticalAnchorClasses.find((entry) => entry.class === "locale-encoding");

    assert.match(result.text, /charset=UTF-8/);
    assert.match(result.text, /normalization=NFC/);
    assert.match(result.text, /locale=de-DE/);
    assert.match(result.text, /collation=de_DE\.UTF-8/);
    assert.match(result.text, /case_sensitive=true for query "Ärger" != "ärger"/);
    assert.equal(localeClass.retention_percent, 100);
    assert.equal(result.quality.criticalAnchorRetentionPercent, 100);
  });

  it("keeps auth scopes, roles, claims, and audience contracts as critical anchors", () => {
    const source = fs.readFileSync(path.join(FIXTURE_DIR, "failure-corpus", "auth-scope-contract.md"), "utf8");
    const result = compressText(source, {
      label: "auth-scope-contract.md",
      mode: "markdown",
      targetPercent: 30,
      keep: [
        "required_scopes=openid profile email repo:read repo:write",
        "permission=payments.capture:write"
      ]
    });
    const authClass = result.quality.criticalAnchorClasses.find((entry) => entry.class === "auth-scope");

    assert.match(result.text, /required_scopes=openid profile email repo:read repo:write/);
    assert.match(result.text, /role=admin must not degrade to viewer/);
    assert.match(result.text, /claims\.required=tenant_id,org_id,email_verified/);
    assert.match(result.text, /audience=api:\/\/sparkompass-prod/);
    assert.match(result.text, /permission=payments\.capture:write/);
    assert.equal(authClass.retention_percent, 100);
    assert.equal(result.quality.criticalAnchorRetentionPercent, 100);
  });

  it("keeps crypto signature and hash contracts as critical anchors", () => {
    const source = fs.readFileSync(path.join(FIXTURE_DIR, "failure-corpus", "crypto-signature-contract.md"), "utf8");
    const result = compressText(source, {
      label: "crypto-signature-contract.md",
      mode: "markdown",
      targetPercent: 30,
      keep: [
        "alg=RS256",
        "expected_sha256=sha256:9f4c2e1d8b7a6c5d4e3f2019a8b7c6d5e4f30192837465abcdefabcdef123456",
        "signature_header=X-Sparkompass-Signature"
      ]
    });
    const cryptoClass = result.quality.criticalAnchorClasses.find((entry) => entry.class === "crypto-contract");

    assert.match(result.text, /alg=RS256/);
    assert.match(result.text, /kid=prod-key-2026-07/);
    assert.match(result.text, /jwks_uri=https:\/\/auth\.example\.com\/\.well-known\/jwks\.json/);
    assert.match(result.text, /expected_sha256=sha256:9f4c2e1d8b7a6c5d4e3f2019a8b7c6d5e4f30192837465abcdefabcdef123456/);
    assert.match(result.text, /signature_header=X-Sparkompass-Signature/);
    assert.equal(cryptoClass.retention_percent, 100);
    assert.equal(result.quality.criticalAnchorRetentionPercent, 100);
  });

  it("keeps money, currency, tax, and rounding contracts as critical anchors", () => {
    const source = fs.readFileSync(path.join(FIXTURE_DIR, "failure-corpus", "money-currency-contract.md"), "utf8");
    const result = compressText(source, {
      label: "money-currency-contract.md",
      mode: "markdown",
      targetPercent: 30,
      keep: [
        "amount_cents=123456",
        "currency=EUR",
        "rounding_mode=half_up"
      ]
    });
    const moneyClass = result.quality.criticalAnchorClasses.find((entry) => entry.class === "money-contract");

    assert.match(result.text, /amount_cents=123456/);
    assert.match(result.text, /currency=EUR/);
    assert.match(result.text, /vat_rate=19%/);
    assert.match(result.text, /fee_bps=30/);
    assert.match(result.text, /rounding_mode=half_up/);
    assert.match(result.text, /minor_units=2/);
    assert.equal(moneyClass.retention_percent, 100);
    assert.equal(result.quality.criticalAnchorRetentionPercent, 100);
  });

  it("keeps destructive operation targets and safety flags as critical anchors", () => {
    const source = fs.readFileSync(path.join(FIXTURE_DIR, "failure-corpus", "destructive-operation.md"), "utf8");
    const result = compressText(source, {
      label: "destructive-operation.md",
      mode: "markdown",
      targetPercent: 25
    });
    const destructiveClass = result.quality.criticalAnchorClasses.find((entry) => entry.class === "destructive-operation");

    assert.match(result.text, /rm -rf \/srv\/prod\/uploads --one-file-system/);
    assert.match(result.text, /kubectl delete namespace billing-prod --wait=false/);
    assert.match(result.text, /terraform destroy -target=module\.payments-prod --auto-approve/);
    assert.match(result.text, /aws s3 rm s3:\/\/billing-prod-ledger --recursive --exclude "\*\.keep"/);
    assert.match(result.text, /git reset --hard origin\/main/);
    assert.equal(destructiveClass.retention_percent, 100);
    assert.equal(result.quality.criticalAnchorRetentionPercent, 100);
  });

  it("keeps regex, glob, and matcher contracts as critical anchors", () => {
    const source = fs.readFileSync(path.join(FIXTURE_DIR, "failure-corpus", "pattern-contract.md"), "utf8");
    const result = compressText(source, {
      label: "pattern-contract.md",
      mode: "markdown",
      targetPercent: 25
    });
    const patternClass = result.quality.criticalAnchorClasses.find((entry) => entry.class === "pattern-contract");

    assert.match(result.text, /route_regex=\^\/api\/\(auth\|billing\)\/v\[0-9\]\+\/callback\$/);
    assert.match(result.text, /path_glob=packages\/\*\/src\/\*\*\/\*\.ts/);
    assert.match(result.text, /deny_pattern=\^\(\?!prod-\[a-z0-9-\]\+\$\)\.\*/);
    assert.match(result.text, /mask_regex=\(\?<=token=\)\[A-Za-z0-9_-\]\{16,\}/);
    assert.match(result.text, /ignore_glob=!\(\*\.spec\)\.\{ts,tsx\}/);
    assert.equal(patternClass.retention_percent, 100);
    assert.equal(result.quality.criticalAnchorRetentionPercent, 100);
  });

  it("keeps web security headers, cookies, CORS, CSP, and CSRF contracts as critical anchors", () => {
    const source = fs.readFileSync(path.join(FIXTURE_DIR, "failure-corpus", "web-security-header.md"), "utf8");
    const result = compressText(source, {
      label: "web-security-header.md",
      mode: "markdown",
      targetPercent: 25
    });
    const headerClass = result.quality.criticalAnchorClasses.find((entry) => entry.class === "web-security-header");

    assert.match(result.text, /Set-Cookie: session=opaque; HttpOnly; Secure; SameSite=Lax; Path=\/; Max-Age=900/);
    assert.match(result.text, /Access-Control-Allow-Origin: https:\/\/app\.example\.com/);
    assert.match(result.text, /Access-Control-Allow-Credentials: true/);
    assert.match(result.text, /Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-r4nd0m'; frame-ancestors 'none'/);
    assert.match(result.text, /csrf_header=X-CSRF-Token required, reject missing Origin mismatch/);
    assert.equal(headerClass.retention_percent, 100);
    assert.equal(result.quality.criticalAnchorRetentionPercent, 100);
  });

  it("keeps code exports and named functions", () => {
    const source = fs.readFileSync(path.join(FIXTURE_DIR, "code-sample.mjs"), "utf8");
    const result = compressText(source, {
      label: "code-sample.mjs",
      mode: "code",
      targetPercent: 35,
      keep: ["compressText", "formatCompressionReport"]
    });

    assert.match(result.text, /export function compressText/);
    assert.match(result.text, /export function formatCompressionReport/);
    assert.ok(result.savings.percent >= 20);
    assert.notEqual(result.quality.status, "riskant");
  });

  it("does not treat routine log levels as critical code anchors", () => {
    const source = fs.readFileSync(path.join(FIXTURE_DIR, "failure-corpus", "stacktrace-cutoff.log"), "utf8");
    const result = compressText(source, {
      label: "stacktrace-cutoff.log",
      mode: "log",
      targetPercent: 35,
      keep: ["E_AUTH_104", "first failing frame: src/auth/token_service.py:117", "repeated 68 times", "refresh_token"]
    });

    assert.match(result.text, /E_AUTH_104/);
    assert.match(result.text, /first failing frame: src\/auth\/token_service\.py:117/);
    assert.match(result.text, /repeated 68 times/);
    assert.ok(result.savings.percent >= 50);
    assert.ok(result.quality.missingCriticalAnchors.every((anchor) => !["DEBUG", "INFO"].includes(anchor)));
  });
});
