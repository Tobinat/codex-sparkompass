# GitHub Publishing Runbook

Dieses Runbook beschreibt den ersten öffentlichen GitHub-Release für Codex Sparkompass.

## Vorgeschlagener Repository-Name

`codex-sparkompass`

Kurzbeschreibung:

> Deutschsprachige Context-Control-Plane für sparsamere, belegbare Codex-Workflows.

Themen:

- `codex`
- `openai`
- `mcp`
- `tokens`
- `context-control`
- `prompting`
- `developer-tools`

## Vor dem Push prüfen

```bash
npm ci
npm run check
git status --short
```

Erwartet:

- Tests grün
- `release-audit`: `30/30`
- `package-audit`: `verified-package-dry-run`
- `plugin-smoke`: `verified-plugin-install-smoke`
- keine `.sparkompass/`, `node_modules/`, `.env` oder `*.tgz` im Commit

## GitHub CLI installieren

Auf diesem System war `gh` beim Erstellen dieses Runbooks nicht installiert. Installation:

```bash
brew install gh
gh auth login
```

## Öffentliches Repo erstellen und pushen

```bash
git add -A
git commit -m "Release v0.1.0-alpha.0"
gh repo create codex-sparkompass \
  --public \
  --source=. \
  --remote=origin \
  --push \
  --description "Deutschsprachige Context-Control-Plane für sparsamere, belegbare Codex-Workflows."
```

Wenn das Repo schon existiert:

```bash
git remote add origin https://github.com/Tobinat/codex-sparkompass.git
git push -u origin main
```

## Release-Artefakt bauen

```bash
npm run check
npm pack --ignore-scripts
```

## Git-Marketplace vor Release prüfen

```bash
npm run build:plugin
npm run plugin-smoke
```

Das Gate muss `verified-plugin-install-smoke` melden und darin den Git-Marketplace-Smoke als `ok` zeigen. Dieser Smoke simuliert eine installierte Plugin-Cache-Kopie ohne globale `sparkompass`-CLI.

## GitHub Release erstellen

```bash
git tag -a v0.1.0-alpha.0 -m "v0.1.0-alpha.0"
git push origin v0.1.0-alpha.0
gh release create v0.1.0-alpha.0 \
  ./codex-sparkompass-0.1.0-alpha.0.tgz \
  --title "Codex Sparkompass v0.1.0-alpha.0" \
  --notes-file docs/releases/v0.1.0-alpha.0.md
```

Danach das lokale Tarball-Artefakt wieder entfernen:

```bash
rm -f codex-sparkompass-0.1.0-alpha.0.tgz
```

## Optional: npm-Veröffentlichung vorbereiten

Für eine spätere npm-Veröffentlichung sollte GitHub Actions mit npm Trusted Publishing und Provenance genutzt werden. Dadurch ist öffentlich prüfbar, aus welchem Repository und Workflow das Paket gebaut wurde. Vorher muss die Version in `package.json`, `package-lock.json` und `plugins/codex-sparkompass/.codex-plugin/plugin.json` identisch bleiben.

## Was im Release nicht behauptet werden darf

- Nicht: offiziell in Codex eingebaut.
- Nicht: garantiert immer Tokenersparnis.
- Nicht: offizielle Abrechnung.
- Nicht: interner Codex-Request wird automatisch komprimiert.

Stattdessen:

- Lokale Context-Control-Plane.
- Technical Preview.
- Belegbare lokale Usage- und Qualitätsgates.
- Vorbereitung auf `verified-end-to-end-noninferior`.
