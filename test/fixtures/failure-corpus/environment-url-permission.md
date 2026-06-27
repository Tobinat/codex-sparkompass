# Failure Corpus: Umgebung, URL und Berechtigung

## Muss exakt bleiben

- DATABASE_URL=https://db.internal.example/v2?sslmode=require
- SPARKOMPASS_TOKEN_FILE=.secrets/sparkompass-token
- chmod 0600 .secrets/sparkompass-token
- Webhook endpoint: https://hooks.example.com/codex/sparkompass
- Do not paste SPARKOMPASS_TOKEN into Codex.

## Warum das kritisch ist

Die Datenbank-URL enthält das benötigte SSL-Flag.
Die Token-Datei darf nur lokal gelesen werden und muss mit 0600 geschützt bleiben.
Der Webhook-Endpunkt ist der einzige erlaubte ausgehende Zielpfad.
Der Rohwert aus SPARKOMPASS_TOKEN darf nie in einen Prompt kopiert werden.

## Rauschen

Die Betriebsnotiz wiederholt allgemeine Deployment-Hinweise.
Die Betriebsnotiz wiederholt allgemeine Deployment-Hinweise.
Die Betriebsnotiz wiederholt allgemeine Deployment-Hinweise.
Die Betriebsnotiz wiederholt allgemeine Deployment-Hinweise.
Die Betriebsnotiz wiederholt allgemeine Deployment-Hinweise.
