# Compression Failure Corpus

Der Failure-Corpus sammelt kleine, bewusst heikle Beispiele für Kompression in Coding-Agenten. Jeder Fall muss gegen Vollkontext und kompakten ContextPack bestehen.

Im Quell-Repository werden die Dateien unter `test/fixtures/failure-corpus/` gelesen. Für installierte Pakete enthält `SparkompassBenchmarkV1` eingebaute Fallback-Fixtures, damit `sparkompass benchmark` auch ohne Testdateien lauffähig bleibt.

## Aktuelle Fallklassen

- **Negation und Flags**: `DO_NOT_DELETE_USERS`, `--no-force`, kein `--force`, keine destruktive Migration.
- **Version, Zahl und Priorität**: exakte API-Version, Timeout, Retry-Zahl und Konfigurationsreihenfolge.
- **Stacktrace-Abbruch**: erster fehlerhafter Frame, Wiederholungszahl, Fehlercode und Done-Kriterium.
- **Gleichnamige Symbole**: Produktionssymbol und Test-Fixture dürfen nicht vertauscht werden.
- **Sicherheits-Datenfluss**: Quelle, Sanitizer, Sink und Log-Verbot müssen zusammen erhalten bleiben.
- **Dynamischer Import**: tenant-abhängiger Import darf nicht zu statischem Default vereinfacht werden.
- **Monorepo-Abhängigkeit**: betroffenes Paket, Shared-Config-Owner und Testfilter bleiben gekoppelt.

## Release-Regel

`sparkompass benchmark .` muss melden:

- `Failure-Corpus-Erfolge` = alle Failure-Corpus-Fälle
- `Failure-Corpus-Klassen` = alle Pflichtklassen in `FailureCorpusCoverageV1`
- `Regressionen gegen Vollkontext` = 0
- `Gegenfakten erkannt` = alle erwarteten Soll-Fakten
- `Gate: verified-benchmark`

Ein neuer Corpus-Fall sollte mindestens eine konkrete Gefahr abdecken: verlorene Negation, falsche Zahl, vertauschte Priorität, abgeschnittener Stacktrace, gleichnamiges Symbol, Sicherheitsdatenfluss, dynamischen Import, Monorepo-Abhängigkeit oder Konfigurationswert.
