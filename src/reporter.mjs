import { formatBytes, formatNumber } from "./token-estimator.mjs";

const SOURCES = [
  "Codex Pricing: https://developers.openai.com/codex/pricing",
  "Codex Best Practices: https://developers.openai.com/codex/learn/best-practices",
  "Codex Prompting: https://developers.openai.com/codex/prompting",
  "AGENTS.md: https://developers.openai.com/codex/guides/agents-md",
  "Skills: https://developers.openai.com/codex/skills"
];

export function formatAuditReport(scan, analysis) {
  const topFiles = analysis.topTokenFiles
    .map((file, index) => {
      const notes = file.notes?.length ? ` (${file.notes.join("; ")})` : "";
      return `${index + 1}. ${file.path} - ca. ${formatNumber(file.estimatedTokens)} Tokens, ${formatBytes(file.bytes)}${notes}`;
    })
    .join("\n");

  const agents = scan.special.agents.length
    ? scan.special.agents
      .map((file) => `- ${file.path}: ca. ${formatNumber(file.estimatedTokens)} Tokens, ${formatBytes(file.bytes)}`)
      .join("\n")
    : "- keine AGENTS.md gefunden";

  const configs = scan.special.codexConfigs.length
    ? scan.special.codexConfigs
      .map((file) => `- ${file.path}: ${file.notes?.join("; ") || "gefunden"}`)
      .join("\n")
    : "- keine .codex-Konfiguration gefunden";

  const recommendations = analysis.recommendations
    .map((item) => `- [${item.impact}] ${item.title}: ${item.action} (${item.evidence})`)
    .join("\n");

  return `
# Codex Sparkompass Audit

Pfad: ${scan.root}
Stand: ${scan.generatedAt}

## Kontext-Ampel: ${analysis.level.color} (${analysis.level.title})

${analysis.level.message}

- Dateien gescannt: ${formatNumber(scan.totals.files)}
- Textdateien: ${formatNumber(scan.totals.textFiles)}
- Ignorierte Einträge: ${formatNumber(scan.totals.ignoredEntries)}
- Geschätzte Text-Tokens: ca. ${formatNumber(scan.totals.estimatedTextTokens)}
- Gesamtgröße: ${formatBytes(scan.totals.bytes)}

## Größte Kontext-Treiber

${topFiles || "- keine Textdateien gefunden"}

## Codex-Leitplanken

AGENTS.md:
${agents}

Codex-Konfiguration:
${configs}

## Empfehlungen

${recommendations}

## Sofort nutzbarer Kompakt-Prompt

Kopiere diesen Aufbau in Codex und fülle nur die fehlenden Stellen:

\`\`\`text
Ziel:
<eine konkrete Änderung>

Relevanter Kontext:
- <Datei oder Ordner>

Grenzen:
- Nur Dateien anfassen, die für das Ziel nötig sind.
- Vor größeren Umbauten kurz Plan nennen.

Done when:
- <Test, Verhalten oder Review-Kriterium>
\`\`\`

## Quellen

${SOURCES.map((source) => `- ${source}`).join("\n")}

Hinweis: Die Tokenwerte sind Näherungen für Kontextplanung, keine offizielle Abrechnung.
`.trim();
}
