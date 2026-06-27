# Changelog

## v0.1.0-alpha.1

Release Candidate für klarere Token-Ersparnis mit stärkerem Qualitätsnachweis.

### Verbessert

- Neuer Failure-Corpus-Fall `web-security-header` für `Set-Cookie`, `HttpOnly`, `Secure`, `SameSite`, CORS-Origin, CSP-Nonce, `frame-ancestors` und CSRF-Verträge.
- Neue kritische Ankerklasse `web-security-header`, damit Security-Header und Cookie-Regeln nicht von einem guten Gesamtwert verdeckt werden.
- Benchmark erweitert auf `26` Fälle und `23/23` Failure-Corpus-Klassen.
- Gegenfakten-Prüfung erweitert auf `169/169` erkannte Gegenfakten.
- `release-audit` prüft nun GitHub-README, Evidence-Seite, aktuelle Release Notes, Changelog und Publishing-Runbook gegen die belegten Spar- und Qualitätszahlen.
- README, Evidenzseite, Release-Checklist und Einsparungsdiagramm auf denselben Messstand gebracht.
- Versionen in Paket, Lockfile und Plugin-Manifest auf `0.1.0-alpha.1` synchronisiert.

### Aktueller Belegstand

- Lokaler Codex A/B-Beleg: `8.417` Tokens gespart, `21%` Gesamt-Ersparnis.
- Nicht gecachter Input im A/B-Beleg: `16.051` Tokens gespart, `42%`.
- Benchmark: `52%` durchschnittliche Ersparnis, `0` Regressionen, `26/26` TaskOutcome-Erfolge.
- GitHub-Claims-Audit: `verified-github-release-claims`.
- Kritische Anker: `100%` im Benchmark und Dogfood.

### Einschränkungen

- Weiterhin Technical Preview, keine Stable-Version.
- Noch nicht offiziell in Codex integriert.
- Der Hook gibt lokale Empfehlungen, verändert aber keinen internen Codex-Request.
- Tokenwerte bleiben lokale Messwerte oder lokale Usage-Belege, keine Abrechnung.

## v0.1.0-alpha.0

Technical Preview für GitHub.

### Enthalten

- Lokales CLI `sparkompass`
- MCP-Server `sparkompass-mcp`
- Lokaler Codex-Plugin-Kandidat mit Skill, MCP-Bridge und Hook-Kandidat
- ContextPack-, Handoff-, PromptPreparation-, Evidence-, Ablation- und Slimming-Flows
- Vierarmige Experimentstruktur: `basis_raw`, `basis_kompakt`, `plugin_raw`, `plugin_kompakt`
- RunManifest- und Usage-Invariant-Prüfung für offizielle Codex-JSONL-Usage
- Router-Modi `bypass`, `compact`, `lazy`, `full`
- Tool-Profile `minimal`, `standard`, `benchmark`, `release`, `debug`
- Gekürzte README; ausführliche Nutzung und Messwerte liegen in `docs/usage.md` und `docs/evidence.md`
- Überarbeitete SVG-Diagramme mit Umlauten und eigenem Einsparungsdiagramm
- Eigenständiges Plugin-`dist`-Bundle für Git-Marketplace-Installationen ohne globale `sparkompass`-CLI
- Verschärfter Plugin-Smoke mit Git-Marketplace-Cache, Hook-Ausführung über `PLUGIN_ROOT` und Prompt-Redaktion
- Redigiertes A/B-Evidence-Bundle unter `evidence/case-studies/readme-ab-v1`
- Release-Audit mit `30/30` lokalen Anforderungen
- `SparkompassGatePathV1` als Pfad von offizieller A/B-Usage-Evidenz zu `quality-noninferior` und vorbereitetem `verified-end-to-end-noninferior`

### Wichtige Einschränkungen

- Noch keine stabile Produktversion.
- Noch nicht offiziell in Codex integriert.
- Der Hook ändert den Codex-Prompt nicht automatisch.
- Tokenwerte sind lokale Schätzungen oder lokale Usage-Belege, keine offizielle Abrechnung.
- `verified-end-to-end-noninferior` ist vorbereitet, aber noch nicht final erreicht.
