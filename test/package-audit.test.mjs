import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";
import {
  buildPackageDryRunAudit,
  buildPackageInstallSmokeAudit,
  formatPackageDryRunAudit,
  formatPackageInstallSmokeAudit
} from "../src/package-audit.mjs";

describe("PackageDryRunAuditV1", () => {
  it("verifies npm pack dry-run contents without writing a tarball", async () => {
    const audit = await buildPackageDryRunAudit(".");

    assert.equal(audit.schema, "PackageDryRunAuditV1");
    assert.equal(audit.status, "verified-package-dry-run");
    assert.equal(audit.verified, true);
    assert.equal(audit.package.name, "codex-sparkompass");
    assert.equal(audit.required_paths.missing.length, 0);
    assert.equal(audit.forbidden_paths.length, 0);
    assert.ok(audit.package.size_bytes > 0);
    assert.ok(audit.package.unpacked_size_bytes > audit.package.size_bytes);
    assert.ok(audit.package.file_count > 0);
    assert.ok(audit.executable_paths.every((item) => item.executable));
    assert.ok(audit.checks.every((item) => item.status === "verified"));
    assert.equal(await fileExists(path.resolve(audit.package.filename)), false);

    const report = formatPackageDryRunAudit(audit);
    assert.match(report, /PackageDryRunAuditV1/);
    assert.match(report, /Gate: verified-package-dry-run/);
  });

  it("CLI package-audit emits JSON and exits successfully", () => {
    const result = spawnSync(process.execPath, [
      "./bin/codex-sparkompass.mjs",
      "package-audit",
      ".",
      "--json"
    ], {
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024
    });

    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.schema, "PackageDryRunAuditV1");
    assert.equal(payload.status, "verified-package-dry-run");
    assert.equal(payload.verified, true);
  });

  it("verifies a packed package through a fresh temporary install", async () => {
    const audit = await buildPackageInstallSmokeAudit(".");

    assert.equal(audit.schema, "PackageInstallSmokeAuditV1");
    assert.equal(audit.status, "verified-package-install-smoke");
    assert.equal(audit.verified, true);
    assert.equal(audit.installed.package_name, "codex-sparkompass");
    assert.equal(audit.installed.cli_doctor_ok, true);
    assert.equal(audit.installed.benchmark_gate, "verified-benchmark");
    assert.equal(audit.installed.benchmark_cases, 26);
    assert.ok(audit.installed.mcp_tool_count >= 41);
    assert.equal(audit.installed.mcp_required_tools_present, true);
    assert.ok(audit.checks.every((item) => item.status === "verified"));
    assert.equal(audit.temp.retained, false);
    assert.equal(await fileExists(path.resolve(audit.package.filename)), false);

    const report = formatPackageInstallSmokeAudit(audit);
    assert.match(report, /PackageInstallSmokeAuditV1/);
    assert.match(report, /Gate: verified-package-install-smoke/);
  });

  it("CLI package-smoke emits JSON and exits successfully", () => {
    const result = spawnSync(process.execPath, [
      "./bin/codex-sparkompass.mjs",
      "package-smoke",
      ".",
      "--json"
    ], {
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024
    });

    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.schema, "PackageInstallSmokeAuditV1");
    assert.equal(payload.status, "verified-package-install-smoke");
    assert.equal(payload.installed.cli_doctor_ok, true);
    assert.ok(payload.installed.mcp_tool_count >= 41);
  });
});

async function fileExists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}
