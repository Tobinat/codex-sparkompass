# README A/B Case Study v1

Diese Fallstudie ist ein redigierter, veröffentlichbarer Beleg zum lokalen Codex-A/B-Lauf aus `docs/official-codex-usage-evidence.md`.

Die Prompt-Dateien sind bewusst sanitisiert. Die JSONL-Dateien enthalten nur ungefährliche `turn.completed`-Usage-Events mit den gemessenen Tokenfeldern. Damit kann die dokumentierte Tokenrechnung ohne private Repository-Inhalte reproduziert werden.

## Rechnen

```bash
node ./bin/codex-sparkompass.mjs codex-usage compare . \
  --baseline evidence/case-studies/readme-ab-v1/raw-usage.jsonl \
  --optimized evidence/case-studies/readme-ab-v1/compact-usage.jsonl \
  --baseline-label "Raw README prompt, redacted" \
  --optimized-label "Sparkompass compact prompt, redacted"
```

Erwartetes Gate:

```text
verified-codex-official-usage-comparison
```

Erwartete Ersparnis:

- Gesamt-Tokens: `8.417` weniger, `21%`
- Input-Tokens: `8.371` weniger, `21%`
- Nicht gecachter Input: `16.051` weniger, `42%`
- Output-Tokens: `46` weniger
- Reasoning-Output-Tokens: `46` weniger

## Caveat

Diese Fallstudie ist keine Preis- oder Rechnungsberechnung und kein allgemeines Sparversprechen. Sie zeigt einen kontrollierten lokalen Lauf mit dokumentierten Codex-JSONL-Usage-Feldern.
