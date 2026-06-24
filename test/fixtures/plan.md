# Codex Sparkompass Plan

## Ziel

Komprimiere lange Eingaben, ohne wichtige Fakten zu verlieren.

## Muss erhalten bleiben

- `sparkompass compress --file debug.log --target 25`
- `--keep AUTH_RESET_TOKEN_EXPIRED`
- Sparbalken mit geschätzten Tokens
- Qualität: gut, ok oder riskant

## Umsetzung

1. Inhalt in Zeilen zerlegen.
2. Schutzanker erkennen.
3. Zielgröße anwenden.
4. Ergebnis immer ausgeben.

## Nicht machen

- Keine Telemetrie.
- Keine stillen Uploads.
- Keine Behauptung, Codex intern zu patchen.

## Extra Kontext

Diese Zeile ist absichtlich lang und enthält viel Fülltext, damit die Kompression zeigen kann, dass nicht jede erklärende Passage überleben muss.
Noch eine lange erklärende Passage, die den Sinn wiederholt und für einen knappen Codex-Prompt wahrscheinlich nicht entscheidend ist.
