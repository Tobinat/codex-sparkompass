import { execFile, spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { formatNumber } from "./token-estimator.mjs";

const execFileAsync = promisify(execFile);

const REQUIRED_PACKAGE_PATHS = [
  "package.json",
  "README.md",
  "LICENSE",
  "INSTALL.md",
  "CHANGELOG.md",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "bin/codex-sparkompass.mjs",
  "bin/codex-sparkompass-mcp.mjs",
  "scripts/build-plugin-dist.mjs",
  "docs/assets/sparkompass-structure.svg",
  "docs/assets/sparkompass-user-flow.svg",
  "docs/assets/sparkompass-release-gates.svg",
  "docs/assets/sparkompass-savings.svg",
  "docs/evidence.md",
  "docs/usage.md",
  "docs/publishing.md",
  "docs/releases/v0.1.0-alpha.0.md",
  "evidence/case-studies/readme-ab-v1/README.md",
  "evidence/case-studies/readme-ab-v1/raw-usage.jsonl",
  "evidence/case-studies/readme-ab-v1/compact-usage.jsonl",
  "evidence/case-studies/readme-ab-v1/comparison.json",
  "src/release-audit.mjs",
  "src/mcp-tools.mjs",
  "src/plugin-audit.mjs",
  "docs/quality-model.md",
  "docs/release-checklist.md",
  "docs/failure-corpus.md",
  ".agents/plugins/marketplace.json",
  ".agents/skills/codex-sparkompass/SKILL.md",
  "plugins/codex-sparkompass/.codex-plugin/plugin.json",
  "plugins/codex-sparkompass/.mcp.json",
  "plugins/codex-sparkompass/hooks/hooks.json",
  "plugins/codex-sparkompass/dist/sparkompass.mjs",
  "plugins/codex-sparkompass/dist/sparkompass-mcp.mjs",
  "plugins/codex-sparkompass/scripts/sparkompass.mjs",
  "plugins/codex-sparkompass/scripts/sparkompass-mcp.mjs",
  "plugins/codex-sparkompass/scripts/sparkompass-resolve.mjs",
  "plugins/codex-sparkompass/scripts/sparkompass-user-prompt-submit.mjs",
  "plugins/codex-sparkompass/skills/codex-sparkompass/SKILL.md",
  "examples/compact-prompt.txt"
];

const EXECUTABLE_PACKAGE_PATHS = [
  "bin/codex-sparkompass.mjs",
  "bin/codex-sparkompass-mcp.mjs",
  "plugins/codex-sparkompass/dist/sparkompass.mjs",
  "plugins/codex-sparkompass/dist/sparkompass-mcp.mjs",
  "plugins/codex-sparkompass/scripts/sparkompass.mjs",
  "plugins/codex-sparkompass/scripts/sparkompass-mcp.mjs",
  "plugins/codex-sparkompass/scripts/sparkompass-user-prompt-submit.mjs"
];

const FORBIDDEN_PACKAGE_PATTERNS = [
  { id: "git", regex: /^\.git\// },
  { id: "node_modules", regex: /^node_modules\// },
  { id: "test-fixtures", regex: /^(test|fixtures)\// },
  { id: "local-ledgers", regex: /^\.sparkompass\// },
  { id: "packed-tarball", regex: /^codex-sparkompass-.*\.tgz$/ },
  { id: "environment-file", regex: /(^|\/)\.env(\.|$)/ },
  { id: "os-metadata", regex: /(^|\/)\.DS_Store$/ }
];

export async function buildPackageDryRunAudit(rootPath, options = {}) {
  const root = path.resolve(rootPath || ".");
  const packageJson = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
  const pack = await runNpmPackDryRun(root, options);
  const files = Array.isArray(pack.files) ? pack.files : [];
  const filePaths = files.map((file) => normalizePackagePath(file.path));
  const fileSet = new Set(filePaths);
  const missingRequiredPaths = REQUIRED_PACKAGE_PATHS.filter((item) => !fileSet.has(item));
  const forbiddenMatches = filePaths
    .flatMap((file) => FORBIDDEN_PACKAGE_PATTERNS
      .filter((pattern) => pattern.regex.test(file))
      .map((pattern) => ({ path: file, reason: pattern.id })));
  const executableChecks = EXECUTABLE_PACKAGE_PATHS.map((file) => {
    const entry = files.find((candidate) => normalizePackagePath(candidate.path) === file);
    const mode = Number(entry?.mode || 0);
    return {
      path: file,
      mode,
      executable: Boolean(mode & 0o111)
    };
  });
  const maxPackageSizeBytes = Number(options.maxPackageSizeBytes) || 1_000_000;
  const maxUnpackedSizeBytes = Number(options.maxUnpackedSizeBytes) || 3_000_000;
  const maxFiles = Number(options.maxFiles) || 120;
  const checks = [
    check("package-name", pack.name === packageJson.name, `${pack.name || "missing"} === ${packageJson.name}`),
    check("package-version", pack.version === packageJson.version, `${pack.version || "missing"} === ${packageJson.version}`),
    check("required-files", missingRequiredPaths.length === 0, `missing=${missingRequiredPaths.join(",") || "none"}`),
    check("forbidden-files", forbiddenMatches.length === 0, `matches=${forbiddenMatches.map((item) => `${item.path}:${item.reason}`).join(",") || "none"}`),
    check("executable-bins", executableChecks.every((item) => item.executable), `missing-executable=${executableChecks.filter((item) => !item.executable).map((item) => item.path).join(",") || "none"}`),
    check("package-size-limit", Number(pack.size) > 0 && Number(pack.size) <= maxPackageSizeBytes, `${Number(pack.size) || 0}/${maxPackageSizeBytes} bytes`),
    check("unpacked-size-limit", Number(pack.unpackedSize) > 0 && Number(pack.unpackedSize) <= maxUnpackedSizeBytes, `${Number(pack.unpackedSize) || 0}/${maxUnpackedSizeBytes} bytes`),
    check("file-count-limit", Number(pack.entryCount || files.length) > 0 && Number(pack.entryCount || files.length) <= maxFiles, `${Number(pack.entryCount || files.length) || 0}/${maxFiles} files`),
    check("dry-run-artifact", !await exists(path.join(root, pack.filename || "")), `${pack.filename || "unknown"} not written`)
  ];
  const verified = checks.every((item) => item.passed);

  return {
    schema: "PackageDryRunAuditV1",
    status: verified ? "verified-package-dry-run" : "package-dry-run-needs-review",
    verified,
    root,
    generated_at: new Date().toISOString(),
    command: "npm pack --dry-run --json --ignore-scripts",
    package: {
      name: pack.name || "",
      version: pack.version || "",
      filename: pack.filename || "",
      size_bytes: Number(pack.size) || 0,
      size_kb: toKilobytes(pack.size),
      unpacked_size_bytes: Number(pack.unpackedSize) || 0,
      unpacked_size_kb: toKilobytes(pack.unpackedSize),
      file_count: Number(pack.entryCount || files.length) || 0,
      shasum: pack.shasum || "",
      integrity: pack.integrity || ""
    },
    checks,
    required_paths: {
      total: REQUIRED_PACKAGE_PATHS.length,
      missing: missingRequiredPaths
    },
    forbidden_paths: forbiddenMatches,
    executable_paths: executableChecks,
    limits: {
      max_package_size_bytes: maxPackageSizeBytes,
      max_unpacked_size_bytes: maxUnpackedSizeBytes,
      max_files: maxFiles
    },
    files: files.map((file) => ({
      path: normalizePackagePath(file.path),
      size: Number(file.size) || 0,
      mode: Number(file.mode) || 0
    })),
    caveats: [
      "This is a local npm pack dry run, not publication to npm.",
      "The command uses --ignore-scripts so prepack does not recurse into the full release check."
    ]
  };
}

export function formatPackageDryRunAudit(audit) {
  return `
# PackageDryRunAuditV1

Gate: ${audit.status}
Pfad: ${audit.root}

- Paket: ${audit.package.name}@${audit.package.version}
- Datei: ${audit.package.filename}
- Größe: ${audit.package.size_kb} kB Package, ${audit.package.unpacked_size_kb} kB entpackt
- Dateien: ${formatNumber(audit.package.file_count)}
- Pflichtpfade: ${formatNumber(audit.required_paths.total - audit.required_paths.missing.length)}/${formatNumber(audit.required_paths.total)}
- Verbotene Pfade: ${audit.forbidden_paths.length ? audit.forbidden_paths.map((item) => `${item.path}:${item.reason}`).join(", ") : "keine"}
- Ausführbare Bridge-Dateien: ${audit.executable_paths.filter((item) => item.executable).length}/${audit.executable_paths.length}

## Checks

${audit.checks.map((item) => `- ${item.passed ? "[x]" : "[ ]"} ${item.id}: ${item.evidence}`).join("\n")}

## Caveats

${audit.caveats.map((item) => `- ${item}`).join("\n")}
`.trim();
}

export async function buildPackageInstallSmokeAudit(rootPath, options = {}) {
  const root = path.resolve(rootPath || ".");
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-package-install-smoke-"));
  const packDir = path.join(tempRoot, "pack");
  const installDir = path.join(tempRoot, "install");
  const commands = [];
  const checks = [];
  const startedAt = Date.now();
  let pack = null;
  let tarballPath = "";
  let installedPackage = null;
  let benchmark = null;
  let mcpToolCount = 0;
  let mcpToolNames = [];

  try {
    await fs.mkdir(packDir, { recursive: true });
    await fs.mkdir(installDir, { recursive: true });
    await fs.writeFile(path.join(installDir, "package.json"), JSON.stringify({
      private: true,
      type: "module"
    }, null, 2), "utf8");

    const npmCommand = options.npmCommand || "npm";
    const timeoutMs = Number(options.timeoutMs) || 120_000;
    const packCommand = await runCommand(npmCommand, [
      "pack",
      "--json",
      "--ignore-scripts",
      "--pack-destination",
      packDir
    ], { cwd: root, timeoutMs });
    commands.push(commandSummary("npm-pack", packCommand));
    pack = parsePackJson(packCommand.stdout)[0] || null;
    tarballPath = pack?.filename ? path.join(packDir, pack.filename) : "";
    checks.push(check("tarball-created", Boolean(pack?.filename && await exists(tarballPath)), pack?.filename || "missing"));

    const installCommand = await runCommand(npmCommand, [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--omit=dev",
      tarballPath
    ], { cwd: installDir, timeoutMs });
    commands.push(commandSummary("npm-install", installCommand));
    checks.push(check("npm-install", installCommand.exitCode === 0, `exit=${installCommand.exitCode}`));

    const installedRoot = path.join(installDir, "node_modules/codex-sparkompass");
    installedPackage = JSON.parse(await fs.readFile(path.join(installedRoot, "package.json"), "utf8"));
    checks.push(check("installed-package-json", installedPackage.name === "codex-sparkompass", installedPackage.name || "missing"));
    const cliPath = path.join(installedRoot, "bin/codex-sparkompass.mjs");
    const mcpPath = path.join(installedRoot, "bin/codex-sparkompass-mcp.mjs");
    checks.push(check("installed-bin-files", await exists(cliPath) && await exists(mcpPath), "codex-sparkompass and mcp bins present"));

    const doctorCommand = await runCommand(process.execPath, [cliPath, "doctor"], { cwd: installDir, timeoutMs });
    commands.push(commandSummary("installed-cli-doctor", doctorCommand));
    checks.push(check("installed-cli-doctor", doctorCommand.exitCode === 0 && doctorCommand.stdout.includes("Codex Sparkompass Doctor"), `exit=${doctorCommand.exitCode}`));

    const benchmarkCommand = await runCommand(process.execPath, [cliPath, "benchmark", ".", "--json"], { cwd: installDir, timeoutMs });
    commands.push(commandSummary("installed-cli-benchmark", benchmarkCommand));
    benchmark = JSON.parse(benchmarkCommand.stdout);
    checks.push(check("installed-cli-benchmark", benchmark.totals?.verified === true, benchmark.totals?.gate || benchmark.totals?.verified ? "verified" : "needs-review"));

    const mcpCommand = await runCommand(process.execPath, [mcpPath], {
      cwd: installDir,
      timeoutMs,
      input: `${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} })}\n`
    });
    commands.push(commandSummary("installed-mcp-tools-list", mcpCommand));
    const mcpResponse = JSON.parse(mcpCommand.stdout.trim().split("\n").at(-1));
    mcpToolNames = (mcpResponse.result?.tools || []).map((tool) => tool.name);
    mcpToolCount = mcpToolNames.length;
    checks.push(check("installed-mcp-tools-list", mcpToolNames.includes("sparkompass_package_install_smoke") && mcpToolNames.includes("sparkompass_lookup"), `${mcpToolCount} tools`));
    checks.push(check("no-workspace-tarball", !await exists(path.join(root, pack?.filename || "")), `${pack?.filename || "unknown"} not written in workspace`));
  } catch (error) {
    checks.push(check("install-smoke-error", false, error?.message || String(error)));
  } finally {
    if (!options.keepTemp) {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  }

  const verified = checks.length > 0 && checks.every((item) => item.passed);

  return {
    schema: "PackageInstallSmokeAuditV1",
    status: verified ? "verified-package-install-smoke" : "package-install-smoke-needs-review",
    verified,
    root,
    generated_at: new Date().toISOString(),
    duration_ms: Date.now() - startedAt,
    command: "npm pack --ignore-scripts --pack-destination <tmp> && npm install --ignore-scripts --omit=dev <tgz>",
    package: {
      name: pack?.name || installedPackage?.name || "",
      version: pack?.version || installedPackage?.version || "",
      filename: pack?.filename || "",
      size_bytes: Number(pack?.size) || 0,
      size_kb: toKilobytes(pack?.size),
      unpacked_size_bytes: Number(pack?.unpackedSize) || 0,
      unpacked_size_kb: toKilobytes(pack?.unpackedSize),
      file_count: Number(pack?.entryCount || pack?.files?.length) || 0
    },
    installed: {
      package_name: installedPackage?.name || "",
      package_version: installedPackage?.version || "",
      cli_doctor_ok: checks.some((item) => item.id === "installed-cli-doctor" && item.passed),
      benchmark_gate: benchmark?.totals?.verified ? "verified-benchmark" : "not-verified",
      benchmark_cases: Number(benchmark?.totals?.cases) || 0,
      mcp_tool_count: mcpToolCount,
      mcp_required_tools_present: mcpToolNames.includes("sparkompass_lookup")
        && mcpToolNames.includes("sparkompass_package_audit")
        && mcpToolNames.includes("sparkompass_package_install_smoke")
    },
    checks,
    commands,
    temp: {
      retained: Boolean(options.keepTemp),
      path: options.keepTemp ? tempRoot : null
    },
    caveats: [
      "This installs the locally packed tarball into a temporary project; it is still not npm publication.",
      "The smoke uses --ignore-scripts so release checks do not recursively run during install."
    ]
  };
}

export function formatPackageInstallSmokeAudit(audit) {
  return `
# PackageInstallSmokeAuditV1

Gate: ${audit.status}
Pfad: ${audit.root}

- Paket: ${audit.package.name}@${audit.package.version}
- Tarball: ${audit.package.filename}
- Installiertes Paket: ${audit.installed.package_name}@${audit.installed.package_version}
- CLI Doctor: ${audit.installed.cli_doctor_ok ? "ok" : "needs-review"}
- Benchmark: ${audit.installed.benchmark_gate}, ${formatNumber(audit.installed.benchmark_cases)} Fälle
- MCP-Tools nach Installation: ${formatNumber(audit.installed.mcp_tool_count)}
- Dauer: ${formatNumber(audit.duration_ms)} ms

## Checks

${audit.checks.map((item) => `- ${item.passed ? "[x]" : "[ ]"} ${item.id}: ${item.evidence}`).join("\n")}

## Caveats

${audit.caveats.map((item) => `- ${item}`).join("\n")}
`.trim();
}

async function runNpmPackDryRun(root, options) {
  const args = ["pack", "--dry-run", "--json", "--ignore-scripts"];
  const npmCommand = options.npmCommand || "npm";
  const { stdout } = await execFileAsync(npmCommand, args, {
    cwd: root,
    maxBuffer: Number(options.maxBuffer) || 8 * 1024 * 1024
  });
  const payload = parsePackJson(stdout);
  const pack = payload[0];
  if (!pack || typeof pack !== "object") {
    throw new Error("npm pack dry run did not return a package entry.");
  }
  return pack;
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: {
        ...process.env,
        npm_config_audit: "false",
        npm_config_fund: "false"
      },
      stdio: ["pipe", "pipe", "pipe"]
    });
    const maxBuffer = Number(options.maxBuffer) || 8 * 1024 * 1024;
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, Number(options.timeoutMs) || 120_000);

    child.stdout.on("data", (chunk) => {
      if (stdout.length < maxBuffer) stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      if (stderr.length < maxBuffer) stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      resolve({
        command,
        args,
        cwd: options.cwd,
        exitCode: 1,
        stdout,
        stderr: `${stderr}${stderr ? "\n" : ""}${error.message}`,
        timedOut,
        durationMs: Date.now() - startedAt
      });
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      resolve({
        command,
        args,
        cwd: options.cwd,
        exitCode: Number(code),
        stdout,
        stderr,
        timedOut,
        durationMs: Date.now() - startedAt
      });
    });
    if (options.input) child.stdin.end(options.input);
    else child.stdin.end();
  });
}

function commandSummary(id, result) {
  return {
    id,
    command: [result.command, ...result.args].join(" "),
    exit_code: result.exitCode,
    duration_ms: result.durationMs,
    timed_out: result.timedOut,
    stdout_excerpt: excerpt(result.stdout),
    stderr_excerpt: excerpt(result.stderr)
  };
}

function excerpt(value) {
  const text = String(value || "").trim();
  return text.length > 400 ? `${text.slice(0, 400)}...` : text;
}

function parsePackJson(stdout) {
  const text = String(stdout || "").trim();
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start < 0 || end < start) {
    throw new Error("npm pack dry run did not return JSON.");
  }
  return JSON.parse(text.slice(start, end + 1));
}

function check(id, passed, evidence) {
  return {
    id,
    passed: Boolean(passed),
    status: passed ? "verified" : "needs-review",
    evidence
  };
}

function normalizePackagePath(value) {
  return String(value || "").replace(/\\/g, "/");
}

function toKilobytes(value) {
  return Number(((Number(value) || 0) / 1000).toFixed(1));
}

async function exists(file) {
  if (!file) return false;
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}
