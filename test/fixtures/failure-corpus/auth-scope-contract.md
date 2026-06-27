# Failure Corpus: Auth Scope und Rollenvertrag

## Muss exakt bleiben

- required_scopes=openid profile email repo:read repo:write
- role=admin must not degrade to viewer
- claims.required=tenant_id,org_id,email_verified
- audience=api://sparkompass-prod
- permission=payments.capture:write

## Warum das kritisch ist

OAuth-Scopes entscheiden, ob Codex den richtigen API-Pfad pruefen kann.
Die Admin-Rolle darf in einem Fix nicht zur Viewer-Rolle vereinfacht werden.
Tenant- und Organisationsclaims sind Pflicht fuer Mandantentrennung.
Die Audience verhindert Token fuer falsche Dienste.
Die Capture-Schreibberechtigung ist absichtlich enger als eine breite Payment-Berechtigung.

## Rauschen

Die Auth-Notiz wiederholt allgemeine Login-Hinweise.
Die Auth-Notiz wiederholt allgemeine Login-Hinweise.
Die Auth-Notiz wiederholt allgemeine Login-Hinweise.
Die Auth-Notiz wiederholt allgemeine Login-Hinweise.
Die Auth-Notiz wiederholt allgemeine Login-Hinweise.
