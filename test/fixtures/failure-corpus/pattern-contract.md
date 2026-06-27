# Failure Corpus: Regex Glob und Matcher

## Muss exakt bleiben

- route_regex=^/api/(auth|billing)/v[0-9]+/callback$
- path_glob=packages/*/src/**/*.ts
- deny_pattern=^(?!prod-[a-z0-9-]+$).*
- mask_regex=(?<=token=)[A-Za-z0-9_-]{16,}
- ignore_glob=!(*.spec).{ts,tsx}

## Warum das kritisch ist

Der Route-Regex bestimmt, welche Webhook-Callbacks akzeptiert werden.
Der Glob entscheidet, welche Paketquellen im Monorepo geladen werden.
Das Deny-Pattern verhindert, dass Nicht-Produktionsnamen als Produktionsressourcen behandelt werden.
Der Mask-Regex muss Tokens erkennen, ohne den Prefix token= zu entfernen.
Der Ignore-Glob schliesst Tests aus, ohne normale TypeScript-Dateien zu verlieren.

## Rauschen

Die Pattern-Notiz wiederholt allgemeine Matcher-Hinweise.
Die Pattern-Notiz wiederholt allgemeine Matcher-Hinweise.
Die Pattern-Notiz wiederholt allgemeine Matcher-Hinweise.
Die Pattern-Notiz wiederholt allgemeine Matcher-Hinweise.
Die Pattern-Notiz wiederholt allgemeine Matcher-Hinweise.
