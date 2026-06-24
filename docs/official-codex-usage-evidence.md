# Official Codex Usage Evidence

Stand: 2026-06-24

Diese Seite dokumentiert einen echten lokalen Codex-A/B-Lauf für Sparkompass. Ziel ist ein nachvollziehbarer GitHub-Beleg: Nicht nur lokale Token-Schätzungen, sondern die von Codex selbst im JSONL-Lauf ausgegebenen Usage-Felder werden gehasht, zusammengefasst und verglichen.

## Offizielle Grundlage

- [Codex CLI Reference](https://developers.openai.com/codex/cli/reference) dokumentiert für `codex exec` die Option `--json` / `--experimental-json`: Sie gibt newline-delimited JSON events aus.
- [Codex Governance](https://developers.openai.com/codex/enterprise/governance) dokumentiert für Enterprise-Workspaces eine Analytics API unter `GET /workspaces/{workspace_id}/usage`; diese enthält Text-Input-, Cached-Input- und Output-Tokenfelder.
- Sparkompass liest lokal die `turn.completed.usage`-Events aus `codex exec --json`. Das ist offizielle Run-Usage, aber keine Preis- oder Rechnungsberechnung. Gesamt-Tokens werden als `input_tokens + output_tokens` berechnet; `cached_input_tokens` und `reasoning_output_tokens` sind Unterkategorien und werden nicht doppelt addiert.

## Reproduktionsweg

Baseline mit Rohkontext:

```bash
CODEX_BIN="${CODEX_BIN:-codex}"

"$CODEX_BIN" \
  --ask-for-approval never \
  exec --json \
  -C . \
  --sandbox read-only \
  - < .sparkompass/live/official-ab-raw-prompt.txt \
  > .sparkompass/live/official-ab-raw.jsonl
```

Optimierter Lauf mit Sparkompass-Prompt:

```bash
CODEX_BIN="${CODEX_BIN:-codex}"

"$CODEX_BIN" \
  --ask-for-approval never \
  exec --json \
  -C . \
  --sandbox read-only \
  - < .sparkompass/live/official-ab-compact-prompt.txt \
  > .sparkompass/live/official-ab-compact.jsonl
```

Belege erzeugen und vergleichen:

```bash
node ./bin/codex-sparkompass.mjs codex-usage record . \
  --file .sparkompass/live/official-ab-raw.jsonl \
  --ledger .sparkompass/live/codex-usage-ledger.json \
  --label "official-ab-raw-readme"

node ./bin/codex-sparkompass.mjs codex-usage record . \
  --file .sparkompass/live/official-ab-compact.jsonl \
  --ledger .sparkompass/live/codex-usage-ledger.json \
  --label "official-ab-sparkompass-compact"

node ./bin/codex-sparkompass.mjs codex-usage compare . \
  --baseline .sparkompass/live/official-ab-raw.jsonl \
  --optimized .sparkompass/live/official-ab-compact.jsonl \
  --baseline-label "Raw README prompt" \
  --optimized-label "Sparkompass compact prompt"
```

## Ergebnis

| Messwert | Raw README Prompt | Sparkompass Compact Prompt | Ersparnis |
| --- | ---: | ---: | ---: |
| Gesamt-Tokens | 40.758 | 32.341 | 8.417 (21%) |
| Input-Tokens | 40.657 | 32.286 | 8.371 (21%) |
| Nicht gecachte Input-Tokens | 38.225 | 22.174 | 16.051 (42%) |
| Output-Tokens | 101 | 55 | 46 |
| Reasoning-Output-Tokens | 94 | 48 | 46 |

Gate:

```text
verified-codex-official-usage-comparison
```

Rohdaten-Hashes:

```text
Raw README prompt:
sha256:f790ec2eea481eb43f9d6fa7270a28aa87393586137b5780fd70489c486e74dc

Sparkompass compact prompt:
sha256:993ba942d2a71dc228da74973f849c0b95858cf9f96386b14a3844c1d02c5b42
```

## Einordnung

Dieser Beleg zeigt: In diesem kontrollierten lokalen A/B-Lauf hat Sparkompass den offiziell von Codex berichteten Gesamtverbrauch um 8.417 Tokens beziehungsweise 21% reduziert. Besonders wichtig ist der nicht gecachte Input: Dort sank der Wert um 16.051 Tokens beziehungsweise 42%.

Die Aussage bleibt bewusst eng:

- Es ist ein offizieller Codex-Run-Beleg aus dokumentierten JSONL-Events.
- Es ist keine offizielle Rechnung, kein Preisrechner und keine Workspace-Abrechnung.
- Der Vergleich ist nur belastbar, wenn Aufgabe, Modell, Workspace, Sandbox und Laufbedingungen vergleichbar sind.
- `.sparkompass/live` bleibt lokal ignoriert; für veröffentlichbare Nachvollziehbarkeit stehen hier Kommandos, Gates und Rohdaten-Hashes.

Eine redigierte, veröffentlichbare Fallstudie mit ungefährlichen Usage-JSONL-Dateien liegt unter:

```text
evidence/case-studies/readme-ab-v1/
```
