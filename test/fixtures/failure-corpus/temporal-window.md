# Failure Corpus: Zeitfenster und Ablaufzeiten

## Muss exakt bleiben

- deploy_window=2026-07-01T02:00:00+02:00..2026-07-01T03:00:00+02:00
- not_before=2026-07-01T02:00:00+02:00
- expires_at=2026-07-01T03:00:00+02:00
- cron: "15 2 * * 1-5" Europe/Berlin
- ttl=15m

## Warum das kritisch ist

Das Deploy darf nicht vor dem Not-before-Zeitpunkt starten.
Das Ablaufdatum begrenzt den Rollout hart.
Die Cron-Zeile ist absichtlich in Europe/Berlin, nicht UTC.
Die TTL von 15 Minuten verhindert alte Freigaben.
Ein falscher Zeitraum kann denselben Code zur falschen Zeit ausführen.

## Rauschen

Die Release-Notiz wiederholt allgemeine Kalenderhinweise.
Die Release-Notiz wiederholt allgemeine Kalenderhinweise.
Die Release-Notiz wiederholt allgemeine Kalenderhinweise.
Die Release-Notiz wiederholt allgemeine Kalenderhinweise.
Die Release-Notiz wiederholt allgemeine Kalenderhinweise.
