export function buildEvidenceLoadHint(item = {}) {
  const unitId = item.unit_id || item.unitId || item.id;
  if (unitId) return `sparkompass_load_evidence unitId=${unitId}`;
  if (item.file && item.line) return `sparkompass_load_evidence file=${item.file} line=${item.line}`;
  return "sparkompass_load_evidence";
}

export function buildSourceHashLoadHint(item = {}) {
  const sourceHash = item.source_hash || item.sourceHash || "";
  if (!sourceHash) return "";
  const file = item.file ? ` file=${item.file}` : "";
  return `sparkompass_load_source_hash sourceHash=${sourceHash}${file}`;
}

export function withEvidenceLoadHints(item = {}) {
  const loadHint = item.load_hint || buildEvidenceLoadHint(item);
  const sourceHashLoadHint = item.source_hash_load_hint || buildSourceHashLoadHint(item);
  const loadHints = {
    evidence: loadHint,
    source_hash: sourceHashLoadHint || null
  };

  return {
    ...item,
    load_hint: loadHint,
    source_hash_load_hint: sourceHashLoadHint || null,
    load_hints: loadHints
  };
}
