# Changelog

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
