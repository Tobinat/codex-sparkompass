import { buildCompactPrompt } from "./prompt.mjs";
import { calculateSavings, formatSavingsBar } from "./savings.mjs";
import { formatBytes, formatNumber } from "./token-estimator.mjs";

export function buildRunRecommendation({ goal, files = [], done = [], scan, analysis }) {
  const explicitFiles = files.map(clean).filter(Boolean);
  const biggestFiles = analysis.topTokenFiles.slice(0, 5).map((file) => ({
    path: file.path,
    estimatedTokens: file.estimatedTokens,
    bytes: file.bytes
  }));

  const constraints = [
    "Nicht das gesamte Repository lesen, bevor die wahrscheinlich relevanten Dateien klar sind.",
    "Nutze zuerst schnelle Orientierung wie Dateisuche, Tests oder Fehlermeldungen.",
    "Große Dateien nur gezielt und ausschnittweise lesen."
  ];

  const context = [];
  if (!explicitFiles.length) {
    context.push("Noch keine Datei vorgegeben. Bitte zuerst die wahrscheinlich relevanten Dateien bestimmen.");
  }
  context.push(`Sparkompass-Audit: ca. ${formatNumber(scan.totals.estimatedTextTokens)} Text-Tokens im Repo, Ampel ${analysis.level.color}.`);

  const prompt = buildCompactPrompt({
    goal,
    files: explicitFiles,
    context,
    constraints,
    done: done.length ? done : ["Relevante Checks wurden ausgeführt oder begründet ausgelassen."]
  });
  const promptTokens = estimatePromptTokens(prompt);
  const naiveTokens = estimateNaiveStartTokens({ goal, files: explicitFiles, scan, analysis });
  const savings = calculateSavings(naiveTokens, promptTokens);

  return {
    goal,
    status: analysis.level,
    totals: scan.totals,
    explicitFiles,
    biggestFiles,
    nextSteps: buildNextSteps(explicitFiles, analysis),
    savings,
    prompt
  };
}

export function formatRunRecommendation(recommendation) {
  const biggestFiles = recommendation.biggestFiles
    .map((file, index) => `${index + 1}. ${file.path} - ca. ${formatNumber(file.estimatedTokens)} Tokens, ${formatBytes(file.bytes)}`)
    .join("\n");

  return `
# Sparkompass Empfehlung

Ziel: ${recommendation.goal}

Status: ${recommendation.status.color} (${recommendation.status.title})
${recommendation.status.message}

Sparbalken: ${formatSavingsBar(recommendation.savings)}

## Was jetzt sinnvoll ist

${recommendation.nextSteps.map((step) => `- ${step}`).join("\n")}

## Größte Kontext-Treiber

${biggestFiles || "- keine Textdateien gefunden"}

## Prompt für Codex

\`\`\`text
${recommendation.prompt}
\`\`\`
`.trim();
}

function buildNextSteps(explicitFiles, analysis) {
  const steps = [];

  if (explicitFiles.length) {
    steps.push(`Mit ${explicitFiles.length} vorgegebenen Datei(en) starten statt breit zu suchen.`);
  } else {
    steps.push("Erst relevante Dateien finden, dann gezielt lesen.");
  }

  if (analysis.level.color !== "grün") {
    steps.push("Vor der Umsetzung einen kurzen Plan verlangen.");
  }

  const hasHeavyFile = analysis.topTokenFiles.some((file) => file.estimatedTokens > 8_000);
  if (hasHeavyFile) {
    steps.push("Sehr große Dateien nur ausschnittweise in den Kontext holen.");
  }

  steps.push("Done-Kriterium im Prompt stehen lassen, damit Codex nicht offen weiterarbeitet.");
  return steps;
}

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function estimatePromptTokens(prompt) {
  return Math.max(1, Math.ceil(prompt.length / 4));
}

function estimateNaiveStartTokens({ goal, files, scan, analysis }) {
  const namedFileTokens = files.length
    ? scan.files
      .filter((file) => files.includes(file.path))
      .reduce((sum, file) => sum + file.estimatedTokens, 0)
    : analysis.topTokenFiles.slice(0, 5).reduce((sum, file) => sum + file.estimatedTokens, 0);

  return Math.max(
    estimatePromptTokens(goal),
    estimatePromptTokens(goal) + namedFileTokens
  );
}
