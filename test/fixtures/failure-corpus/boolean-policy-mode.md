# Failure Corpus: Boolesche Policy- und Moduswerte

## Muss exakt bleiben

- allow_production_writes=false
- delete_users=false
- mode=read-only
- policy=deny-by-default
- migration_required=true

## Warum das kritisch ist

Produktionsschreibzugriffe bleiben aus.
User-Loeschungen duerfen nicht aktiviert werden.
Der Modus bleibt read-only, bis der Handoff belegt ist.
Deny-by-default verhindert stille Freigaben.
Die Migration ist weiterhin Pflicht, bevor der Task als erledigt gilt.

## Rauschen

Die Betriebsnotiz erklaert allgemeine Reviewablaeufe.
Die Betriebsnotiz erklaert allgemeine Reviewablaeufe.
Die Betriebsnotiz erklaert allgemeine Reviewablaeufe.
Die Betriebsnotiz erklaert allgemeine Reviewablaeufe.
Die Betriebsnotiz erklaert allgemeine Reviewablaeufe.
