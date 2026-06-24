export function analyzeScan(scan, options = {}) {
  const top = options.top ?? 12;
  const level = classifyContext(scan.totals.estimatedTextTokens);
  const topTokenFiles = scan.files
    .filter((file) => file.kind === "text")
    .slice(0, top);

  return {
    level,
    topTokenFiles,
    recommendations: buildRecommendations(scan, topTokenFiles),
    modelGuide: [
      {
        useCase: "leicht, klar umrissen",
        suggestion: "schnelleres/kleineres Modell oder niedrigeres Reasoning"
      },
      {
        useCase: "komplex, repo-weit, unsicher",
        suggestion: "stärkeres Modell, aber erst nach Plan und enger Dateiauswahl"
      }
    ],
    tokenSavingMoves: [
      "Erst Ziel, relevante Dateien und Done-Kriterien nennen, dann Codex suchen lassen.",
      "AGENTS.md kurz halten und Spezialregeln in Unterordner legen.",
      "MCP-Server nur aktivieren, wenn der Task externe Daten wirklich braucht.",
      "Wiederholte Prompt-Muster als Skill statt als langen Prompt ablegen.",
      "Subagents nur für echte Parallelität nutzen, weil jeder Agent eigenen Kontext verbraucht."
    ]
  };
}

function classifyContext(tokens) {
  if (tokens <= 40_000) {
    return {
      color: "grün",
      title: "schlank",
      message: "Das Repository wirkt für Codex gut portionierbar."
    };
  }

  if (tokens <= 120_000) {
    return {
      color: "gelb",
      title: "wachsam",
      message: "Codex sollte mit klaren Datei-Hinweisen und enger Aufgabenbeschreibung starten."
    };
  }

  return {
    color: "rot",
    title: "kontextschwer",
    message: "Ohne Kontextstrategie drohen lange Läufe, häufiges Nachladen und hohe Kosten."
  };
}

function buildRecommendations(scan, topTokenFiles) {
  const recommendations = [];
  const agentsTokens = scan.special.agents.reduce((sum, file) => sum + file.estimatedTokens, 0);
  const totalMcpServers = scan.files.reduce((sum, file) => sum + (file.mcpServerCount ?? 0), 0);

  if (scan.totals.estimatedTextTokens > 40_000) {
    recommendations.push({
      id: "context-bom",
      title: "Kontext-BOM vor jedem großen Prompt",
      impact: "hoch",
      action: "Nenne im Codex-Prompt zuerst nur Ziel, betroffene Dateien und Done-Kriterien. Vermeide komplette Projekt-Dumps.",
      evidence: `${scan.totals.estimatedTextTokens} geschätzte Text-Tokens im Repository`
    });
  }

  if (topTokenFiles.some((file) => file.estimatedTokens > 8_000)) {
    recommendations.push({
      id: "heavy-files",
      title: "Schwere Dateien aus dem Startkontext halten",
      impact: "hoch",
      action: "Verweise auf große Dateien nur, wenn sie wirklich entscheidend sind. Für Logs, Snapshots oder generierte Dateien lieber Ausschnitte nutzen.",
      evidence: topTokenFiles
        .filter((file) => file.estimatedTokens > 8_000)
        .slice(0, 3)
        .map((file) => file.path)
        .join(", ")
    });
  }

  if (agentsTokens > 4_000 || scan.special.agents.some((file) => file.bytes > 16_000)) {
    recommendations.push({
      id: "agents-slim",
      title: "AGENTS.md schneiden und schichten",
      impact: "hoch",
      action: "Halte die Root-Anweisungen knapp. Lege Spezialregeln näher an die betroffenen Unterordner, damit Codex nicht jedes Mal alles laden muss.",
      evidence: `${scan.special.agents.length} AGENTS-Datei(en), zusammen ca. ${agentsTokens} Tokens`
    });
  } else if (scan.special.agents.length === 0) {
    recommendations.push({
      id: "agents-create",
      title: "Kurze AGENTS.md als Leitplanke anlegen",
      impact: "mittel",
      action: "Lege eine knappe AGENTS.md mit Build-, Test- und Done-Regeln an. Das spart Wiederholung in Prompts.",
      evidence: "Keine AGENTS.md gefunden"
    });
  }

  if (totalMcpServers > 0) {
    recommendations.push({
      id: "mcp-budget",
      title: "MCP-Kontext budgetieren",
      impact: "mittel",
      action: "Aktiviere nur MCP-Server, die für die aktuelle Aufgabe gebraucht werden. Jeder aktive externe Kontext kann den Prompt vergrößern.",
      evidence: `${totalMcpServers} mögliche MCP-Server-Konfiguration(en) gefunden`
    });
  }

  recommendations.push({
    id: "prompt-contract",
    title: "Prompt als Vertrag schreiben",
    impact: "mittel",
    action: "Nutze die Struktur Ziel, Kontext, Grenzen, Done when. Das reduziert Rückfragen und verhindert seitliche Exploration.",
    evidence: "Codex profitiert laut offizieller Anleitung von Ziel, Kontext, Constraints und Done-Kriterien."
  });

  recommendations.push({
    id: "skill-loop",
    title: "Wiederholungen in Skills verwandeln",
    impact: "mittel",
    action: "Wenn du denselben Prompt mehrfach nutzt, mache daraus eine Skill-Datei mit klarer Beschreibung und optionalem Script.",
    evidence: "Skills laden volle Details erst bei passender Aufgabe und halten wiederkehrende Workflows konsistent."
  });

  return recommendations;
}
