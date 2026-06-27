# Failure Corpus: Datenbank-Migration und Constraints

## Muss exakt bleiben

- ALTER TABLE invoices ADD CONSTRAINT invoices_account_id_fkey FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE RESTRICT;
- CREATE UNIQUE INDEX CONCURRENTLY idx_users_email_lower ON users (lower(email)) WHERE deleted_at IS NULL;
- UPDATE invoices SET status='archived' WHERE paid_at < '2025-01-01' AND status='paid';
- rollback: DROP INDEX CONCURRENTLY idx_users_email_lower;
- transaction: BEGIN; run backfill; COMMIT only after constraint validation.

## Warum das kritisch ist

Der Foreign-Key darf nicht zu `ON DELETE CASCADE` werden.
Der eindeutige Index gilt nur für nicht gelöschte Nutzer.
Das `UPDATE` darf ohne `WHERE` niemals laufen.
Der Rollback muss denselben Index entfernen, nicht die ganze Tabelle.
Der Commit darf erst nach der Constraint-Prüfung passieren.

## Rauschen

Die Migrationsnotiz wiederholt allgemeine Datenbankhinweise.
Die Migrationsnotiz wiederholt allgemeine Datenbankhinweise.
Die Migrationsnotiz wiederholt allgemeine Datenbankhinweise.
Die Migrationsnotiz wiederholt allgemeine Datenbankhinweise.
Die Migrationsnotiz wiederholt allgemeine Datenbankhinweise.
