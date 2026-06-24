import { formatNumber } from "./token-estimator.mjs";

export function calculateSavings(originalTokens, compactTokens) {
  const original = Math.max(0, Number(originalTokens) || 0);
  const compact = Math.max(0, Number(compactTokens) || 0);
  const saved = Math.max(0, original - compact);
  const percent = original > 0 ? Math.round((saved / original) * 100) : 0;

  return {
    originalTokens: original,
    compactTokens: compact,
    savedTokens: saved,
    percent
  };
}

export function formatSavingsBar(savings, options = {}) {
  const width = options.width ?? 24;
  const filled = Math.round((Math.min(100, savings.percent) / 100) * width);
  const empty = Math.max(0, width - filled);
  const bar = `${"#".repeat(filled)}${"-".repeat(empty)}`;

  return `[${bar}] ${savings.percent}% gespart (${formatNumber(savings.savedTokens)} von ${formatNumber(savings.originalTokens)} Tokens)`;
}
