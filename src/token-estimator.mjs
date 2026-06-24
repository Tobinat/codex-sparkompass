const TEXT_TOKEN_PATTERN = /\p{L}[\p{L}\p{N}_-]*|\p{N}+|[^\s\p{L}\p{N}]/gu;

export function estimateTextStats(text) {
  if (!text) {
    return {
      bytes: 0,
      chars: 0,
      lines: 0,
      lexicalUnits: 0,
      estimatedTokens: 0
    };
  }

  const chars = [...text].length;
  const lexicalUnits = text.match(TEXT_TOKEN_PATTERN)?.length ?? 0;
  const charEstimate = chars / 4;
  const unitEstimate = lexicalUnits * 0.75;
  const estimatedTokens = Math.max(1, Math.ceil((charEstimate * 0.7) + (unitEstimate * 0.3)));

  return {
    bytes: Buffer.byteLength(text, "utf8"),
    chars,
    lines: text.split(/\r\n|\r|\n/).length,
    lexicalUnits,
    estimatedTokens
  };
}

export function estimateTokensFromBytes(bytes) {
  if (!bytes) return 0;
  return Math.max(1, Math.ceil(bytes / 4));
}

export function formatNumber(value) {
  return new Intl.NumberFormat("de-DE").format(Math.round(value));
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}
