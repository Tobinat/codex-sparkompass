# Sparkompass Evidenzstand

Diese Seite fasst die sichtbaren Messwerte für die Alpha-Version zusammen. Alle Tokenwerte sind lokale Messwerte oder lokale Schätzungen. Sie sind keine offizielle Abrechnung.

## Codex A/B-Beleg

Quelle: [official-codex-usage-evidence.md](official-codex-usage-evidence.md)

Redigierte Artefakte zum Nachrechnen: [`evidence/case-studies/readme-ab-v1`](../evidence/case-studies/readme-ab-v1/)

| Messwert | Raw README Prompt | Sparkompass Compact Prompt | Ersparnis |
| --- | ---: | ---: | ---: |
| Gesamt-Tokens | `40.758` | `32.341` | `8.417` (`21%`) |
| Input-Tokens | `40.657` | `32.286` | `8.371` (`21%`) |
| Nicht gecachte Input-Tokens | `38.225` | `22.174` | `16.051` (`42%`) |
| Output-Tokens | `101` | `55` | `46` |
| Reasoning-Output-Tokens | `94` | `48` | `46` |

Gate: `verified-codex-official-usage-comparison`

## Lokale Qualitäts- und Effizienzsignale

| Signal | Wert |
| --- | ---: |
| Tests | `277/277` |
| Benchmark-Fälle | `26` |
| Failure-Corpus | `23/23` |
| Gegenfakten im Benchmark erkannt | `169/169` |
| Benchmark-Ersparnis | `52%` |
| Benchmark-Gesamtkosten pro verifiziertem Task | `133` Tokens |
| Benchmark-Task-Erfolgsdelta | `0%` |
| Dogfood durchschnittliche Ersparnis | `36%` |
| Dogfood kritische Anker-Erhaltung | `100%` |
| Pilot-Startkontext-Ersparnis | `42%` |
| Pilot-sendbare-Prompt-Ersparnis | `18%` |

## Release-Gates

| Gate | Status |
| --- | --- |
| Scorecard | `verified-scorecard` |
| Evidence-Audit | `verified-evidence-audit` |
| Ablation-Audit | `verified-ablation-audit` |
| Slimming-Plan | `verified-slimming-plan` |
| Package-Dry-Run | `verified-package-dry-run` |
| Package-Install-Smoke | `verified-package-install-smoke` |
| Plugin-Install-Smoke | `verified-plugin-install-smoke` |
| GitHub-Claims-Audit | `verified-github-release-claims` |
| Release-Audit | `verified-release-audit` |
| GatePath | `verified-gate-path-prepared` |

## Einordnung

Der aktuelle Stand reicht für eine GitHub Technical Preview. Für Stable fehlt noch das harte End-to-End-Gate:

- mehrere echte Aufgaben
- gepaarte Raw/Compact-Läufe
- vergleichbare Modell-, Sandbox- und Workspace-Bedingungen
- offizielle Codex-Usage-JSONL
- TaskOutcome-Ledger
- gleiche oder bessere Erfolgsrate bei weniger Tokens pro verifiziertem Task

Sparkompass behauptet `verified-end-to-end-noninferior` erst, wenn diese Belege vollständig sind.
