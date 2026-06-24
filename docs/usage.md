# Sparkompass Nutzung

Diese Seite ist das praktische Handbuch. Die README bleibt bewusst kurz; hier stehen die wichtigsten Workflows gebündelt.

## Grundprinzip

Sparkompass spart nicht durch blindes Kürzen. Der normale Ablauf ist:

1. Aufgabe und relevante Dateien benennen.
2. Kontext planen oder verdichten.
3. Muss-Fakten, Pfade und Fehlercodes prüfen.
4. Startprompt oder ContextPack bewusst verwenden.
5. Ergebnis mit Tests, TaskOutcome oder Codex-Usage belegen.

Tokenwerte sind lokale Schätzungen oder lokale Codex-Usage-Belege, keine offizielle Abrechnung.

## Repository prüfen

```bash
sparkompass audit .
sparkompass inventory .
sparkompass scorecard .
```

`audit` zeigt große Kontexttreiber. `inventory` erstellt eine semantische Karte. `scorecard` fasst lokale Release-Signale zusammen.

## Nächsten Codex-Lauf vorbereiten

```bash
sparkompass recommend . \
  --goal "Login-Fehler nach Passwort-Reset beheben" \
  --file "src/auth/session.ts" \
  --done "Auth-Tests laufen grün"
```

Das Ergebnis ist ein enger Prompt mit Grenzen und Done-Kriterium. Für größere Übergaben ist `handoff` stärker:

```bash
sparkompass handoff . \
  --goal "Login-Fehler beheben" \
  --file "src/auth/session.ts" \
  --expect "AUTH_RESET_TOKEN_EXPIRED" \
  --budget 800 \
  --print-prompt
```

## Kontext planen

```bash
sparkompass plan . \
  --goal "Login-Fehler beheben" \
  --file "src/auth/session.ts" \
  --expect "AUTH_RESET_TOKEN_EXPIRED" \
  --expect-regex "src/auth/.+\\.ts" \
  --budget 800
```

Wichtige Folgekommandos:

```bash
sparkompass bom . --goal "Login-Fehler beheben" --expect "AUTH_RESET_TOKEN_EXPIRED"
sparkompass control . --goal "Login-Fehler beheben" --expect "AUTH_RESET_TOKEN_EXPIRED"
sparkompass evidence-audit . --goal "Login-Fehler beheben" --expect "AUTH_RESET_TOKEN_EXPIRED"
sparkompass ablation-audit . --goal "Login-Fehler beheben" --expect "AUTH_RESET_TOKEN_EXPIRED"
sparkompass slim . --goal "Login-Fehler beheben" --expect "AUTH_RESET_TOKEN_EXPIRED"
```

`bom` macht sichtbar, aus welchen Dateien und Entscheidungen der geplante Kontext besteht. `evidence-audit` prüft Hashes und Zeilen. `ablation-audit` zeigt, welche Einheiten für das Oracle kritisch sind. `slim` schlägt ablation-sichere On-Demand-Belege vor.

## Große Eingaben verdichten

Für einen schnellen, nicht beweisenden Textschnitt:

```bash
sparkompass compress --file "debug.log" --target 35 --keep "AUTH_RESET_TOKEN_EXPIRED"
```

Für belastbare Übergaben:

```bash
sparkompass pack \
  --file "debug.log" \
  --target 35 \
  --keep "AUTH_RESET_TOKEN_EXPIRED" \
  --expect "Auth reset test passes"
```

`pack` erzeugt ein Receipt. Wenn die kompakte Fassung wichtige Fakten verliert, erweitert Sparkompass oder liefert Vollkontext.

Receipts nachträglich prüfen:

```bash
sparkompass receipt verify --receipt "pack.json" --file "debug.log"
sparkompass receipt lint --receipt "pack.json"
sparkompass contextpack verify . --context-pack-id "ctx-..."
```

## Logs und Tool-Ausgaben

```bash
sparkompass tool-output --file "pytest.log" --command "pytest -q" --exit-code 1 --store .sparkompass/tool-output
sparkompass tool-output load --summary ".sparkompass/tool-output/<id>.summary.json" --pattern "E_AUTH_104"
```

Codex bekommt zuerst einen strukturierten Befund. Rohdaten werden nur bei Bedarf nachgeladen.

## Lokale Wirkung messen

```bash
sparkompass pack --file "debug.log" --expect "AUTH_RESET_TOKEN_EXPIRED" --ledger
sparkompass ledger report .

sparkompass task run . --command "npm test" --expect-output "pass" --ledger
sparkompass task-ledger report .

sparkompass impact .
```

So entsteht eine Spur aus Einsparung, Qualitätsgate und Task-Ergebnis.

## Offizielle Codex-Usage auswerten

```bash
codex exec --json "antworte nur: ok" > .sparkompass/codex-run.jsonl

sparkompass codex-usage record . \
  --file ".sparkompass/codex-run.jsonl" \
  --ledger

sparkompass codex-usage report .
```

Für A/B:

```bash
sparkompass codex-usage compare . \
  --baseline ".sparkompass/raw-run.jsonl" \
  --optimized ".sparkompass/compact-run.jsonl"
```

Sparkompass prüft dabei Usage-Invarianten wie `cached_input_tokens <= input_tokens`, `reasoning_output_tokens <= output_tokens` und `total = input_tokens + output_tokens`.

## Experiment und Router

```bash
sparkompass experiment plan . \
  --raw-prompt-file "evidence/prompts/raw.txt" \
  --compact-prompt-file "evidence/prompts/compact.txt" \
  --model "gpt-5" \
  --reasoning-effort "medium" \
  --sandbox-mode "workspace-write" \
  --task-command "npm test" \
  --out "evidence/experiment-plan.json"

sparkompass experiment script . \
  --plan "evidence/experiment-plan.json" \
  --out "evidence/codex-experiment/run-experiment.sh"

sparkompass experiment audit . --plan "evidence/experiment-plan.json"
sparkompass experiment run . --variant "basis_raw=raw.jsonl" --variant "basis_kompakt=compact.jsonl" --variant "plugin_raw=plugin-raw.jsonl" --variant "plugin_kompakt=plugin-compact.jsonl"
sparkompass router decide . --experiment "evidence/experiment.json" --overhead "evidence/overhead.json"
```

Der Router empfiehlt `bypass`, `compact`, `lazy` oder `full`, je nachdem, was durch Usage, Qualität und Overhead getragen wird.

## Plugin und MCP

```bash
sparkompass-mcp
SPARKOMPASS_TOOL_PROFILE=standard sparkompass-mcp
sparkompass doctor overhead . --profile standard
```

Das Profil `standard` reduziert in diesem Repo die sichtbaren MCP-Tools von `48` auf `20` und spart lokal geschätzt ca. `11.716` Katalog-Tokens gegenüber dem Vollprofil. Das ist eine Planungszahl, keine Abrechnung.

## Release-Prüfung

```bash
npm run lint
npm test
npm run dogfood
npm run benchmark
npm run package-audit
npm run package-smoke
npm run plugin-smoke
npm run release-audit
```

Für den kompletten lokalen Check:

```bash
npm run check
```
