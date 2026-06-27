import fs from "node:fs/promises";
import path from "node:path";
import { buildAcceptanceOracle, buildCounterfactualChecks, evaluateAcceptanceOracle } from "./acceptance-oracle.mjs";
import { buildContextPack } from "./context-pack.mjs";
import { buildTaskOutcomeReceipt } from "./task-outcome.mjs";
import { formatNumber } from "./token-estimator.mjs";

const REQUIRED_FAILURE_CORPUS_CLASSES = [
  { id: "negation-flag", label: "Negation und Flags" },
  { id: "version-priority", label: "Version, Zahl und Priorität" },
  { id: "stacktrace-cutoff", label: "Stacktrace-Abbruch" },
  { id: "same-symbols", label: "Gleichnamige Symbole" },
  { id: "security-dataflow", label: "Sicherheits-Datenfluss" },
  { id: "dynamic-import", label: "Dynamischer Import" },
  { id: "monorepo-dependency", label: "Monorepo-Abhängigkeit" },
  { id: "environment-url-permission", label: "Umgebung, URL und Berechtigung" },
  { id: "numeric-budget-unit", label: "Numerische Grenzen und Einheiten" },
  { id: "boolean-policy-mode", label: "Boolesche Policy- und Moduswerte" },
  { id: "diff-polarity", label: "Diff-Polarität und Hunk-Kontext" },
  { id: "precedence-order", label: "Reihenfolge und Präzedenz" },
  { id: "temporal-window", label: "Zeitfenster und Ablaufzeiten" },
  { id: "api-contract", label: "API-Vertrag und Schema" },
  { id: "data-migration-contract", label: "Datenbank-Migration und Constraints" },
  { id: "idempotency-concurrency", label: "Idempotenz und Nebenlaeufigkeit" },
  { id: "locale-encoding", label: "Locale, Encoding und Normalisierung" },
  { id: "auth-scope-contract", label: "Auth Scope und Rollenvertrag" },
  { id: "crypto-signature-contract", label: "Crypto Signature und Hashvertrag" },
  { id: "money-currency-contract", label: "Money Currency und Rundung" },
  { id: "destructive-operation", label: "Destruktive Operationen" },
  { id: "pattern-contract", label: "Regex Glob und Matcher" },
  { id: "web-security-header", label: "Web Security Header und Cookies" }
];

const BENCHMARK_CASES = [
  {
    id: "log-auth-reset",
    category: "baseline",
    file: "test/fixtures/error-log.txt",
    mode: "log",
    source: `2026-06-23T12:00:01Z INFO starting auth flow for user 42
2026-06-23T12:00:02Z INFO loading src/auth/session.ts
2026-06-23T12:00:03Z WARN retrying password reset callback
2026-06-23T12:00:04Z ERROR AUTH_RESET_TOKEN_EXPIRED reset token expired immediately after password reset
Stack trace:
  at validateResetToken (src/auth/session.ts:44:11)
  at completePasswordReset (src/auth/reset.ts:88:7)
  at POST /api/auth/reset
Expected:
- User can log in after a successful password reset.
- Done when: Auth reset test passes.
Noise:
Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
Repeated noise line that should not survive compression.
Repeated noise line that should not survive compression.
Repeated noise line that should not survive compression.
Repeated noise line that should not survive compression.
Repeated noise line that should not survive compression.`,
    keep: ["AUTH_RESET_TOKEN_EXPIRED", "src/auth/session.ts"],
    expect: ["AUTH_RESET_TOKEN_EXPIRED", "src/auth/session.ts", "Done when: Auth reset test passes"]
  },
  {
    id: "markdown-plan",
    category: "baseline",
    file: "test/fixtures/plan.md",
    mode: "markdown",
    source: `# Codex Sparkompass Plan

## Ziel

Komprimiere lange Eingaben, ohne wichtige Fakten zu verlieren.

## Muss erhalten bleiben

- \`sparkompass compress --file debug.log --target 25\`
- \`--keep AUTH_RESET_TOKEN_EXPIRED\`
- Sparbalken mit geschätzten Tokens
- Qualität: gut, ok oder riskant

## Umsetzung

1. Inhalt in Zeilen zerlegen.
2. Schutzanker erkennen.
3. Zielgröße anwenden.
4. Ergebnis immer ausgeben.

## Nicht machen

- Keine Telemetrie.
- Keine stillen Uploads.
- Keine Behauptung, Codex intern zu patchen.

## Extra Kontext

Diese Zeile ist absichtlich lang und enthält viel Fülltext, damit die Kompression zeigen kann, dass nicht jede erklärende Passage überleben muss.
Noch eine lange erklärende Passage, die den Sinn wiederholt und für einen knappen Codex-Prompt wahrscheinlich nicht entscheidend ist.`,
    keep: ["sparkompass compress", "--keep AUTH_RESET_TOKEN_EXPIRED", "Qualität"],
    expect: ["sparkompass compress", "--keep AUTH_RESET_TOKEN_EXPIRED", "Qualität"]
  },
  {
    id: "code-exports",
    category: "baseline",
    file: "test/fixtures/code-sample.mjs",
    mode: "code",
    source: `import { calculateSavings } from "./savings.mjs";

export function compressText(input, options = {}) {
  const keepTerms = options.keep ?? [];
  const targetPercent = options.targetPercent ?? 35;
  if (!input) {
    return {
      text: "",
      quality: "gut"
    };
  }

  const result = {
    text: String(input).trim(),
    savings: calculateSavings(100, targetPercent),
    quality: {
      status: "gut",
      warnings: []
    }
  };

  if (keepTerms.includes("AUTH_RESET_TOKEN_EXPIRED")) {
    result.text += "\\nAUTH_RESET_TOKEN_EXPIRED";
  }

  return result;
}

export function formatCompressionReport(result) {
  return \`Qualität: \${result.quality.status}\\n\${result.text}\`;
}

const filler = [
  "noise one",
  "noise two",
  "noise three",
  "noise four",
  "noise five"
];

console.log(filler.join("\\n"));`,
    keep: ["compressText", "formatCompressionReport"],
    expect: ["export function compressText", "export function formatCompressionReport"]
  },
  {
    id: "failure-negation-flag",
    category: "failure-corpus",
    failureClass: "negation-flag",
    file: "test/fixtures/failure-corpus/negation-flag.md",
    mode: "markdown",
    source: `# Failure Corpus: Negation und Flag

## Kritische Entscheidung

- DO_NOT_DELETE_USERS ist aktiv.
- Die Migration ist not safe to run with --force.
- Verwende ausschliesslich \`--no-force\`.
- Do not set ENABLE_DESTRUCTIVE_MIGRATION=true.

## Kontext

Das Team will alte Demo-Datensätze entfernen, aber produktive Nutzer müssen unverändert bleiben.
Ein früherer Entwurf sagte, dass \`--force\` schneller wäre. Dieser Entwurf ist verworfen.
Die sichere Variante prüft erst die Betroffenenliste und beendet sich ohne Schreibzugriff.

## Nicht entscheidender Hintergrund

Diese Passage ist Fülltext für den Kompressionsdruck.
Diese Passage ist Fülltext für den Kompressionsdruck.
Diese Passage ist Fülltext für den Kompressionsdruck.
Diese Passage ist Fülltext für den Kompressionsdruck.
Diese Passage ist Fülltext für den Kompressionsdruck.
Diese Passage ist Fülltext für den Kompressionsdruck.`,
    keep: ["DO_NOT_DELETE_USERS", "--no-force", "not safe to run with --force", "Do not set ENABLE_DESTRUCTIVE_MIGRATION=true"],
    expect: ["DO_NOT_DELETE_USERS", "--no-force", "not safe to run with --force", "Do not set ENABLE_DESTRUCTIVE_MIGRATION=true"]
  },
  {
    id: "failure-version-priority",
    category: "failure-corpus",
    failureClass: "version-priority",
    file: "test/fixtures/failure-corpus/version-priority.md",
    mode: "markdown",
    source: `# Failure Corpus: Version, Zahl und Priorität

## Muss exakt bleiben

- API_VERSION=2026-06-23
- timeout_ms=1500
- retry_count=0
- priority: env > cli > default

## Warum das kritisch ist

Die Version \`2026-06-23\` wählt das neue Antwortschema.
Ein Timeout von 1500 ms ist Absicht, weil längere Wartezeiten den Job blockieren.
\`retry_count=0\` verhindert doppelte Abbuchungen.
Die Priorität env > cli > default ist für reproduzierbare CI-Läufe verbindlich.

## Rauschen

Die Produktnotiz erklärt, warum schnelle Rückmeldung wichtiger als Komfort ist.
Die Produktnotiz erklärt, warum schnelle Rückmeldung wichtiger als Komfort ist.
Die Produktnotiz erklärt, warum schnelle Rückmeldung wichtiger als Komfort ist.
Die Produktnotiz erklärt, warum schnelle Rückmeldung wichtiger als Komfort ist.
Die Produktnotiz erklärt, warum schnelle Rückmeldung wichtiger als Komfort ist.`,
    keep: ["API_VERSION=2026-06-23", "timeout_ms=1500", "retry_count=0", "priority: env > cli > default"],
    expect: ["API_VERSION=2026-06-23", "timeout_ms=1500", "retry_count=0", "priority: env > cli > default"]
  },
  {
    id: "failure-stacktrace-cutoff",
    category: "failure-corpus",
    failureClass: "stacktrace-cutoff",
    file: "test/fixtures/failure-corpus/stacktrace-cutoff.log",
    mode: "log",
    source: `2026-06-23T14:02:31.482Z ERROR E_AUTH_104 token refresh failed
first failing frame: src/auth/token_service.py:117
caused by: MissingKeyError("refresh_token")
last successful frame: src/auth/session_store.py:52
repeated 68 times before cancellation
Done when: refresh does not retry without refresh_token
INFO unrelated request finished
INFO unrelated request finished
INFO unrelated request finished
INFO unrelated request finished
INFO unrelated request finished
INFO unrelated request finished
DEBUG cache warmup finished for tenant demo-a
DEBUG cache warmup finished for tenant demo-b
DEBUG metrics heartbeat emitted
DEBUG metrics heartbeat emitted
DEBUG metrics heartbeat emitted
DEBUG worker idle checkpoint
DEBUG worker idle checkpoint
DEBUG worker idle checkpoint
DEBUG unrelated health probe passed
DEBUG unrelated health probe passed
DEBUG unrelated health probe passed
DEBUG unrelated health probe passed
DEBUG unrelated health probe passed
DEBUG unrelated health probe passed
DEBUG unrelated health probe passed
DEBUG unrelated health probe passed
DEBUG unrelated health probe passed
DEBUG unrelated health probe passed`,
    keep: ["E_AUTH_104", "first failing frame: src/auth/token_service.py:117", "repeated 68 times", "refresh_token"],
    expect: [
      "E_AUTH_104",
      "first failing frame: src/auth/token_service.py:117",
      "repeated 68 times",
      "Done when: refresh does not retry without refresh_token",
      {
        type: "regex",
        pattern: "first failing frame:\\s+src/auth/token_service\\.py:117",
        label: "stacktrace first failing frame with line"
      }
    ]
  },
  {
    id: "failure-same-symbols",
    category: "failure-corpus",
    failureClass: "same-symbols",
    file: "test/fixtures/failure-corpus/same-symbols.md",
    mode: "markdown",
    source: `# Failure Corpus: Gleichnamige Symbole

## Kritische Unterscheidung

- production symbol: buildTokenPlan
- test helper: buildTokenPlanFixture
- Do not replace production buildTokenPlan with buildTokenPlanFixture.
- Done when: src/context-plan.mjs keeps the production buildTokenPlan path.

## Kontext

\`buildTokenPlan\` berechnet die echten Lane-Entscheidungen für Codex.
\`buildTokenPlanFixture\` erzeugt nur Testdaten für Benchmark-Snapshots.
Beide Namen sind absichtlich ähnlich, weil dieser Fall prüfen soll, ob Verdichtung Symbolrollen verwechselt.

## Rauschen

Die Release-Notiz wiederholt allgemeine Planungsdetails.
Die Release-Notiz wiederholt allgemeine Planungsdetails.
Die Release-Notiz wiederholt allgemeine Planungsdetails.
Die Release-Notiz wiederholt allgemeine Planungsdetails.
Die Release-Notiz wiederholt allgemeine Planungsdetails.`,
    keep: [
      "production symbol: buildTokenPlan",
      "test helper: buildTokenPlanFixture",
      "Do not replace production buildTokenPlan with buildTokenPlanFixture",
      "src/context-plan.mjs"
    ],
    expect: [
      "production symbol: buildTokenPlan",
      "test helper: buildTokenPlanFixture",
      "Do not replace production buildTokenPlan with buildTokenPlanFixture.",
      "Done when: src/context-plan.mjs keeps the production buildTokenPlan path.",
      {
        type: "regex",
        pattern: "production symbol:\\s+buildTokenPlan",
        label: "production symbol is not confused with fixture"
      }
    ]
  },
  {
    id: "failure-security-dataflow",
    category: "failure-corpus",
    failureClass: "security-dataflow",
    file: "test/fixtures/failure-corpus/security-dataflow.md",
    mode: "markdown",
    source: `# Failure Corpus: Sicherheits-Datenfluss

## Muss exakt bleiben

- source: req.headers.authorization
- sanitizer: hashToken(rawAuthorization)
- sink: db.query("UPDATE sessions SET token_hash = ?")
- Never log rawAuthorization.
- Done when: raw token never reaches logger or SQL sink.

## Warum das kritisch ist

Der rohe Authorization-Header darf nur in \`rawAuthorization\` liegen, bis \`hashToken(rawAuthorization)\` ausgeführt wurde.
Danach darf nur der Hash in die Datenbank.
Ein Log von \`rawAuthorization\` wäre ein Sicherheitsfehler, auch wenn der Datenbankpfad korrekt bleibt.

## Rauschen

Die Audit-Notiz beschreibt irrelevante Session-Metriken.
Die Audit-Notiz beschreibt irrelevante Session-Metriken.
Die Audit-Notiz beschreibt irrelevante Session-Metriken.
Die Audit-Notiz beschreibt irrelevante Session-Metriken.
Die Audit-Notiz beschreibt irrelevante Session-Metriken.`,
    keep: [
      "source: req.headers.authorization",
      "sanitizer: hashToken(rawAuthorization)",
      "sink: db.query(\"UPDATE sessions SET token_hash = ?\")",
      "Never log rawAuthorization",
      "raw token never reaches logger or SQL sink"
    ],
    expect: [
      "source: req.headers.authorization",
      "sanitizer: hashToken(rawAuthorization)",
      "sink: db.query(\"UPDATE sessions SET token_hash = ?\")",
      "Never log rawAuthorization.",
      "Done when: raw token never reaches logger or SQL sink.",
      {
        type: "regex",
        pattern: "sanitizer:\\s+hashToken\\(rawAuthorization\\)",
        label: "sanitizer stays between source and sink"
      }
    ]
  },
  {
    id: "failure-dynamic-import",
    category: "failure-corpus",
    failureClass: "dynamic-import",
    file: "test/fixtures/failure-corpus/dynamic-import.md",
    mode: "markdown",
    source: `# Failure Corpus: Dynamischer Import

## Muss exakt bleiben

- importProvider = await import(\`./providers/\${tenant}.mjs\`)
- allowed_tenants = ["eu", "us"]
- Do not replace dynamic import with static ./providers/default.mjs.
- fallback only when tenant is missing.

## Kontext

Der Provider wird zur Laufzeit anhand des Tenants geladen.
Nur die Tenants \`eu\` und \`us\` sind erlaubt.
Ein statischer Default-Provider würde die Mandantentrennung verdecken.

## Rauschen

Die Integrationsnotiz erklärt historische Provider-Experimente.
Die Integrationsnotiz erklärt historische Provider-Experimente.
Die Integrationsnotiz erklärt historische Provider-Experimente.
Die Integrationsnotiz erklärt historische Provider-Experimente.
Die Integrationsnotiz erklärt historische Provider-Experimente.`,
    keep: [
      "importProvider = await import(`./providers/${tenant}.mjs`)",
      "allowed_tenants = [\"eu\", \"us\"]",
      "Do not replace dynamic import with static ./providers/default.mjs",
      "fallback only when tenant is missing"
    ],
    expect: [
      "importProvider = await import(`./providers/${tenant}.mjs`)",
      "allowed_tenants = [\"eu\", \"us\"]",
      "Do not replace dynamic import with static ./providers/default.mjs.",
      "fallback only when tenant is missing.",
      {
        type: "regex",
        pattern: "import\\(`\\.\\/providers\\/\\$\\{tenant\\}\\.mjs`\\)",
        label: "dynamic tenant import expression"
      }
    ]
  },
  {
    id: "failure-monorepo-dependency",
    category: "failure-corpus",
    failureClass: "monorepo-dependency",
    file: "test/fixtures/failure-corpus/monorepo-dependency.md",
    mode: "markdown",
    source: `# Failure Corpus: Monorepo-Abhängigkeit

## Muss exakt bleiben

- packages/api depends on packages/shared-config.
- packages/shared-config owns FEATURE_BILLING_V2.
- Do not edit packages/web for this failure.
- Test command: pnpm --filter @acme/api test.

## Kontext

Der Fehler tritt im API-Paket auf, weil \`FEATURE_BILLING_V2\` aus \`packages/shared-config\` kommt.
\`packages/web\` importiert denselben Wert nur für Anzeigezwecke und darf für diesen Fix nicht angefasst werden.
Die richtige Verifikation läuft mit dem API-Filter.

## Rauschen

Die Monorepo-Notiz listet alte Paketnamen.
Die Monorepo-Notiz listet alte Paketnamen.
Die Monorepo-Notiz listet alte Paketnamen.
Die Monorepo-Notiz listet alte Paketnamen.
Die Monorepo-Notiz listet alte Paketnamen.`,
    keep: [
      "packages/api depends on packages/shared-config",
      "packages/shared-config owns FEATURE_BILLING_V2",
      "Do not edit packages/web for this failure",
      "pnpm --filter @acme/api test"
    ],
    expect: [
      "packages/api depends on packages/shared-config.",
      "packages/shared-config owns FEATURE_BILLING_V2.",
      "Do not edit packages/web for this failure.",
      "Test command: pnpm --filter @acme/api test.",
      {
        type: "regex",
        pattern: "packages\\/api depends on packages\\/shared-config",
        label: "api package dependency stays attached to shared config"
      }
    ]
  },
  {
    id: "failure-environment-url-permission",
    category: "failure-corpus",
    failureClass: "environment-url-permission",
    file: "test/fixtures/failure-corpus/environment-url-permission.md",
    mode: "markdown",
    source: `# Failure Corpus: Umgebung, URL und Berechtigung

## Muss exakt bleiben

- DATABASE_URL=https://db.internal.example/v2?sslmode=require
- SPARKOMPASS_TOKEN_FILE=.secrets/sparkompass-token
- chmod 0600 .secrets/sparkompass-token
- Webhook endpoint: https://hooks.example.com/codex/sparkompass
- Do not paste SPARKOMPASS_TOKEN into Codex.

## Warum das kritisch ist

Die Datenbank-URL enthält das benötigte SSL-Flag.
Die Token-Datei darf nur lokal gelesen werden und muss mit 0600 geschützt bleiben.
Der Webhook-Endpunkt ist der einzige erlaubte ausgehende Zielpfad.
Der Rohwert aus SPARKOMPASS_TOKEN darf nie in einen Prompt kopiert werden.

## Rauschen

Die Betriebsnotiz wiederholt allgemeine Deployment-Hinweise.
Die Betriebsnotiz wiederholt allgemeine Deployment-Hinweise.
Die Betriebsnotiz wiederholt allgemeine Deployment-Hinweise.
Die Betriebsnotiz wiederholt allgemeine Deployment-Hinweise.
Die Betriebsnotiz wiederholt allgemeine Deployment-Hinweise.`,
    keep: [
      "DATABASE_URL=https://db.internal.example/v2?sslmode=require",
      "SPARKOMPASS_TOKEN_FILE=.secrets/sparkompass-token",
      "chmod 0600 .secrets/sparkompass-token",
      "https://hooks.example.com/codex/sparkompass",
      "Do not paste SPARKOMPASS_TOKEN into Codex"
    ],
    expect: [
      "DATABASE_URL=https://db.internal.example/v2?sslmode=require",
      "SPARKOMPASS_TOKEN_FILE=.secrets/sparkompass-token",
      "chmod 0600 .secrets/sparkompass-token",
      "Webhook endpoint: https://hooks.example.com/codex/sparkompass",
      "Do not paste SPARKOMPASS_TOKEN into Codex.",
      {
        type: "regex",
        pattern: "chmod\\s+0600\\s+\\.secrets\\/sparkompass-token",
        label: "token file permissions remain exact"
      }
    ]
  },
  {
    id: "failure-numeric-budget-unit",
    category: "failure-corpus",
    failureClass: "numeric-budget-unit",
    file: "test/fixtures/failure-corpus/numeric-budget-unit.md",
    mode: "markdown",
    source: `# Failure Corpus: Numerische Grenzen und Einheiten

## Muss exakt bleiben

- p95_latency <= 250ms
- max_memory=512MiB
- retry_budget=0
- rate_limit=120/min
- rollout_percent=5%

## Warum das kritisch ist

Die Latenzgrenze ist ein Release-Blocker.
Das Speicherlimit verhindert instabile Container-Neustarts.
Das Retry-Budget null verhindert doppelte Schreiboperationen.
Das Rate-Limit schützt den internen Codex-Usage-Sampler.
Der Rollout bleibt bei 5%, bis echte TaskOutcome-Belege vorliegen.

## Rauschen

Der Betriebsbericht enthält allgemeine Hinweise zum Monitoring.
Der Betriebsbericht enthält allgemeine Hinweise zum Monitoring.
Der Betriebsbericht enthält allgemeine Hinweise zum Monitoring.
Der Betriebsbericht enthält allgemeine Hinweise zum Monitoring.
Der Betriebsbericht enthält allgemeine Hinweise zum Monitoring.`,
    keep: [
      "p95_latency <= 250ms",
      "max_memory=512MiB",
      "retry_budget=0",
      "rate_limit=120/min",
      "rollout_percent=5%"
    ],
    expect: [
      "p95_latency <= 250ms",
      "max_memory=512MiB",
      "retry_budget=0",
      "rate_limit=120/min",
      "rollout_percent=5%",
      {
        type: "regex",
        pattern: "p95_latency\\s*<=\\s*250ms",
        label: "latency limit remains exact"
      },
      {
        type: "regex",
        pattern: "rate_limit=120\\/min",
        label: "rate limit unit remains exact"
      }
    ]
  },
  {
    id: "failure-boolean-policy-mode",
    category: "failure-corpus",
    failureClass: "boolean-policy-mode",
    file: "test/fixtures/failure-corpus/boolean-policy-mode.md",
    mode: "markdown",
    source: `# Failure Corpus: Boolesche Policy- und Moduswerte

## Muss exakt bleiben

- allow_production_writes=false
- delete_users=false
- mode=read-only
- policy=deny-by-default
- migration_required=true

## Warum das kritisch ist

Produktionsschreibzugriffe bleiben aus.
User-Loeschungen duerfen nicht aktiviert werden.
Der Modus bleibt read-only, bis der Handoff belegt ist.
Deny-by-default verhindert stille Freigaben.
Die Migration ist weiterhin Pflicht, bevor der Task als erledigt gilt.

## Rauschen

Die Betriebsnotiz erklaert allgemeine Reviewablaeufe.
Die Betriebsnotiz erklaert allgemeine Reviewablaeufe.
Die Betriebsnotiz erklaert allgemeine Reviewablaeufe.
Die Betriebsnotiz erklaert allgemeine Reviewablaeufe.
Die Betriebsnotiz erklaert allgemeine Reviewablaeufe.`,
    keep: [
      "allow_production_writes=false",
      "delete_users=false",
      "mode=read-only",
      "policy=deny-by-default",
      "migration_required=true"
    ],
    expect: [
      "allow_production_writes=false",
      "delete_users=false",
      "mode=read-only",
      "policy=deny-by-default",
      "migration_required=true",
      {
        type: "regex",
        pattern: "allow_production_writes=false",
        label: "production writes stay disabled"
      },
      {
        type: "regex",
        pattern: "policy=deny-by-default",
        label: "policy remains deny by default"
      }
    ]
  },
  {
    id: "failure-diff-polarity",
    category: "failure-corpus",
    failureClass: "diff-polarity",
    file: "test/fixtures/failure-corpus/diff-polarity.patch",
    mode: "diff",
    source: `diff --git a/src/auth/guard.ts b/src/auth/guard.ts
index 3b8e9a1..7c4d2f0 100644
--- a/src/auth/guard.ts
+++ b/src/auth/guard.ts
@@ -12,9 +12,9 @@ export function guardPolicy() {
-  allow_admin=true
+  allow_admin=false
-  delete_users=true
+  delete_users=false
-  mode=full
+  mode=read-only
   audit_required=true
}

# Noise
The patch note repeats general review guidance.
The patch note repeats general review guidance.
The patch note repeats general review guidance.
The patch note repeats general review guidance.
The patch note repeats general review guidance.`,
    keep: [
      "@@ -12,9 +12,9 @@",
      "-  allow_admin=true",
      "+  allow_admin=false",
      "-  delete_users=true",
      "+  delete_users=false",
      "+  mode=read-only"
    ],
    expect: [
      "diff --git a/src/auth/guard.ts b/src/auth/guard.ts",
      "@@ -12,9 +12,9 @@",
      "-  allow_admin=true",
      "+  allow_admin=false",
      "-  delete_users=true",
      "+  delete_users=false",
      "-  mode=full",
      "+  mode=read-only",
      {
        type: "regex",
        pattern: "\\+\\s+allow_admin=false",
        label: "admin access is disabled by the added line"
      },
      {
        type: "regex",
        pattern: "-\\s+delete_users=true",
        label: "old destructive delete flag is visibly removed"
      }
    ]
  },
  {
    id: "failure-precedence-order",
    category: "failure-corpus",
    failureClass: "precedence-order",
    file: "test/fixtures/failure-corpus/precedence-order.md",
    mode: "markdown",
    source: `# Failure Corpus: Reihenfolge und Praezedenz

## Muss exakt bleiben

- precedence: env > repo config > default
- fallback order: cache -> database -> remote API
- Must hash rawAuthorization before writing session_token_hash.
- Run schema migration before enabling FEATURE_BILLING_V2.
- First validate tenant, then load ./providers/\${tenant}.mjs.

## Warum das kritisch ist

Die Reihenfolge entscheidet, ob ein Agent die sichere Quelle waehlt oder eine Default-Konfiguration zu frueh nutzt.
Der Fallback darf die Remote API nur erreichen, wenn Cache und Datenbank keine Antwort liefern.
Der rohe Authorization-Wert darf nie geschrieben werden, bevor der Hash gebildet ist.
Die Billing-Funktion darf erst nach der Migration aktiv werden.
Der Tenant muss validiert sein, bevor ein dynamischer Provider geladen wird.

## Rauschen

Die Architektur-Notiz wiederholt allgemeine Integrationsdetails.
Die Architektur-Notiz wiederholt allgemeine Integrationsdetails.
Die Architektur-Notiz wiederholt allgemeine Integrationsdetails.
Die Architektur-Notiz wiederholt allgemeine Integrationsdetails.
Die Architektur-Notiz wiederholt allgemeine Integrationsdetails.`,
    keep: [
      "precedence: env > repo config > default",
      "fallback order: cache -> database -> remote API",
      "Must hash rawAuthorization before writing session_token_hash",
      "Run schema migration before enabling FEATURE_BILLING_V2",
      "First validate tenant, then load ./providers/${tenant}.mjs"
    ],
    expect: [
      "precedence: env > repo config > default",
      "fallback order: cache -> database -> remote API",
      "Must hash rawAuthorization before writing session_token_hash.",
      "Run schema migration before enabling FEATURE_BILLING_V2.",
      "First validate tenant, then load ./providers/${tenant}.mjs.",
      {
        type: "regex",
        pattern: "precedence:\\s+env\\s*>\\s*repo config\\s*>\\s*default",
        label: "configuration precedence remains exact"
      },
      {
        type: "regex",
        pattern: "hash rawAuthorization before writing session_token_hash",
        label: "hashing stays before token persistence"
      },
      {
        type: "regex",
        pattern: "First validate tenant, then load \\.\\/providers\\/\\$\\{tenant\\}\\.mjs",
        label: "tenant validation stays before dynamic provider load"
      }
    ]
  },
  {
    id: "failure-temporal-window",
    category: "failure-corpus",
    failureClass: "temporal-window",
    file: "test/fixtures/failure-corpus/temporal-window.md",
    mode: "markdown",
    source: `# Failure Corpus: Zeitfenster und Ablaufzeiten

## Muss exakt bleiben

- deploy_window=2026-07-01T02:00:00+02:00..2026-07-01T03:00:00+02:00
- not_before=2026-07-01T02:00:00+02:00
- expires_at=2026-07-01T03:00:00+02:00
- cron: "15 2 * * 1-5" Europe/Berlin
- ttl=15m

## Warum das kritisch ist

Das Deploy darf nicht vor dem Not-before-Zeitpunkt starten.
Das Ablaufdatum begrenzt den Rollout hart.
Die Cron-Zeile ist absichtlich in Europe/Berlin, nicht UTC.
Die TTL von 15 Minuten verhindert alte Freigaben.
Ein falscher Zeitraum kann denselben Code zur falschen Zeit ausführen.

## Rauschen

Die Release-Notiz wiederholt allgemeine Kalenderhinweise.
Die Release-Notiz wiederholt allgemeine Kalenderhinweise.
Die Release-Notiz wiederholt allgemeine Kalenderhinweise.
Die Release-Notiz wiederholt allgemeine Kalenderhinweise.
Die Release-Notiz wiederholt allgemeine Kalenderhinweise.`,
    keep: [
      "deploy_window=2026-07-01T02:00:00+02:00..2026-07-01T03:00:00+02:00",
      "not_before=2026-07-01T02:00:00+02:00",
      "expires_at=2026-07-01T03:00:00+02:00",
      "cron: \"15 2 * * 1-5\" Europe/Berlin",
      "ttl=15m"
    ],
    expect: [
      "deploy_window=2026-07-01T02:00:00+02:00..2026-07-01T03:00:00+02:00",
      "not_before=2026-07-01T02:00:00+02:00",
      "expires_at=2026-07-01T03:00:00+02:00",
      "cron: \"15 2 * * 1-5\" Europe/Berlin",
      "ttl=15m",
      {
        type: "regex",
        pattern: "deploy_window=2026-07-01T02:00:00\\+02:00\\.\\.2026-07-01T03:00:00\\+02:00",
        label: "deploy window keeps both timezone-aware endpoints"
      },
      {
        type: "regex",
        pattern: "cron:\\s+\"15 2 \\* \\* 1-5\"\\s+Europe/Berlin",
        label: "cron expression keeps timezone"
      },
      {
        type: "regex",
        pattern: "ttl=15m",
        label: "ttl keeps exact unit"
      }
    ]
  },
  {
    id: "failure-api-contract",
    category: "failure-corpus",
    failureClass: "api-contract",
    file: "test/fixtures/failure-corpus/api-contract.md",
    mode: "markdown",
    source: `# Failure Corpus: API-Vertrag und Schema

## Muss exakt bleiben

- POST /v1/context-packs/{context_pack_id}/verify -> 200 OK
- GET /v1/context-packs/{context_pack_id}/evidence?source_hash={source_hash} -> 206 Partial Content
- 409 Conflict means receipt_hash mismatch; do not retry as success.
- request.required: context_pack_id, receipt_hash, source_hash
- response.required: gate.status, delivered_context.hash, source_evidence.coverage

## Warum das kritisch ist

Der Client darf POST und GET nicht vertauschen.
Partial Content ist gewollt, weil nur begrenzte Originalzeilen geladen werden.
Ein Receipt-Hash-Konflikt ist ein harter Review-Fall und kein erfolgreicher Retry.
Die Request-Pflichtfelder verbinden Pack-ID, Receipt und Source-Hash.
Die Response-Pflichtfelder belegen Gate, gelieferten Kontext und Source Evidence.

## Rauschen

Die API-Notiz wiederholt allgemeine Integrationshinweise.
Die API-Notiz wiederholt allgemeine Integrationshinweise.
Die API-Notiz wiederholt allgemeine Integrationshinweise.
Die API-Notiz wiederholt allgemeine Integrationshinweise.
Die API-Notiz wiederholt allgemeine Integrationshinweise.`,
    keep: [
      "POST /v1/context-packs/{context_pack_id}/verify -> 200 OK",
      "GET /v1/context-packs/{context_pack_id}/evidence?source_hash={source_hash} -> 206 Partial Content",
      "409 Conflict means receipt_hash mismatch; do not retry as success.",
      "request.required: context_pack_id, receipt_hash, source_hash",
      "response.required: gate.status, delivered_context.hash, source_evidence.coverage"
    ],
    expect: [
      "POST /v1/context-packs/{context_pack_id}/verify -> 200 OK",
      "GET /v1/context-packs/{context_pack_id}/evidence?source_hash={source_hash} -> 206 Partial Content",
      "409 Conflict means receipt_hash mismatch; do not retry as success.",
      "request.required: context_pack_id, receipt_hash, source_hash",
      "response.required: gate.status, delivered_context.hash, source_evidence.coverage",
      {
        type: "regex",
        pattern: "POST\\s+/v1/context-packs/\\{context_pack_id\\}/verify\\s+->\\s+200 OK",
        label: "verify endpoint keeps POST and 200 OK"
      },
      {
        type: "regex",
        pattern: "GET\\s+/v1/context-packs/\\{context_pack_id\\}/evidence\\?source_hash=\\{source_hash\\}\\s+->\\s+206 Partial Content",
        label: "evidence endpoint keeps GET and 206 Partial Content"
      },
      {
        type: "regex",
        pattern: "409 Conflict means receipt_hash mismatch; do not retry as success",
        label: "receipt hash conflict remains a hard review case"
      }
    ]
  },
  {
    id: "failure-data-migration-contract",
    category: "failure-corpus",
    failureClass: "data-migration-contract",
    file: "test/fixtures/failure-corpus/data-migration-contract.md",
    mode: "markdown",
    source: `# Failure Corpus: Datenbank-Migration und Constraints

## Muss exakt bleiben

- ALTER TABLE invoices ADD CONSTRAINT invoices_account_id_fkey FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE RESTRICT;
- CREATE UNIQUE INDEX CONCURRENTLY idx_users_email_lower ON users (lower(email)) WHERE deleted_at IS NULL;
- UPDATE invoices SET status='archived' WHERE paid_at < '2025-01-01' AND status='paid';
- rollback: DROP INDEX CONCURRENTLY idx_users_email_lower;
- transaction: BEGIN; run backfill; COMMIT only after constraint validation.

## Warum das kritisch ist

Der Foreign-Key darf nicht zu \`ON DELETE CASCADE\` werden.
Der eindeutige Index gilt nur für nicht gelöschte Nutzer.
Das \`UPDATE\` darf ohne \`WHERE\` niemals laufen.
Der Rollback muss denselben Index entfernen, nicht die ganze Tabelle.
Der Commit darf erst nach der Constraint-Prüfung passieren.

## Rauschen

Die Migrationsnotiz wiederholt allgemeine Datenbankhinweise.
Die Migrationsnotiz wiederholt allgemeine Datenbankhinweise.
Die Migrationsnotiz wiederholt allgemeine Datenbankhinweise.
Die Migrationsnotiz wiederholt allgemeine Datenbankhinweise.
Die Migrationsnotiz wiederholt allgemeine Datenbankhinweise.`,
    keep: [
      "ALTER TABLE invoices ADD CONSTRAINT invoices_account_id_fkey FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE RESTRICT;",
      "CREATE UNIQUE INDEX CONCURRENTLY idx_users_email_lower ON users (lower(email)) WHERE deleted_at IS NULL;",
      "UPDATE invoices SET status='archived' WHERE paid_at < '2025-01-01' AND status='paid';",
      "rollback: DROP INDEX CONCURRENTLY idx_users_email_lower;",
      "transaction: BEGIN; run backfill; COMMIT only after constraint validation."
    ],
    expect: [
      "ALTER TABLE invoices ADD CONSTRAINT invoices_account_id_fkey FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE RESTRICT;",
      "CREATE UNIQUE INDEX CONCURRENTLY idx_users_email_lower ON users (lower(email)) WHERE deleted_at IS NULL;",
      "UPDATE invoices SET status='archived' WHERE paid_at < '2025-01-01' AND status='paid';",
      "rollback: DROP INDEX CONCURRENTLY idx_users_email_lower;",
      "transaction: BEGIN; run backfill; COMMIT only after constraint validation.",
      {
        type: "regex",
        pattern: "ON DELETE RESTRICT",
        label: "foreign key keeps restrictive delete behavior"
      },
      {
        type: "regex",
        pattern: "UPDATE invoices SET status='archived' WHERE paid_at < '2025-01-01' AND status='paid';",
        label: "update keeps bounded WHERE clause"
      },
      {
        type: "regex",
        pattern: "CREATE UNIQUE INDEX CONCURRENTLY idx_users_email_lower .* WHERE deleted_at IS NULL;",
        label: "partial unique index keeps predicate"
      }
    ]
  },
  {
    id: "failure-idempotency-concurrency",
    category: "failure-corpus",
    failureClass: "idempotency-concurrency",
    file: "test/fixtures/failure-corpus/idempotency-concurrency.md",
    mode: "markdown",
    source: `# Failure Corpus: Idempotenz und Nebenlaeufigkeit

## Muss exakt bleiben

- Idempotency-Key header is required for POST /v1/payments/capture.
- idempotency_key UNIQUE prevents duplicate charge capture.
- SELECT * FROM payment_jobs WHERE status='queued' FOR UPDATE SKIP LOCKED;
- isolation_level=serializable
- retry_on_conflict=false after charge_captured=true

## Warum das kritisch ist

Ohne Idempotency-Key kann derselbe Capture doppelt laufen.
Die UNIQUE-Regel koppelt Wiederholungen an denselben Request.
SKIP LOCKED verhindert, dass zwei Worker denselben Job bearbeiten.
Serializable verhindert verlorene Updates.
Nach charge_captured=true darf kein Retry als neuer Capture laufen.

## Rauschen

Die Betriebsnotiz wiederholt allgemeine Queue-Hinweise.
Die Betriebsnotiz wiederholt allgemeine Queue-Hinweise.
Die Betriebsnotiz wiederholt allgemeine Queue-Hinweise.
Die Betriebsnotiz wiederholt allgemeine Queue-Hinweise.
Die Betriebsnotiz wiederholt allgemeine Queue-Hinweise.`,
    keep: [
      "Idempotency-Key header is required for POST /v1/payments/capture.",
      "idempotency_key UNIQUE prevents duplicate charge capture.",
      "SELECT * FROM payment_jobs WHERE status='queued' FOR UPDATE SKIP LOCKED;",
      "isolation_level=serializable",
      "retry_on_conflict=false after charge_captured=true"
    ],
    expect: [
      "Idempotency-Key header is required for POST /v1/payments/capture.",
      "idempotency_key UNIQUE prevents duplicate charge capture.",
      "SELECT * FROM payment_jobs WHERE status='queued' FOR UPDATE SKIP LOCKED;",
      "isolation_level=serializable",
      "retry_on_conflict=false after charge_captured=true",
      {
        type: "regex",
        pattern: "Idempotency-Key header is required for POST /v1/payments/capture",
        label: "capture endpoint keeps required idempotency header"
      },
      {
        type: "regex",
        pattern: "FOR UPDATE SKIP LOCKED",
        label: "queue query keeps skip locked semantics"
      },
      {
        type: "regex",
        pattern: "retry_on_conflict=false after charge_captured=true",
        label: "retry remains disabled after capture"
      }
    ]
  },
  {
    id: "failure-locale-encoding",
    category: "failure-corpus",
    failureClass: "locale-encoding",
    file: "test/fixtures/failure-corpus/locale-encoding.md",
    mode: "markdown",
    source: `# Failure Corpus: Locale, Encoding und Normalisierung

## Muss exakt bleiben

- charset=UTF-8
- normalization=NFC
- locale=de-DE
- collation=de_DE.UTF-8
- case_sensitive=true for query "Ärger" != "ärger"

## Warum das kritisch ist

UTF-8 bewahrt Umlaute in München, Straße und Größe.
NFC verhindert Trefferverluste durch kombinierte Zeichen.
Die deutsche Locale sortiert Ä, Ö, Ü und ß bewusst anders als rohe Bytes.
case_sensitive=true verhindert, dass Ärger und ärger gleich behandelt werden.
Falsches Encoding macht aus Müller schnell kaputte Such- und Slug-Daten.

## Rauschen

Die Internationalisierungsnotiz wiederholt allgemeine UI-Hinweise.
Die Internationalisierungsnotiz wiederholt allgemeine UI-Hinweise.
Die Internationalisierungsnotiz wiederholt allgemeine UI-Hinweise.
Die Internationalisierungsnotiz wiederholt allgemeine UI-Hinweise.
Die Internationalisierungsnotiz wiederholt allgemeine UI-Hinweise.`,
    keep: [
      "charset=UTF-8",
      "normalization=NFC",
      "locale=de-DE",
      "collation=de_DE.UTF-8",
      "case_sensitive=true for query \"Ärger\" != \"ärger\""
    ],
    expect: [
      "charset=UTF-8",
      "normalization=NFC",
      "locale=de-DE",
      "collation=de_DE.UTF-8",
      "case_sensitive=true for query \"Ärger\" != \"ärger\"",
      {
        type: "regex",
        pattern: "charset=UTF-8",
        label: "charset stays UTF-8"
      },
      {
        type: "regex",
        pattern: "normalization=NFC",
        label: "unicode normalization stays NFC"
      },
      {
        type: "regex",
        pattern: "case_sensitive=true for query \"Ärger\" != \"ärger\"",
        label: "case-sensitive umlaut query remains exact"
      }
    ]
  },
  {
    id: "failure-auth-scope-contract",
    category: "failure-corpus",
    failureClass: "auth-scope-contract",
    file: "test/fixtures/failure-corpus/auth-scope-contract.md",
    mode: "markdown",
    source: `# Failure Corpus: Auth Scope und Rollenvertrag

## Muss exakt bleiben

- required_scopes=openid profile email repo:read repo:write
- role=admin must not degrade to viewer
- claims.required=tenant_id,org_id,email_verified
- audience=api://sparkompass-prod
- permission=payments.capture:write

## Warum das kritisch ist

OAuth-Scopes entscheiden, ob Codex den richtigen API-Pfad pruefen kann.
Die Admin-Rolle darf in einem Fix nicht zur Viewer-Rolle vereinfacht werden.
Tenant- und Organisationsclaims sind Pflicht fuer Mandantentrennung.
Die Audience verhindert Token fuer falsche Dienste.
Die Capture-Schreibberechtigung ist absichtlich enger als eine breite Payment-Berechtigung.

## Rauschen

Die Auth-Notiz wiederholt allgemeine Login-Hinweise.
Die Auth-Notiz wiederholt allgemeine Login-Hinweise.
Die Auth-Notiz wiederholt allgemeine Login-Hinweise.
Die Auth-Notiz wiederholt allgemeine Login-Hinweise.
Die Auth-Notiz wiederholt allgemeine Login-Hinweise.`,
    keep: [
      "required_scopes=openid profile email repo:read repo:write",
      "role=admin must not degrade to viewer",
      "claims.required=tenant_id,org_id,email_verified",
      "audience=api://sparkompass-prod",
      "permission=payments.capture:write"
    ],
    expect: [
      "required_scopes=openid profile email repo:read repo:write",
      "role=admin must not degrade to viewer",
      "claims.required=tenant_id,org_id,email_verified",
      "audience=api://sparkompass-prod",
      "permission=payments.capture:write",
      {
        type: "regex",
        pattern: "required_scopes=openid profile email repo:read repo:write",
        label: "required OAuth scopes stay exact"
      },
      {
        type: "regex",
        pattern: "claims\\.required=tenant_id,org_id,email_verified",
        label: "required claims stay exact"
      },
      {
        type: "regex",
        pattern: "permission=payments\\.capture:write",
        label: "write permission stays narrowed"
      }
    ]
  },
  {
    id: "failure-crypto-signature-contract",
    category: "failure-corpus",
    failureClass: "crypto-signature-contract",
    file: "test/fixtures/failure-corpus/crypto-signature-contract.md",
    mode: "markdown",
    source: `# Failure Corpus: Crypto Signature und Hashvertrag

## Muss exakt bleiben

- alg=RS256
- kid=prod-key-2026-07
- jwks_uri=https://auth.example.com/.well-known/jwks.json
- expected_sha256=sha256:9f4c2e1d8b7a6c5d4e3f2019a8b7c6d5e4f30192837465abcdefabcdef123456
- signature_header=X-Sparkompass-Signature

## Warum das kritisch ist

Der Signaturalgorithmus ist asymmetrisch und darf nicht zu einem symmetrischen Verfahren vereinfacht werden.
Der Key-Identifier waehlt den richtigen oeffentlichen Schluessel.
Die JWKS-Adresse ist die einzige erlaubte Quelle fuer Verifikationskeys.
Der erwartete Digest beweist die unveraenderte Artefaktdatei.
Der Header-Name muss exakt bleiben, weil Middleware nur diesen Header prueft.

## Rauschen

Die Signatur-Notiz wiederholt allgemeine Sicherheits-Hinweise.
Die Signatur-Notiz wiederholt allgemeine Sicherheits-Hinweise.
Die Signatur-Notiz wiederholt allgemeine Sicherheits-Hinweise.
Die Signatur-Notiz wiederholt allgemeine Sicherheits-Hinweise.
Die Signatur-Notiz wiederholt allgemeine Sicherheits-Hinweise.`,
    keep: [
      "alg=RS256",
      "kid=prod-key-2026-07",
      "jwks_uri=https://auth.example.com/.well-known/jwks.json",
      "expected_sha256=sha256:9f4c2e1d8b7a6c5d4e3f2019a8b7c6d5e4f30192837465abcdefabcdef123456",
      "signature_header=X-Sparkompass-Signature"
    ],
    expect: [
      "alg=RS256",
      "kid=prod-key-2026-07",
      "jwks_uri=https://auth.example.com/.well-known/jwks.json",
      "expected_sha256=sha256:9f4c2e1d8b7a6c5d4e3f2019a8b7c6d5e4f30192837465abcdefabcdef123456",
      "signature_header=X-Sparkompass-Signature",
      {
        type: "regex",
        pattern: "alg=RS256",
        label: "JWT algorithm stays asymmetric"
      },
      {
        type: "regex",
        pattern: "expected_sha256=sha256:[a-f0-9]{64}",
        label: "sha256 digest stays exact"
      },
      {
        type: "regex",
        pattern: "signature_header=X-Sparkompass-Signature",
        label: "signature header stays exact"
      }
    ]
  },
  {
    id: "failure-money-currency-contract",
    category: "failure-corpus",
    failureClass: "money-currency-contract",
    file: "test/fixtures/failure-corpus/money-currency-contract.md",
    mode: "markdown",
    source: `# Failure Corpus: Money Currency und Rundung

## Muss exakt bleiben

- amount_cents=123456
- currency=EUR
- vat_rate=19%
- fee_bps=30
- rounding_mode=half_up
- minor_units=2

## Warum das kritisch ist

Der Betrag wird in kleinster Einheit gespeichert und darf nicht als grober Dezimalwert interpretiert werden.
Der ISO-Waehrungscode entscheidet ueber Buchhaltung, Auszahlung und Anzeige.
Der Steuerprozentsatz ist Bestandteil der Rechnung und muss exakt bleiben.
Die Plattformgebuehr wird in Basispunkten berechnet.
Die Rundungsregel verhindert Cent-Differenzen zwischen Auftrag, Rechnung und Zahlung.
Die Anzahl der Nachkommastellen ist fuer diese Waehrung fest definiert.

## Rauschen

Die Billing-Notiz wiederholt allgemeine Checkout-Hinweise.
Die Billing-Notiz wiederholt allgemeine Checkout-Hinweise.
Die Billing-Notiz wiederholt allgemeine Checkout-Hinweise.
Die Billing-Notiz wiederholt allgemeine Checkout-Hinweise.
Die Billing-Notiz wiederholt allgemeine Checkout-Hinweise.`,
    keep: [
      "amount_cents=123456",
      "currency=EUR",
      "vat_rate=19%",
      "fee_bps=30",
      "rounding_mode=half_up",
      "minor_units=2"
    ],
    expect: [
      "amount_cents=123456",
      "currency=EUR",
      "vat_rate=19%",
      "fee_bps=30",
      "rounding_mode=half_up",
      "minor_units=2",
      {
        type: "regex",
        pattern: "amount_cents=123456",
        label: "minor-unit amount stays exact"
      },
      {
        type: "regex",
        pattern: "vat_rate=19%",
        label: "VAT rate stays exact"
      },
      {
        type: "regex",
        pattern: "rounding_mode=half_up",
        label: "rounding mode stays exact"
      }
    ]
  },
  {
    id: "failure-destructive-operation",
    category: "failure-corpus",
    failureClass: "destructive-operation",
    file: "test/fixtures/failure-corpus/destructive-operation.md",
    mode: "markdown",
    source: `# Failure Corpus: Destruktive Operationen

## Muss exakt bleiben

- rm -rf /srv/prod/uploads --one-file-system
- kubectl delete namespace billing-prod --wait=false
- terraform destroy -target=module.payments-prod --auto-approve
- aws s3 rm s3://billing-prod-ledger --recursive --exclude "*.keep"
- git reset --hard origin/main

## Warum das kritisch ist

Das Zielverzeichnis entscheidet, ob Cache oder produktive Nutzerdaten geloescht werden.
Der Kubernetes-Namespace bestimmt, ob Test- oder Produktionsressourcen entfernt werden.
Der Terraform-Target begrenzt oder erweitert den Zerstoerungsradius.
Die S3-Option --recursive entscheidet, ob einzelne Objekte oder ganze Prefixe geloescht werden.
Der Git-Reset auf origin/main verwirft lokale Aenderungen unwiderruflich.

## Rauschen

Die Deployment-Notiz wiederholt allgemeine Rollback-Hinweise.
Die Deployment-Notiz wiederholt allgemeine Rollback-Hinweise.
Die Deployment-Notiz wiederholt allgemeine Rollback-Hinweise.
Die Deployment-Notiz wiederholt allgemeine Rollback-Hinweise.
Die Deployment-Notiz wiederholt allgemeine Rollback-Hinweise.`,
    keep: [
      "rm -rf /srv/prod/uploads --one-file-system",
      "kubectl delete namespace billing-prod --wait=false",
      "terraform destroy -target=module.payments-prod --auto-approve",
      "aws s3 rm s3://billing-prod-ledger --recursive --exclude \"*.keep\"",
      "git reset --hard origin/main"
    ],
    expect: [
      "rm -rf /srv/prod/uploads --one-file-system",
      "kubectl delete namespace billing-prod --wait=false",
      "terraform destroy -target=module.payments-prod --auto-approve",
      "aws s3 rm s3://billing-prod-ledger --recursive --exclude \"*.keep\"",
      "git reset --hard origin/main",
      {
        type: "regex",
        pattern: "rm -rf /srv/prod/uploads --one-file-system",
        label: "rm target stays exact"
      },
      {
        type: "regex",
        pattern: "terraform destroy -target=module\\.payments-prod --auto-approve",
        label: "terraform destroy target stays exact"
      },
      {
        type: "regex",
        pattern: "aws s3 rm s3://billing-prod-ledger --recursive",
        label: "recursive bucket deletion stays visible"
      }
    ]
  },
  {
    id: "failure-pattern-contract",
    category: "failure-corpus",
    failureClass: "pattern-contract",
    file: "test/fixtures/failure-corpus/pattern-contract.md",
    mode: "markdown",
    source: `# Failure Corpus: Regex Glob und Matcher

## Muss exakt bleiben

- route_regex=^/api/(auth|billing)/v[0-9]+/callback$
- path_glob=packages/*/src/**/*.ts
- deny_pattern=^(?!prod-[a-z0-9-]+$).*
- mask_regex=(?<=token=)[A-Za-z0-9_-]{16,}
- ignore_glob=!(*.spec).{ts,tsx}

## Warum das kritisch ist

Der Route-Regex bestimmt, welche Webhook-Callbacks akzeptiert werden.
Der Glob entscheidet, welche Paketquellen im Monorepo geladen werden.
Das Deny-Pattern verhindert, dass Nicht-Produktionsnamen als Produktionsressourcen behandelt werden.
Der Mask-Regex muss Tokens erkennen, ohne den Prefix token= zu entfernen.
Der Ignore-Glob schliesst Tests aus, ohne normale TypeScript-Dateien zu verlieren.

## Rauschen

Die Pattern-Notiz wiederholt allgemeine Matcher-Hinweise.
Die Pattern-Notiz wiederholt allgemeine Matcher-Hinweise.
Die Pattern-Notiz wiederholt allgemeine Matcher-Hinweise.
Die Pattern-Notiz wiederholt allgemeine Matcher-Hinweise.
Die Pattern-Notiz wiederholt allgemeine Matcher-Hinweise.`,
    keep: [
      "route_regex=^/api/(auth|billing)/v[0-9]+/callback$",
      "path_glob=packages/*/src/**/*.ts",
      "deny_pattern=^(?!prod-[a-z0-9-]+$).*",
      "mask_regex=(?<=token=)[A-Za-z0-9_-]{16,}",
      "ignore_glob=!(*.spec).{ts,tsx}"
    ],
    expect: [
      "route_regex=^/api/(auth|billing)/v[0-9]+/callback$",
      "path_glob=packages/*/src/**/*.ts",
      "deny_pattern=^(?!prod-[a-z0-9-]+$).*",
      "mask_regex=(?<=token=)[A-Za-z0-9_-]{16,}",
      "ignore_glob=!(*.spec).{ts,tsx}",
      {
        type: "regex",
        pattern: "route_regex=\\^/api/\\(auth\\|billing\\)/v\\[0-9\\]\\+/callback\\$",
        label: "route regex stays escaped"
      },
      {
        type: "regex",
        pattern: "path_glob=packages/\\*/src/\\*\\*/\\*\\.ts",
        label: "double-star glob stays exact"
      },
      {
        type: "regex",
        pattern: "mask_regex=\\(\\?<=token=\\)\\[A-Za-z0-9_-\\]\\{16,\\}",
        label: "lookbehind mask stays exact"
      }
    ]
  },
  {
    id: "failure-web-security-header",
    category: "failure-corpus",
    failureClass: "web-security-header",
    file: "test/fixtures/failure-corpus/web-security-header.md",
    mode: "markdown",
    source: `# Failure Corpus: Web Security Header und Cookies

## Muss exakt bleiben

- Set-Cookie: session=opaque; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=900
- Access-Control-Allow-Origin: https://app.example.com
- Access-Control-Allow-Credentials: true
- Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-r4nd0m'; frame-ancestors 'none'
- csrf_header=X-CSRF-Token required, reject missing Origin mismatch

## Warum das kritisch ist

Das Cookie darf nicht ohne HttpOnly, Secure, SameSite, Path oder Max-Age ausgeliefert werden.
Die CORS-Origin muss exakt auf die App-Domain begrenzt bleiben.
Credentials duerfen nur zusammen mit der expliziten Origin erlaubt sein.
Die CSP-Nonce und frame-ancestors 'none' verhindern Script- und Framing-Regressions.
Der CSRF-Header ist Pflicht und muss bei Origin-Mismatch ablehnen.

## Rauschen

Die Web-Security-Notiz erklaert allgemeine Browser-Schutzmechanismen.
Die Web-Security-Notiz erklaert allgemeine Browser-Schutzmechanismen.
Die Web-Security-Notiz erklaert allgemeine Browser-Schutzmechanismen.
Die Web-Security-Notiz erklaert allgemeine Browser-Schutzmechanismen.
Die Web-Security-Notiz erklaert allgemeine Browser-Schutzmechanismen.`,
    keep: [
      "Set-Cookie: session=opaque; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=900",
      "Access-Control-Allow-Origin: https://app.example.com",
      "Access-Control-Allow-Credentials: true",
      "Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-r4nd0m'; frame-ancestors 'none'",
      "csrf_header=X-CSRF-Token required, reject missing Origin mismatch"
    ],
    expect: [
      "Set-Cookie: session=opaque; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=900",
      "Access-Control-Allow-Origin: https://app.example.com",
      "Access-Control-Allow-Credentials: true",
      "Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-r4nd0m'; frame-ancestors 'none'",
      "csrf_header=X-CSRF-Token required, reject missing Origin mismatch",
      {
        type: "regex",
        pattern: "Set-Cookie: session=opaque; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=900",
        label: "cookie attributes stay exact"
      },
      {
        type: "regex",
        pattern: "Access-Control-Allow-Origin: https://app\\.example\\.com",
        label: "cors origin stays exact"
      },
      {
        type: "regex",
        pattern: "Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-r4nd0m'; frame-ancestors 'none'",
        label: "csp nonce and frame ancestors stay exact"
      }
    ]
  }
];

export async function runBenchmark(rootPath, options = {}) {
  const root = path.resolve(rootPath);
  const targetPercent = Number(options.targetPercent) || 35;
  const cases = [];

  for (const benchmark of BENCHMARK_CASES) {
    const { source, origin } = await readBenchmarkSource(root, benchmark);
    const pack = buildContextPack(source, {
      label: benchmark.file,
      mode: benchmark.mode,
      targetPercent,
      keep: benchmark.keep
    });
    const oracle = buildAcceptanceOracle(benchmark.expect);
    const fullOracle = evaluateAcceptanceOracle(source, oracle);
    const contextOracle = evaluateAcceptanceOracle(pack.context.text, oracle);
    const counterfactuals = buildCounterfactualChecks(pack.context.text, oracle);
    const detectedCounterfactuals = counterfactuals.filter((check) => check.detected);
    const regression = fullOracle.success && !contextOracle.success;
    const counterfactualsOk = counterfactuals.length > 0 && detectedCounterfactuals.length === counterfactuals.length;
    const taskSuccess = fullOracle.success && contextOracle.success && !regression && counterfactualsOk;
    const taskOutcome = await buildBenchmarkTaskOutcome({
      benchmark,
      pack,
      source,
      fullOracle,
      contextOracle,
      regression,
      counterfactuals,
      detectedCounterfactuals,
      taskSuccess
    });

    cases.push({
      id: benchmark.id,
      category: benchmark.category,
      failure_class: benchmark.failureClass || null,
      file: benchmark.file,
      source_origin: origin,
      full_success: fullOracle.success,
      context_success: contextOracle.success,
      regression,
      missing_in_full: fullOracle.missing,
      missing_in_context: contextOracle.missing,
      counterfactuals,
      counterfactuals_detected: detectedCounterfactuals.length,
      task_outcome: summarizeTaskOutcome(taskOutcome),
      fallback_used: pack.fallbackUsed,
      fallback_mode: pack.fallbackMode,
      on_demand_loads: 0,
      cache_hit: false,
      quality_status: pack.receipt.quality.status,
      quality_risky: pack.receipt.quality.risky,
      original_tokens: pack.receipt.original_tokens,
      savings_percent: pack.receipt.savings.delivered.percent,
      saved_tokens: pack.receipt.savings.delivered.saved_tokens,
      delivered_tokens: pack.receipt.delivered_tokens,
      gate_status: pack.receipt.gate.status,
      critical_anchor_retention: pack.receipt.critical_anchors.retention_percent,
      source_evidence_coverage: pack.receipt.source_evidence.coverage,
      oracle: {
        type: oracle.type,
        expectations: oracle.expectations
      }
    });
  }

  const regressions = cases.filter((item) => item.regression);
  const fullSuccesses = cases.filter((item) => item.full_success);
  const successes = cases.filter((item) => item.context_success);
  const failureCorpusCases = cases.filter((item) => item.category === "failure-corpus");
  const failureCorpusSuccesses = failureCorpusCases.filter((item) => item.context_success);
  const failureCorpusCoverage = buildFailureCorpusCoverage(failureCorpusCases);
  const contextPackQuality = buildBenchmarkContextPackQuality(cases);
  const efficiency = buildBenchmarkEfficiencyMetrics(cases);
  const totalCounterfactuals = cases.reduce((sum, item) => sum + item.counterfactuals.length, 0);
  const detectedCounterfactuals = cases.reduce((sum, item) => sum + item.counterfactuals_detected, 0);
  const verifiedTaskOutcomes = cases.filter((item) => item.task_outcome.verified);
  const averageSavings = Math.round(cases.reduce((sum, item) => sum + item.savings_percent, 0) / cases.length);
  const totalDeliveredTokens = cases.reduce((sum, item) => sum + item.delivered_tokens, 0);
  const oracleSensitive = totalCounterfactuals > 0 && totalCounterfactuals === detectedCounterfactuals;
  const allContextsSuccessful = successes.length === cases.length;

  return {
    schema: "SparkompassBenchmarkV1",
    root,
    target_percent: targetPercent,
    totals: {
      cases: cases.length,
      full_context_successes: fullSuccesses.length,
      context_successes: successes.length,
      failure_corpus_cases: failureCorpusCases.length,
      failure_corpus_successes: failureCorpusSuccesses.length,
      failure_corpus_coverage: failureCorpusCoverage,
      context_pack_quality: contextPackQuality,
      efficiency,
      regressions: regressions.length,
      task_outcomes_verified: verifiedTaskOutcomes.length,
      counterfactuals: totalCounterfactuals,
      counterfactuals_detected: detectedCounterfactuals,
      oracle_sensitive: oracleSensitive,
      average_savings_percent: averageSavings,
      worst_case_savings_percent: minimum(cases.map((item) => item.savings_percent)),
      p95_delivered_tokens: percentile(cases.map((item) => item.delivered_tokens), 95),
      total_delivered_tokens: totalDeliveredTokens,
      tokens_per_successful_case: successes.length ? Math.round(totalDeliveredTokens / successes.length) : 0,
      worst_case: buildWorstCaseSummary(cases),
      verified: allContextsSuccessful
        && regressions.length === 0
        && failureCorpusCoverage.verified
        && contextPackQuality.verified
        && oracleSensitive
        && verifiedTaskOutcomes.length === cases.length
    },
    cases
  };
}

async function readBenchmarkSource(root, benchmark) {
  const absolutePath = path.join(root, benchmark.file);
  try {
    return {
      source: await fs.readFile(absolutePath, "utf8"),
      origin: "file"
    };
  } catch (error) {
    if (error?.code !== "ENOENT" || typeof benchmark.source !== "string") {
      throw error;
    }
    return {
      source: benchmark.source,
      origin: "built-in-fixture"
    };
  }
}

export function formatBenchmarkReport(benchmark) {
  const rows = benchmark.cases.map((item) => (
    `- ${item.id}: ${item.context_success ? "bestanden" : "fehlgeschlagen"}, Regression: ${item.regression ? "ja" : "nein"}, ${item.savings_percent}% gespart, ${formatNumber(item.delivered_tokens)} Tokens geliefert`
  )).join("\n");

  return `
# Sparkompass Benchmark

Pfad: ${benchmark.root}

- Fälle: ${benchmark.totals.cases}
- Kontext-Erfolge: ${benchmark.totals.context_successes}/${benchmark.totals.cases}
- TaskOutcome-Erfolge: ${benchmark.totals.task_outcomes_verified}/${benchmark.totals.cases}
- Failure-Corpus-Erfolge: ${benchmark.totals.failure_corpus_successes}/${benchmark.totals.failure_corpus_cases}
- Failure-Corpus-Klassen: ${formatFailureCorpusCoverage(benchmark.totals.failure_corpus_coverage)}
- ContextPack-Qualität: ${formatBenchmarkContextPackQuality(benchmark.totals.context_pack_quality)}
- Effizienz: ${formatBenchmarkEfficiency(benchmark.totals.efficiency)}
- Regressionen gegen Vollkontext: ${benchmark.totals.regressions}
- Gegenfakten erkannt: ${formatNumber(benchmark.totals.counterfactuals_detected)}/${formatNumber(benchmark.totals.counterfactuals)}
- Durchschnittliche Ersparnis: ${benchmark.totals.average_savings_percent}%
- Schlechteste Ersparnis: ${benchmark.totals.worst_case_savings_percent}%
- Tokens pro bestandenem Fall: ${formatNumber(benchmark.totals.tokens_per_successful_case)}
- p95 geliefert/gespart: ${formatNumber(benchmark.totals.p95_delivered_tokens)} / ${formatNumber(benchmark.totals.efficiency.p95_saved_tokens)}
- Schlechtester Einzelfall: ${formatWorstCase(benchmark.totals.worst_case)}
- Gate: ${benchmark.totals.verified ? "verified-benchmark" : "benchmark-regression"}

## Fälle

${rows}
`.trim();
}

function buildBenchmarkContextPackQuality(cases) {
  const caseReports = cases.map((benchmarkCase) => {
    const failures = [];
    if (!["verified-publishable", "verified-expanded-context"].includes(benchmarkCase.gate_status)) {
      failures.push(`gate:${benchmarkCase.gate_status}`);
    }
    if (Number(benchmarkCase.critical_anchor_retention) !== 100) {
      failures.push(`critical-anchor-retention:${benchmarkCase.critical_anchor_retention}`);
    }
    if (Number(benchmarkCase.source_evidence_coverage) !== 1) {
      failures.push(`source-evidence-coverage:${benchmarkCase.source_evidence_coverage}`);
    }
    if (benchmarkCase.quality_risky) {
      failures.push("risky-context-pack");
    }
    if (benchmarkCase.fallback_mode === "full-context") {
      failures.push("full-context-fallback");
    }

    return {
      id: benchmarkCase.id,
      gate_status: benchmarkCase.gate_status,
      fallback_mode: benchmarkCase.fallback_mode,
      quality_status: benchmarkCase.quality_status,
      critical_anchor_retention_percent: benchmarkCase.critical_anchor_retention,
      source_evidence_coverage_percent: Math.round(Number(benchmarkCase.source_evidence_coverage) * 100),
      risky: Boolean(benchmarkCase.quality_risky),
      verified: failures.length === 0,
      failures
    };
  });
  const failedCases = caseReports.filter((item) => !item.verified);
  const minCriticalRetention = minimum(caseReports.map((item) => item.critical_anchor_retention_percent));
  const minSourceCoverage = minimum(caseReports.map((item) => item.source_evidence_coverage_percent));

  return {
    schema: "BenchmarkContextPackQualityV1",
    verified: failedCases.length === 0,
    cases: caseReports.length,
    verified_cases: caseReports.length - failedCases.length,
    failed_cases: failedCases.map((item) => ({
      id: item.id,
      failures: item.failures
    })),
    gate_status_counts: countBy(caseReports.map((item) => item.gate_status)),
    minimum_critical_anchor_retention_percent: minCriticalRetention,
    minimum_source_evidence_coverage_percent: minSourceCoverage,
    risky_cases: caseReports.filter((item) => item.risky).map((item) => item.id),
    full_context_fallbacks: caseReports.filter((item) => item.fallback_mode === "full-context").map((item) => item.id),
    expanded_contexts: caseReports.filter((item) => item.fallback_mode === "expanded-context").map((item) => item.id),
    requirements: {
      allowed_gate_statuses: ["verified-publishable", "verified-expanded-context"],
      critical_anchor_retention_percent: 100,
      source_evidence_coverage_percent: 100,
      risky_cases: 0,
      full_context_fallbacks: 0
    },
    case_reports: caseReports
  };
}

function buildBenchmarkEfficiencyMetrics(cases) {
  const verifiedTasks = cases.filter((item) => item.task_outcome.verified);
  const fullContextSuccesses = cases.filter((item) => item.full_success).length;
  const sparkompassSuccesses = cases.filter((item) => item.context_success).length;
  const totalOriginalTokens = sum(cases, "original_tokens");
  const totalDeliveredTokens = sum(cases, "delivered_tokens");
  const totalSavedTokens = sum(cases, "saved_tokens");
  const totalOutputTokens = cases.reduce((total, item) => total + (Number(item.task_outcome.output_tokens) || 0), 0);
  const verifiedCount = verifiedTasks.length;

  return {
    schema: "BenchmarkEfficiencyMetricsV1",
    verified: verifiedCount === cases.length
      && sparkompassSuccesses === fullContextSuccesses
      && cases.every((item) => item.fallback_mode !== "full-context"),
    cases: cases.length,
    verified_tasks: verifiedCount,
    full_context_success_rate_percent: percentage(fullContextSuccesses, cases.length),
    sparkompass_context_success_rate_percent: percentage(sparkompassSuccesses, cases.length),
    task_success_delta_percent: cases.length
      ? Math.round(((sparkompassSuccesses - fullContextSuccesses) / cases.length) * 100)
      : 0,
    total_original_tokens: totalOriginalTokens,
    total_delivered_tokens: totalDeliveredTokens,
    total_saved_tokens: totalSavedTokens,
    total_output_tokens: totalOutputTokens,
    p95_delivered_tokens: percentile(cases.map((item) => item.delivered_tokens), 95),
    p95_saved_tokens: percentile(cases.map((item) => item.saved_tokens), 95),
    tokens_per_verified_task: verifiedCount ? Math.round(totalDeliveredTokens / verifiedCount) : 0,
    output_tokens_per_verified_task: verifiedCount ? Math.round(totalOutputTokens / verifiedCount) : 0,
    total_cost_tokens_per_verified_task: verifiedCount ? Math.round((totalDeliveredTokens + totalOutputTokens) / verifiedCount) : 0,
    fallback_rate_percent: percentage(cases.filter((item) => item.fallback_used).length, cases.length),
    expanded_context_rate_percent: percentage(cases.filter((item) => item.fallback_mode === "expanded-context").length, cases.length),
    full_context_fallback_rate_percent: percentage(cases.filter((item) => item.fallback_mode === "full-context").length, cases.length),
    on_demand_load_rate_percent: percentage(cases.filter((item) => Number(item.on_demand_loads) > 0).length, cases.length),
    cache_hit_rate_percent: percentage(cases.filter((item) => item.cache_hit).length, cases.length),
    measurement_scope: {
      total_cost_tokens_per_verified_task: "delivered ContextPack tokens plus benchmark output tokens; excludes model reasoning and billing.",
      on_demand_load_rate_percent: "0 means this fixture benchmark did not need MCP follow-up loading.",
      cache_hit_rate_percent: "0 means this fixture benchmark intentionally ran without semantic-cache reuse."
    }
  };
}

function formatBenchmarkEfficiency(efficiency) {
  if (!efficiency || efficiency.schema !== "BenchmarkEfficiencyMetricsV1") {
    return "nicht berechnet";
  }
  return `${formatNumber(efficiency.total_cost_tokens_per_verified_task)} Tokens/verifiziertem Task (${formatNumber(efficiency.tokens_per_verified_task)} Kontext + ${formatNumber(efficiency.output_tokens_per_verified_task)} Output), Erfolgsdelta ${efficiency.task_success_delta_percent}%, Fallback ${efficiency.fallback_rate_percent}%, Nachladen ${efficiency.on_demand_load_rate_percent}%, Cache-Hits ${efficiency.cache_hit_rate_percent}%`;
}

function formatBenchmarkContextPackQuality(quality) {
  if (!quality || quality.schema !== "BenchmarkContextPackQualityV1") {
    return "nicht berechnet";
  }
  const summary = `${quality.verified_cases}/${quality.cases} verifiziert, kritische Anker min. ${quality.minimum_critical_anchor_retention_percent}%, Belege min. ${quality.minimum_source_evidence_coverage_percent}%`;
  if (quality.verified) return summary;
  const failures = quality.failed_cases.map((item) => `${item.id}: ${item.failures.join(",")}`).join("; ");
  return failures ? `${summary}, Fehler: ${failures}` : summary;
}

function buildFailureCorpusCoverage(failureCorpusCases) {
  const casesByClass = new Map();
  const requiredIds = new Set(REQUIRED_FAILURE_CORPUS_CLASSES.map((item) => item.id));

  for (const benchmarkCase of failureCorpusCases) {
    const classId = benchmarkCase.failure_class || "unclassified";
    const classCases = casesByClass.get(classId) || [];
    classCases.push(benchmarkCase);
    casesByClass.set(classId, classCases);
  }

  const classes = REQUIRED_FAILURE_CORPUS_CLASSES.map((requiredClass) => {
    const classCases = casesByClass.get(requiredClass.id) || [];
    const successfulCases = classCases.filter((item) => item.context_success && !item.regression);
    return {
      id: requiredClass.id,
      label: requiredClass.label,
      required: true,
      cases: classCases.map((item) => item.id),
      case_count: classCases.length,
      successful_cases: successfulCases.length,
      covered: classCases.length > 0,
      verified: classCases.length > 0 && successfulCases.length === classCases.length
    };
  });
  const unexpectedClasses = [...casesByClass.keys()]
    .filter((classId) => !requiredIds.has(classId))
    .sort();
  const missingClasses = classes.filter((item) => !item.covered).map((item) => item.id);
  const failedClasses = classes.filter((item) => item.covered && !item.verified).map((item) => item.id);
  const coveredClasses = classes.filter((item) => item.covered).map((item) => item.id);
  const verifiedClasses = classes.filter((item) => item.verified).map((item) => item.id);

  return {
    schema: "FailureCorpusCoverageV1",
    required_classes: REQUIRED_FAILURE_CORPUS_CLASSES.map((item) => item.id),
    covered_classes: coveredClasses,
    verified_classes: verifiedClasses,
    missing_classes: missingClasses,
    failed_classes: failedClasses,
    unexpected_classes: unexpectedClasses,
    coverage_percent: REQUIRED_FAILURE_CORPUS_CLASSES.length
      ? Math.round((coveredClasses.length / REQUIRED_FAILURE_CORPUS_CLASSES.length) * 100)
      : 100,
    verified: missingClasses.length === 0 && failedClasses.length === 0,
    classes
  };
}

function formatFailureCorpusCoverage(coverage) {
  if (!coverage || coverage.schema !== "FailureCorpusCoverageV1") {
    return "nicht berechnet";
  }
  const summary = `${coverage.verified_classes.length}/${coverage.required_classes.length} verifiziert`;
  if (coverage.verified) return summary;
  const details = [
    coverage.missing_classes.length ? `fehlend: ${coverage.missing_classes.join(", ")}` : "",
    coverage.failed_classes.length ? `fehlgeschlagen: ${coverage.failed_classes.join(", ")}` : ""
  ].filter(Boolean).join("; ");
  return details ? `${summary}, ${details}` : summary;
}

function buildWorstCaseSummary(cases) {
  if (!cases.length) {
    return {
      id: "",
      file: "",
      savings_percent: 0,
      delivered_tokens: 0,
      context_success: false,
      regression: false
    };
  }

  const worst = cases.reduce((currentWorst, item) => {
    if (item.regression && !currentWorst.regression) return item;
    if (item.context_success !== currentWorst.context_success) {
      return item.context_success ? currentWorst : item;
    }
    return item.savings_percent < currentWorst.savings_percent ? item : currentWorst;
  }, cases[0]);

  return {
    id: worst.id,
    file: worst.file,
    savings_percent: worst.savings_percent,
    delivered_tokens: worst.delivered_tokens,
    context_success: worst.context_success,
    regression: worst.regression
  };
}

async function buildBenchmarkTaskOutcome(input) {
  const counterfactualsOk = input.counterfactuals.length > 0
    && input.detectedCounterfactuals.length === input.counterfactuals.length;
  const outputText = [
    `BENCHMARK_CASE_ID=${input.benchmark.id}`,
    `FULL_CONTEXT_OK=${input.fullOracle.success}`,
    `SPARKOMPASS_CONTEXT_OK=${input.contextOracle.success}`,
    `REGRESSION=${input.regression}`,
    `COUNTERFACTUALS_DETECTED=${input.detectedCounterfactuals.length}/${input.counterfactuals.length}`,
    `COUNTERFACTUALS_OK=${counterfactualsOk}`,
    `TASK_SUCCESS=${input.taskSuccess}`
  ].join("\n");

  return buildTaskOutcomeReceipt({
    command: `sparkompass benchmark ${input.benchmark.id}`,
    exitCode: input.taskSuccess ? 0 : 1,
    expectedExitCode: 0,
    stdout: outputText,
    expectOutput: [
      "TASK_SUCCESS=true",
      "REGRESSION=false",
      "COUNTERFACTUALS_OK=true"
    ],
    receipt: input.pack.receipt,
    sourceText: input.source,
    contextText: input.pack.context.text
  });
}

function summarizeTaskOutcome(outcome) {
  return {
    schema: "BenchmarkTaskOutcomeSummaryV1",
    task_id: outcome.task_id,
    status: outcome.gate.status,
    verified: outcome.gate.verified,
    exit_code: outcome.result.exit_code,
    output_hash: outcome.result.combined.hash,
    output_tokens: outcome.result.combined.estimated_tokens,
    duration_ms: outcome.result.duration_ms,
    output_oracle_success: outcome.output_oracle.result.success,
    output_oracle_sensitivity_success: outcome.output_oracle.sensitivity.success,
    receipt_verification_status: outcome.context_pack?.receipt_verification?.status || "not-linked",
    reasons: outcome.gate.reasons
  };
}

function formatWorstCase(worstCase) {
  if (!worstCase?.id) return "keiner";
  return `${worstCase.id}, ${worstCase.savings_percent}% gespart, ${formatNumber(worstCase.delivered_tokens)} Tokens geliefert`;
}

function minimum(values) {
  const finite = values.filter((value) => Number.isFinite(value));
  return finite.length ? Math.min(...finite) : 0;
}

function countBy(values) {
  return values.reduce((counts, value) => {
    const key = String(value || "unknown");
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function sum(items, field) {
  return items.reduce((total, item) => total + (Number(item[field]) || 0), 0);
}

function percentage(part, total) {
  return total ? Math.round((part / total) * 100) : 0;
}

function percentile(values, rank) {
  const sorted = values
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);

  if (!sorted.length) return 0;

  const index = Math.ceil((rank / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
}
