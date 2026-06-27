# Failure Corpus: Numerische Grenzen und Einheiten

## Muss exakt bleiben

- p95_latency <= 250ms
- max_memory=512MiB
- retry_budget=0
- rate_limit=120/min
- rollout_percent=5%

## Warum das kritisch ist

Die Latenzgrenze ist ein Release-Blocker.
Das Speicherlimit verhindert instabile Container-Neustarts.
Das Retry-Budget null verhindert doppelte Schreiboperationen.
Das Rate-Limit schützt den internen Codex-Usage-Sampler.
Der Rollout bleibt bei 5%, bis echte TaskOutcome-Belege vorliegen.

## Rauschen

Der Betriebsbericht enthält allgemeine Hinweise zum Monitoring.
Der Betriebsbericht enthält allgemeine Hinweise zum Monitoring.
Der Betriebsbericht enthält allgemeine Hinweise zum Monitoring.
Der Betriebsbericht enthält allgemeine Hinweise zum Monitoring.
Der Betriebsbericht enthält allgemeine Hinweise zum Monitoring.
