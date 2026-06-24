# Installation

Codex Sparkompass ist aktuell eine `v0.1.0-alpha` Technical Preview. Es ist ein lokales Node.js-CLI mit Codex-Skill, Plugin-Kandidat und MCP-Server.

## Voraussetzungen

- Node.js 20 oder neuer
- npm
- Git, wenn du das Repository klonen willst

## Schnellstart aus GitHub

```bash
git clone https://github.com/Tobinat/codex-sparkompass.git
cd codex-sparkompass
npm ci
npm run check
node ./bin/codex-sparkompass.mjs doctor
node ./bin/codex-sparkompass.mjs audit .
```

Wenn du die CLI global aus dem lokalen Checkout nutzen willst:

```bash
npm link
sparkompass doctor
sparkompass audit .
```

## Download ohne Git

1. Öffne die GitHub-Release-Seite.
2. Lade `Source code (zip)` oder das Release-Artefakt `codex-sparkompass-0.1.0.tgz`.
3. Entpacke das Projekt.
4. Führe aus:

```bash
npm ci
npm run check
node ./bin/codex-sparkompass.mjs doctor
```

## Lokales Paket installieren

```bash
npm pack --ignore-scripts
npm install -g ./codex-sparkompass-0.1.0.tgz
sparkompass doctor
```

Hinweis: `npm pack --ignore-scripts` baut nur das lokale Paket. Der normale Release-Weg ist `npm run check` vor dem Packen.

## Erste sinnvolle Befehle

```bash
sparkompass audit .
sparkompass recommend . --goal "Nächsten Codex-Lauf vorbereiten"
sparkompass handoff . --goal "Gezielten Codex-Start bauen" --budget 800
sparkompass release-audit .
```

Alle Tokenwerte sind lokale Schätzungen oder aus lokalen Codex-Usage-Belegen abgeleitete Werte. Sie sind keine Abrechnung.
