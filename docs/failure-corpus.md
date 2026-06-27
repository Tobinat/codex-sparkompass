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
- **Umgebung, URL und Berechtigung**: Env-Zuweisungen, erlaubte Endpunkte, Token-Dateipfade und Dateirechte wie `chmod 0600` bleiben exakt erhalten.
- **Numerische Grenzen und Einheiten**: Latenz-, Speicher-, Retry-, Rate-Limit- und Rollout-Werte bleiben mit Operator und Einheit exakt erhalten.
- **Boolesche Policy- und Moduswerte**: Sicherheitsnahe Konfigurationswerte wie `allow_production_writes=false`, `delete_users=false`, `mode=read-only`, `policy=deny-by-default` und `migration_required=true` bleiben exakt erhalten.
- **Diff-Polarität und Hunk-Kontext**: Patch-Header, Hunk-Marker und relevante `+`-/`-`-Zeilen bleiben erhalten, damit entfernte und hinzugefügte Sicherheitswerte nicht vertauscht werden.
- **Reihenfolge und Präzedenz**: Konfigurationsprioritäten, Fallback-Ketten und `before`-/`then`-Regeln bleiben als Reihenfolge erhalten.
- **Zeitfenster und Ablaufzeiten**: Deploy-Fenster, `not_before`, `expires_at`, Cron-Zeitzonen und TTL-Werte bleiben exakt erhalten.
- **API-Vertrag und Schema**: HTTP-Methode, Endpoint, Statuscode, Konfliktsemantik sowie Request-/Response-Pflichtfelder bleiben gekoppelt erhalten.
- **Datenbank-Migration und Constraints**: Foreign Keys, `ON DELETE`, partielle Unique-Indexes, `WHERE`-gebundene Updates, Rollback-Befehle und Transaktionsreihenfolge bleiben exakt erhalten.
- **Idempotenz und Nebenlaeufigkeit**: `Idempotency-Key`, eindeutige Dedupe-Keys, `FOR UPDATE SKIP LOCKED`, Isolation-Level und Retry-Policies nach Side-Effects bleiben exakt erhalten.
- **Locale, Encoding und Normalisierung**: `UTF-8`, `NFC`, deutsche Locale-/Collation-Werte und Case-Sensitivity bei Umlauten bleiben exakt erhalten.
- **Auth Scope und Rollenvertrag**: OAuth-Scopes, Rollen, Claims, Audience und fein geschnittene Permissions bleiben exakt gekoppelt erhalten.
- **Crypto Signature und Hashvertrag**: Signaturalgorithmus, Key-ID, JWKS-URI, erwarteter SHA-256-Digest und Signature-Header bleiben exakt erhalten.
- **Money Currency und Rundung**: Betrag in kleinster Einheit, Währung, Steuerprozentsatz, Gebühren-Basispunkte, Rundungsmodus und Minor-Units bleiben exakt erhalten.
- **Destruktive Operationen**: Lösch-, Destroy-, Reset- und Prune-Befehle behalten Ziel, Umgebung, Bucket, Namespace und Safety-Flags exakt sichtbar.
- **Regex Glob und Matcher**: Regex-Anker, Lookarounds, Zeichenklassen, Glob-Sterne und negierte Matcher bleiben exakt erhalten.
- **Web Security Header und Cookies**: `Set-Cookie`, `HttpOnly`, `Secure`, `SameSite`, CORS-Origin, CSP-Nonce, `frame-ancestors` und CSRF-Verträge bleiben exakt erhalten.

## Release-Regel

`sparkompass benchmark .` muss melden:

- `Failure-Corpus-Erfolge` = alle Failure-Corpus-Fälle
- `Failure-Corpus-Klassen` = alle Pflichtklassen in `FailureCorpusCoverageV1`
- `Regressionen gegen Vollkontext` = 0
- `Gegenfakten erkannt` = alle erwarteten Soll-Fakten
- `Gate: verified-benchmark`

Ein neuer Corpus-Fall sollte mindestens eine konkrete Gefahr abdecken: verlorene Negation, falsche Zahl, vertauschte Priorität, abgeschnittener Stacktrace, gleichnamiges Symbol, Sicherheitsdatenfluss, dynamischen Import, Monorepo-Abhängigkeit, booleschen Policy-/Moduswert, Diff-Polarität, Reihenfolge/Praezedenz, Zeitfenster/Ablaufzeit, API-/Schema-Vertrag, Datenbank-/Migrationsvertrag, Idempotenz-/Nebenlaeufigkeitsvertrag, Locale-/Encoding-/Normalisierungsvertrag, Auth-/Scope-/Rollenvertrag, Crypto-/Signatur-/Hashvertrag, Geld-/Währungs-/Rundungsvertrag, destruktive Operation, Regex-/Glob-/Matcher-Vertrag, Web-Security-Header-/Cookie-Vertrag, Endpoint-URL, Dateiberechtigung oder eine numerische Grenze mit Einheit.
