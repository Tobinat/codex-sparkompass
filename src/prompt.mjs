export function buildCompactPrompt({ goal, context = [], constraints = [], done = [], files = [] }) {
  const normalizedGoal = clean(goal);
  const contextLines = [...files.map((file) => `Datei: ${clean(file)}`), ...context.map(clean)]
    .filter(Boolean);
  const constraintLines = constraints.map(clean).filter(Boolean);
  const doneLines = done.map(clean).filter(Boolean);

  return `
Ziel:
${normalizedGoal}

Relevanter Kontext:
${formatList(contextLines, ["Bitte lies zuerst nur die Dateien/Ordner, die für dieses Ziel nötig sind."])}

Grenzen:
${formatList([
  "Halte die Änderung eng am Ziel.",
  "Vermeide große Refactors ohne klaren Nutzen.",
  ...constraintLines
])}

Arbeitsweise:
- Sammle kurz den nötigen Kontext.
- Wenn etwas unklar ist, stelle höchstens zwei konkrete Rückfragen.
- Nutze vorhandene Projektmuster und führe passende Checks aus.

Done when:
${formatList(doneLines.length ? doneLines : ["Die Änderung ist umgesetzt, geprüft und knapp zusammengefasst."])}
`.trim();
}

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function formatList(items, fallback = []) {
  const lines = (items.length ? items : fallback).filter(Boolean);
  return lines.map((item) => `- ${item}`).join("\n");
}
