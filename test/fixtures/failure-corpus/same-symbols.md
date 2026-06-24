# Failure Corpus: Gleichnamige Symbole

## Kritische Unterscheidung

- production symbol: buildTokenPlan
- test helper: buildTokenPlanFixture
- Do not replace production buildTokenPlan with buildTokenPlanFixture.
- Done when: src/context-plan.mjs keeps the production buildTokenPlan path.

## Kontext

`buildTokenPlan` berechnet die echten Lane-Entscheidungen für Codex.
`buildTokenPlanFixture` erzeugt nur Testdaten für Benchmark-Snapshots.
Beide Namen sind absichtlich ähnlich, weil dieser Fall prüfen soll, ob Verdichtung Symbolrollen verwechselt.

## Rauschen

Die Release-Notiz wiederholt allgemeine Planungsdetails.
Die Release-Notiz wiederholt allgemeine Planungsdetails.
Die Release-Notiz wiederholt allgemeine Planungsdetails.
Die Release-Notiz wiederholt allgemeine Planungsdetails.
Die Release-Notiz wiederholt allgemeine Planungsdetails.
