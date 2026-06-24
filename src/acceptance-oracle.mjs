import { createHash } from "node:crypto";

const DEFAULT_REGEX_FLAGS = "";

export function buildAcceptanceOracle(input = []) {
  const expectations = normalizeExpectationSpecs(input);

  return {
    schema: "AcceptanceOracleV1",
    type: expectations.every((item) => item.type === "contains")
      ? "contains-all-terms"
      : "contains-and-regex",
    expectations,
    expected_terms: expectations
      .filter((item) => item.type === "contains")
      .map((item) => item.value),
    expected_patterns: expectations
      .filter((item) => item.type === "regex")
      .map((item) => ({ label: item.label, pattern: item.pattern, flags: item.flags }))
  };
}

export function evaluateAcceptanceOracle(text, oracleOrExpectations = []) {
  const oracle = Array.isArray(oracleOrExpectations)
    ? buildAcceptanceOracle(oracleOrExpectations)
    : oracleOrExpectations;
  const source = String(text ?? "");
  const checks = (oracle.expectations || []).map((expectation) => evaluateExpectation(source, expectation));
  const missingChecks = checks.filter((check) => !check.matched);

  return {
    schema: "AcceptanceOracleResultV1",
    success: missingChecks.length === 0,
    total: checks.length,
    matched_count: checks.length - missingChecks.length,
    matched: checks.filter((check) => check.matched).map(publicCheck),
    missing: missingChecks.map((check) => check.label),
    missing_details: missingChecks.map(publicCheck),
    checks: checks.map(publicCheck)
  };
}

export function buildCounterfactualChecks(text, oracleOrExpectations = []) {
  const oracle = Array.isArray(oracleOrExpectations)
    ? buildAcceptanceOracle(oracleOrExpectations)
    : oracleOrExpectations;
  const source = String(text ?? "");

  return (oracle.expectations || []).map((expectation) => {
    const current = evaluateExpectation(source, expectation);
    if (!current.matched) {
      return {
        expectation_id: expectation.id,
        type: expectation.type,
        label: expectation.label,
        term: expectation.type === "contains" ? expectation.value : expectation.label,
        pattern: expectation.type === "regex" ? expectation.pattern : undefined,
        flags: expectation.type === "regex" ? expectation.flags : undefined,
        present: false,
        detected: true,
        reason: current.reason === "invalid-regex" ? "invalid-regex-already-failing" : "expectation-already-missing"
      };
    }

    const mutated = removeExpectation(source, expectation);
    const oracleResult = evaluateAcceptanceOracle(mutated, oracle);
    const detected = oracleResult.missing.includes(expectation.label);

    return {
      expectation_id: expectation.id,
      type: expectation.type,
      label: expectation.label,
      term: expectation.type === "contains" ? expectation.value : expectation.label,
      pattern: expectation.type === "regex" ? expectation.pattern : undefined,
      flags: expectation.type === "regex" ? expectation.flags : undefined,
      present: true,
      detected,
      reason: detected ? "oracle-detected-removal" : "oracle-missed-removal"
    };
  });
}

export function normalizeExpectationSpecs(input = []) {
  const rawItems = Array.isArray(input) ? input : [input];
  const normalized = [];
  const seen = new Set();

  for (const item of rawItems) {
    const expectation = normalizeExpectationSpec(item);
    if (!expectation) continue;

    const key = expectation.type === "regex"
      ? `regex:${expectation.pattern}:${expectation.flags}`
      : `contains:${expectation.value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push({
      ...expectation,
      id: `acc-${sha256(key).slice(0, 12)}`
    });
  }

  return normalized;
}

export function formatExpectationLabel(expectation) {
  if (!expectation) return "";
  if (expectation.label) return expectation.label;
  if (expectation.type === "regex") {
    return expectation.flags
      ? `/${expectation.pattern}/${expectation.flags}`
      : `/${expectation.pattern}/`;
  }
  return String(expectation.value || "");
}

function normalizeExpectationSpec(item) {
  if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
    return normalizeStringExpectation(String(item));
  }

  if (!item || typeof item !== "object") return null;

  const type = String(item.type || (item.pattern ? "regex" : "contains")).trim().toLowerCase();
  if (type === "regex" || type === "regexp" || type === "matches") {
    const pattern = String(item.pattern || item.value || "").trim();
    if (!pattern) return null;
    const flags = normalizeRegexFlags(item.flags);
    const label = String(item.label || "").trim() || formatExpectationLabel({ type: "regex", pattern, flags });
    return {
      type: "regex",
      pattern,
      flags,
      label
    };
  }

  const value = String(item.value || item.term || item.label || "").trim();
  if (!value) return null;
  return {
    type: "contains",
    value,
    label: String(item.label || "").trim() || value
  };
}

function normalizeStringExpectation(value) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("regex:")) {
    const regexSpec = trimmed.slice("regex:".length).trim();
    const parsed = parseRegexSpec(regexSpec);
    if (!parsed.pattern) return null;
    return {
      type: "regex",
      pattern: parsed.pattern,
      flags: parsed.flags,
      label: formatExpectationLabel({
        type: "regex",
        pattern: parsed.pattern,
        flags: parsed.flags
      })
    };
  }

  return {
    type: "contains",
    value: trimmed,
    label: trimmed
  };
}

function parseRegexSpec(spec) {
  if (!spec.startsWith("/")) {
    return {
      pattern: spec,
      flags: DEFAULT_REGEX_FLAGS
    };
  }

  let escaped = false;
  for (let index = spec.length - 1; index > 0; index -= 1) {
    const char = spec[index];
    if (char === "/" && !escaped) {
      return {
        pattern: spec.slice(1, index),
        flags: normalizeRegexFlags(spec.slice(index + 1))
      };
    }
    escaped = char === "\\" && !escaped;
  }

  return {
    pattern: spec.slice(1),
    flags: DEFAULT_REGEX_FLAGS
  };
}

function evaluateExpectation(text, expectation) {
  if (expectation.type === "regex") {
    const compiled = compileRegex(expectation);
    if (!compiled.regex) {
      return {
        ...expectation,
        matched: false,
        reason: "invalid-regex",
        error: compiled.error
      };
    }
    const matched = compiled.regex.test(text);
    return {
      ...expectation,
      matched,
      reason: matched ? "matched-regex" : "missing-regex"
    };
  }

  const matched = text.includes(expectation.value);
  return {
    ...expectation,
    matched,
    reason: matched ? "matched-contains" : "missing-contains"
  };
}

function removeExpectation(text, expectation) {
  const marker = `[REMOVED:${sha256(expectation.id).slice(0, 8)}]`;
  if (expectation.type === "regex") {
    const compiled = compileRegex(expectation);
    if (!compiled.regex) return text;
    return text.replace(compiled.regex, marker);
  }

  return text.split(expectation.value).join(marker);
}

function compileRegex(expectation) {
  try {
    return {
      regex: new RegExp(expectation.pattern, normalizeRegexFlags(expectation.flags)),
      error: null
    };
  } catch (error) {
    return {
      regex: null,
      error: error?.message || String(error)
    };
  }
}

function normalizeRegexFlags(flags = "") {
  return [...new Set(String(flags || DEFAULT_REGEX_FLAGS).replace(/g/g, "").split(""))]
    .filter((flag) => "dimsuvy".includes(flag))
    .join("");
}

function publicCheck(check) {
  return {
    expectation_id: check.id,
    type: check.type,
    label: check.label,
    value: check.type === "contains" ? check.value : undefined,
    pattern: check.type === "regex" ? check.pattern : undefined,
    flags: check.type === "regex" ? check.flags : undefined,
    matched: check.matched,
    reason: check.reason,
    error: check.error
  };
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}
