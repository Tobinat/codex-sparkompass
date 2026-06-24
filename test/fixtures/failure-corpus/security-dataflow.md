# Failure Corpus: Sicherheits-Datenfluss

## Muss exakt bleiben

- source: req.headers.authorization
- sanitizer: hashToken(rawAuthorization)
- sink: db.query("UPDATE sessions SET token_hash = ?")
- Never log rawAuthorization.
- Done when: raw token never reaches logger or SQL sink.

## Warum das kritisch ist

Der rohe Authorization-Header darf nur in `rawAuthorization` liegen, bis `hashToken(rawAuthorization)` ausgeführt wurde.
Danach darf nur der Hash in die Datenbank.
Ein Log von `rawAuthorization` wäre ein Sicherheitsfehler, auch wenn der Datenbankpfad korrekt bleibt.

## Rauschen

Die Audit-Notiz beschreibt irrelevante Session-Metriken.
Die Audit-Notiz beschreibt irrelevante Session-Metriken.
Die Audit-Notiz beschreibt irrelevante Session-Metriken.
Die Audit-Notiz beschreibt irrelevante Session-Metriken.
Die Audit-Notiz beschreibt irrelevante Session-Metriken.
