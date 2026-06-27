# Failure Corpus: API-Vertrag und Schema

## Muss exakt bleiben

- POST /v1/context-packs/{context_pack_id}/verify -> 200 OK
- GET /v1/context-packs/{context_pack_id}/evidence?source_hash={source_hash} -> 206 Partial Content
- 409 Conflict means receipt_hash mismatch; do not retry as success.
- request.required: context_pack_id, receipt_hash, source_hash
- response.required: gate.status, delivered_context.hash, source_evidence.coverage

## Warum das kritisch ist

Der Client darf POST und GET nicht vertauschen.
Partial Content ist gewollt, weil nur begrenzte Originalzeilen geladen werden.
Ein Receipt-Hash-Konflikt ist ein harter Review-Fall und kein erfolgreicher Retry.
Die Request-Pflichtfelder verbinden Pack-ID, Receipt und Source-Hash.
Die Response-Pflichtfelder belegen Gate, gelieferten Kontext und Source Evidence.

## Rauschen

Die API-Notiz wiederholt allgemeine Integrationshinweise.
Die API-Notiz wiederholt allgemeine Integrationshinweise.
Die API-Notiz wiederholt allgemeine Integrationshinweise.
Die API-Notiz wiederholt allgemeine Integrationshinweise.
Die API-Notiz wiederholt allgemeine Integrationshinweise.
