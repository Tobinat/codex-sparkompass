# Failure Corpus: Version, Zahl und Priorität

## Muss exakt bleiben

- API_VERSION=2026-06-23
- timeout_ms=1500
- retry_count=0
- priority: env > cli > default

## Warum das kritisch ist

Die Version `2026-06-23` wählt das neue Antwortschema.
Ein Timeout von 1500 ms ist Absicht, weil längere Wartezeiten den Job blockieren.
`retry_count=0` verhindert doppelte Abbuchungen.
Die Priorität env > cli > default ist für reproduzierbare CI-Läufe verbindlich.

## Rauschen

Die Produktnotiz erklärt, warum schnelle Rückmeldung wichtiger als Komfort ist.
Die Produktnotiz erklärt, warum schnelle Rückmeldung wichtiger als Komfort ist.
Die Produktnotiz erklärt, warum schnelle Rückmeldung wichtiger als Komfort ist.
Die Produktnotiz erklärt, warum schnelle Rückmeldung wichtiger als Komfort ist.
Die Produktnotiz erklärt, warum schnelle Rückmeldung wichtiger als Komfort ist.
