# Failure Corpus: Idempotenz und Nebenlaeufigkeit

## Muss exakt bleiben

- Idempotency-Key header is required for POST /v1/payments/capture.
- idempotency_key UNIQUE prevents duplicate charge capture.
- SELECT * FROM payment_jobs WHERE status='queued' FOR UPDATE SKIP LOCKED;
- isolation_level=serializable
- retry_on_conflict=false after charge_captured=true

## Warum das kritisch ist

Ohne Idempotency-Key kann derselbe Capture doppelt laufen.
Die UNIQUE-Regel koppelt Wiederholungen an denselben Request.
SKIP LOCKED verhindert, dass zwei Worker denselben Job bearbeiten.
Serializable verhindert verlorene Updates.
Nach charge_captured=true darf kein Retry als neuer Capture laufen.

## Rauschen

Die Betriebsnotiz wiederholt allgemeine Queue-Hinweise.
Die Betriebsnotiz wiederholt allgemeine Queue-Hinweise.
Die Betriebsnotiz wiederholt allgemeine Queue-Hinweise.
Die Betriebsnotiz wiederholt allgemeine Queue-Hinweise.
Die Betriebsnotiz wiederholt allgemeine Queue-Hinweise.
