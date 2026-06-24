import { estimateTextStats, formatBytes, formatNumber } from "./token-estimator.mjs";

export const DEFAULT_PROMPT_ADVISORY_MIN_TOKENS = 1600;
export const DEFAULT_PROMPT_ADVISORY_MIN_LINES = 120;
export const MAX_PROMPT_ADVISORY_EXTRACTED_CHARS = 200000;

export function buildPromptAdvisory(input, options = {}) {
  const promptText = options.hookPayload ? extractPromptText(parsePayload(input), input) : String(input || "");
  const stats = estimateTextStats(promptText);
  const signals = classifyPrompt(promptText, stats);
  const minTokens = normalizeThreshold(options.minTokens ?? process.env.SPARKOMPASS_HOOK_MIN_TOKENS, DEFAULT_PROMPT_ADVISORY_MIN_TOKENS);
  const minLines = normalizeThreshold(options.minLines ?? process.env.SPARKOMPASS_HOOK_MIN_LINES, DEFAULT_PROMPT_ADVISORY_MIN_LINES);
  const shouldAdvise = stats.estimatedTokens >= minTokens || stats.lines >= minLines || signals.includes("tool-output");
  const suggested = buildSuggestion(signals);

  return {
    schema: "SparkompassUserPromptHookAdvisoryV1",
    status: shouldAdvise ? "advisory" : "ok",
    prompt: {
      bytes: stats.bytes,
      chars: stats.chars,
      lines: stats.lines,
      estimated_tokens: stats.estimatedTokens
    },
    thresholds: {
      min_tokens: minTokens,
      min_lines: minLines
    },
    signals,
    suggested,
    caveat: "This advisory does not modify the Codex prompt or the request payload. Token counts and savings are local estimates."
  };
}

export function formatPromptAdvisory(advisory) {
  const statusLine = advisory.status === "advisory"
    ? "großer Prompt erkannt"
    : "kein Sparkompass-Hinweis nötig";

  return `
# Sparkompass Prompt Advisory

Status: ${statusLine}

- Größe: ${formatNumber(advisory.prompt.estimated_tokens)} Tokens geschätzt, ${formatNumber(advisory.prompt.lines)} Zeilen, ${formatBytes(advisory.prompt.bytes)}
- Signale: ${advisory.signals.length ? advisory.signals.join(", ") : "keine"}
- Vorschlag: ${advisory.suggested.command}
- Danach: ${advisory.suggested.follow_up}
- Hinweis: Diese Advisory verändert den Codex-Prompt nicht; alle Tokenwerte sind lokale Schätzungen.
`.trim();
}

export function extractPromptText(payload, rawInput = "") {
  if (typeof payload === "string") return payload.slice(0, MAX_PROMPT_ADVISORY_EXTRACTED_CHARS);
  if (!payload || typeof payload !== "object") return String(rawInput || "").slice(0, MAX_PROMPT_ADVISORY_EXTRACTED_CHARS);

  const direct = findDirectPrompt(payload);
  if (direct) return direct.slice(0, MAX_PROMPT_ADVISORY_EXTRACTED_CHARS);

  const collected = [];
  collectPromptStrings(payload, [], collected);
  const text = collected.join("\n\n");

  return (text || String(rawInput || "")).slice(0, MAX_PROMPT_ADVISORY_EXTRACTED_CHARS);
}

export function parsePayload(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return "";
  try {
    return JSON.parse(trimmed);
  } catch {
    return text;
  }
}

function buildSuggestion(signals) {
  if (signals.includes("tool-output")) {
    return {
      action: "summarize-tool-output",
      command: "sparkompass tool-output --file <log-path> --command \"<command>\" --exit-code <code>",
      follow_up: "Use sparkompass tool-output load only when an exact raw excerpt is needed."
    };
  }

  if (signals.includes("repo-context") || signals.includes("code-heavy")) {
    return {
      action: "build-handoff",
      command: "sparkompass handoff . --goal \"<goal>\" --budget 800 --expect \"<must survive>\"",
      follow_up: "Use the printed ContextHandoffReceipt start prompt and load MCP evidence on demand."
    };
  }

  return {
    action: "build-context-pack",
    command: "sparkompass pack --file <path> --expect \"<must survive>\"",
    follow_up: "Use pack instead of raw paste when critical facts must survive compression."
  };
}

function classifyPrompt(text, stats) {
  const signals = new Set();
  const codeFenceCount = (text.match(/```/g) || []).length;

  if (stats.estimatedTokens >= DEFAULT_PROMPT_ADVISORY_MIN_TOKENS || stats.lines >= DEFAULT_PROMPT_ADVISORY_MIN_LINES) {
    signals.add("large-paste");
  }
  if (codeFenceCount >= 2 || /\b(function|class|export|import|const|let|async|return)\b/.test(text)) {
    signals.add("code-heavy");
  }
  if (/\b(error|failed|failure|traceback|exception|assertionerror|npm ERR!|panic)\b/i.test(text)) {
    signals.add("tool-output");
  }
  if (/\b(src|test|docs|plugins|package\.json|README\.md)\//.test(text) || /\b[A-Za-z0-9_.-]+\.(mjs|js|ts|tsx|py|json|md)\b/.test(text)) {
    signals.add("repo-context");
  }

  return [...signals];
}

function findDirectPrompt(payload) {
  const directKeys = [
    "prompt",
    "user_prompt",
    "userPrompt",
    "message",
    "text",
    "content",
    "input"
  ];

  for (const key of directKeys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) return value;
  }

  if (Array.isArray(payload.messages)) {
    const lastUser = [...payload.messages].reverse().find((message) => message?.role === "user");
    if (typeof lastUser?.content === "string") return lastUser.content;
    if (Array.isArray(lastUser?.content)) {
      return lastUser.content
        .map((part) => typeof part === "string" ? part : typeof part?.text === "string" ? part.text : "")
        .filter(Boolean)
        .join("\n");
    }
  }

  return "";
}

function collectPromptStrings(value, path, output) {
  if (!value || totalCollectedChars(output) >= MAX_PROMPT_ADVISORY_EXTRACTED_CHARS) return;
  if (typeof value === "string") {
    const key = String(path.at(-1) || "").toLowerCase();
    if (/(prompt|message|content|text|input|query|body)/.test(key) && value.trim()) {
      output.push(value);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectPromptStrings(item, path, output);
    return;
  }
  if (typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      collectPromptStrings(item, [...path, key], output);
    }
  }
}

function totalCollectedChars(items) {
  return items.reduce((sum, item) => sum + item.length, 0);
}

function normalizeThreshold(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}
