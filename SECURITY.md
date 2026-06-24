# Security Policy

## Unterstützte Versionen

| Version | Status |
| --- | --- |
| `v0.1.0-alpha` | Technical Preview |

## Sicherheit melden

Bitte melde Sicherheitsprobleme nicht öffentlich als normales Issue, wenn sie private Repository-Inhalte, Secrets, Token, Credentials oder gefährliche Ausführungspfade offenlegen könnten.

Für diese Alpha-Version gilt:

- Keine Telemetrie.
- Kein geplanter Upload von Repository-Inhalten.
- Keine automatische Änderung des internen Codex-Requests.
- MCP-Tools laden lokale Dateien nur auf explizite Tool-Anfrage.
- Hook-Ausgaben sollen große Prompts erkennen, aber sensible Prompt-Inhalte nicht ausgeben.

## Besonders sensible Bereiche

- Prompt- und Log-Redaktion
- `source_hash`-Nachladen
- MCP-Tool-Ausgaben
- lokale Package-/Plugin-Smoke-Tests
- Shell-Kommandos in TaskOutcome-Flows

## Erwartung an Reports

Bitte beschreibe:

- betroffene Version oder Commit
- betroffener Befehl oder Tool-Name
- minimaler Reproduktionsfall
- erwartetes und tatsächliches Verhalten
- ob private Daten, Secrets oder lokale Pfade sichtbar wurden
