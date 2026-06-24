# Contributing

Danke, dass du Codex Sparkompass verbessern willst.

## Entwicklungssetup

```bash
npm ci
npm run check
```

## Regeln für Änderungen

- Nutzertexte und README-Erklärungen bleiben auf Deutsch.
- Tokenwerte müssen klar als Schätzung, lokaler Beleg oder offizielle Codex-Usage aus JSONL benannt werden.
- Keine Behauptung, dass Sparkompass Codex intern umschreibt oder offizielle Abrechnung ersetzt.
- Neue Empfehlungen müssen auf dokumentiertem Codex-Verhalten oder lokal messbaren Signalen basieren.
- CLI-Code soll ohne unnötige Runtime-Abhängigkeiten bleiben.

## Vor einem Pull Request

```bash
npm run lint
npm test
npm run release-audit
npm run package-audit
```

Für Release-nahe Änderungen:

```bash
npm run check
```

## Gute Issue-Beispiele

- Ein ContextPack verliert eine wichtige Muss-Fakt.
- Ein Router-Modus entscheidet zu aggressiv.
- Ein Release-Audit-Gate ist unklar dokumentiert.
- Ein Installationsschritt funktioniert auf einem frischen System nicht.
