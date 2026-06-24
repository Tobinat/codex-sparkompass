# Failure Corpus: Negation und Flag

## Kritische Entscheidung

- DO_NOT_DELETE_USERS ist aktiv.
- Die Migration ist not safe to run with --force.
- Verwende ausschliesslich `--no-force`.
- Do not set ENABLE_DESTRUCTIVE_MIGRATION=true.

## Kontext

Das Team will alte Demo-Datensätze entfernen, aber produktive Nutzer müssen unverändert bleiben.
Ein früherer Entwurf sagte, dass `--force` schneller wäre. Dieser Entwurf ist verworfen.
Die sichere Variante prüft erst die Betroffenenliste und beendet sich ohne Schreibzugriff.

## Nicht entscheidender Hintergrund

Diese Passage ist Fülltext für den Kompressionsdruck.
Diese Passage ist Fülltext für den Kompressionsdruck.
Diese Passage ist Fülltext für den Kompressionsdruck.
Diese Passage ist Fülltext für den Kompressionsdruck.
Diese Passage ist Fülltext für den Kompressionsdruck.
Diese Passage ist Fülltext für den Kompressionsdruck.
