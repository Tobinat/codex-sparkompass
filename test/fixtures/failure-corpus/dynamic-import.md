# Failure Corpus: Dynamischer Import

## Muss exakt bleiben

- importProvider = await import(`./providers/${tenant}.mjs`)
- allowed_tenants = ["eu", "us"]
- Do not replace dynamic import with static ./providers/default.mjs.
- fallback only when tenant is missing.

## Kontext

Der Provider wird zur Laufzeit anhand des Tenants geladen.
Nur die Tenants `eu` und `us` sind erlaubt.
Ein statischer Default-Provider würde die Mandantentrennung verdecken.

## Rauschen

Die Integrationsnotiz erklärt historische Provider-Experimente.
Die Integrationsnotiz erklärt historische Provider-Experimente.
Die Integrationsnotiz erklärt historische Provider-Experimente.
Die Integrationsnotiz erklärt historische Provider-Experimente.
Die Integrationsnotiz erklärt historische Provider-Experimente.
