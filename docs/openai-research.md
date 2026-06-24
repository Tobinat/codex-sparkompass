# Recherchebasis

Stand: 2026-06-23

Diese Notizen basieren auf offiziellen OpenAI-Seiten und werden im Repo bewusst knapp gehalten.

## Relevante OpenAI-Hinweise

- Codex-Credits werden tokenbasiert berechnet: Input, gecachter Input und Output sind getrennte Verbrauchstreiber.
- OpenAI empfiehlt, Prompts präzise zu halten und unnötigen Kontext zu entfernen.
- Eine große `AGENTS.md` kann Verbrauch erhöhen; verschachtelte Dateien helfen, Kontext näher am betroffenen Bereich zu halten.
- Jeder hinzugefügte MCP-Server kann zusätzlichen Kontext in Nachrichten bringen.
- Codex-Prompts profitieren von Ziel, Kontext, Constraints und klaren Done-Kriterien.
- Skills nutzen progressive Offenlegung: Die Skill-Liste ist knapp, die vollständigen Anweisungen werden erst geladen, wenn die Skill gebraucht wird.
- Für einfache Aufgaben kann ein kleineres Modell oder niedrigeres Reasoning sinnvoll sein; schwere Aufgaben brauchen mehr Fähigkeit, sollten aber besser geplant und enger geführt werden.
- Prompt Caching funktioniert automatisch für unterstützte Modelle und kann nur bei exakten Prompt-Prefix-Treffern greifen. Stabile Inhalte sollten deshalb vorne stehen, variable Aufgaben-, Diff- und Nutzerdaten hinten.
- Prompt Caching kann Kosten und Latenz senken, reduziert aber nicht automatisch die belegte Kontextgröße. Sparkompass behandelt es deshalb als Layout-Optimierung neben Kontextauswahl und nicht als Ersatz für Kompression.

## Quellen

- Codex Pricing: https://developers.openai.com/codex/pricing
- Codex Best Practices: https://developers.openai.com/codex/learn/best-practices
- Codex Prompting: https://developers.openai.com/codex/prompting
- AGENTS.md: https://developers.openai.com/codex/guides/agents-md
- Agent Skills: https://developers.openai.com/codex/skills
- Codex Models: https://developers.openai.com/codex/models
- Codex Prompting Guide: https://developers.openai.com/cookbook/examples/gpt-5/codex_prompting_guide
- OpenAI Prompt Caching: https://developers.openai.com/api/docs/guides/prompt-caching
