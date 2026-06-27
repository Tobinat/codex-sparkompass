# Failure Corpus: Reihenfolge und Praezedenz

## Muss exakt bleiben

- precedence: env > repo config > default
- fallback order: cache -> database -> remote API
- Must hash rawAuthorization before writing session_token_hash.
- Run schema migration before enabling FEATURE_BILLING_V2.
- First validate tenant, then load ./providers/${tenant}.mjs.

## Warum das kritisch ist

Die Reihenfolge entscheidet, ob ein Agent die sichere Quelle waehlt oder eine Default-Konfiguration zu frueh nutzt.
Der Fallback darf die Remote API nur erreichen, wenn Cache und Datenbank keine Antwort liefern.
Der rohe Authorization-Wert darf nie geschrieben werden, bevor der Hash gebildet ist.
Die Billing-Funktion darf erst nach der Migration aktiv werden.
Der Tenant muss validiert sein, bevor ein dynamischer Provider geladen wird.

## Rauschen

Die Architektur-Notiz wiederholt allgemeine Integrationsdetails.
Die Architektur-Notiz wiederholt allgemeine Integrationsdetails.
Die Architektur-Notiz wiederholt allgemeine Integrationsdetails.
Die Architektur-Notiz wiederholt allgemeine Integrationsdetails.
Die Architektur-Notiz wiederholt allgemeine Integrationsdetails.
