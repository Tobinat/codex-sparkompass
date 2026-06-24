# Failure Corpus: Monorepo-Abhängigkeit

## Muss exakt bleiben

- packages/api depends on packages/shared-config.
- packages/shared-config owns FEATURE_BILLING_V2.
- Do not edit packages/web for this failure.
- Test command: pnpm --filter @acme/api test.

## Kontext

Der Fehler tritt im API-Paket auf, weil `FEATURE_BILLING_V2` aus `packages/shared-config` kommt.
`packages/web` importiert denselben Wert nur für Anzeigezwecke und darf für diesen Fix nicht angefasst werden.
Die richtige Verifikation läuft mit dem API-Filter.

## Rauschen

Die Monorepo-Notiz listet alte Paketnamen.
Die Monorepo-Notiz listet alte Paketnamen.
Die Monorepo-Notiz listet alte Paketnamen.
Die Monorepo-Notiz listet alte Paketnamen.
Die Monorepo-Notiz listet alte Paketnamen.
