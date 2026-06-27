import { createHash } from "node:crypto";
import { calculateSavings, formatSavingsBar } from "./savings.mjs";
import { estimateTextStats, formatNumber } from "./token-estimator.mjs";

const DEFAULT_TARGET_PERCENT = 35;
const PATH_PATTERN = /\b(?:[\w.-]+\/)+[\w.-]+\.(?:mjs|js|ts|tsx|jsx|py|go|rs|java|json|md|yml|yaml|toml|log|txt)\b/g;
const CODE_PATTERN = /\b[A-Z][A-Z0-9_]{3,}\b/g;
const CLI_OPTION_PATTERN = /--[a-z0-9][a-z0-9-]*/ig;
const URL_PATTERN = /\bhttps?:\/\/[^\s<>"'`),]+/g;
const ENV_ASSIGNMENT_PATTERN = /\b[A-Z][A-Z0-9_]{2,}=(?:"[^"\n]{1,120}"|'[^'\n]{1,120}'|[^\s,;#)]+)\b/g;
const PERMISSION_PATTERN = /\b(?:chmod\s+[0-7]{3,4}|(?:mode|permission|permissions|chmod)\s*[:=]\s*[0-7]{3,4})\b/ig;
const NUMERIC_CONSTRAINT_PATTERN = /\b(?:(?:[a-z][\w.-]*(?:timeout|latency|retry|count|limit|budget|max|min|memory|cpu|quota|threshold|percent|rate|size|p\d{1,2})[\w.-]*)\s*(?:[:=]|<=|>=|<|>)\s*-?\d+(?:[.,]\d+)?\s*(?:ms|s|sec|seconds|m|min|h|KiB|MiB|GiB|KB|MB|GB|%|x|\/min|\/s)?|(?:timeout|latency|memory|cpu|rate[-_ ]?limit|retry(?:[_ -]?(?:count|budget))?|rollout(?:[_ -]?percent)?|budget|threshold|quota|size|p95|p99)\s*(?:von\s*)?(?:[:=]|<=|>=|<|>)?\s*-?\d+(?:[.,]\d+)?\s*(?:ms|s|sec|seconds|m|min|h|KiB|MiB|GiB|KB|MB|GB|%|x|\/min|\/s)?)\b/ig;
const CONFIG_VALUE_PATTERN = /\b(?:(?:[a-z][\w.-]*(?:allow|deny|enable|enabled|disable|disabled|required|readonly|read[_-]?only|delete|write|admin|prod|production|sandbox|mode|strategy|policy|auth|secret|token|payment|billing|migration|feature|flag)[\w.-]*)|(?:(?:allow|deny|enable|enabled|disable|disabled|required|readonly|read[_-]?only|delete|write|admin|prod|production|sandbox|mode|strategy|policy|auth|secret|token|payment|billing|migration|feature|flag)[\w.-]*))\s*(?:[:=]|=>)\s*(?:true|false|null|none|deny|allow|deny-by-default|allow-by-default|enabled|disabled|read-only|readonly|strict|careful|compact|full|bypass|lazy|production|staging|sandbox|workspace-write|yes|no)\b/ig;
const DIFF_HEADER_PATTERN = /^(?:diff --git\s+a\/\S+\s+b\/\S+|index\s+[0-9a-f]{7,}\.\.[0-9a-f]{7,}(?:\s+\d+)?|---\s+(?:a\/)?\S+|\+\+\+\s+(?:b\/)?\S+|@@\s+-\d+(?:,\d+)?\s+\+\d+(?:,\d+)?\s+@@.*)$/;
const ORDER_RULE_PATTERN = /\b(?:priority|precedence|order|fallback|before|after|first|then|finally|zuerst|danach|anschliessend|anschließend|zuletzt|prioritaet|priorität|praezedenz|präzedenz|reihenfolge|vor|nach|erst|dann)\b/i;
const TEMPORAL_KEYWORD_PATTERN = /\b(?:expires?(?:[_ -]?(?:at|in))?|expiry|not[_ -]?before|not[_ -]?after|valid[_ -]?(?:from|until)|retention(?:[_ -]?(?:until|days|hours))?|ttl|time[_ -]?to[_ -]?live|deploy[_ -]?window|maintenance[_ -]?window|window|cutoff|deadline|cron|schedule|timezone|tz|rollout[_ -]?at|run[_ -]?at)\b/i;
const TEMPORAL_DATE_PATTERN = /\b\d{4}-\d{2}-\d{2}(?:[T ][0-2]\d:[0-5]\d(?::[0-5]\d)?(?:\.\d+)?(?:Z|[+-][0-2]\d:?[0-5]\d)?)?\b/;
const TEMPORAL_DURATION_PATTERN = /\b(?:ttl|expires?_in|retention(?:_days|_hours)?|time[_ -]?to[_ -]?live|grace[_ -]?period|cooldown)\s*[:=]\s*\d+(?:[.,]\d+)?\s*(?:ms|s|sec|seconds|m|min|h|d|day|days|w|week|weeks)\b/i;
const TEMPORAL_CRON_PATTERN = /\b(?:cron|schedule)\s*[:=]\s*(?:"[^"\n]+"|'[^'\n]+'|(?:\S+\s+){4,6}\S+)(?:\s+(?:UTC|GMT|[A-Z]{2,4}|[A-Za-z_]+\/[A-Za-z_]+))?/i;
const TEMPORAL_TIMEZONE_PATTERN = /\b(?:UTC|GMT|Europe\/[A-Za-z_]+|America\/[A-Za-z_]+|Asia\/[A-Za-z_]+|Australia\/[A-Za-z_]+|[+-][0-2]\d:?[0-5]\d)\b/;
const HTTP_METHOD_ENDPOINT_PATTERN = /\b(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+\/[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%{}-]+/g;
const HTTP_STATUS_CONTRACT_PATTERN = /(?:\b(?:HTTP\s*)?[1-5]\d{2}\s+(?:OK|Created|Accepted|No Content|Partial Content|Bad Request|Unauthorized|Forbidden|Not Found|Conflict|Unprocessable Entity|Too Many Requests|Internal Server Error|Service Unavailable)\b|(?:->|\b(?:status|returns?|responds?|response(?:\s+status)?)\b)\s*[:=]?\s*(?:HTTP\s*)?[1-5]\d{2}\b)/ig;
const API_REQUIRED_FIELDS_PATTERN = /\b(?:request|response|body|schema|payload|headers?|required(?:[_ -]?fields?)?|pflichtfeld(?:er)?|must include|muss enthalten)\b.*\b[A-Za-z_][\w.-]*(?:\[\])?(?:\s*,\s*[A-Za-z_][\w.-]*(?:\[\])?)*\b/i;
const SQL_STATEMENT_PATTERN = /\b(?:BEGIN|COMMIT|ROLLBACK|ALTER\s+TABLE|CREATE\s+(?:UNIQUE\s+)?INDEX(?:\s+CONCURRENTLY)?|DROP\s+(?:INDEX|TABLE|COLUMN)|DELETE\s+FROM|UPDATE\s+[A-Za-z_][\w.]*\s+SET|INSERT\s+INTO)\b/i;
const SQL_CONSTRAINT_PATTERN = /\b(?:FOREIGN\s+KEY|REFERENCES\s+[A-Za-z_][\w.]*\s*\([^)]+\)|ON\s+DELETE\s+(?:CASCADE|RESTRICT|SET\s+NULL|NO\s+ACTION)|NOT\s+NULL|UNIQUE|CHECK\s*\(|WHERE\s+[^;\n]+)\b/i;
const SQL_ROLLBACK_PATTERN = /\brollback\s*:\s*(?:DROP|ALTER|DELETE|UPDATE|INSERT|CREATE)\b/i;
const IDEMPOTENCY_KEY_PATTERN = /\b(?:Idempotency-Key|idempotency[_-]?key|dedupe[_-]?key|request[_-]?id|correlation[_-]?id)\b/i;
const CONCURRENCY_LOCK_PATTERN = /\b(?:SELECT\b.+\bFOR UPDATE(?:\s+SKIP LOCKED)?|FOR UPDATE(?:\s+SKIP LOCKED)?|SKIP LOCKED|advisory[_-]?lock|pg_advisory_xact_lock|mutex|distributed[_-]?lock|lock[_-]?timeout|lease[_-]?(?:ttl|token)|optimistic[_-]?lock|version[_-]?check)\b/i;
const DELIVERY_GUARANTEE_PATTERN = /\b(?:isolation[_-]?level|serializable|repeatable read|read committed|retry[_-]?on[_-]?conflict|exactly[_-]?once|at[_-]?least[_-]?once|at[_-]?most[_-]?once)\b/i;
const SIDE_EFFECT_PATTERN = /\b(?:payment|payments|charge|capture|job|worker|queue|invoice|order|refund|email|webhook|migration|write|update|insert|delete|retry|duplicate|double|race|concurrent|lost update|transaction|commit|rollback|status)\b/i;
const LOCALE_ENCODING_KEY_PATTERN = /\b(?:charset|encoding|normalization|unicode[_-]?normalization|locale|collation|case[_-]?sensitive|case[_-]?folding|accent[_-]?sensitive|diacritic[_-]?sensitive)\b/i;
const LOCALE_ENCODING_VALUE_PATTERN = /\b(?:UTF-?8|NFC|NFD|NFKC|NFKD|[a-z]{2}[-_][A-Z]{2}(?:\.UTF-?8)?|case[_-]?sensitive\s*[:=]\s*(?:true|false)|case[_-]?folding\s*[:=]\s*(?:true|false)|accent[_-]?sensitive\s*[:=]\s*(?:true|false)|diacritic[_-]?sensitive\s*[:=]\s*(?:true|false))\b/i;
const UMLAUT_SAMPLE_PATTERN = /[ÄÖÜäöüß]/;
const AUTH_SCOPE_KEY_PATTERN = /\b(?:oauth[_-]?scopes?|required[_-]?scopes?|scopes?|roles?|claims?|permissions?|rbac|acl|audience|issuer|subject|tenant[_-]?id|principal|service[_-]?account|entitlements?)\b/i;
const AUTH_SCOPE_ASSIGNMENT_PATTERN = /\b(?:[a-z][\w.-]*(?:scope|role|claim|permission|audience|issuer|subject|tenant|principal|entitlement)[\w.-]*|oauth[_-]?scopes?|required[_-]?scopes?|scopes?|roles?|claims?|permissions?|aud|iss|sub|rbac|acl)\s*[:=]\s*(?:"[^"\n]{1,180}"|'[^'\n]{1,180}'|[A-Za-z0-9_./:@+-]+(?:[,\s|]+[A-Za-z0-9_./:@+-]+){0,8})\b/ig;
const CRYPTO_CONTRACT_KEY_PATTERN = /\b(?:algorithm|alg|signature|signing|verify|verification|digest|checksum|sha256|sha384|sha512|hash|hmac|mac|jwks|jwk|kid|key[_-]?id|public[_-]?key|fingerprint|certificate|cert|x509|nonce)\b/i;
const CRYPTO_CONTRACT_ASSIGNMENT_PATTERN = /\b(?:[a-z][\w.-]*(?:algorithm|signature|digest|checksum|hash|hmac|mac|jwks|jwk|kid|key[_-]?id|fingerprint|cert|nonce)[\w.-]*|alg|kid|key[_-]?id|expected[_-]?sha(?:256|384|512)|checksum|digest|fingerprint|signature[_-]?header|jwks[_-]?uri)\s*[:=]\s*(?:"[^"\n]{1,180}"|'[^'\n]{1,180}'|[A-Za-z0-9_./:@+=-]+)\b/ig;
const CRYPTO_DIGEST_PATTERN = /\b(?:sha(?:256|384|512):[a-f0-9]{16,128}|[A-Fa-f0-9]{32,128})\b/;
const MONEY_CONTRACT_KEY_PATTERN = /\b(?:amount|total|subtotal|currency|minor[_-]?units|rounding(?:[_-]?mode)?|round|price|invoice|charge|capture|refund|payment|settlement|payout|gross[_-]?(?:amount|total)|net[_-]?(?:amount|total)|tax|vat|mwst|ust|fee[_-]?bps|basis[_-]?points?|discount|fx[_-]?rate)\b/i;
const MONEY_CONTRACT_ASSIGNMENT_PATTERN = /\b(?:[a-z][\w.-]*(?:amount|total|subtotal|currency|minor[_-]?units|rounding[_-]?mode|rounding|price|invoice|charge|capture|refund|payment|settlement|payout|gross[_-]?(?:amount|total)|net[_-]?(?:amount|total)|tax|vat|mwst|ust|fee[_-]?bps|basis[_-]?points?|discount|fx[_-]?rate)[\w.-]*|amount|currency|minor[_-]?units|rounding[_-]?mode|vat[_-]?rate|tax[_-]?rate|fee[_-]?bps|fx[_-]?rate)\s*[:=]\s*(?:"[^"\n]{1,120}"|'[^'\n]{1,120}'|[A-Z]{3}|-?\d+(?:[.,]\d+)?(?:\s?(?:EUR|USD|GBP|CHF|JPY|ct|cent|cents|%|bps|bp))?|[a-z][a-z0-9_-]{2,40})\b/ig;
const MONEY_AMOUNT_PATTERN = /\b(?:(?:EUR|USD|GBP|CHF|JPY)\s?-?\d+(?:[.,]\d{2})?|-?\d+(?:[.,]\d{2})\s?(?:EUR|USD|GBP|CHF|JPY))\b/;
const DESTRUCTIVE_OPERATION_PATTERN = /\b(?:rm\s+-[a-z]*r[a-z]*f[a-z]*|rm\s+-[a-z]*f[a-z]*r[a-z]*|git\s+(?:reset\s+--hard|clean\s+-[a-z]*f[a-z]*d|push\s+--force(?:-with-lease)?)|kubectl\s+(?:delete|replace\s+--force)|helm\s+(?:uninstall|delete)|terraform\s+(?:destroy|apply\b.*\b-destroy\b)|aws\s+s3\s+rm|az\s+storage\s+blob\s+delete(?:-batch)?|gcloud\s+(?:compute\s+instances\s+delete|container\s+clusters\s+delete)|docker\s+(?:system\s+prune|volume\s+rm|container\s+rm)|DROP\s+(?:TABLE|DATABASE|SCHEMA)|TRUNCATE\s+TABLE)\b/i;
const DESTRUCTIVE_TARGET_PATTERN = /(?:\b(?:prod(?:uction)?|staging|namespace|cluster|bucket|database|schema|table|volume|branch|origin\/main|main|release|snapshot|s3:\/\/[A-Za-z0-9._~:/%+=,@-]+|gs:\/\/[A-Za-z0-9._~:/%+=,@-]+|\/[A-Za-z0-9._~:@%+=,/-]+)\b|(?:--?namespace(?:=|\s+)\S+|--?target(?:=|\s+)\S+|--?selector(?:=|\s+)\S+|--recursive|--auto-approve|--force(?:-with-lease)?|--hard|-rf|-fr|--prune)\b)/i;
const PATTERN_CONTRACT_KEY_PATTERN = /\b(?:[a-z][\w.-]*(?:regex|regexp|pattern|glob|matcher|allowlist|denylist|include|exclude|ignore|filter|mask)[\w.-]*|regex|regexp|pattern|glob|matcher|route[_-]?pattern|path[_-]?pattern|allowlist|denylist|include|exclude|ignore|filter|mask)\b/i;
const PATTERN_CONTRACT_ASSIGNMENT_PATTERN = /\b(?:[a-z][\w.-]*(?:regex|regexp|pattern|glob|matcher|allowlist|denylist|include|exclude|ignore|filter|mask)[\w.-]*|regex|regexp|pattern|glob|matcher|include|exclude|ignore|filter|mask)\s*[:=]\s*(?:"[^"\n]{1,180}"|'[^'\n]{1,180}'|\/[^\/\n]{1,160}\/[gimsuy]*|[^\s,;#]{1,180})/ig;
const PATTERN_META_PATTERN = /(?:\^|\$|\\[bBdDsSwW]|\\\.|\\\/|\\\*|\\\+|\\\?|\\\(|\\\)|\\\[|\\\]|\.\*|\.\+|\[[^\]\n]{1,80}\]|\([^)\n]{1,120}\)|\*\*|\{[^}\n]{1,80}\}|!\(|\?<=|\?<!|\?=|\?!)/;
const WEB_SECURITY_HEADER_KEY_PATTERN = /\b(?:Set-Cookie|SameSite|HttpOnly|Secure|Content-Security-Policy|Strict-Transport-Security|Access-Control-Allow-Origin|Access-Control-Allow-Credentials|Access-Control-Allow-Headers|Access-Control-Allow-Methods|X-Frame-Options|X-Content-Type-Options|Referrer-Policy|Permissions-Policy|Cross-Origin-(?:Opener|Embedder|Resource)-Policy|CSP|HSTS|CORS|CSRF|X-CSRF-Token|cookie|cookies|csrf|cors)\b/i;
const WEB_SECURITY_HEADER_ASSIGNMENT_PATTERN = /\b(?:Set-Cookie|Content-Security-Policy|Strict-Transport-Security|Access-Control-Allow-(?:Origin|Credentials|Headers|Methods)|X-Frame-Options|X-Content-Type-Options|Referrer-Policy|Permissions-Policy|Cross-Origin-(?:Opener|Embedder|Resource)-Policy|csrf[_-]?header|csrf[_-]?cookie|same[_-]?site)\s*[:=]\s*[^#\n]{1,260}/ig;
const COOKIE_ATTRIBUTE_PATTERN = /\b(?:HttpOnly|Secure|SameSite\s*=\s*(?:Strict|Lax|None)|Domain\s*=\s*[^;\s]+|Path\s*=\s*\/[^\s;]*|Max-Age\s*=\s*\d+|Expires\s*=\s*[^;\n]+)/i;
const CSP_DIRECTIVE_PATTERN = /\b(?:default-src|script-src|style-src|img-src|connect-src|frame-ancestors|base-uri|form-action|object-src)\s+[^;\n]+/i;
const CORS_ORIGIN_PATTERN = /\b(?:Access-Control-Allow-Origin|allowed[_-]?origins?|cors[_-]?origin)\s*[:=]\s*(?:https?:\/\/[^\s,;]+|\*|null)\b/i;
const CSRF_CONTRACT_PATTERN = /\b(?:csrf|xsrf|X-CSRF-Token)[\w.-]*(?:[_ -]?(?:header|cookie|token|origin|referer|same[_ -]?site))?\s*[:=]\s*[^\s,;#]+/i;
const QUOTED_PATTERN = /"([^"\n]{4,120})"|'([^'\n]{4,120})'|`([^`\n]{4,120})`/g;
const IGNORED_CODE_ANCHORS = new Set(["DEBUG", "ERROR", "FATAL", "INFO", "NOTICE", "TRACE", "WARN", "WARNING"]);
const CRITICAL_CLI_OPTIONS = new Set([
  "--dangerously",
  "--delete",
  "--force",
  "--hard",
  "--no-preserve-root",
  "--no-verify",
  "--prod",
  "--production",
  "--reset",
  "--unsafe",
  "--yes"
]);

export function compressText(input, options = {}) {
  const targetPercent = clamp(Number(options.targetPercent) || DEFAULT_TARGET_PERCENT, 10, 90);
  const label = options.label || "Eingabe";
  const keepTerms = asArray(options.keep).map(cleanInline).filter(Boolean);
  const normalized = normalizeText(input);
  const originalStats = estimateTextStats(normalized);
  const mode = options.mode && options.mode !== "auto"
    ? String(options.mode)
    : detectMode(normalized, label);

  if (!normalized) {
    return {
      label,
      mode,
      targetPercent,
      keepTerms,
      original: originalStats,
      compact: originalStats,
      savings: calculateSavings(0, 0),
      quality: buildQualityReport({
        original: "",
        compact: "",
        lines: [],
        selectedIndexes: new Set(),
        protectedIndexes: new Set(),
        keepTerms,
        targetTokens: 0,
        compactTokens: 0
      }),
      text: ""
    };
  }

  const targetTokens = Math.max(24, Math.ceil(originalStats.estimatedTokens * (targetPercent / 100)));
  const lines = normalized.split("\n");
  const protectedIndexes = findProtectedLineIndexes(lines, keepTerms, mode);
  const { selectedLines, selectedIndexes, selectedEntries } = selectImportantLines(lines, targetTokens, {
    keepTerms,
    mode,
    protectedIndexes
  });
  const selected = selectedLines;
  const compactText = selected.join("\n").trim();
  const compactStats = estimateTextStats(compactText);

  return {
    label,
    mode,
    targetPercent,
    keepTerms,
    original: originalStats,
    compact: compactStats,
    savings: calculateSavings(originalStats.estimatedTokens, compactStats.estimatedTokens),
    quality: buildQualityReport({
      original: normalized,
      compact: compactText,
      lines,
      selectedIndexes,
      selectedEntries,
      protectedIndexes,
      keepTerms,
      targetTokens,
      compactTokens: compactStats.estimatedTokens
    }),
    text: compactText
  };
}

export function formatCompressionReport(result) {
  return `
# Sparkompass Kompression

Quelle: ${result.label}
Modus: ${result.mode}
Zielgröße: ca. ${result.targetPercent}% der Ausgangsgröße
Ausgang: ca. ${formatNumber(result.original.estimatedTokens)} Tokens
Kompakt: ca. ${formatNumber(result.compact.estimatedTokens)} Tokens
Sparbalken: ${formatSavingsBar(result.savings)}

## Prüfung

- Ergebnis: ausgegeben, nicht blockiert
- Qualität: ${result.quality.status}
- Kritische Anker behalten: ${result.quality.retainedCriticalAnchors}/${result.quality.criticalAnchors} (${result.quality.criticalAnchorRetentionPercent}%)
${formatAnchorClassBreakdown(result.quality.criticalAnchorClasses)}
- Informative Anker behalten: ${result.quality.retainedInformativeAnchors}/${result.quality.informativeAnchors} (${result.quality.informativeAnchorRetentionPercent}%)
- Anker gesamt behalten: ${result.quality.retainedAnchors}/${result.quality.totalAnchors} (${result.quality.anchorRetentionPercent}%)
- Geschützte Zeilen behalten: ${result.quality.retainedProtectedLines}/${result.quality.protectedLines}
- Quellbeleg-Abdeckung: ${result.quality.sourceCoveragePercent}%
${formatWarnings(result.quality.warnings)}

## Kompakte Fassung

\`\`\`text
${result.text}
\`\`\`

Hinweis: Das ist eine heuristische Verdichtung vor dem Prompt, keine verlustfreie Kompression und keine offizielle Abrechnung.
`.trim();
}

function normalizeText(input) {
  return String(input ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .trim();
}

function selectImportantLines(lines, targetTokens, options) {
  const scored = lines.map((line, index) => ({
    index,
    line,
    score: scoreLine(line, index, options)
  }));

  const selectedIndexes = new Set();
  let tokens = 0;

  for (const item of scored.filter((entry) => options.protectedIndexes.has(entry.index))) {
    const lineTokens = estimateTextStats(item.line).estimatedTokens;
    selectedIndexes.add(item.index);
    tokens += lineTokens;
  }

  for (const item of [...scored].sort((a, b) => b.score - a.score || a.index - b.index)) {
    if (selectedIndexes.has(item.index)) continue;
    if (!item.line.trim()) continue;
    const lineTokens = estimateTextStats(item.line).estimatedTokens;
    if (tokens + lineTokens > targetTokens && selectedIndexes.size > 0) continue;
    selectedIndexes.add(item.index);
    tokens += lineTokens;
    if (tokens >= targetTokens) break;
  }

  const selectedEntries = [...selectedIndexes]
    .sort((a, b) => a - b)
    .map((index) => ({ index, line: lines[index] }))
    .filter((entry, index, selectedEntries) => !(entry.line.trim() === "" && selectedEntries[index - 1]?.line.trim() === ""));

  return {
    selectedLines: selectedEntries.map((entry) => entry.line),
    selectedIndexes,
    selectedEntries
  };
}

function scoreLine(line, index, options = {}) {
  const trimmed = line.trim();
  if (!trimmed) return 0;

  let score = Math.max(1, 6 - Math.floor(index / 80));
  if (options.protectedIndexes?.has(index)) score += 100;
  if (containsAny(trimmed, options.keepTerms ?? [])) score += 60;
  if (/^#{1,6}\s+/.test(trimmed)) score += 14;
  if (/`[^`]+`/.test(trimmed)) score += 10;
  if (/\s--[a-z0-9-]+/i.test(trimmed)) score += 8;
  if (/^[-*+]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed)) score += 8;
  if (/^(export\s+)?(async\s+)?function\s+|^(export\s+)?class\s+|^export\s+const\s+/.test(trimmed)) score += 12;
  if (/^(import|from)\s+/.test(trimmed)) score += 4;
  if (/\b(TODO|FIXME|BUG|error|failed|exception|warn|security|secret)\b/i.test(trimmed)) score += 12;
  if (/\b(Ziel|Done|Kontext|Grenzen|Tests?|Fehler|Problem|Ursache)\b/i.test(trimmed)) score += 10;
  if (PATH_PATTERN.test(trimmed)) score += 10;
  PATH_PATTERN.lastIndex = 0;
  if (hasUrlAnchor(trimmed)) score += 10;
  if (hasEnvAssignmentAnchor(trimmed)) score += 12;
  if (hasPermissionAnchor(trimmed)) score += 12;
  if (hasNumericConstraintAnchor(trimmed)) score += 10;
  if (hasConfigValueAnchor(trimmed)) score += 12;
  if (isDiffHeaderLine(trimmed)) score += 14;
  if (isCriticalDiffChangeLine(trimmed)) score += 14;
  if (isOrderRuleLine(trimmed)) score += 14;
  if (isTemporalConstraintLine(trimmed)) score += 14;
  if (isApiContractLine(trimmed)) score += 14;
  if (isDataMigrationContractLine(trimmed)) score += 14;
  if (isIdempotencyConcurrencyLine(trimmed)) score += 14;
  if (isLocaleEncodingLine(trimmed)) score += 14;
  if (isAuthScopeLine(trimmed)) score += 14;
  if (isCryptoContractLine(trimmed)) score += 14;
  if (isMoneyContractLine(trimmed)) score += 14;
  if (isDestructiveOperationLine(trimmed)) score += 14;
  if (isPatternContractLine(trimmed)) score += 14;
  if (isWebSecurityHeaderLine(trimmed)) score += 14;
  if (hasCodeAnchor(trimmed)) score += 8;
  if (/^\s*(at\s+|File\s+")/.test(line)) score += 10;
  if (/^\d{4}-\d{2}-\d{2}|^\[\d{2}:\d{2}:\d{2}/.test(trimmed)) score += 5;
  if (options.mode === "log" && /\b(error|warn|fatal|trace|stack|caused by)\b/i.test(trimmed)) score += 10;
  if (options.mode === "code" && /^(const|let|var|if|for|while|return|throw)\b/.test(trimmed)) score += 4;
  if (trimmed.length > 180) score -= 5;
  if (/^[{}[\],;]+$/.test(trimmed)) score -= 4;

  return score;
}

function findProtectedLineIndexes(lines, keepTerms, mode) {
  const protectedIndexes = new Set();

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    if (containsAny(trimmed, keepTerms)) protectedIndexes.add(index);
    if (/^#{1,6}\s+/.test(trimmed)) protectedIndexes.add(index);
    if (mode === "markdown" && /`[^`]+`/.test(trimmed)) protectedIndexes.add(index);
    if (mode === "markdown" && hasCliOption(trimmed)) protectedIndexes.add(index);
    if (/\b(error|failed|exception|fatal|panic|traceback|stack trace)\b/i.test(trimmed)) protectedIndexes.add(index);
    if (/\b(TODO|FIXME|BUG|SECURITY|SECRET)\b/.test(trimmed)) protectedIndexes.add(index);
    if (hasCriticalCliOption(trimmed)) protectedIndexes.add(index);
    if (/\b(Done when|Ziel|Problem|Ursache|Fehler|Grenzen)\b/i.test(trimmed)) protectedIndexes.add(index);
    if (PATH_PATTERN.test(trimmed)) protectedIndexes.add(index);
    PATH_PATTERN.lastIndex = 0;
    if (hasUrlAnchor(trimmed)) protectedIndexes.add(index);
    if (hasEnvAssignmentAnchor(trimmed)) protectedIndexes.add(index);
    if (hasPermissionAnchor(trimmed)) protectedIndexes.add(index);
    if (hasNumericConstraintAnchor(trimmed)) protectedIndexes.add(index);
    if (hasConfigValueAnchor(trimmed)) protectedIndexes.add(index);
    if (isDiffHeaderLine(trimmed)) protectedIndexes.add(index);
    if (isCriticalDiffChangeLine(trimmed)) protectedIndexes.add(index);
    if (isOrderRuleLine(trimmed)) protectedIndexes.add(index);
    if (isTemporalConstraintLine(trimmed)) protectedIndexes.add(index);
    if (isApiContractLine(trimmed)) protectedIndexes.add(index);
    if (isDataMigrationContractLine(trimmed)) protectedIndexes.add(index);
    if (isIdempotencyConcurrencyLine(trimmed)) protectedIndexes.add(index);
    if (isLocaleEncodingLine(trimmed)) protectedIndexes.add(index);
    if (isAuthScopeLine(trimmed)) protectedIndexes.add(index);
    if (isCryptoContractLine(trimmed)) protectedIndexes.add(index);
    if (isMoneyContractLine(trimmed)) protectedIndexes.add(index);
    if (isDestructiveOperationLine(trimmed)) protectedIndexes.add(index);
    if (isPatternContractLine(trimmed)) protectedIndexes.add(index);
    if (isWebSecurityHeaderLine(trimmed)) protectedIndexes.add(index);
    if (hasCodeAnchor(trimmed)) protectedIndexes.add(index);
    if (mode === "code" && /^(export\s+)?(async\s+)?function\s+|^(export\s+)?class\s+|^export\s+const\s+/.test(trimmed)) {
      protectedIndexes.add(index);
    }
    if (mode === "code" && /^(import|export)\b/.test(trimmed)) protectedIndexes.add(index);
    if (mode === "code" && /\b(warnings\.push|throw new|console\.|Error\()/.test(trimmed)) protectedIndexes.add(index);
  });

  return protectedIndexes;
}

function buildQualityReport({ original, compact, lines, selectedIndexes, selectedEntries = [], protectedIndexes, keepTerms, targetTokens, compactTokens }) {
  const anchorSet = extractAnchors(original, keepTerms);
  const criticalAnchors = anchorSet.filter((anchor) => anchor.critical);
  const informativeAnchors = anchorSet.filter((anchor) => !anchor.critical);
  const compactInline = cleanInline(compact);
  const compactInlineLower = compactInline.toLowerCase();
  const retainedAnchors = anchorSet.filter((anchor) => compactInline.includes(anchor.value));
  const retainedCriticalAnchors = criticalAnchors.filter((anchor) => compactInline.includes(anchor.value));
  const retainedInformativeAnchors = informativeAnchors.filter((anchor) => compactInline.includes(anchor.value));
  const anchorClasses = buildAnchorClassBreakdown(anchorSet, compactInline);
  const criticalAnchorClasses = buildAnchorClassBreakdown(criticalAnchors, compactInline);
  const missingKeepTerms = keepTerms.filter((term) => !compactInlineLower.includes(cleanInline(term).toLowerCase()));
  const retainedProtectedLines = [...protectedIndexes]
    .filter((index) => selectedIndexes.has(index))
    .length;
  const anchorRetentionPercent = anchorSet.length
    ? Math.round((retainedAnchors.length / anchorSet.length) * 100)
    : 100;
  const criticalAnchorRetentionPercent = criticalAnchors.length
    ? Math.round((retainedCriticalAnchors.length / criticalAnchors.length) * 100)
    : 100;
  const informativeAnchorRetentionPercent = informativeAnchors.length
    ? Math.round((retainedInformativeAnchors.length / informativeAnchors.length) * 100)
    : 100;
  const protectedRetentionPercent = protectedIndexes.size
    ? Math.round((retainedProtectedLines / protectedIndexes.size) * 100)
    : 100;
  const warnings = [];

  if (missingKeepTerms.length) {
    warnings.push(`Keep-Begriffe fehlen: ${missingKeepTerms.join(", ")}`);
  }
  if (criticalAnchorRetentionPercent < 100) {
    warnings.push("Kritische Anker fehlen. Verdichtung darf nicht freigegeben werden.");
  }
  if (compactTokens > targetTokens && targetTokens > 0) {
    warnings.push("Zielgröße überschritten, weil geschützte Inhalte erhalten wurden.");
  }
  if (anchorRetentionPercent < 75) {
    warnings.push("Viele erkannte Anker fehlen. Für kritische Aufgaben Original prüfen.");
  }
  if (protectedRetentionPercent < 100) {
    warnings.push("Nicht alle geschützten Zeilen wurden erhalten.");
  }

  return {
    status: classifyQuality(anchorRetentionPercent, protectedRetentionPercent, missingKeepTerms.length, criticalAnchorRetentionPercent),
    totalAnchors: anchorSet.length,
    retainedAnchors: retainedAnchors.length,
    missingAnchors: anchorSet.filter((anchor) => !compactInline.includes(anchor.value)).map((anchor) => anchor.value).slice(0, 12),
    anchorRetentionPercent,
    criticalAnchors: criticalAnchors.length,
    retainedCriticalAnchors: retainedCriticalAnchors.length,
    missingCriticalAnchors: criticalAnchors.filter((anchor) => !compactInline.includes(anchor.value)).map((anchor) => anchor.value),
    criticalAnchorRetentionPercent,
    criticalAnchorClasses,
    informativeAnchors: informativeAnchors.length,
    retainedInformativeAnchors: retainedInformativeAnchors.length,
    informativeAnchorRetentionPercent,
    anchorClasses,
    protectedLines: protectedIndexes.size,
    retainedProtectedLines,
    protectedRetentionPercent,
    sourceEvidence: buildSourceEvidence(selectedEntries),
    sourceCoveragePercent: selectedEntries.length ? 100 : (compact ? 0 : 100),
    targetExceeded: compactTokens > targetTokens && targetTokens > 0,
    inputLines: lines.length,
    outputLines: compact ? compact.split("\n").length : 0,
    warnings
  };
}

function classifyQuality(anchorRetentionPercent, protectedRetentionPercent, missingKeepCount, criticalAnchorRetentionPercent) {
  if (missingKeepCount > 0) return "riskant";
  if (criticalAnchorRetentionPercent < 100) return "riskant";
  if (protectedRetentionPercent < 100) return "riskant";
  if (anchorRetentionPercent >= 85) return "gut";
  if (anchorRetentionPercent >= 65) return "ok";
  return "riskant";
}

function extractAnchors(text, keepTerms) {
  const anchors = new Map();
  for (const keepTerm of keepTerms) {
    addAnchor(anchors, keepTerm, "keep", true);
  }
  for (const match of text.matchAll(PATH_PATTERN)) addAnchor(anchors, match[0], "path", true);
  PATH_PATTERN.lastIndex = 0;
  for (const match of text.matchAll(URL_PATTERN)) addAnchor(anchors, match[0], "url", true);
  URL_PATTERN.lastIndex = 0;
  for (const match of text.matchAll(ENV_ASSIGNMENT_PATTERN)) addAnchor(anchors, match[0], "env-var", true);
  ENV_ASSIGNMENT_PATTERN.lastIndex = 0;
  for (const match of text.matchAll(PERMISSION_PATTERN)) addAnchor(anchors, match[0], "permission", true);
  PERMISSION_PATTERN.lastIndex = 0;
  for (const match of text.matchAll(NUMERIC_CONSTRAINT_PATTERN)) addAnchor(anchors, match[0], "numeric-constraint", true);
  NUMERIC_CONSTRAINT_PATTERN.lastIndex = 0;
  for (const match of text.matchAll(CONFIG_VALUE_PATTERN)) addAnchor(anchors, match[0], "config-value", true);
  CONFIG_VALUE_PATTERN.lastIndex = 0;
  for (const match of text.matchAll(AUTH_SCOPE_ASSIGNMENT_PATTERN)) addAnchor(anchors, match[0], "auth-scope", true);
  AUTH_SCOPE_ASSIGNMENT_PATTERN.lastIndex = 0;
  for (const match of text.matchAll(CRYPTO_CONTRACT_ASSIGNMENT_PATTERN)) addAnchor(anchors, match[0], "crypto-contract", true);
  CRYPTO_CONTRACT_ASSIGNMENT_PATTERN.lastIndex = 0;
  for (const match of text.matchAll(MONEY_CONTRACT_ASSIGNMENT_PATTERN)) addAnchor(anchors, match[0], "money-contract", true);
  MONEY_CONTRACT_ASSIGNMENT_PATTERN.lastIndex = 0;
  for (const match of text.matchAll(PATTERN_CONTRACT_ASSIGNMENT_PATTERN)) {
    if (PATTERN_META_PATTERN.test(match[0])) addAnchor(anchors, match[0], "pattern-contract", true);
  }
  PATTERN_CONTRACT_ASSIGNMENT_PATTERN.lastIndex = 0;
  for (const match of text.matchAll(WEB_SECURITY_HEADER_ASSIGNMENT_PATTERN)) addAnchor(anchors, match[0], "web-security-header", true);
  WEB_SECURITY_HEADER_ASSIGNMENT_PATTERN.lastIndex = 0;
  for (const match of text.matchAll(HTTP_METHOD_ENDPOINT_PATTERN)) addAnchor(anchors, match[0], "api-contract", true);
  HTTP_METHOD_ENDPOINT_PATTERN.lastIndex = 0;
  for (const match of text.matchAll(HTTP_STATUS_CONTRACT_PATTERN)) addAnchor(anchors, match[0], "api-contract", true);
  HTTP_STATUS_CONTRACT_PATTERN.lastIndex = 0;
  for (const line of text.split(/\r\n|\r|\n/)) {
    const trimmed = cleanInline(line);
    if (isDiffHeaderLine(trimmed)) addAnchor(anchors, trimmed, "diff-marker", true);
    if (isCriticalDiffChangeLine(trimmed)) addAnchor(anchors, trimmed, "diff-change", true);
    if (isOrderRuleLine(trimmed)) addAnchor(anchors, trimmed, "order-rule", true);
    if (isTemporalConstraintLine(trimmed)) addAnchor(anchors, trimmed, "temporal-constraint", true);
    if (isApiContractLine(trimmed)) addAnchor(anchors, trimmed, "api-contract", true);
    if (isDataMigrationContractLine(trimmed)) addAnchor(anchors, trimmed, "data-migration-contract", true);
    if (isIdempotencyConcurrencyLine(trimmed)) addAnchor(anchors, trimmed, "idempotency-concurrency", true);
    if (isLocaleEncodingLine(trimmed)) addAnchor(anchors, trimmed, "locale-encoding", true);
    if (isAuthScopeLine(trimmed)) addAnchor(anchors, trimmed, "auth-scope", true);
    if (isCryptoContractLine(trimmed)) addAnchor(anchors, trimmed, "crypto-contract", true);
    if (isMoneyContractLine(trimmed)) addAnchor(anchors, trimmed, "money-contract", true);
    if (isDestructiveOperationLine(trimmed)) addAnchor(anchors, trimmed, "destructive-operation", true);
    if (isPatternContractLine(trimmed)) addAnchor(anchors, trimmed, "pattern-contract", true);
    if (isWebSecurityHeaderLine(trimmed)) addAnchor(anchors, trimmed, "web-security-header", true);
  }
  for (const match of text.matchAll(CLI_OPTION_PATTERN)) {
    addAnchor(anchors, match[0], "cli-option", isCriticalCliOption(match[0]));
  }
  CLI_OPTION_PATTERN.lastIndex = 0;
  for (const match of text.matchAll(CODE_PATTERN)) {
    if (isCodeAnchor(match[0])) addAnchor(anchors, match[0], isErrorCodeAnchor(match[0]) ? "error-code" : "code", true);
  }
  CODE_PATTERN.lastIndex = 0;
  for (const match of text.matchAll(QUOTED_PATTERN)) {
    const quoted = match[1] ?? match[2] ?? match[3];
    if (isMeaningfulAnchor(quoted)) {
      addAnchor(anchors, quoted, "quoted", false);
    }
  }

  return [...anchors.values()]
    .map((anchor) => ({ ...anchor, value: cleanInline(anchor.value) }))
    .filter((anchor) => anchor.value.length >= 3)
    .slice(0, 80);
}

function addAnchor(anchors, value, source, critical) {
  const normalized = cleanInline(value);
  if (!normalized) return;
  const existing = anchors.get(normalized);
  if (existing) {
    existing.critical = existing.critical || critical;
    if (!existing.sources.includes(source)) existing.sources.push(source);
    return;
  }
  anchors.set(normalized, {
    value: normalized,
    critical,
    sources: [source]
  });
}

function buildAnchorClassBreakdown(anchors, compact) {
  const classes = new Map();

  for (const anchor of anchors) {
    for (const source of anchor.sources) {
      const current = classes.get(source) || {
        class: source,
        total: 0,
        retained: 0,
        missing: []
      };
      current.total += 1;
      if (compact.includes(anchor.value)) {
        current.retained += 1;
      } else {
        current.missing.push(anchor.value);
      }
      classes.set(source, current);
    }
  }

  return [...classes.values()]
    .map((entry) => ({
      schema: "CriticalAnchorClassV1",
      class: entry.class,
      total: entry.total,
      retained: entry.retained,
      missing: entry.missing.slice(0, 12),
      retention_percent: entry.total ? Math.round((entry.retained / entry.total) * 100) : 100
    }))
    .sort(compareAnchorClasses);
}

function buildSourceEvidence(selectedEntries) {
  return selectedEntries.map((entry, outputIndex) => ({
    evidence_id: `ev-${String(outputIndex + 1).padStart(4, "0")}`,
    output_line: outputIndex + 1,
    source_line: entry.index + 1,
    source_hash: `sha256:${sha256(entry.line)}`,
    compression_type: "extractive",
    text: entry.line
  }));
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function isMeaningfulAnchor(value) {
  const anchor = cleanInline(value);
  if (anchor.length < 3) return false;
  if (PATH_PATTERN.test(anchor)) {
    PATH_PATTERN.lastIndex = 0;
    return true;
  }
  PATH_PATTERN.lastIndex = 0;
  if (hasUrlAnchor(anchor)) return true;
  if (hasEnvAssignmentAnchor(anchor)) return true;
  if (hasPermissionAnchor(anchor)) return true;
  if (hasNumericConstraintAnchor(anchor)) return true;
  if (hasConfigValueAnchor(anchor)) return true;
  if (isDiffHeaderLine(anchor)) return true;
  if (isCriticalDiffChangeLine(anchor)) return true;
  if (isOrderRuleLine(anchor)) return true;
  if (isTemporalConstraintLine(anchor)) return true;
  if (isApiContractLine(anchor)) return true;
  if (isDataMigrationContractLine(anchor)) return true;
  if (isIdempotencyConcurrencyLine(anchor)) return true;
  if (isLocaleEncodingLine(anchor)) return true;
  if (isAuthScopeLine(anchor)) return true;
  if (isCryptoContractLine(anchor)) return true;
  if (isMoneyContractLine(anchor)) return true;
  if (isDestructiveOperationLine(anchor)) return true;
  if (isPatternContractLine(anchor)) return true;
  if (isWebSecurityHeaderLine(anchor)) return true;
  if (hasCodeAnchor(anchor)) {
    return true;
  }
  if (/--[a-z0-9-]+/i.test(anchor)) return true;
  if (/\b(Sparbalken|Qualität|Dogfood|Codex|MCP|CLI|AGENTS\.md)\b/i.test(anchor)) return true;
  return false;
}

function detectMode(text, label) {
  const lowerLabel = label.toLowerCase();
  if (/\.(mjs|js|ts|tsx|jsx|py|go|rs|java)$/.test(lowerLabel)) return "code";
  if (/\.(log|out|err)$/.test(lowerLabel)) return "log";
  if (/\.(md|mdx)$/.test(lowerLabel)) return "markdown";
  if (/^\s*#{1,6}\s+/m.test(text)) return "markdown";
  if (/^(?:diff --git\s+a\/\S+\s+b\/\S+|@@\s+-\d+(?:,\d+)?\s+\+\d+(?:,\d+)?\s+@@)/m.test(text)) return "diff";
  if (/\b(error|warn|fatal|traceback|stack trace)\b/i.test(text)) return "log";
  if (/\b(export function|class |import .* from)\b/.test(text)) return "code";
  return "text";
}

function formatWarnings(warnings) {
  if (!warnings.length) return "- Warnungen: keine";
  return `- Warnungen:\n${warnings.map((warning) => `  - ${warning}`).join("\n")}`;
}

function formatAnchorClassBreakdown(classes = []) {
  if (!classes.length) return "- Kritische Ankerklassen: keine";
  return [
    "- Kritische Ankerklassen:",
    ...classes.map((entry) => (
      `  - ${entry.class}: ${entry.retained}/${entry.total} (${entry.retention_percent}%)`
    ))
  ].join("\n");
}

function asArray(value) {
  if (value === undefined || value === "") return [];
  return Array.isArray(value) ? value : [value];
}

function cleanInline(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function containsAny(value, terms) {
  const lower = value.toLowerCase();
  return terms.some((term) => lower.includes(term.toLowerCase()));
}

function hasCodeAnchor(value) {
  for (const match of String(value ?? "").matchAll(CODE_PATTERN)) {
    if (isCodeAnchor(match[0])) return true;
  }
  return false;
}

function hasCriticalCliOption(value) {
  for (const match of String(value ?? "").matchAll(CLI_OPTION_PATTERN)) {
    if (isCriticalCliOption(match[0])) {
      CLI_OPTION_PATTERN.lastIndex = 0;
      return true;
    }
  }
  CLI_OPTION_PATTERN.lastIndex = 0;
  return false;
}

function hasCliOption(value) {
  const matched = CLI_OPTION_PATTERN.test(String(value ?? ""));
  CLI_OPTION_PATTERN.lastIndex = 0;
  return matched;
}

function hasUrlAnchor(value) {
  const matched = URL_PATTERN.test(String(value ?? ""));
  URL_PATTERN.lastIndex = 0;
  return matched;
}

function hasEnvAssignmentAnchor(value) {
  const matched = ENV_ASSIGNMENT_PATTERN.test(String(value ?? ""));
  ENV_ASSIGNMENT_PATTERN.lastIndex = 0;
  return matched;
}

function hasPermissionAnchor(value) {
  const matched = PERMISSION_PATTERN.test(String(value ?? ""));
  PERMISSION_PATTERN.lastIndex = 0;
  return matched;
}

function hasNumericConstraintAnchor(value) {
  const matched = NUMERIC_CONSTRAINT_PATTERN.test(String(value ?? ""));
  NUMERIC_CONSTRAINT_PATTERN.lastIndex = 0;
  return matched;
}

function hasConfigValueAnchor(value) {
  const matched = CONFIG_VALUE_PATTERN.test(String(value ?? ""));
  CONFIG_VALUE_PATTERN.lastIndex = 0;
  return matched;
}

function hasAuthScopeAnchor(value) {
  const matched = AUTH_SCOPE_ASSIGNMENT_PATTERN.test(String(value ?? ""));
  AUTH_SCOPE_ASSIGNMENT_PATTERN.lastIndex = 0;
  return matched;
}

function hasCryptoContractAnchor(value) {
  const matched = CRYPTO_CONTRACT_ASSIGNMENT_PATTERN.test(String(value ?? ""));
  CRYPTO_CONTRACT_ASSIGNMENT_PATTERN.lastIndex = 0;
  return matched;
}

function hasMoneyContractAnchor(value) {
  const matched = MONEY_CONTRACT_ASSIGNMENT_PATTERN.test(String(value ?? ""));
  MONEY_CONTRACT_ASSIGNMENT_PATTERN.lastIndex = 0;
  return matched;
}

function hasPatternContractAnchor(value) {
  const matched = PATTERN_CONTRACT_ASSIGNMENT_PATTERN.test(String(value ?? ""));
  PATTERN_CONTRACT_ASSIGNMENT_PATTERN.lastIndex = 0;
  return matched;
}

function hasWebSecurityHeaderAnchor(value) {
  const matched = WEB_SECURITY_HEADER_ASSIGNMENT_PATTERN.test(String(value ?? ""));
  WEB_SECURITY_HEADER_ASSIGNMENT_PATTERN.lastIndex = 0;
  return matched;
}

function hasHttpMethodEndpointAnchor(value) {
  const matched = HTTP_METHOD_ENDPOINT_PATTERN.test(String(value ?? ""));
  HTTP_METHOD_ENDPOINT_PATTERN.lastIndex = 0;
  return matched;
}

function hasHttpStatusContractAnchor(value) {
  const matched = HTTP_STATUS_CONTRACT_PATTERN.test(String(value ?? ""));
  HTTP_STATUS_CONTRACT_PATTERN.lastIndex = 0;
  return matched;
}

function isDiffHeaderLine(value) {
  return DIFF_HEADER_PATTERN.test(String(value ?? "").trim());
}

function isCriticalDiffChangeLine(value) {
  const line = String(value ?? "").trim();
  if (!/^[+-]/.test(line) || /^(?:\+\+\+|---)\s/.test(line)) return false;
  const payload = line.slice(1).trim();
  if (!payload) return false;
  if (hasUrlAnchor(payload)) return true;
  if (hasEnvAssignmentAnchor(payload)) return true;
  if (hasPermissionAnchor(payload)) return true;
  if (hasNumericConstraintAnchor(payload)) return true;
  if (hasConfigValueAnchor(payload)) return true;
  if (isDataMigrationContractLine(payload)) return true;
  if (isIdempotencyConcurrencyLine(payload)) return true;
  if (isLocaleEncodingLine(payload)) return true;
  if (isAuthScopeLine(payload)) return true;
  if (isCryptoContractLine(payload)) return true;
  if (isMoneyContractLine(payload)) return true;
  if (isDestructiveOperationLine(payload)) return true;
  if (isPatternContractLine(payload)) return true;
  if (isWebSecurityHeaderLine(payload)) return true;
  if (hasCriticalCliOption(payload)) return true;
  if (PATH_PATTERN.test(payload)) {
    PATH_PATTERN.lastIndex = 0;
    return true;
  }
  PATH_PATTERN.lastIndex = 0;
  if (hasCodeAnchor(payload) && /\b(?:allow|deny|enable|disable|required|delete|write|admin|auth|secret|token|permission|policy|mode|guard|migration)\w*/i.test(payload)) return true;
  return false;
}

function isOrderRuleLine(value) {
  const line = cleanInline(value);
  if (line.length < 8 || line.length > 220) return false;
  if (!ORDER_RULE_PATTERN.test(line)) return false;
  if (/\b(?:priority|precedence|prioritaet|priorität|praezedenz|präzedenz|reihenfolge|order)\s*[:=]\s*.+(?:>|->|before|after|then|first|zuerst|danach|dann|vor|nach)\b/i.test(line)) return true;
  if (/\b(?:fallback|fallbacks?)\b.*(?:>|->|\bthen\b|\bfirst\b|\bzuerst\b|\bdanach\b|\bdann\b)/i.test(line)) return true;
  if (/\b(?:first|zuerst|erst)\b.*\b(?:then|danach|anschliessend|anschließend|dann)\b/i.test(line)) return true;
  if (/\b(?:must|muss|run|execute|apply|invalidate|write|read|check|load|delete|rotate|hash|commit|deploy|send|save|pruefe|prüfe|lade|speichere|schreibe)\b.*\b(?:before|after|then|first|zuerst|danach|anschliessend|anschließend|dann|vor|nach|erst)\b/i.test(line)) return true;
  if (/\b(?:env|environment|cli|repo config|config|default|runtime|tenant|workspace|user|system)\b\s*(?:>|->)\s*\b/i.test(line)) return true;
  if (/^\d+\.\s+/.test(line) && /\b(?:before|after|then|zuerst|danach|dann|vor|nach|erst)\b/i.test(line)) return true;
  return false;
}

function isTemporalConstraintLine(value) {
  const line = cleanInline(value);
  if (line.length < 8 || line.length > 220) return false;
  if (!TEMPORAL_KEYWORD_PATTERN.test(line)) return false;
  if (TEMPORAL_DATE_PATTERN.test(line)) return true;
  if (TEMPORAL_DURATION_PATTERN.test(line)) return true;
  if (TEMPORAL_CRON_PATTERN.test(line)) return true;
  if (/\b(?:timezone|tz)\s*[:=]\s*(?:UTC|GMT|[A-Z]{2,4}|[A-Za-z_]+\/[A-Za-z_]+|[+-][0-2]\d:?[0-5]\d)\b/i.test(line)) return true;
  if (TEMPORAL_TIMEZONE_PATTERN.test(line) && /\b(?:cron|schedule|window|deadline|cutoff|expires?|not[_ -]?before|not[_ -]?after)\b/i.test(line)) return true;
  return false;
}

function isApiContractLine(value) {
  const line = cleanInline(value);
  if (line.length < 8 || line.length > 260) return false;
  if (hasHttpMethodEndpointAnchor(line)) return true;
  if (hasHttpStatusContractAnchor(line) && /\b(?:means|retry|success|failure|error|mismatch|conflict|required|forbidden|unauthorized|created|partial)\b/i.test(line)) return true;
  if (!/\b(?:api|endpoint|route|request|response|schema|payload|headers?|required|status|returns?|responds?|body|contract)\b/i.test(line)) return false;
  if (hasHttpStatusContractAnchor(line)) return true;
  if (API_REQUIRED_FIELDS_PATTERN.test(line)) return true;
  if (/\b(?:request|response)\.(?:required|body|headers?)\s*[:=]\s*[A-Za-z_][\w., -]*/i.test(line)) return true;
  return false;
}

function isDataMigrationContractLine(value) {
  const line = cleanInline(value);
  if (line.length < 8 || line.length > 280) return false;
  if (SQL_ROLLBACK_PATTERN.test(line)) return true;
  if (!SQL_STATEMENT_PATTERN.test(line)) return false;
  if (SQL_CONSTRAINT_PATTERN.test(line)) return true;
  if (/[;)]$/.test(line) && /\b(?:migration|backfill|constraint|index|table|column|tenant|account|invoice|user|session|token|status|deleted_at|paid_at)\b/i.test(line)) return true;
  if (/\b(?:BEGIN|COMMIT|ROLLBACK)\b/i.test(line) && /\b(?:transaction|migration|backfill|constraint|validation)\b/i.test(line)) return true;
  return false;
}

function isIdempotencyConcurrencyLine(value) {
  const line = cleanInline(value);
  if (line.length < 8 || line.length > 280) return false;
  const hasContractShape = /(?:[:=]|->|;|\bUNIQUE\b|\bWHERE\b|\bFOR UPDATE\b|\brequired\b|\bheader\b)/i.test(line);

  if (IDEMPOTENCY_KEY_PATTERN.test(line)) {
    return hasContractShape || SIDE_EFFECT_PATTERN.test(line);
  }
  if (CONCURRENCY_LOCK_PATTERN.test(line)) {
    return hasContractShape || SIDE_EFFECT_PATTERN.test(line) || /\b(?:SELECT|UPDATE|INSERT|DELETE)\b/i.test(line);
  }
  if (DELIVERY_GUARANTEE_PATTERN.test(line)) {
    return hasContractShape || SIDE_EFFECT_PATTERN.test(line);
  }
  return false;
}

function isLocaleEncodingLine(value) {
  const line = cleanInline(value);
  if (line.length < 8 || line.length > 260) return false;
  if (!LOCALE_ENCODING_KEY_PATTERN.test(line)) return false;
  const hasContractShape = /(?:[:=]|->|\brequired\b|\bmust\b|\bpreserve\b|\bkeeps?\b|\bfor query\b)/i.test(line);

  if (LOCALE_ENCODING_VALUE_PATTERN.test(line) && hasContractShape) return true;
  if (UMLAUT_SAMPLE_PATTERN.test(line) && /\b(?:locale|collation|normalization|case[_-]?sensitive|case[_-]?folding|accent|diacritic)\b/i.test(line)) return true;
  return false;
}

function isAuthScopeLine(value) {
  const line = cleanInline(value);
  if (line.length < 8 || line.length > 280) return false;
  if (!AUTH_SCOPE_KEY_PATTERN.test(line)) return false;
  const hasContractShape = /(?:[:=]|->|,|\||\brequired\b|\bmust\b|\bonly\b|\bdeny\b|\ballow\b|\bexact\b|\bpreserve\b|\bvalidates?\b|\bcontains?\b)/i.test(line);

  if (hasAuthScopeAnchor(line) && hasContractShape) return true;
  if (/\b(?:scope|scopes|permission|permissions)\b.*\b[a-z][\w.-]+:[\w:./-]+\b/i.test(line)) return true;
  if (/\b(?:role|roles)\b.*\b(?:admin|owner|editor|viewer|support|operator|billing_admin|security_admin|read-only)\b/i.test(line)) return true;
  if (/\b(?:claim|claims)\b.*\b(?:tenant_id|org_id|sub|aud|iss|email_verified|roles?|permissions?)\b/i.test(line)) return true;
  if (/\b(?:audience|aud|issuer|iss|subject|sub)\s*[:=]\s*(?:api:\/\/|https?:\/\/|[A-Za-z0-9_.:/@+-]+)/i.test(line)) return true;
  return false;
}

function isCryptoContractLine(value) {
  const line = cleanInline(value);
  if (line.length < 8 || line.length > 300) return false;
  if (!CRYPTO_CONTRACT_KEY_PATTERN.test(line)) return false;
  const hasContractShape = /(?:[:=]|->|,|\brequired\b|\bmust\b|\bonly\b|\bexact\b|\bpreserve\b|\bvalidates?\b|\bverify\b|\bheader\b|\bexpected\b)/i.test(line);

  if (hasCryptoContractAnchor(line) && hasContractShape) return true;
  if (CRYPTO_DIGEST_PATTERN.test(line) && /\b(?:sha(?:256|384|512)|digest|checksum|hash|fingerprint)\b/i.test(line)) return true;
  if (/\b(?:alg|algorithm)\s*[:=]\s*(?:RS256|RS384|RS512|ES256|ES384|ES512|EdDSA|PS256|PS384|PS512|HS256|HS384|HS512)\b/.test(line)) return true;
  if (/\b(?:kid|key[_-]?id)\s*[:=]\s*[A-Za-z0-9_.:@+-]{3,}\b/i.test(line)) return true;
  if (/\bjwks[_-]?uri\s*[:=]\s*https?:\/\/[^\s<>"'`),]+/i.test(line)) return true;
  if (/\bsignature[_-]?header\s*[:=]\s*[A-Za-z0-9_.:-]{3,}\b/i.test(line)) return true;
  return false;
}

function isMoneyContractLine(value) {
  const line = cleanInline(value);
  if (line.length < 8 || line.length > 300) return false;
  if (!MONEY_CONTRACT_KEY_PATTERN.test(line)) return false;
  const hasContractShape = /(?:[:=]|->|,|\brequired\b|\bmust\b|\bonly\b|\bexact\b|\bpreserve\b|\bminor\b|\bround(?:ing)?\b|\btax\b|\bvat\b|\bfee\b|\bcurrency\b)/i.test(line);

  if (hasMoneyContractAnchor(line) && hasContractShape) return true;
  if (MONEY_AMOUNT_PATTERN.test(line) && /\b(?:amount|total|subtotal|price|invoice|charge|capture|refund|payment|gross[_-]?(?:amount|total)|net[_-]?(?:amount|total)|currency)\b/i.test(line)) return true;
  if (/\b(?:vat|tax|mwst|ust)[_-]?rate\s*[:=]\s*\d+(?:[.,]\d+)?%/i.test(line)) return true;
  if (/\bfee[_-]?bps\s*[:=]\s*\d+(?:[.,]\d+)?\s*(?:bps|bp)?\b/i.test(line)) return true;
  if (/\bminor[_-]?units\s*[:=]\s*\d+\b/i.test(line)) return true;
  if (/\brounding[_-]?mode\s*[:=]\s*(?:half[_-]up|half[_-]even|bankers|floor|ceil|ceiling|truncate|round[_-]down|round[_-]up)\b/i.test(line)) return true;
  if (/\bcurrency\s*[:=]\s*(?:EUR|USD|GBP|CHF|JPY)\b/.test(line)) return true;
  return false;
}

function isDestructiveOperationLine(value) {
  const line = cleanInline(value);
  if (line.length < 8 || line.length > 320) return false;
  if (!DESTRUCTIVE_OPERATION_PATTERN.test(line)) return false;
  if (DESTRUCTIVE_TARGET_PATTERN.test(line)) return true;
  if (/\b(?:delete|destroy|drop|truncate|reset|clean|prune|remove)\b/i.test(line) && hasCriticalCliOption(line)) return true;
  return false;
}

function isPatternContractLine(value) {
  const line = cleanInline(value);
  if (line.length < 8 || line.length > 320) return false;
  if (!PATTERN_CONTRACT_KEY_PATTERN.test(line)) return false;
  if (!PATTERN_META_PATTERN.test(line)) return false;
  const hasContractShape = /(?:[:=]|->|`|"|'|\brequired\b|\bmust\b|\bexact\b|\bpreserve\b|\bmatch(?:es|er)?\b|\bexclude\b|\binclude\b|\ballow\b|\bdeny\b)/i.test(line);

  if (hasPatternContractAnchor(line) && hasContractShape) return true;
  if (/\b(?:regex|regexp|pattern|glob|matcher)\b.*(?:`[^`\n]+`|"[^"\n]+"|'[^'\n]+')/i.test(line)) return true;
  if (/\b(?:include|exclude|ignore|allowlist|denylist)\b.*(?:\*\*|\*\.|\[|\]|\^|\$|\\)/i.test(line)) return true;
  return false;
}

function isWebSecurityHeaderLine(value) {
  const line = cleanInline(value);
  if (line.length < 8 || line.length > 360) return false;
  if (!WEB_SECURITY_HEADER_KEY_PATTERN.test(line)) return false;

  if (hasWebSecurityHeaderAnchor(line)) return true;
  if (/\bSet-Cookie\b/i.test(line) && COOKIE_ATTRIBUTE_PATTERN.test(line)) return true;
  if (COOKIE_ATTRIBUTE_PATTERN.test(line) && /\b(?:cookie|session|csrf|same[_ -]?site)\b/i.test(line)) return true;
  if (CORS_ORIGIN_PATTERN.test(line)) return true;
  if (CSP_DIRECTIVE_PATTERN.test(line) && /\b(?:Content-Security-Policy|content[_ -]?security|CSP)\b/i.test(line)) return true;
  if (/\bStrict-Transport-Security\b.*\bmax-age=\d+/i.test(line)) return true;
  if (/\bAccess-Control-Allow-Credentials\s*[:=]\s*(?:true|false)\b/i.test(line)) return true;
  if (CSRF_CONTRACT_PATTERN.test(line) && /\b(?:required|reject|origin|referer|same|cookie|header|token|missing)\b/i.test(line)) return true;
  return false;
}

function isCriticalCliOption(value) {
  return CRITICAL_CLI_OPTIONS.has(String(value ?? "").toLowerCase());
}

function isCodeAnchor(value) {
  return !IGNORED_CODE_ANCHORS.has(String(value ?? "").toUpperCase());
}

function isErrorCodeAnchor(value) {
  const normalized = String(value ?? "");
  return normalized.includes("_") || /^E[A-Z0-9]+/.test(normalized) || /^ERR[A-Z0-9]+/.test(normalized);
}

function compareAnchorClasses(left, right) {
  const order = ["keep", "error-code", "env-var", "url", "permission", "numeric-constraint", "config-value", "diff-marker", "diff-change", "order-rule", "temporal-constraint", "api-contract", "data-migration-contract", "idempotency-concurrency", "locale-encoding", "auth-scope", "crypto-contract", "money-contract", "destructive-operation", "pattern-contract", "web-security-header", "path", "cli-option", "code", "quoted"];
  return order.indexOf(left.class) - order.indexOf(right.class) || left.class.localeCompare(right.class);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
