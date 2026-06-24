# Codex Sparkompass

![Codex Sparkompass Struktur](docs/assets/sparkompass-structure.svg)

**Status:** `v0.1.0-alpha` Technical Preview.

Codex Sparkompass ist eine deutschsprachige Context-Control-Plane für Codex. Das Projekt hilft dabei, vor einem Codex-Lauf weniger unnötigen Kontext zu senden, wichtige Fakten zu schützen, Originalstellen gezielt nachzuladen und Token-Ersparnis mit Qualitätsgates zu verbinden.

Es ist kein Token-Hack und keine Abrechnungssoftware. Die Zahlen sind lokale Schätzungen oder lokale Codex-Usage-Belege, damit man bessere Entscheidungen trifft, bevor man Codex mit zu viel Kontext losschickt. Sparkompass schreibt den internen Codex-Request nicht heimlich um.

## Schnellstart

```bash
git clone https://github.com/Tobinat/codex-sparkompass.git
cd codex-sparkompass
npm ci
npm run check
node ./bin/codex-sparkompass.mjs audit .
```

Optional lokal global verlinken:

```bash
npm link
sparkompass doctor
sparkompass audit .
```

Mehr Wege zum Herunterladen und Installieren stehen in [INSTALL.md](INSTALL.md).

## Was bringt es?

Sparkompass zeigt vor oder während einem Codex-Workflow:

- wie groß der lokale Repository-Kontext ungefähr ist
- welche Dateien wahrscheinlich viele Tokens kosten
- ob `AGENTS.md` oder Codex-Konfigurationen viel Kontext mitbringen
- welcher knappe Prompt für den nächsten Lauf sinnvoll wäre
- wie viel eine vorherige Verdichtung ungefähr spart
- wie viel ein ContextPack tatsächlich nach Fallbacks geliefert und gespart hat
- ob ein gespeichertes ContextPack-Receipt später noch zur Originalquelle passt
- ob ein registriertes ContextPack nur über seine `context_pack_id` wiedergefunden und verifiziert werden kann
- ob ein lokaler Test-, Lint- oder Build-Check zum verdichteten Kontext bestanden hat
- wie viele Output- und Kontexttokens pro verifiziertem Task gebraucht wurden
- wie echte vierarmige Codex-Usage-Messläufe reproduzierbar geplant werden müssen
- welche Originalstellen später gezielt als Beleg nachgeladen werden können
- ob ein konkreter Context-Control-Vorflugbericht bereit für den Codex-Handoff ist
- ob die geplanten Handoff-Belege aktuell noch hashgenau zur Quelle passen
- welche sofort geladenen Kontextteile für ein Akzeptanz-Orakel wirklich kritisch sind
- welche ablation-sicheren Sofortkontextteile als On-Demand-Evidence vorgeschlagen werden können
- wie groß der geplante Codex-Startprompt ist und welche Ersparnis der Handoff-Receipt sichtbar macht
- ob mehrere Handoff-Receipts zusammen wirklich Startkontext sparen
- welche belegte Nutzerwirkung mehrere Pack-, Handoff- und Task-Läufe zusammen zeigen
- ob ein Codex-Lifecycle-Hook bei großen User-Prompts vor dem Senden eine Sparkompass-Empfehlung geben sollte
- welche Dateien, Typen, Entscheidungen und Risikoeinheiten im geplanten Kontext stecken
- welche Kontextteile als stabiler Prefix, variable Aufgabe oder Nachlade-Index übergeben werden sollten
- ob Dogfood, Benchmark, TaskOutcome und Ledger-Spuren zusammen ein publishable Signal ergeben

Der Anspruch ist größer als reine Kompression: Sparkompass soll Kontext auswählen, belegen, prüfen und bei Unsicherheit auf mehr Kontext zurückfallen.

## Bilder und Ablauf

![Sparkompass Nutzerfluss](docs/assets/sparkompass-user-flow.svg)

![Sparkompass Release-Gates](docs/assets/sparkompass-release-gates.svg)

## Veröffentlichungsstatus

Diese Alpha-Version ist für GitHub veröffentlichbar als **Technical Preview**, aber noch nicht als Stable-Version.

Aktueller lokaler Stand:

- Tests: `227/227`
- Release-Audit: `30/30`
- Package-Audit: `verified-package-dry-run`
- Package-Smoke: `verified-package-install-smoke`
- Plugin-Smoke: `verified-plugin-install-smoke`
- Router-Probe: `compact`
- GatePath: `verified-gate-path-prepared`

Der bisherige lokale A/B-Beleg bleibt: `8.417` Tokens gespart, `21%` Gesamt-Ersparnis, `42%` nicht gecachter Input gespart. Das ist ein lokaler Codex-Usage-Beleg, keine offizielle Abrechnung.

## Was ist das genau?

Der Sparkompass besteht aktuell aus fuenf Schichten:

- **CLI:** die Quelle der Wahrheit für Audit, ContextPlan, ContextBOM, ContextControlReport, ContextEvidenceAudit, ContextAblationAudit, ContextSlimmingPlan, ContextHandoffReceipt, ContextHandoffLedger, ContextEnvelope, Inventory, ContextGraph, ProgramSlice, ContextPack, ContextPackRegistry, Receipt Verification, PromptPreparation, PromptPreparationLedger, Task Outcome, TaskOutcome Ledger, Savings Ledger, Impact Report, Cache, Delta, Lookup, Semantic Cache, Scorecard, Benchmark und Dogfood.
- **Repo-Skill:** `.agents/skills/codex-sparkompass` sagt Codex, wann und wie es das CLI benutzen soll.
- **Lokaler Plugin-Kandidat:** `plugins/codex-sparkompass` verpackt Skill, Bridge-Script und MCP-Konfiguration für Codex.
- **MCP-Server:** `sparkompass-mcp` stellt interaktive Werkzeuge bereit, damit Codex erst semantische Einheiten sucht und dann nur benötigte Originalstellen nachlaedt.
- **Lifecycle-Hook-Kandidat:** `plugins/codex-sparkompass/hooks/hooks.json` kann bei `UserPromptSubmit` große Prompts erkennen und eine lokale Empfehlung ausgeben, ohne den Prompt heimlich umzuschreiben.

Nicht enthalten:

- keine Telemetrie
- kein Upload von Repo-Inhalten
- kein Eingriff in den internen Codex-Versand an OpenAI
- kein automatisches Ersetzen des User-Prompts durch den Hook

## Installation

Siehe [INSTALL.md](INSTALL.md).

## Anwendung

### 1. Repository prüfen

```bash
sparkompass audit .
```

Das zeigt eine Kontext-Ampel, die größten Dateien und konkrete Hinweise.

### 2. Nächsten Codex-Lauf vorbereiten

```bash
sparkompass recommend . \
  --goal "Login-Fehler nach Passwort-Reset beheben" \
  --file "src/auth/session.ts" \
  --done "Auth-Tests laufen grün"
```

Das erzeugt eine kurze Empfehlung plus einen Prompt, den man direkt in Codex verwenden kann.

### 3. Kontextplan vor dem Lesen bauen

```bash
sparkompass plan . \
  --goal "Login-Fehler nach Passwort-Reset beheben" \
  --file "src/auth/session.ts" \
  --expect "AUTH_RESET_TOKEN_EXPIRED" \
  --expect-regex "src/auth/.+\\.ts" \
  --budget 800
```

`plan` erzeugt `ContextPlanV1`: Sofortkontext, Nachlade-Belege und bewusst ausgelassene Einheiten unter einem Tokenbudget. Das ist der Planer zwischen `recommend` und `lookup`: erst entscheiden, welche semantischen Einheiten wirklich in den Startkontext gehoeren, dann nur bei Bedarf Belege laden.

Wenn `--expect` oder `--expect-regex` gesetzt sind, erzeugt der Plan zusätzlich `ContextPlanRequirementCoverageV1`. Diese Spur zeigt, ob Muss-Fakten sofort abgedeckt, als Nachlade-Beleg verfügbar oder im Repository nicht gefunden sind. Fehlende Muss-Fakten setzen das Plan-Gate auf `plan-needs-review`.

Der Plan enthält außerdem `ContextBudgetOptimizerV1`. Diese Stufe reserviert Platz für explizite Dateien und neue/geänderte Einheiten und füllt das restliche Budget nach Nutzen pro Token. Dadurch gewinnt bei knappem Budget nicht automatisch der größte oder lauteste Treffer, sondern der Kontext, der pro Token am meisten zur Aufgabe beiträgt.

Zusammen mit dem Plan entsteht `ContextDecisionTraceV1`: eine maschinenlesbare Entscheidungsakte für `immediate_context`, `on_demand_evidence`, bewusst ausgelassene Einheiten, Budget-Ablehnungen, Risk-Review-Gründe, Delta-Coverage und Muss-Fakten. Der Trace macht sichtbar, warum Kontext gespart wurde und welche Unsicherheit vor einem Handoff noch geladen oder geprüft werden muss.

Mit `--risk-profile careful` oder `--risk-profile strict` erzeugt der Plan zusätzlich `ContextPlanRiskControlsV1`. Riskante, relevante Einheiten wie Auth-, Token-, Secret-, Migrations- oder Delete-nahe Stellen dürfen dann nicht still in `on_demand_evidence` verschwinden: Bei `strict` wird der Plan review-pflichtig, bis das Startbudget erhöht oder die betroffene Originalstelle bewusst geladen wurde.

Nach einem Cache-Lauf kann `plan` delta-bewusst priorisieren:

```bash
sparkompass cache .
sparkompass plan . --goal "Login-Fehler beheben" --cache .sparkompass/context-cache.json
```

Dann markiert der Planer Einheiten als `stable`, `changed` oder `added` und gibt neuen/geänderten Einheiten einen Bonus. `ContextPlanDeltaCoverageV1` prüft zusätzlich, ob alle neuen/geänderten Einheiten als Sofortkontext oder Nachlade-Beleg adressierbar sind. Ist die Delta-Coverage nur teilweise sichtbar oder fehlt ein angeforderter Cache, wird der Plan review-pflichtig.

Wenn das Ziel ein Symbol trifft, aber dessen direkte Abhängigkeiten wichtig sind, kann `plan` eine kleine Graph-Nachbarschaft dazunehmen:

```bash
sparkompass plan . --goal "Login-Fehler beheben" --graph --budget 800
```

Dann werden Einheiten nur dann als relevant freigegeben, wenn sie zum Ziel passen, explizit genannt wurden, neu/geändert sind oder als ein-Hop-Nachbar im Context Graph hängen. Typ- und Risiko-Signale sortieren weiter, machen aber nicht mehr allein den ganzen Bestand relevant.

### 4. Kontext-BOM anzeigen

```bash
sparkompass bom . \
  --goal "Login-Fehler nach Passwort-Reset beheben" \
  --file "src/auth/session.ts" \
  --expect "AUTH_RESET_TOKEN_EXPIRED" \
  --budget 800
```

`bom` erzeugt `ContextBOMV1`: eine kompakte Materialliste für den geplanten Kontext. Sie zeigt Lane-Mix, Top-Dateien, Typen, Entscheidungsklassen, Muss-Fakten, Risikoregister und Evidence-Hinweise. Damit wird aus "der Plan hat etwas gewählt" ein nachvollziehbarer Handoff-Vertrag: was geht sofort an Codex, was bleibt on-demand, was wurde nur als Omitted-Vorschau erfasst und warum?

### 5. Control-Plane-Vorflugbericht bauen

```bash
sparkompass control . \
  --goal "Login-Fehler nach Passwort-Reset beheben" \
  --file "src/auth/session.ts" \
  --expect "AUTH_RESET_TOKEN_EXPIRED" \
  --budget 800
```

`control` erzeugt `ContextControlReportV1`: einen kompakten Vorflugbericht aus `ContextPlanV1` und `ContextEnvelopeV1`. Er zeigt, ob der geplante Handoff `ready-for-handoff` ist, welche Muss-Fakten sofort oder per Nachladen belegt sind, welche Segmente zuerst an Codex gehen sollen und welche Belege nur bei Bedarf über MCP geladen werden.

Cache- und Prefix-Hinweise sind dabei Warnungen, keine falschen Blocker. Fehlende Muss-Fakten oder ein nicht verifiziertes Plan-Gate setzen den Report auf `needs-review`.

### 6. Evidence-Audit prüfen

```bash
sparkompass evidence-audit . \
  --goal "Login-Fehler nach Passwort-Reset beheben" \
  --file "src/auth/session.ts" \
  --expect "AUTH_RESET_TOKEN_EXPIRED" \
  --budget 800
```

`evidence-audit` erzeugt `ContextEvidenceAuditV1`: eine hashgenaue Prüfung der Belege, die `control` für Sofortkontext, Muss-Fakten und On-Demand-Nachladen geplant hat. Das Gate `verified-evidence-audit` bedeutet: Die Beleg-IDs zeigen auf aktuelle Dateien, Zeilen existieren noch und die Quellzeilen-Hashes passen.

Das beweist keine fachliche Vollständigkeit und ersetzt keine Tests. Es beweist die Nachladefähigkeit der Belegspur, damit Codex bei Bedarf Originalstellen laden kann, statt komplette Dateien vorsorglich mitzuschleppen.

### 7. Ablation-Audit prüfen

```bash
sparkompass ablation-audit . \
  --goal "Login-Fehler nach Passwort-Reset beheben" \
  --file "src/auth/session.ts" \
  --expect "AUTH_RESET_TOKEN_EXPIRED" \
  --budget 800
```

`ablation-audit` erzeugt `ContextAblationAuditV1`: Der geplante Sofortkontext wird gegen ein Akzeptanz-Orakel zusammengesetzt. Danach entfernt Sparkompass jede Sofort-Einheit testweise und prüft, ob das Oracle noch besteht. Einheiten, deren Entfernung eine Muss-Fakt bricht, werden `oracle-critical`; alle anderen werden als Kandidaten für späteres On-Demand-Laden markiert.

Das ist der erste planbezogene Gegenfakten-Test. Er beweist nicht, dass die Aufgabe fachlich gelöst ist; er beweist, dass das angegebene Oracle sensibel auf konkrete Kontextentfernung reagiert.

### 8. Slimming-Plan aus Ablation bauen

```bash
sparkompass slim . \
  --goal "Login-Fehler nach Passwort-Reset beheben" \
  --file "src/auth/session.ts" \
  --expect "AUTH_RESET_TOKEN_EXPIRED" \
  --budget 800
```

`slim` erzeugt `ContextSlimmingPlanV1`: einen konservativen Vorschlag, welche ablation-sicheren Sofortkontext-Einheiten in On-Demand-Evidence verschoben werden können. Oracle-kritische Einheiten bleiben im Sofortkontext, ungeprüfte Einheiten bleiben ebenfalls drin. Das Gate `verified-slimming-plan` bedeutet: Plan und Ablation sind verifiziert, die Ablation-Coverage ist vollständig, mindestens eine oracle-kritische Einheit bleibt sofort sichtbar und mindestens ein Kandidat kann Tokens im Startkontext sparen.

Der Slimming-Plan kürzt keinen Codex-Prompt heimlich. Er ist die Review-Schicht zwischen `ablation-audit` und `handoff`: erst sehen, was sicher nachladbar wirkt, dann einen schlankeren Handoff bewusst bauen und erneut `ablation-audit`/`evidence-audit` prüfen.

### 9. Handoff-Receipt mit Sparbalken bauen

```bash
sparkompass handoff . \
  --goal "Login-Fehler nach Passwort-Reset beheben" \
  --file "src/auth/session.ts" \
  --expect "AUTH_RESET_TOKEN_EXPIRED" \
  --budget 800
```

`handoff` erzeugt `ContextHandoffReceiptV1`: den nutzbaren Beleg für einen geplanten Codex-Start. Er enthält den Startprompt, einen sichtbaren Sparbalken gegen das geschätzte Repository-Inventar, Readiness-Gates, Muss-Fakten-Coverage, Prompt-Cache-Layout, Handoff-Hashes und den MCP-Nachladevertrag.

Mit `--print-prompt` zeigt der Human-Report den Startprompt direkt an. In `--json` liegt er immer unter `start_prompt.text`. Das ist weiterhin keine interne Codex-Umschreibung und keine Abrechnungszahl, sondern der belegte Inhalt, den ein Nutzer oder Agent bewusst als engeren Startkontext verwenden kann.

Für wiederholte Codex-Starts kann der Handoff-Receipt in ein lokales Ledger geschrieben werden:

```bash
sparkompass handoff . --goal "Login-Fehler beheben" --ledger
sparkompass handoff-ledger report .
```

`ContextHandoffLedgerV1` zeigt, wie viele Handoffs verifiziert waren, wie viele review-pflichtig waren, wie viele Starttokens gegen das lokale Inventar geschätzt vermieden wurden und wie viele On-Demand-Belege später nachladbar blieben. Damit wird aus dem einzelnen Sparbalken eine Verlaufsspur.

### 10. Cache-freundliche ContextEnvelope bauen

```bash
sparkompass envelope . \
  --goal "Login-Fehler nach Passwort-Reset beheben" \
  --cache .sparkompass/context-cache.json \
  --graph \
  --expect "AUTH_RESET_TOKEN_EXPIRED"
```

`envelope` erzeugt `ContextEnvelopeV1`: eine Übergabestruktur aus stabilem Prefix, semi-stabiler Repository-Karte, variablem Task-Tail und On-Demand-Index. Das hilft bei API-basierten Workflows, stabile Inhalte vorne und variable Inhalte hinten zu halten. OpenAI Prompt Caching arbeitet mit exakten Prompt-Prefixen; Sparkompass zeigt deshalb Hashes, Reihenfolge und geschätzte Prefix-/Tail-Tokens, behauptet aber keinen garantierten Cache-Hit.

Der On-Demand-Index gehoert nicht in jeden Startprompt. Er ist die Liste der Belege, die Codex über MCP nachladen soll, wenn exakte Quellzeilen gebraucht werden.

Wenn eine vorherige Envelope gespeichert wurde, kann Sparkompass die Prefix-Stabilität vergleichen:

```bash
sparkompass envelope . --goal "Login-Fehler beheben" --json > previous-envelope.json
sparkompass envelope . --goal "Login-Fehler beheben" --previous-envelope previous-envelope.json
```

Dann erscheint `ContextEnvelopePrefixReuseV1`: voller Prefix wiederverwendbar, nur statischer Prefix wiederverwendbar oder Prefix geändert. Der Balken ist eine lokale Bytegleichheits-Schätzung für wiederholte Prompts, keine Abrechnungszahl.

Für mehrere Läufe gibt es ein lokales Envelope-Ledger:

```bash
sparkompass envelope . --goal "Login-Fehler beheben" --ledger
sparkompass envelope-ledger report .
```

`ContextEnvelopeLedgerV1` zeigt, wie oft voller Prefix, nur statischer Prefix oder kein Prefix wiederverwendbar war. Das ist die mehrturnfähige Spur für Prompt-Layout-Qualität.

### 11. Semantisches Kontextinventar erstellen

```bash
sparkompass inventory .
```

Das erzeugt ein erstes `ContextInventoryV1`: Funktionen, Klassen, Exporte, Importe, Markdown-Überschriften, Log-Fehler und Konfigurationswerte werden als adressierbare Einheiten sichtbar.

### 12. Kontext-Cache, Delta und Lookup nutzen

```bash
sparkompass cache .
sparkompass delta .
sparkompass plan . --goal "compressText verbessern" --budget 500
sparkompass lookup . --query "compressText" --budget 120
sparkompass graph . --query "compressText"
sparkompass slice . --query "compressText"
sparkompass flow . --query "compressText" --depth 2
sparkompass semantic-cache add . --query "compressText" --file "test/fixtures/code-sample.mjs" --oracle "npm test" --tool-version "npm=10" --registry
sparkompass semantic-cache lookup . --query "compressText" --oracle "npm test" --tool-version "npm=10"
sparkompass tool-output --file "pytest.log" --command "pytest -q" --exit-code 1
sparkompass tool-output load --summary ".sparkompass/tool-output/<id>.summary.json" --pattern "E_AUTH_104"
sparkompass prompt-advisory --text "Error: E_AUTH_104 in src/auth/session.mjs"
sparkompass prompt-prepare --file "großer-prompt.txt" --expect "AUTH_RESET_TOKEN_EXPIRED"
sparkompass prompt-prepare --file "großer-prompt.txt" --expect "AUTH_RESET_TOKEN_EXPIRED" --ledger
sparkompass prompt-ledger report .
sparkompass pilot . --ledger-dir .sparkompass/pilot-run
sparkompass impact . --savings-ledger .sparkompass/pilot-run/savings-ledger.json --task-outcome-ledger .sparkompass/pilot-run/task-outcome-ledger.json --handoff-ledger .sparkompass/pilot-run/handoff-ledger.json
sparkompass package-audit .
sparkompass package-smoke .
sparkompass plugin-smoke .
sparkompass evidence-audit . --goal "Login-Fehler beheben" --file "src/auth/session.ts"
sparkompass ablation-audit . --goal "Login-Fehler beheben" --file "src/auth/session.ts" --expect "AUTH_RESET_TOKEN_EXPIRED"
sparkompass slim . --goal "Login-Fehler beheben" --file "src/auth/session.ts" --expect "AUTH_RESET_TOKEN_EXPIRED"
sparkompass release-audit .
```

`cache` speichert ein content-addressed Inventar. `delta` vergleicht spätere Inventare dagegen und zeigt stabile, neue, geänderte und entfernte Einheiten. `lookup` ist die CLI-Vorstufe für interaktive Kontextwerkzeuge: Codex kann gezielt semantische Einheiten unter einem Tokenbudget nachladen.

`graph` erzeugt ein erstes `ContextGraphV1`: semantische Einheiten werden zu Knoten, lokale Imports, Symbolreferenzen und Testbezuege werden zu Kanten. Mit `--query` entsteht eine kleine Neighborhood um ein Symbol oder Thema.

`slice` erzeugt ein `ProgramSliceV1`: Zielsymbol, Code-Span, direkte Calls, einfache Read/Write-Hinweise, Imports, Tests und Evidence-Hashes. Für JavaScript/MJS nutzt Sparkompass Acorn als AST-Parser; bei nicht parsebaren Dateien fällt es sichtbar auf den konservativen heuristischen Modus zurück. Wenn Calls nicht aufloesbar sind, meldet die Qualität `review-needed` statt Sicherheit vorzutäuschen.

`flow` erzeugt ein `DataFlowTraceV1`: Sparkompass folgt aufgelösten Calls bis zu einer begrenzten Tiefe und zeigt, welche Argumentausdrücke in welche Zielparameter fließen. Jeder Trace enthält Evidence-Hashes und wird bei unaufgelösten Kanten als `review-needed` markiert.

`semantic-cache` speichert wiederverwendbare ContextPacks nur mit Beweisen: Query-Terme, Abhängigkeits-Hashes, Datei-Hashes, `SemanticCacheToolFingerprintV1`, ContextPack-Receipt und optionales Akzeptanz-Orakel. Mit `--registry` wird das Pack zusätzlich in `ContextPackRegistryV1` eingetragen; ein späterer Cache-Hit prüft dann auch `context_pack_id`, Registry-Receipt-Hash, Source-Hash und gelieferten Kontext. Ein Lookup ist nur ein Hit, wenn die adaptive `SemanticCacheVerificationPolicyV1`, Abhängigkeiten, Tool-Fingerprint, Receipt, optionaler Registry-Vertrag und Orakel-Prüfung bestehen. Exakte Inventar- und Dependency-Treffer dürfen die Query-Schwelle senken, voellig fremde Queries aber nicht freigeben.

`tool-output` erzeugt `ToolOutputSummaryV1`: lange Terminalausgaben, Testlogs oder Build-Ausgaben werden zu Status, ersten Fehlern, betroffenen Dateien, Wiederholungen, Fehlercodes und Rohdaten-Hash verdichtet. Mit `--store .sparkompass/tool-output` können Rohtext und Summary lokal abgelegt werden; ohne `--store` schreibt der Befehl nichts in den Workspace. `tool-output load` laedt danach nur einen begrenzten Rohlog-Ausschnitt per Summary, Raw-Datei oder ID und prüft den Raw-Hash.

`prompt-advisory` erzeugt dieselbe `SparkompassUserPromptHookAdvisoryV1`, die auch der Plugin-Hook nutzt. Damit kann man eine geplante Eingabe oder ein Codex-Hook-Payload manuell prüfen und bekommt nur Größe, Signale und den empfohlenen Sparkompass-Pfad zurück. Prompt-Inhalte werden im Human-Report nicht gespiegelt.

`prompt-prepare` erzeugt `SparkompassPromptPreparationV1`: aus einer großen geplanten Eingabe entsteht ein bewusst sendbarer Codex-Prompt mit ContextPack-ID, Gate, Quellhash, geliefertem Kontext-Hash, Sparbalken und Akzeptanz-Orakel. Anders als die Advisory liefert dieser Befehl den kompakten Prompt selbst aus. Wenn die Verdichtung unsicher ist, wird wie bei `pack` erweitert oder auf Vollkontext zurückgefallen, statt ein schlechteres Ergebnis freizugeben.

Mit `--ledger` schreibt `prompt-prepare` zusätzlich in `.sparkompass/prompt-preparation-ledger.json`. `prompt-ledger report` zeigt danach, wie viele Prompts vorbereitet wurden, wie viele verifiziert waren, wie viele sendbare Prompt-Tokens gespart wurden, welche p95-Werte entstehen und ob Fallbacks oder Review-Fälle auftraten.

`pilot` erzeugt `SparkompassPilotRunV1`: einen reproduzierbaren Eigenlauf, der Dogfood und Benchmark prüft, ContextPacks in ein Savings-Ledger schreibt, einen sendbaren Prompt in ein PromptPreparation-Ledger einträgt, ein TaskOutcome mit Receipt-Verifikation registriert und Envelope-/Handoff-Ledger befüllt. Damit wird die zentrale Kennzahl greifbar: nicht nur entfernte Tokens, sondern Tokens pro verifiziertem Task, sendbare Prompt-Ersparnis und Startkontext-Ersparnis über Ledger-Spuren. Ohne `--task-command` zeichnet der Pilot die internen Sparkompass-Gates auf; mit `--task-command "npm test"` kann ein echter Projektcheck gekoppelt werden.

`impact` erzeugt `SparkompassImpactReportV1`: eine zusammengeführte Wirkungsansicht aus Savings-, Handoff-, PromptPreparation- und TaskOutcome-Ledgers. Der Report zeigt gelieferte ContextPack-Ersparnis, geschätzte Startkontext-Ersparnis, sendbare Prompt-Ersparnis, kombinierte Kontext-Ersparnis, verifizierte Packs/Handoffs/Prompts/Tasks, Tokens pro verifiziertem Task und Blocker wie Vollkontext-Fallbacks oder Review-Tasks. Leere Ledgers werden nicht als Erfolg verkauft; `Gate: verified-impact` entsteht erst, wenn Messdaten vorhanden und qualitätsgesichert sind.

`package-audit` erzeugt `PackageDryRunAuditV1`: Sparkompass führt `npm pack --dry-run --json --ignore-scripts` aus und prüft die tatsächliche Paketliste gegen Pflichtpfade, verbotene lokale Artefakte, Größenlimits und ausführbare CLI-/Plugin-Bridges.

`package-smoke` erzeugt `PackageInstallSmokeAuditV1`: Sparkompass packt das lokale Paket in ein temporäres Tarball, installiert es in ein frisches temporäres Projekt und startet dort die installierte CLI, den Benchmark und den MCP-Server. Damit wird geprüft, ob das Paket nach der Installation wirklich nutzbar ist.

`plugin-smoke` erzeugt `PluginInstallSmokeAuditV1`: Sparkompass kopiert den lokalen Codex-Plugin-Kandidaten in ein temporäres Plugin-Verzeichnis und startet daraus CLI-Bridge, MCP-Bridge, einen echten MCP-`tools/call` für `sparkompass_lookup` und den UserPromptSubmit-Hook. Zusätzlich simuliert der Smoke eine installierte Plugin-Cache-Kopie, die ihre CLI/MCP-Brücke über den lokalen Codex-Marketplace findet. So wird geprüft, ob die Plugin-Hülle nicht nur vorhanden ist, sondern nach Kopie und Cache-Installation wirklich Kontextwerkzeuge ausführen kann und der Hook große Prompts empfiehlt, ohne sensible Prompt-Inhalte auszugeben.

`release-audit` erzeugt `SparkompassReleaseAuditV1`: eine Zielprüfung, die Scorecard, Pilot, Impact Report, Inventar, Fallback-Proben, MCP-Werkzeuge, ExperimentPlan-/ExperimentScript-/ExperimentEvidenceAudit-/ExperimentRun-/Router-/GatePath-Probe, Package-Shape, Package-Dry-Run, Package-Install-Smoke, Plugin-Shape und Plugin-Install-Smoke zusammenführt. Jede Kernanforderung des Projekts bekommt Status und Evidenz. Das Audit ersetzt keine Veröffentlichung, macht aber sichtbar, ob die lokale Belegkette das Ziel gerade trägt.

### 13. MCP-Nachladen für Codex starten

```bash
sparkompass-mcp
```

Der Server kann mit einem Tool-Profil kleiner gestartet werden:

```bash
SPARKOMPASS_TOOL_PROFILE=standard sparkompass-mcp
```

Verfügbare Profile sind `minimal`, `standard`, `benchmark`, `release` und `debug`. Ohne Profil bleibt `debug` aktiv und zeigt wie bisher alle MCP-Tools. Die lokale Grundlast misst:

```bash
sparkompass doctor overhead . --profile standard
```

In diesem Repo meldet `standard` aktuell 20/48 sichtbare MCP-Tools und ca. 11.716 geschätzte Katalog-Tokens weniger als das Vollprofil. Das ist eine lokale Planungszahl, keine offizielle Codex-Abrechnung.

Der MCP-Server spricht über STDIO und stellt diese Werkzeuge bereit:

- `sparkompass_inventory`: semantische Repository-Karte als begrenzte Vorschau
- `sparkompass_lookup`: relevante Einheiten unter einem Tokenbudget finden
- `sparkompass_plan_context`: Sofortkontext, Nachlade-Belege und ausgelassene Einheiten planen; optional mit Delta-Cache, Graph-Nachbarschaft und BudgetOptimizer
- `sparkompass_context_bom`: Kontext-BOM nach Lane, Datei, Typ, Entscheidung, Risiko und Muss-Fakten erzeugen
- `sparkompass_build_envelope`: ContextPlan als stabilen Prefix, variable Tail und On-Demand-Index für cache-freundliche Übergaben strukturieren
- `sparkompass_control_report`: ContextPlan und ContextEnvelope als Vorflugbericht mit Readiness-Gate, Handoff-Hashes und Evidence-Protokoll zusammenführen
- `sparkompass_evidence_audit`: geplante Evidence-IDs gegen aktuelle Dateien, Zeilen und Quellhashes prüfen
- `sparkompass_ablation_audit`: Sofortkontext-Einheiten testweise entfernen und oracle-kritische Einheiten finden
- `sparkompass_slim_context`: ablation-sichere Sofortkontext-Einheiten als On-Demand-Vorschlag mit Zusatzersparnis berichten
- `sparkompass_handoff_receipt`: Startprompt, Sparbalken, Gates, Prompt-Cache-Layout und MCP-Nachladevertrag als ContextHandoffReceipt erzeugen
- `sparkompass_handoff_ledger`: Handoff-Receipts sammeln und Startkontext-Ersparnis über mehrere Codex-Starts berichten
- `sparkompass_scorecard`: Dogfood, Benchmark, TaskOutcome-Gates und lokale Ledgers als Release-Scorecard zusammenfassen
- `sparkompass_pilot_run`: reproduzierbaren Pilot-Run mit Savings-, PromptPreparation-, TaskOutcome-, Envelope- und Handoff-Ledger-Belegen erzeugen
- `sparkompass_impact_report`: Savings-, Handoff-, PromptPreparation- und TaskOutcome-Ledgers als qualitätsgegatede Nutzerwirkung zusammenfassen
- `sparkompass_experiment_plan`: Vierarm-Codex-Experiment mit Prompt-Hashes, geplanten Usage-Dateien, TaskOutcome-Pfaden und Metadaten vorbereiten
- `sparkompass_experiment_script`: aus einem ExperimentPlan ein ausführbares Runbook erzeugen, ohne Codex direkt zu starten
- `sparkompass_experiment_audit`: geplante Usage-JSONL-Dateien, Usage-Invarianten, Prompt-Hashes und TaskOutcome-Dateien gegen den Plan prüfen
- `sparkompass_experiment_run`: echte Codex-JSONL-Usage-Dateien zu RunManifests, Effekten, Quality-Gate und Router-Empfehlung verbinden
- `sparkompass_doctor_overhead`: Plugin-, Skill-, Hook- und MCP-Katalog-Grundlast samt Tool-Profilen lokal messen
- `sparkompass_router_decision`: aus Experiment- und Overhead-Belegen `bypass`, `compact`, `lazy` oder `full` wählen
- `sparkompass_package_audit`: Paket-Dry-Run, Pflichtpfade, verbotene Dateien, Größenlimits und ausführbare Bridges prüfen
- `sparkompass_package_install_smoke`: lokal gepacktes Paket temporär installieren und installierte CLI/MCP-Entrypoints prüfen
- `sparkompass_plugin_install_smoke`: lokalen Plugin-Kandidaten temporär kopieren und CLI-Bridge, MCP-Bridge, Cache-Install-Bridge, echten Lookup-Tool-Call sowie UserPromptSubmit-Hook prüfen
- `sparkompass_release_audit`: Zielanforderungen gegen Scorecard, Pilot, Impact Report, Inventar, Fallback-Proben, ExperimentPlan-/ExperimentScript-/ExperimentEvidenceAudit-/ExperimentRun-/Router-/GatePath-Probe, Package-Dry-Run, Package-Install-Smoke, Plugin-Smoke und Plugin prüfen
- `sparkompass_prompt_advisory`: geplante Prompts oder Hook-Payloads auf Größe und Sparpfad prüfen, ohne Prompt-Inhalte zu echoen
- `sparkompass_prepare_prompt`: große geplante Prompts als sendbaren kompakten ContextPack-Handoff mit Gate und Sparbalken vorbereiten
- `sparkompass_prompt_preparation_ledger`: vorbereitete Prompts sammeln und sendbare Prompt-Ersparnis über mehrere Handoffs berichten
- `sparkompass_envelope_ledger`: Prefix-Wiederverwendung über mehrere ContextEnvelope-Läufe sammeln und berichten
- `sparkompass_expand_symbol`: Symbolumfeld im Context Graph untersuchen
- `sparkompass_load_evidence`: Originalzeilen mit Hash-Prüfung nachladen
- `sparkompass_load_source_hash`: begrenzte Originalausschnitte per `source_hash` oder `file_hash` nachladen, ohne ganze Dateien zu senden
- `sparkompass_summarize_tool_output`: lange Tool-Ausgaben strukturiert zusammenfassen, bevor Rohlogs gelesen werden
- `sparkompass_load_tool_output`: begrenzte Rohlog-Ausschnitte aus gespeicherter ToolOutputSummary nachladen
- `sparkompass_slice_symbol`: ProgramSlice mit Code-Span, Calls, Reads/Writes, Tests und Evidence laden
- `sparkompass_trace_flow`: DataFlowTrace mit Argument-zu-Parameter-Bindungen über aufgelöste Calls laden
- `sparkompass_cache_write`: content-addressed Kontextcache schreiben
- `sparkompass_delta`: stabile, neue, geänderte und entfernte Einheiten vergleichen
- `sparkompass_pack`: verifiziertes ContextPack mit Receipt erzeugen
- `sparkompass_verify_receipt`: gespeichertes ContextPack-Receipt gegen Originalquelle und optional gelieferten Kontext prüfen
- `sparkompass_verify_context_pack`: registriertes ContextPack per `context_pack_id` finden und mit Receipt-/Quellhashes prüfen
- `sparkompass_contextpack_format`: offenes ContextPackFormatV1 abrufen oder Receipts ohne Originalquelle gegen portable Formatregeln linten
- `sparkompass_task_outcome`: vorhandenen Check-Output als TaskOutcomeReceipt mit optionaler Receipt-Verifikation registrieren
- `sparkompass_task_outcome_ledger`: TaskOutcomeReceipts sammeln und Tokens pro verifiziertem Task berichten
- `sparkompass_calibrate_context`: kleinste direkt verifizierte Zielgröße für ein Risikoprofil finden
- `sparkompass_savings_ledger`: echte gelieferte Ersparnis aus ContextPack-Receipts sammeln und berichten
- `sparkompass_shadow_compare`: Vollkontext und Sparkompass-Kontext gegen dieselben Soll-Fakten vergleichen
- `sparkompass_semantic_cache_add`: ContextPack mit Abhängigkeits- und Oracle-Hash speichern
- `sparkompass_semantic_cache_lookup`: Cache-Treffer nur bei bestandener adaptiver Similarity-, Dependency-, Oracle- und Receipt-Verifikation liefern

Im Plugin ist der Server über `plugins/codex-sparkompass/.mcp.json` verdrahtet. Dadurch kann Codex perspektivisch erst eine kleine Repository-Landkarte laden und danach gezielt Belege, Symbole oder Deltas abrufen.

### 14. Codex-Hook-Advisory für große Prompts

Der Plugin-Kandidat enthält zusätzlich einen bewusst sanften `UserPromptSubmit`-Hook:

```text
plugins/codex-sparkompass/hooks/hooks.json
plugins/codex-sparkompass/scripts/sparkompass-user-prompt-submit.mjs
```

Der Hook liest die von Codex übergebene Hook-Eingabe lokal, schätzt Größe und Signale wie Tool-Ausgabe, Code oder Repository-Kontext und gibt nur dann eine kurze Empfehlung aus, wenn der Prompt wahrscheinlich zu groß oder log-lastig ist. Er spiegelt keine Prompt-Inhalte zurück und verändert den Codex-Prompt nicht. Typische Empfehlungen sind `sparkompass tool-output`, `sparkompass pack` oder `sparkompass handoff`.

Technisch ruft das Hook-Script den regulaeren CLI-Befehl `sparkompass prompt-advisory --hook-payload --quiet-ok` auf. CLI, MCP und Hook verwenden damit dieselbe Advisory-Logik.

Zum lokalen Testen:

```bash
printf '{"user_prompt":"Error: E_AUTH_104 in src/auth/session.mjs"}' \
  | node plugins/codex-sparkompass/scripts/sparkompass-user-prompt-submit.mjs --json --min-tokens 1
```

### 15. Inhalt vor dem Prompt verdichten

```bash
sparkompass compress --file "debug.log" --target 25 --keep "AUTH_RESET_TOKEN_EXPIRED"
```

Oder per Pipe:

```bash
cat debug.log | sparkompass compress --target 25
```

Das gibt eine kompakte Fassung plus Sparbalken aus. Diese Fassung kann man statt des Rohtexts in Codex einfügen.

`--keep` schützt Begriffe, Fehlercodes, Dateinamen oder Anforderungen, die auf jeden Fall erhalten bleiben sollen. Wenn der Schutz die Zielgröße sprengt, gibt Sparkompass trotzdem ein Ergebnis aus und meldet die Warnung sichtbar.

### 16. Verifiziertes ContextPack erzeugen

```bash
sparkompass pack \
  --file "debug.log" \
  --target 25 \
  --keep "AUTH_RESET_TOKEN_EXPIRED" \
  --expect "Done when: Auth reset test passes" \
  --expect-regex "src/auth/.+\\.ts"
```

`pack` erzeugt zusätzlich ein `ContextPackReceiptV1` mit kritischen Ankern, Ankerklassen, Quellbelegen, optionalem Akzeptanz-Orakel, Fallback-Entscheidung und geliefertem Kontext. Wenn die Zielgröße zu aggressiv ist oder ein erwarteter Fakt beziehungsweise ein Regex-Muster fehlt, versucht Sparkompass zuerst einen erweiterten Kontext. Nur wenn auch dieser nicht verifiziert werden kann, liefert es Vollkontext statt eine riskante Kompaktfassung freizugeben.

Die Ankerklassen zeigen getrennt, ob zum Beispiel `--keep`-Begriffe, Fehlercodes, Pfade, gefährliche CLI-Flags wie `--force` und Code-Begriffe erhalten wurden. So bleibt die 100%-Regel für kritische Anker prüfbar, statt nur eine Gesamtzahl zu sein.

`--expect` und `--expect-regex` sind das direkte Qualitätsgate für ein einzelnes ContextPack. Das Receipt enthält dann `acceptance_oracle` mit Prüfung gegen Original und gelieferten Kontext.

Der Sparbalken im Receipt misst die echte gelieferte Ersparnis. Wenn Vollkontext geliefert wurde, steht dort 0%, selbst wenn ein verworfener Kompakt-Kandidat kleiner gewesen wäre.

Gespeicherte Receipts lassen sich später erneut prüfen:

```bash
sparkompass pack --file "debug.log" --expect "AUTH_RESET_TOKEN_EXPIRED" --json > pack.json
sparkompass receipt verify --receipt "pack.json" --file "debug.log"
sparkompass receipt schema
sparkompass receipt lint --receipt "pack.json"
```

`receipt verify` erzeugt `ContextPackReceiptVerificationV1`. Die Prüfung vergleicht Source-Hash, Quellbeleg-Zeilenhashes, kritische Ankerklassen, Quellbeleg-Abdeckung, Qualitätsstatus und das Acceptance-Oracle. Wenn der gelieferte Kontext als Datei, Text oder im Pack-JSON vorhanden ist, wird auch sein Hash gegen das Receipt geprüft.

`receipt schema` gibt den portablen Vertrag `ContextPackFormatV1` aus. `receipt lint` erzeugt `ContextPackFormatValidationV1` und prüft, ob ein gespeichertes Pack auch ohne Originalquelle die offenen Format-Invarianten erfüllt: erlaubtes Gate, Liefermodus, Tokenrechnung, Hash-Form, 100% kritische Anker, 100% Quellbelege, Fallback-Konsistenz und bestandene Acceptance-Oracle-Spur. `receipt verify` bleibt die stärkere Prüfung, weil es zusätzlich die aktuelle Originalquelle und Quellzeilen-Hashes kontrolliert.

Wenn Codex oder ein Team später nur noch die Pack-ID kennt, kann das Pack lokal registriert werden:

```bash
sparkompass pack \
  --file "debug.log" \
  --expect "AUTH_RESET_TOKEN_EXPIRED" \
  --registry \
  --json > pack.json

sparkompass contextpack verify \
  --context-pack-id "ctx-..." \
  --registry ".sparkompass/context-pack-registry.json"
```

`contextpack verify` erzeugt `ContextPackRegistryVerificationV1`. Die Registry speichert das Receipt, den gelieferten Kontext und bevorzugt einen Quellpfad statt Original-Rohtext. Bei der Prüfung wird trotzdem wieder `ContextPackReceiptVerificationV1` ausgeführt: Source-Hash, Quellbelege, Registry-Receipt-Hash und optional der Delivered-Context-Hash müssen passen. Damit ist `prüfeKontext(context_pack_id)` kein blosser Index, sondern ein hashbarer Nachweisweg.

Für heikle Inhalte kann ein Risikoprofil gesetzt werden:

```bash
sparkompass pack --file "security.log" --risk-profile strict --keep "E_AUTH_104"
```

Profile:

- `compact`: startet kleiner, spart aggressiver, bleibt aber verifiziert.
- `balanced`: Standardprofil.
- `careful`: mehr Startkontext für Code, Logs, Konfiguration und unklare Aufgaben.
- `strict`: konservativ für sicherheitskritische oder fachlich riskante Inhalte.

Das Receipt enthält `ContextPolicyV1` mit Profil, effektivem Zielbudget und Erweiterungspfad.

### 17. Receipt nachträglich verifizieren

```bash
sparkompass receipt verify \
  --receipt "pack.json" \
  --file "debug.log"
```

Diese Prüfung ist für Review, Wiederverwendung und spätere Audits gedacht. Sie sagt nicht nur "das Receipt sieht richtig aus", sondern prüft es gegen die originale Quelle. Wenn der gelieferte Kontext separat gespeichert wurde, kann er mit `--context "delivered.txt"` ebenfalls hashgenau geprüft werden.

### 18. Task-Ergebnis belegen

```bash
sparkompass task run . \
  --command "npm test" \
  --expect-output "pass" \
  --ledger
```

`task run` erzeugt `TaskOutcomeReceiptV1`: Befehl, Arbeitsverzeichnis, erwarteter und tatsächlicher Exit-Code, Output-Hash, Output-Zusammenfassung und optionale Output-Erwartungen. Wenn ein Check nicht den erwarteten Exit-Code liefert, ein erwarteter Output-Fakt fehlt oder ein verknüpftes ContextPack-Receipt nicht verifiziert werden kann, wird `task-outcome-needs-review` gemeldet.

Mit `--ledger` schreibt Sparkompass das Ergebnis zusätzlich in `.sparkompass/task-outcome-ledger.json`. Der Report zeigt `TaskOutcomeLedgerV1`: verifizierte Tasks, review-pflichtige Tasks, Verifikationsrate, fehlgeschlagene Exits, Output-Orakel-Fehler, Review-Gründe, p95-Dauer, verknüpfte ContextPacks, Output-Tokens pro verifiziertem Task und ContextPack-Tokens pro verifiziertem Task. Das ist die zentrale Kennzahl für die nächste Stufe: Nicht nur "wie viel wurde entfernt?", sondern "wie teuer war eine bestandene Aufgabe und welche Risiken blieben sichtbar?".

```bash
sparkompass task-ledger report .
```

Ein ContextPack kann direkt mit einem lokalen Check verbunden werden:

```bash
sparkompass pack --file "debug.log" --expect "AUTH_RESET_TOKEN_EXPIRED" --json > pack.json
sparkompass task run . \
  --command "npm test" \
  --expect-output "pass" \
  --receipt "pack.json" \
  --source-file "debug.log"
```

Für bereits vorhandene Logs gibt es `task record`:

```bash
sparkompass task record . \
  --command "npm test" \
  --exit-code 0 \
  --output-file "test.log" \
  --expect-output "pass" \
  --ledger
```

Das MCP-Werkzeug `sparkompass_task_outcome` registriert nur vorhandenen Output und führt keine Shell-Befehle aus. `sparkompass_task_outcome_ledger` kann diese Receipts danach sammeln oder berichten. So bleibt die interaktive Codex-Schicht bei Kontext- und Belegarbeit, während echte Befehle bewusst über CLI oder Terminal laufen.

### 19. Offizielle Codex-Usage belegen

```bash
codex exec --json "antworte nur: ok" > .sparkompass/codex-run.jsonl
sparkompass codex-usage record . \
  --file ".sparkompass/codex-run.jsonl" \
  --ledger
sparkompass codex-usage report .
```

`codex-usage record` erzeugt `CodexOfficialUsageReceiptV1`: Sparkompass liest dokumentierte `turn.completed`-Events aus `codex exec --json` und übernimmt die dort gelieferten Felder `input_tokens`, `cached_input_tokens`, `output_tokens` und `reasoning_output_tokens`. Der Roh-JSONL-Export wird gehasht, die Usage-Events werden zusammengefasst und fehlende oder kaputte Events setzen das Gate auf `codex-usage-needs-review`.

Jeder Usage-Beleg enthält zusätzlich `CodexUsageInvariantsV1`: `cached_input_tokens <= input_tokens`, `reasoning_output_tokens <= output_tokens` und `total_tokens = input_tokens + output_tokens` werden für Gesamtsummen und einzelne Events geprüft. Dadurch kann ein Experiment keine `quality-noninferior`-Evidenz werden, wenn die offiziellen Usage-Felder rechnerisch nicht tragen.

Mit `--ledger` schreibt Sparkompass die Belege in `.sparkompass/codex-usage-ledger.json`. `codex-usage report` zeigt danach offizielle Codex-Laufwerte über mehrere Runs. Das ist der richtige Beleg für GitHub, wenn ein echter Codex-Lauf mit dokumentierten Usage-Events gemessen wurde. Es ist trotzdem keine Preis- oder Rechnungsberechnung; dafür bleiben Dashboard, Analytics API oder Abrechnung des jeweiligen Workspace maßgeblich.

Für einen offiziellen A/B-Beleg werden zwei echte Codex-Läufe verglichen:

```bash
sparkompass codex-usage compare . \
  --baseline ".sparkompass/raw-run.jsonl" \
  --optimized ".sparkompass/compact-run.jsonl"
```

`CodexOfficialUsageComparisonV1` zeigt danach die offiziell gemessene Gesamt-, Input-, nicht gecachte Input-, Output- und Reasoning-Output-Ersparnis. Der Vergleich ist nur belastbar, wenn Aufgabe, Modell, Workspace und Laufbedingungen vergleichbar sind.

Ein echter lokaler A/B-Beleg liegt in [docs/official-codex-usage-evidence.md](docs/official-codex-usage-evidence.md): Raw-README-Prompt gegen Sparkompass-Kompaktprompt, beide per `codex exec --json` gemessen. Ergebnis: 8.417 offiziell berichtete Tokens weniger, also 21% Gesamt-Ersparnis in diesem kontrollierten Lauf. Gesamt-Tokens werden als `input_tokens + output_tokens` berechnet; `reasoning_output_tokens` wird als Output-Unterkategorie nicht doppelt addiert.

Für kausale Messung über mehrere echte Codex-Läufe gibt es zuerst `experiment plan`:

```bash
sparkompass experiment plan . \
  --raw-prompt-file "evidence/prompts/raw.txt" \
  --compact-prompt-file "evidence/prompts/compact.txt" \
  --model "gpt-5" \
  --reasoning-effort "medium" \
  --sandbox-mode "workspace-write" \
  --task-command "npm test" \
  --out "evidence/experiment-plan.json"
```

`SparkompassExperimentPlanV1` erzeugt keine Usage-Zahlen. Es plant die echten `codex exec --json`-Runs für `basis_raw`, `basis_kompakt`, `plugin_raw` und `plugin_kompakt`, jeweils mit geplanten JSONL-Pfaden, Prompt-Hashes, TaskOutcome-Dateien, Metadaten-Hashes, Doctor-/Audit-/Experiment-/Router-Befehlen und Review-Gründen. Standardmäßig werden drei Wiederholungen vorbereitet.

Aus diesem Plan kann `experiment script` ein ausführbares Runbook erzeugen:

```bash
sparkompass experiment script . \
  --plan "evidence/experiment-plan.json" \
  --out "evidence/codex-experiment/run-experiment.sh"
```

`SparkompassExperimentScriptV1` startet beim Erzeugen noch keinen Codex-Lauf. Es schreibt ein Shell-Skript mit `set -euo pipefail`, allen geplanten `codex exec --json`-Runs, TaskOutcome-Befehlen, Doctor-Overhead, `experiment audit`, `experiment run` und `router decide` in dieser Reihenfolge. Dadurch wird aus dem Plan ein reproduzierbarer Ausführungsweg, ohne Usage-Zahlen zu schätzen oder Codex intern umzuschreiben.

Wenn die geplanten Codex-Läufe und TaskOutcome-Checks geschrieben wurden, prüft `experiment audit` die Artefakte gegen den Plan:

```bash
sparkompass experiment audit . \
  --plan "evidence/experiment-plan.json" \
  --out "evidence/experiment-evidence-audit.json"
```

`SparkompassExperimentEvidenceAuditV1` startet Codex nicht. Es liest nur die geplanten Usage-JSONL-Dateien, prüft daraus offizielle Usage-Events samt `CodexUsageInvariantsV1`, vergleicht Prompt-Hashes und prüft geplante TaskOutcome-Receipts. Erst wenn dieses Gate `verified-experiment-evidence` meldet, sollte `experiment run` daraus offizielle Usage-Evidenz bauen.

Danach wertet `experiment run` die echten JSONL-Dateien aus:

```bash
sparkompass experiment run . \
  --variant "basis_raw=.sparkompass/basis-raw.jsonl" \
  --variant "basis_kompakt=.sparkompass/basis-kompakt.jsonl" \
  --variant "plugin_raw=.sparkompass/plugin-raw.jsonl" \
  --variant "plugin_kompakt=.sparkompass/plugin-kompakt.jsonl" \
  --task-outcome "basis_raw=evidence/task-basis-raw.json" \
  --task-outcome "plugin_kompakt=evidence/task-plugin-kompakt.json" \
  --repeat 3 \
  --context-pack-hash "sha256:..." \
  --require-metadata true \
  --require-context-pack-hash true \
  --out "evidence/experiment.json"
```

`SparkompassExperimentRunV1` erzeugt pro Lauf ein `SparkompassRunManifestV1` mit Codex-Version, Modell, Reasoning, Sandbox, Git-Commit, Konfigurations-/Plugin-/Skill-/Tool-/Prompt-/ContextPack-Hashes, optionalem TaskOutcome-Beleg, offiziellen Usage-Werten und Usage-Invarianten. Danach berechnet es reinen Kompressionsgewinn, Plugin-Grundlast, Netto-Produktgewinn, Integrationseffekt und `SparkompassExperimentEfficiencyV1`: verifizierte erfolgreiche Tasks pro Token sowie Tokens pro verifiziertem Task. Das ist der nächste Schritt von einem einzelnen Case-Study-Beleg zu `paired-reproducible` und später `quality-noninferior`.

Mit `--require-metadata true` muss jedes RunManifest statt Platzhaltern echte Reproduzierbarkeitsmetadaten tragen: Codex-Version, Modell, Reasoning, Sandbox, Git-Commit, Config-/Plugin-/Skill-/Tool-Katalog-Hash, Prompt-Hash und ContextPack-Hash. `--require-context-pack-hash true` macht diesen Anteil explizit; fehlende Werte erzeugen `metadata-incomplete` und verhindern, dass der Lauf als strenger Release-Beweis durchgeht.

`--task-outcome "variant=task.json"` verbindet eine Experiment-Variante mit einem `TaskOutcomeReceiptV1`. Wenn Baseline und optimierter Lauf verifizierte TaskOutcomes haben und der Erfolgsdelta nicht schlechter wird, kann das Experiment `quality-noninferior` melden. Review-pflichtige TaskOutcomes oder Konflikte mit `--task-passed` blockieren das Gate. Reine `--task-passed`-Flags bleiben als Beobachtung nutzbar, zaehlen aber nicht als `verified-task-efficiency`.

Aus einem solchen Experiment kann Sparkompass danach eine konkrete Laufentscheidung bauen:

```bash
sparkompass router decide . \
  --experiment "evidence/experiment.json" \
  --overhead "evidence/overhead.json" \
  --out "evidence/router.json"
```

`SparkompassRouterDecisionV1` liest `SparkompassExperimentRunV1` und optional `SparkompassDoctorOverheadV1`. Daraus entsteht keine neue Abrechnung, sondern eine reproduzierbare lokale Entscheidung: `bypass`, wenn Sparkompass netto nicht günstiger ist, `compact`, wenn offizielle Usage, `quality-noninferior` und `verified-task-efficiency` tragen, `lazy`, wenn Nachladen oder weitere Evidenz sicherer ist, und `full`, wenn die Qualitätslage blockiert. Zusätzlich empfiehlt der Router ein Tool-Profil wie `minimal`, `standard` oder `debug`, damit nicht jeder Lauf mit der maximalen MCP-Werkzeugliste starten muss.

`SparkompassGatePathV1` haelt den naechsten Evidenzpfad zusammen: Der bekannte lokale A/B-Beleg (`8.417` Tokens gespart, `21%` Gesamt-Ersparnis, `42%` nicht gecachter Input gespart) wird mit `quality-noninferior`, `verified-task-efficiency` und der Router-Entscheidung verbunden. Das Artefakt bereitet `verified-end-to-end-noninferior` vor, behauptet dieses finale Gate aber erst, wenn mehrere echte Aufgaben mit offiziellen Codex-Usage-JSONL, TaskOutcome-Ledger und gleicher oder besserer Erfolgsrate belegt sind.

### 20. Sichere Zielgröße kalibrieren

```bash
sparkompass calibrate \
  --file "debug.log" \
  --risk-profile careful \
  --keep "AUTH_RESET_TOKEN_EXPIRED" \
  --expect "Done when: Auth reset test passes" \
  --expect-regex "src/auth/.+\\.ts"
```

`calibrate` erzeugt `ContextCalibrationV1`: Sparkompass testet Zielgrößen ohne automatische Erweiterung und empfiehlt die kleinste direkt verifizierte Pack-Größe. Wenn `--expect` oder `--expect-regex` gesetzt sind, prüft die Kalibrierung dieselben Akzeptanzregeln wie `pack`. Das ist der Weg, wenn man nicht raten will, ob 25%, 35% oder 50% für die konkrete Aufgabe sicher genug sind.

### 21. Sparbilanz über mehrere Läufe sammeln

```bash
sparkompass pack --file "debug.log" --keep "AUTH_RESET_TOKEN_EXPIRED" --ledger
sparkompass ledger report .
```

`--ledger` schreibt das `ContextPackReceiptV1` in `.sparkompass/savings-ledger.json`. Der Report zeigt `SavingsLedgerV1`: echte gelieferte Ersparnis, theoretische Kompakt-Kandidaten, p95 gelieferte Tokens, Fallback-Rate, Vollkontext-Fallbacks und schlechteste Qualitätswerte. Damit sieht man nicht nur einen einzelnen Balken, sondern ob Sparkompass über mehrere Läufe wirklich Nutzen bringt.

Ein bereits gespeichertes Receipt kann ebenfalls eingetragen werden:

```bash
sparkompass ledger add --receipt "pack.json"
```

### 22. Impact-Report aus Ledgers bauen

```bash
sparkompass pilot . --ledger-dir .sparkompass/pilot-run
sparkompass impact . \
  --savings-ledger .sparkompass/pilot-run/savings-ledger.json \
  --task-outcome-ledger .sparkompass/pilot-run/task-outcome-ledger.json \
  --handoff-ledger .sparkompass/pilot-run/handoff-ledger.json \
  --prompt-preparation-ledger .sparkompass/pilot-run/prompt-preparation-ledger.json
```

`impact` erzeugt `SparkompassImpactReportV1`: den lesbaren Beweis, was die Sparläufe für Nutzer gebracht haben. Er verbindet echte gelieferte ContextPack-Ersparnis, geschätzte Startkontext-Ersparnis, sendbare Prompt-Ersparnis und TaskOutcome-Verifikation. Das Gate wird nur `verified-impact`, wenn vorhandene Ledger keine Qualitätsblocker wie Vollkontext-Fallbacks, riskante Verdichtungen, blockierte Handoffs, review-pflichtige Prompts oder Review-Tasks enthalten.

### 23. Shadow-Vergleich gegen Vollkontext

```bash
sparkompass shadow \
  --file "debug.log" \
  --expect "AUTH_RESET_TOKEN_EXPIRED" \
  --expect "Done when: Auth reset test passes" \
  --expect-regex "src/auth/.+\\.ts"
```

`shadow` erzeugt `ShadowRunV1`: Sparkompass prüft den Vollkontext und den gelieferten ContextPack gegen dasselbe deterministische Akzeptanzorakel. Das Oracle unterstützt exakte Soll-Fakten via `--expect` und Muster via `--expect-regex`, zum Beispiel für Dateipfade mit Zeilennummern. Wenn der Vollkontext besteht, der Sparkompass-Kontext aber nicht, meldet der Lauf `Gate: shadow-regression` und beendet mit Exit-Code 2.

Zusätzlich entfernt Shadow jede Soll-Fakt oder jedes Soll-Muster testweise aus dem gelieferten Kontext. Nur wenn das Oracle diese Gegenfakten erkennt, ist `Gate: verified-shadow` möglich.

### 24. Nur einen Prompt bauen

```bash
sparkompass prompt \
  --goal "Login-Fehler beheben" \
  --file "src/auth.ts" \
  --done "Tests laufen grün"
```

### 25. JSON für eigene Tools

```bash
sparkompass audit . --json
sparkompass recommend . --goal "README prüfen" --json
sparkompass plan . --goal "README prüfen" --budget 800 --json
sparkompass control . --goal "README prüfen" --budget 800 --json
sparkompass handoff . --goal "README prüfen" --budget 800 --json
sparkompass handoff-ledger report . --json
sparkompass envelope . --goal "README prüfen" --budget 800 --json
sparkompass envelope-ledger report . --json
sparkompass inventory . --json
sparkompass cache . --json
sparkompass delta . --json
sparkompass lookup . --query "compressText" --json
sparkompass bom . --goal "compressText verbessern" --budget 500 --json
sparkompass graph . --query "compressText" --json
sparkompass slice . --query "compressText" --json
sparkompass flow . --query "compressText" --json
sparkompass semantic-cache add . --query "compressText" --file test/fixtures/code-sample.mjs --oracle "npm test" --expect "export function compressText" --tool-version "npm=10" --registry --json
sparkompass semantic-cache lookup . --query "compressText" --oracle "npm test" --expect "export function compressText" --tool-version "npm=10" --json
sparkompass tool-output --file pytest.log --command "pytest -q" --exit-code 1 --json
sparkompass tool-output load --summary .sparkompass/tool-output/abc.summary.json --pattern E_AUTH_104 --json
sparkompass compress --file debug.log --json
sparkompass pack --file debug.log --expect "AUTH_RESET_TOKEN_EXPIRED" --expect-regex "src/auth/.+\\.ts" --json
sparkompass receipt verify --receipt pack.json --file debug.log --json
sparkompass task run . --command "npm test" --expect-output "pass" --json
sparkompass calibrate --file debug.log --expect "AUTH_RESET_TOKEN_EXPIRED" --expect-regex "src/auth/.+\\.ts" --json
sparkompass ledger report . --json
sparkompass slim . --goal "compressText quality warnings" --file src/compressor.mjs --expect compressText --budget 120 --json
sparkompass impact . --json
sparkompass shadow --file debug.log --expect "AUTH_RESET_TOKEN_EXPIRED" --expect-regex "src/auth/.+\\.ts" --json
```

### 26. Benchmark gegen Vollkontext prüfen

```bash
sparkompass benchmark .
```

Der Benchmark prüft kleine Akzeptanzorakel gegen Vollkontext und ContextPack. Die zentrale Frage ist: Bleiben erwartete Fehlercodes, Befehle, Funktionsnamen und strukturierte Muster wie Stacktrace-Pfade im gelieferten Kontext erhalten?

Zusätzlich führt der Benchmark Gegenfakten-Checks aus: Er entfernt erwartete Soll-Fakten und Soll-Muster testweise aus dem gelieferten Kontext und verlangt, dass das Oracle diesen Fehler erkennt. Jeder Benchmark-Fall erzeugt außerdem ein TaskOutcome-Receipt für die konkrete Akzeptanzaufgabe: Vollkontext muss bestehen, Sparkompass-Kontext muss bestehen, Regression muss `false` sein und alle Gegenfakten müssen erkannt werden. `BenchmarkContextPackQualityV1` verlangt für alle Benchmark-Packs 100% kritische Anker, 100% Quellbelege, keine riskanten Packs und keine Vollkontext-Fallbacks. `BenchmarkEfficiencyMetricsV1` berichtet zusätzlich Erfolgsdelta, Tokens pro verifiziertem Task, Output-Tokens, p95 gesparte Tokens, Fallback-Rate, Nachlade-Rate und Cache-Hit-Rate. `Gate: verified-benchmark` bedeutet dadurch nicht nur "kompakt und bestanden", sondern auch "die Prüfung wäre sensibel genug, um wichtige Verluste zu bemerken".

Der Benchmark enthält außerdem einen kleinen Failure-Corpus für gefährliche Kompressionsfälle: Negationen und Flags, exakte Zahlen/Versionen/Prioritäten, abgeschnittene Stacktraces, gleichnamige Symbole, Sicherheits-Datenfluss, dynamische Imports und Monorepo-Abhängigkeiten. `FailureCorpusCoverageV1` macht diese Klassen explizit und blockiert `verified-benchmark`, wenn eine Pflichtklasse fehlt oder fehlschlägt. Im Quell-Repo nutzt der Benchmark die Fixture-Dateien; fehlen diese nach einer Paketinstallation, verwendet er eingebaute Fallback-Fixtures mit denselben Akzeptanzorakeln. Mehr dazu steht in [docs/failure-corpus.md](docs/failure-corpus.md).

### 27. Sparkompass an sich selbst testen

```bash
sparkompass dogfood .
```

Das komprimiert zentrale Dateien dieses Repos und zeigt durchschnittliche Ersparnis, Anker-Erhaltung und riskante Verdichtungen.
Zusätzlich meldet Dogfood den schlechtesten Einzelfall und p95-Tokenwerte, damit ein guter Durchschnitt keinen schwachen Kontextfall versteckt.

### 28. Release-Scorecard prüfen

```bash
sparkompass scorecard .
```

`scorecard` erzeugt `SparkompassScorecardV1`: eine read-only Freigabeansicht aus Dogfood, Benchmark, TaskOutcome-Erfolgen, kritischen Ankern, Quellbelegen, Fallbacks und lokalen Ledger-Spuren. Dazu zählen SavingsLedger, TaskOutcomeLedger, EnvelopeLedger, HandoffLedger und PromptPreparationLedger; fehlende Historie ist eine Warnung, kein Blocker. Das Gate `verified-scorecard` ist kein Ersatz für `package-audit`, `package-smoke`, `plugin-smoke` oder `release-audit`, aber der schnelle Blick darauf, ob Sparkompass gerade eher publishable oder review-pflichtig ist.

## Wie nutze ich den Skill?

Der Skill liegt hier:

```text
.agents/skills/codex-sparkompass/SKILL.md
```

In einem Codex-freundlichen Repo kann Codex Skills aus `.agents/skills` verwenden. Danach kann man Codex zum Beispiel sagen:

```text
Use $codex-sparkompass to prepare the next Codex run for fixing the login bug.
```

Der Skill soll dann nicht selbst raten, sondern das CLI ausführen, die Ausgabe lesen und daraus den nächsten engen Codex-Prompt ableiten.

Wichtig: Der Skill kann Codex nicht heimlich vor dem Versand an OpenAI umschreiben. Er hilft dabei, den Inhalt vorab zu verdichten und sichtbar zu machen, was vermutlich gespart wird. Wenn bereits ein großer Prompt oder eine große Paste vorhanden ist, ist `sparkompass prompt-prepare` die bewusst sendbare Variante: Sie erzeugt den kompakten Prompt plus ContextPack-Beleg, statt nur einen Hinweis auszugeben.

## Wie nutze ich das Plugin?

Das Repo enthält jetzt auch einen lokalen Plugin-Kandidaten:

```text
plugins/codex-sparkompass/.codex-plugin/plugin.json
.agents/plugins/marketplace.json
```

Der Plugin-Skill ruft die gleiche CLI über eine kleine Bridge auf:

```bash
node plugins/codex-sparkompass/scripts/sparkompass.mjs recommend . --goal "Nächsten Codex-Lauf sparen"
```

Der Plugin-Kandidat enthält außerdem einen MCP-Server:

```text
plugins/codex-sparkompass/.mcp.json
plugins/codex-sparkompass/scripts/sparkompass-mcp.mjs
```

Damit wird Sparkompass nicht nur vor einem Prompt ausgeführt, sondern kann Codex während einer Aufgabe interaktive Kontextwerkzeuge anbieten: suchen, Handoff-Receipts bauen, Handoff-Ledgers auswerten, Belege laden, Cache schreiben, Deltas prüfen, ContextPacks erzeugen, Receipts verifizieren, Task-Ergebnisse belegen, TaskOutcome-Ledgers auswerten, Impact-Reports bauen und eine Sparbilanz führen.

Der Hook-Kandidat ergänzt diese Schicht vor dem User-Prompt: Wenn ein sehr großer Prompt oder eine Tool-Ausgabe direkt in Codex eingefügt wird, kann er lokal auf den sparsameren Weg hinweisen. Auch hier gilt: Er ist ein Hinweisgeber, kein interner Request-Rewriter.

Im Codex-App-Kontext kann der Marketplace-Eintrag genutzt werden, um den Plugin-Kandidaten lokal zu installieren oder zu testen.

```bash
codex plugin marketplace add .
codex plugin add codex-sparkompass@personal
codex plugin list --marketplace personal
```

Nach Installation kann ein neuer Codex-Thread oder App-Neustart nötig sein, bis Skill, MCP-Server und Hook aus der installierten Plugin-Kopie geladen werden. MCP-Werkzeuge sollten bei installierter Plugin-Nutzung immer das Zielrepo über `rootPath` angeben; `repoRoot` funktioniert als Alias. So sucht `sparkompass_lookup` nicht in der Plugin-Cache-Kopie, sondern im Repository, an dem gerade gearbeitet wird.

Für unser eigenes Dogfooding schreiben wir bewusste Live-Ledgers:

```bash
sparkompass prompt-prepare --file README.md --goal "Live-Test" --ledger .sparkompass/live/prompt-preparation-ledger.json
sparkompass handoff . --goal "Live-Test" --ledger .sparkompass/live/handoff-ledger.json
sparkompass task run . --command "npm run plugin-smoke" --expect-output "verified-plugin-install-smoke" --ledger .sparkompass/live/task-outcome-ledger.json
sparkompass impact . \
  --savings-ledger .sparkompass/live/savings-ledger.json \
  --task-outcome-ledger .sparkompass/live/task-outcome-ledger.json \
  --handoff-ledger .sparkompass/live/handoff-ledger.json \
  --prompt-preparation-ledger .sparkompass/live/prompt-preparation-ledger.json
```

## Warum das hilft

Codex verbraucht Kontext durch Prompts, gelesene Dateien, Toolausgaben, geladene Anweisungen und angebundene Systeme. Der Sparkompass senkt nicht die Preise. Er hilft, weniger unnötigen Kontext zu erzeugen:

- erst relevante Dateien finden, dann lesen
- vor dem Handoff mit `ContextBOMV1` sehen, aus welchen Dateien, Typen und Entscheidungen der Kontext besteht
- mit `ContextHandoffReceiptV1` sehen, welcher Startprompt wirklich genutzt werden soll und wie viel Startkontext lokal geschätzt vermieden wurde
- mit `ContextHandoffLedgerV1` prüfen, ob mehrere geplante Codex-Starts zusammen wirklich kleiner werden
- große Dateien nicht automatisch voll in den Kontext ziehen
- `AGENTS.md` kurz und lokal halten
- wiederholte Arbeitsweisen als Skill statt als langen Prompt nutzen
- MCP-Server und Subagents nur einsetzen, wenn sie wirklich gebraucht werden
- lange Logs, Notizen oder Fehlermeldungen vor dem Einfügen mit `compress` oder `pack` verdichten
- große geplante Prompts mit `prompt-prepare` in einen belegten sendbaren Kompaktprompt verwandeln
- vorbereitete Prompts mit `prompt-ledger` über mehrere Codex-Starts messen
- gespeicherte ContextPack-Receipts gegen Originalquelle und gelieferten Kontext nachprüfen
- lokale Task-Ergebnisse als `TaskOutcomeReceiptV1` mit Output-Hash, Exit-Code und erwarteten Output-Fakten belegen
- `TaskOutcomeLedgerV1` nutzen, um Tokens pro verifiziertem Task über mehrere Läufe zu sehen
- echte gelieferte Ersparnis über `SavingsLedgerV1` verfolgen
- mit `SparkompassImpactReportV1` sehen, ob gesparte Kontext- und Promptmenge auch durch verifizierte Prompts und Tasks getragen wird
- mit `SparkompassScorecardV1` sehen, ob Dogfood, Benchmark, TaskOutcome und Ledger-Spuren zusammen grün sind

## Sparbalken

`recommend` und `compress` zeigen eine Schätzung:

```text
Sparbalken: [############--------] 60% gespart (900 von 1.500 Tokens)
```

Bei `compress` vergleicht der Balken Rohtext gegen kompakte Fassung. Bei `pack` vergleicht er Rohtext gegen den tatsächlich gelieferten Kontext nach möglichen Erweiterungen oder Vollkontext-Fallbacks. Danach kommt eine Prüfung:

- Qualität: `gut`, `ok` oder `riskant`
- erkannte Anker, die erhalten blieben
- kritische Ankerklassen wie `keep`, `error-code`, `path`, `cli-option` und `code`
- geschützte Zeilen, die erhalten blieben
- Warnungen, wenn die Zielgröße wegen wichtiger Inhalte überschritten wurde

Bei `recommend` vergleicht der Balken einen naiven Start mit gelesenen Dateien gegen den erzeugten engen Startprompt. Bei `prompt-prepare` gibt es zwei Balken: Rohprompt gegen gelieferten ContextPack-Kontext und Rohprompt gegen den tatsächlich sendbaren Prompt inklusive Beleg-Metadaten. `prompt-ledger report` summiert diese sendbare Prompt-Ersparnis über mehrere vorbereitete Prompts. Bei `handoff` vergleicht der Balken das geschätzte Repository-Inventar mit dem tatsächlich erzeugten `ContextEnvelope`-Startprompt und zeigt gleichzeitig die Readiness-Gates. Das ist eine Planungszahl, keine Rechnung. Für mehrere Pack-Läufe sammelt `sparkompass ledger report` die echte gelieferte Ersparnis. `sparkompass impact` führt Pack-, Handoff-, PromptPreparation- und TaskOutcome-Ledgers zusammen und zeigt, ob die Ersparnis mit verifizierten Prompts und Ergebnissen verbunden ist.

## Befehle

```bash
sparkompass audit [pfad] [--json] [--top 12] [--include-lockfiles]
sparkompass recommend [pfad] --goal "..." [--file "..."] [--done "..."] [--json]
sparkompass plan [pfad] --goal "..." [--budget 800] [--risk-profile balanced] [--file "..."] [--cache .sparkompass/context-cache.json] [--graph] [--done "..."] [--expect "..."] [--expect-regex "..."] [--json]
sparkompass bom [pfad] --goal "..." [--budget 800] [--risk-profile balanced] [--file "..."] [--cache .sparkompass/context-cache.json] [--graph] [--done "..."] [--expect "..."] [--expect-regex "..."] [--json]
sparkompass control [pfad] --goal "..." [--budget 800] [--risk-profile balanced] [--file "..."] [--cache .sparkompass/context-cache.json] [--graph] [--done "..."] [--expect "..."] [--expect-regex "..."] [--previous-envelope envelope.json] [--min-cache-prefix-tokens 1024] [--json]
sparkompass evidence-audit [pfad] --goal "..." [--budget 800] [--risk-profile balanced] [--file "..."] [--cache .sparkompass/context-cache.json] [--graph] [--done "..."] [--expect "..."] [--expect-regex "..."] [--max-evidence 180] [--json]
sparkompass ablation-audit [pfad] --goal "..." --expect "..." [--budget 800] [--risk-profile balanced] [--file "..."] [--cache .sparkompass/context-cache.json] [--graph] [--done "..."] [--expect-regex "..."] [--max-units 80] [--json]
sparkompass slim [pfad] --goal "..." --expect "..." [--budget 800] [--risk-profile balanced] [--file "..."] [--cache .sparkompass/context-cache.json] [--graph] [--done "..."] [--expect-regex "..."] [--max-units 80] [--max-moves 24] [--json]
sparkompass handoff [pfad] --goal "..." [--budget 800] [--risk-profile balanced] [--file "..."] [--cache .sparkompass/context-cache.json] [--graph] [--done "..."] [--expect "..."] [--expect-regex "..."] [--previous-envelope envelope.json] [--min-cache-prefix-tokens 1024] [--print-prompt] [--ledger .sparkompass/handoff-ledger.json] [--json]
sparkompass handoff-ledger report [pfad] [--ledger .sparkompass/handoff-ledger.json] [--json]
sparkompass handoff-ledger add [pfad] --receipt "handoff.json" [--out .sparkompass/handoff-ledger.json] [--kind handoff] [--note "..."] [--json]
sparkompass envelope [pfad] --goal "..." [--budget 800] [--risk-profile balanced] [--file "..."] [--cache .sparkompass/context-cache.json] [--graph] [--done "..."] [--expect "..."] [--expect-regex "..."] [--previous-envelope envelope.json] [--ledger .sparkompass/envelope-ledger.json] [--min-cache-prefix-tokens 1024] [--json]
sparkompass compress [--file "..."] [--text "..."] [--target 35] [--mode auto] [--keep "..."] [--json]
sparkompass pack [--file "..."] [--text "..."] [--target 35] [--risk-profile balanced] [--mode auto] [--keep "..."] [--expect "..."] [--expect-regex "..."] [--ledger .sparkompass/savings-ledger.json] [--registry .sparkompass/context-pack-registry.json] [--json]
sparkompass receipt schema [--json]
sparkompass receipt lint --receipt "pack.json" [--json]
sparkompass receipt verify --receipt "pack.json" [--file "..."] [--text "..."] [--context "..."] [--json]
sparkompass contextpack report [pfad] [--registry .sparkompass/context-pack-registry.json] [--json]
sparkompass contextpack register [pfad] --pack "pack.json" [--source-file "..."] [--context "..."] [--registry .sparkompass/context-pack-registry.json] [--store-source-text] [--json]
sparkompass contextpack verify [pfad] --context-pack-id "ctx-..." [--source-file "..."] [--context "..."] [--registry .sparkompass/context-pack-registry.json] [--json]
sparkompass task run [pfad] --command "..." [--expected-exit-code 0] [--expect-output "..."] [--expect-output-regex "..."] [--receipt pack.json] [--source-file "..."] [--context "..."] [--ledger .sparkompass/task-outcome-ledger.json] [--json]
sparkompass task record [pfad] --command "..." --exit-code 0 [--output-file "..."] [--output-text "..."] [--expect-output "..."] [--receipt pack.json] [--source-file "..."] [--ledger .sparkompass/task-outcome-ledger.json] [--json]
sparkompass codex-usage record [pfad] --file "codex-run.jsonl" [--ledger .sparkompass/codex-usage-ledger.json] [--label "..."] [--json]
sparkompass codex-usage compare [pfad] --baseline "raw.jsonl" --optimized "compact.jsonl" [--baseline-label "..."] [--optimized-label "..."] [--json]
sparkompass codex-usage report [pfad] [--ledger .sparkompass/codex-usage-ledger.json] [--json]
sparkompass experiment plan [pfad] --raw-prompt-file raw.txt --compact-prompt-file compact.txt --model gpt-5 --reasoning-effort medium --sandbox-mode workspace-write [--task-command "npm test"] [--evidence-dir evidence/codex-experiment] [--repeat 3] [--out evidence/experiment-plan.json] [--json]
sparkompass experiment script [pfad] --plan evidence/experiment-plan.json [--out evidence/codex-experiment/run-experiment.sh] [--json]
sparkompass experiment audit [pfad] --plan evidence/experiment-plan.json [--out evidence/experiment-evidence-audit.json] [--json]
sparkompass experiment run [pfad] --variant "basis_raw=raw.jsonl" --variant "basis_kompakt=compact.jsonl" --variant "plugin_raw=plugin-raw.jsonl" --variant "plugin_kompakt=plugin-compact.jsonl" [--repeat 3] [--task-passed "plugin_kompakt=true"] [--task-outcome "plugin_kompakt=task.json"] [--context-pack-hash "sha256:..."] [--require-metadata true] [--require-context-pack-hash true] [--out evidence/experiment.json] [--json]
sparkompass router decide [pfad] --experiment evidence/experiment.json [--overhead evidence/overhead.json] [--min-net-gain-tokens 1] [--require-quality-evidence true] [--out evidence/router.json] [--json]
sparkompass calibrate [--file "..."] [--text "..."] [--risk-profile balanced] [--min-target 10] [--max-target 90] [--step 5] [--keep "..."] [--expect "..."] [--expect-regex "..."] [--json]
sparkompass ledger report [pfad] [--ledger .sparkompass/savings-ledger.json] [--json]
sparkompass ledger add [pfad] --receipt "pack.json" [--out .sparkompass/savings-ledger.json] [--kind pack] [--note "..."] [--json]
sparkompass task-ledger report [pfad] [--ledger .sparkompass/task-outcome-ledger.json] [--json]
sparkompass task-ledger add [pfad] --outcome "task.json" [--out .sparkompass/task-outcome-ledger.json] [--kind task] [--note "..."] [--json]
sparkompass envelope-ledger report [pfad] [--ledger .sparkompass/envelope-ledger.json] [--json]
sparkompass envelope-ledger add [pfad] --envelope "envelope.json" [--out .sparkompass/envelope-ledger.json] [--kind envelope] [--note "..."] [--json]
sparkompass shadow [--file "..."] [--text "..."] --expect "..." [--expect-regex "..."] [--target 35] [--risk-profile balanced] [--keep "..."] [--json]
sparkompass tool-output [--file "..."] [--text "..."] [--command "..."] [--exit-code 1] [--store .sparkompass/tool-output] [--json]
sparkompass tool-output load [--summary "..."] [--raw "..."] [--id "..."] [--pattern "..."] [--line 42] [--context-lines 6] [--json]
sparkompass inventory [pfad] [--max-files 300] [--json]
sparkompass cache [pfad] [--out .sparkompass/context-cache.json] [--json]
sparkompass delta [pfad] [--cache .sparkompass/context-cache.json] [--json]
sparkompass lookup [pfad] --query "..." [--budget 400] [--json]
sparkompass source [pfad] --source-hash "sha256:..." [--file "..."] [--file-hash "sha256:..."] [--context-lines 6] [--max-matches 5] [--json]
sparkompass graph [pfad] [--query "..."] [--max-files 300] [--json]
sparkompass slice [pfad] --query "..." [--max-files 300] [--json]
sparkompass flow [pfad] --query "..." [--depth 2] [--json]
sparkompass semantic-cache add [pfad] --query "..." [--file "..."] [--text "..."] [--oracle "..."] [--expect "..."] [--expect-regex "..."] [--tool-version "..."] [--risk-profile balanced] [--registry .sparkompass/context-pack-registry.json] [--json]
sparkompass semantic-cache lookup [pfad] --query "..." [--oracle "..."] [--expect "..."] [--expect-regex "..."] [--tool-version "..."] [--min-similarity 0.6] [--json]
sparkompass prompt-advisory [--file "..."] [--text "..."] [--hook-payload] [--min-tokens 1600] [--min-lines 120] [--quiet-ok] [--json]
sparkompass prompt-prepare [--file "..."] [--text "..."] [--hook-payload] [--goal "..."] [--target 35] [--risk-profile balanced] [--keep "..."] [--expect "..."] [--expect-regex "..."] [--include-receipt] [--ledger .sparkompass/prompt-preparation-ledger.json] [--json]
sparkompass prompt-ledger report [pfad] [--ledger .sparkompass/prompt-preparation-ledger.json] [--json]
sparkompass prompt-ledger add [pfad] --preparation "prompt-preparation.json" [--out .sparkompass/prompt-preparation-ledger.json] [--kind prompt-prepare] [--note "..."] [--json]
sparkompass pilot [pfad] [--ledger-dir .sparkompass/pilot-run] [--file "..."] [--goal "..."] [--task-command "npm test"] [--json]
sparkompass impact [pfad] [--savings-ledger .sparkompass/savings-ledger.json] [--task-outcome-ledger .sparkompass/task-outcome-ledger.json] [--handoff-ledger .sparkompass/handoff-ledger.json] [--prompt-preparation-ledger .sparkompass/prompt-preparation-ledger.json] [--json]
sparkompass package-audit [pfad] [--max-package-size-kb 400] [--max-unpacked-size-kb 1500] [--max-files 120] [--json]
sparkompass package-smoke [pfad] [--keep-temp] [--json]
sparkompass plugin-smoke [pfad] [--keep-temp] [--json]
sparkompass release-audit [pfad] [--ledger-dir "..."] [--pilot false] [--max-moves 24] [--json]
sparkompass scorecard [pfad] [--target 35] [--min-saving 35] [--min-anchors 75] [--savings-ledger .sparkompass/savings-ledger.json] [--task-outcome-ledger .sparkompass/task-outcome-ledger.json] [--envelope-ledger .sparkompass/envelope-ledger.json] [--handoff-ledger .sparkompass/handoff-ledger.json] [--prompt-preparation-ledger .sparkompass/prompt-preparation-ledger.json] [--json]
sparkompass benchmark [pfad] [--target 35] [--json]
sparkompass dogfood [pfad] [--target 35] [--min-saving 35] [--min-anchors 75] [--fail-on-risk] [--json]
sparkompass prompt --goal "..." [--file "..."] [--context "..."] [--constraint "..."] [--done "..."]
sparkompass doctor overhead [pfad] [--profile minimal|standard|benchmark|release|debug] [--json]
sparkompass doctor
sparkompass-mcp
```

## Entwicklung

```bash
npm run lint
npm test
npm run audit
npm run benchmark
npm run dogfood
npm run scorecard
npm run evidence-audit
npm run ablation-audit
npm run slim
npm run pilot
npm run impact
npm run doctor-overhead
npm run package-audit
npm run package-smoke
npm run plugin-smoke
npm run release-audit
printf '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}\n' | node ./bin/codex-sparkompass-mcp.mjs
npm pack --dry-run
```

`npm run dogfood` ist das Release-Gate für die Kompression. Es muss `Gate: verified-publishable` melden. Aktuelle Basislinie:

- durchschnittliche Ersparnis: 41%
- durchschnittliche Anker-Erhaltung: 100%
- schlechteste Anker-Erhaltung: 100%
- kritische Anker-Erhaltung: 100%
- Quellbeleg-Abdeckung: 100%
- p95 gelieferte Tokens im Dogfood: 16.176
- Erweiterte ContextPacks: 0
- Vollkontext-Fallbacks: 0
- riskante Verdichtungen: 0
- Tests: 227
- Test-Suites: 55
- Benchmark-Fälle: 10
- Failure-Corpus-Erfolge: 7/7
- Failure-Corpus-Klassen: 7/7
- Benchmark-ContextPack-Qualität: 10/10
- Benchmark-Regressionen gegen Vollkontext: 0
- Benchmark-TaskOutcome-Erfolge: 10/10
- Scorecard-Gate: verified-scorecard
- Release-Audit-Gate: verified-release-audit
- Evidence-Audit-Gate: verified-evidence-audit
- Ablation-Audit-Gate: verified-ablation-audit
- Slimming-Plan-Gate: verified-slimming-plan
- Impact-Gate: verified-impact
- PackageDryRun-Gate: verified-package-dry-run
- PackageInstallSmoke-Gate: verified-package-install-smoke
- PluginInstallSmoke-Gate: verified-plugin-install-smoke
- PluginInstallSmoke-Tool-Call: ok, 2 Lookup-Treffer
- PluginInstallSmoke-Cache-Install-Bridge: ok, 2 Lookup-Treffer
- Pilot-PromptPreparationLedger: 1/1 verifiziert
- Pilot-Context-Tokens pro verifiziertem Task: 16.119
- Pilot-Startkontext-Ersparnis: 49%
- Pilot-sendbare-Prompt-Ersparnis: 13%
- Impact-sendbare-Prompt-Ersparnis: 13%
- Release-Audit-Anforderungen: 30/30
- Release-Audit-ExperimentPlan: verified-experiment-plan, 12 geplante Runs
- Release-Audit-ExperimentScript: verified-experiment-script, 12 geplante Runs, ausführbar
- Release-Audit-ExperimentEvidenceAudit: verified-experiment-evidence, 12/12 Usage, 12/12 TaskOutcomes
- Release-Audit-ExperimentRun-Usage-Invarianten: 4/4
- Release-Audit-ExperimentRun-Metadaten: 4/4
- Release-Audit-ExperimentRun-ContextPack-Hash: 4/4
- Release-Audit-ExperimentRun-Task-Effizienz: verified-task-efficiency, 830 Tokens/verifiziertem Task, 270 Tokens gespart
- Release-Audit-Gate-Pfad: verified-gate-path-prepared, naechstes Gate verified-end-to-end-noninferior vorbereitet
- ContextPackFormat-Gate: verified-context-pack-format
- ContextPack-ID-Gate: verified-context-pack-id
- SourceHashEvidence-Gate: verified-source-hash-evidence
- SourceHashContract-Gate: verified-source-hash-contract
- SemanticCacheRegistry-Gate: verified-semantic-cache-registry-contract
- MCP-Tools: 48
- DoctorOverhead-Gate: verified-doctor-overhead
- DoctorOverhead-Standard-Profil: 20/48 MCP-Tools, ca. 11.716 geschätzte Katalog-Tokens gespart
- npm-pack-dry-run: 281.4 kB Package, 1277 kB entpackt, 92 Dateien
- Gegenfakten im Benchmark erkannt: 42/42
- Benchmark-Ersparnis: 55%
- Tokens pro bestandenem Benchmark-Fall: 83
- BenchmarkEfficiency-Gate: verified
- Benchmark-Gesamtkosten pro verifiziertem Task: 120 Tokens
- Benchmark-Task-Erfolgsdelta: 0%
- Benchmark-p95 gesparte Tokens: 163
- Benchmark-Fallback-/Nachlade-/Cache-Hit-Rate: 0% / 0% / 0%
- Delta-Kontext und Lookup sind als CLI-Vorstufe für interaktive Kontextwerkzeuge vorhanden.
- ContextPlanV1 und `sparkompass_plan_context` trennen Sofortkontext, Nachlade-Belege und ausgelassene Einheiten; mit Cache auch `stable`, `changed`, `added` und `ContextPlanDeltaCoverageV1`, mit `--graph` direkte Abhängigkeitsnachbarn, mit `--expect`/`--expect-regex` Muss-Fakten-Coverage, mit `ContextBudgetOptimizerV1` Nutzen pro Token und mit `ContextPlanRiskControlsV1` review-pflichtige deferred Risk Units für `strict`/`careful`.
- ContextDecisionTraceV1 erklärt Planentscheidungen, Budget-Ablehnungen und Unsicherheiten als prüfbare Entscheidungsakte.
- ContextBOMV1 und `sparkompass_context_bom` machen den geplanten Kontext als Materialliste nach Lane, Datei, Typ, Entscheidung, Risiko und Muss-Fakten sichtbar.
- ContextControlReportV1 und `sparkompass_control_report` führen Plan, Envelope, Readiness-Gate, Evidence-Protokoll und Handoff-Hashes zu einem Vorflugbericht zusammen.
- ContextEvidenceAuditV1, `sparkompass evidence-audit` und `sparkompass_evidence_audit` prüfen die geplanten Belege gegen aktuelle Dateien, Zeilen und Quellhashes.
- SourceHashEvidenceV1, SourceHashHandoffContractProbeV1, `sparkompass source` und `sparkompass_load_source_hash` laden begrenzte Originalausschnitte direkt per `source_hash` oder `file_hash`. ContextPlan, ContextBOM, ContextControlReport, ContextEnvelope und ContextHandoffReceipt tragen dafür `source_hash_load_hint` und `load_hints.source_hash`, damit ein kompakter Handoff erst klein bleiben und später exakt belegte Rohstellen nachfordern kann.
- ContextAblationAuditV1, `sparkompass ablation-audit` und `sparkompass_ablation_audit` testen Sofortkontext-Einheiten gegen ein Oracle und markieren oracle-kritische sowie ablation-sichere Einheiten.
- ContextSlimmingPlanV1, `sparkompass slim` und `sparkompass_slim_context` machen aus ablation-sicheren Einheiten einen On-Demand-Vorschlag mit geschätzter Zusatzersparnis im Sofortkontext.
- ContextHandoffReceiptV1 und `sparkompass_handoff_receipt` machen Startprompt, Sparbalken, Readiness-Gates, Prompt-Cache-Layout und MCP-Nachladevertrag per Unit-ID und `source_hash` als nutzbaren Handoff-Beleg sichtbar.
- ContextHandoffLedgerV1 und `sparkompass_handoff_ledger` sammeln Handoff-Receipts und zeigen geschätzte Startkontext-Ersparnis, Gate-Status und Nachlade-Evidence über mehrere Codex-Starts.
- SparkompassUserPromptHookAdvisoryV1, `sparkompass prompt-advisory`, `sparkompass_prompt_advisory` und der Plugin-Hook erkennen große User-Prompts lokal und schlagen `tool-output`, `pack` oder `handoff` vor, ohne Prompt-Inhalte auszugeben oder den Codex-Prompt zu verändern.
- SparkompassPromptPreparationV1, `sparkompass prompt-prepare` und `sparkompass_prepare_prompt` erzeugen aus großen Eingaben einen bewusst sendbaren kompakten Prompt mit ContextPack-ID, Gate, Hashes, Akzeptanz-Orakel und Sparbalken.
- PromptPreparationLedgerV1, `sparkompass prompt-ledger` und `sparkompass_prompt_preparation_ledger` messen sendbare Prompt-Ersparnis, Verifikationsrate, p95-Werte und Fallbacks über mehrere vorbereitete Prompts.
- SparkompassPilotRunV1, `sparkompass pilot` und `sparkompass_pilot_run` schreiben reale Pilot-Ledger für Savings, PromptPreparation, TaskOutcome, Envelope und Handoff, damit Tokens pro verifiziertem Task, sendbare Prompt-Ersparnis und Startkontext-Ersparnis zusammen prüfbar werden.
- SparkompassImpactReportV1, `sparkompass impact` und `sparkompass_impact_report` führen Savings-, Handoff-, PromptPreparation- und TaskOutcome-Ledgers zu einem Nutzerwirkungs-Gate mit Sparbalken, p95-Werten und Qualitätsblockern zusammen.
- SparkompassExperimentPlanV1 und `sparkompass experiment plan` bereiten echte vierarmige Codex-JSONL-Messläufe mit Prompt-Hashes, geplanten Usage-Dateien, TaskOutcome-Pfaden und vollständigen Metadaten vor, ohne selbst Usage-Zahlen zu behaupten.
- SparkompassExperimentScriptV1 und `sparkompass experiment script` erzeugen aus dem Plan ein ausführbares Runbook für alle geplanten Codex-Runs, TaskOutcome-Prüfungen, Evidence-Audit, ExperimentRun und Router.
- SparkompassExperimentEvidenceAuditV1 und `sparkompass experiment audit` prüfen geplante Usage-JSONL-Dateien, Usage-Invarianten, Prompt-Hashes und TaskOutcome-Receipts gegen den ExperimentPlan, bevor `experiment run` daraus Belege baut.
- SparkompassExperimentRunV1 und `sparkompass experiment run` verbinden vier offizielle Codex-JSONL-Arme plus Usage-Invarianten, RunManifest-Metadatenvollständigkeit und optionale TaskOutcome-Receipts zu RunManifests, Effekten, verifizierter Task-Effizienz, Gate und Router-Empfehlung.
- SparkompassDoctorOverheadV1 und `sparkompass doctor overhead` messen Plugin-, Skill-, Hook- und MCP-Katalog-Grundlast lokal und zeigen Tool-Profile samt geschätzter Katalog-Ersparnis.
- SparkompassRouterDecisionV1 und `sparkompass router decide` übersetzen Experiment- und Overhead-Belege in `bypass`, `compact`, `lazy` oder `full` plus empfohlenes Tool-Profil.
- SparkompassGatePathV1 verknüpft offiziellen A/B-Usage-Beleg, `quality-noninferior`, Router-Entscheidung und fehlende End-to-End-Evidenz zu einem maschinenlesbaren Pfad Richtung `verified-end-to-end-noninferior`.
- PackageDryRunAuditV1, `sparkompass package-audit` und `sparkompass_package_audit` prüfen die tatsächliche `npm pack --dry-run`-Dateiliste gegen Pflichtpfade, verbotene lokale Artefakte, Größenlimits und ausführbare CLI-/Plugin-Bridges.
- PackageInstallSmokeAuditV1, `sparkompass package-smoke` und `sparkompass_package_install_smoke` packen das lokale Paket, installieren es in ein temporäres Projekt und prüfen installierte CLI, Benchmark und MCP-Tools.
- PluginInstallSmokeAuditV1, `sparkompass plugin-smoke` und `sparkompass_plugin_install_smoke` kopieren den Plugin-Kandidaten temporär und prüfen Plugin-CLI-Bridge, MCP-Bridge, installierte Cache-Bridge, echten `sparkompass_lookup`-Tool-Call und UserPromptSubmit-Hook inklusive Prompt-Redaktion.
- SparkompassReleaseAuditV1, `sparkompass release-audit` und `sparkompass_release_audit` prüfen die Projektanforderungen gegen aktuelle lokale Evidenz, inklusive ContextPack-ID-Verifikation, Fallback-Proben, MCP-Werkzeugen, ExperimentPlan-/ExperimentScript-/ExperimentEvidenceAudit-/ExperimentRun-/Router-/GatePath-Probe, Package-Shape, Package-Dry-Run, Package-Install-Smoke, Plugin-Shape und Plugin-Install-Smoke.
- SparkompassReleaseAuditV1 CLI/MCP-Tests sind Teil des Standardchecks.
- SparkompassScorecardV1 und `sparkompass_scorecard` führen Dogfood, Benchmark, TaskOutcome und Ledger-Spuren inklusive PromptPreparation zu einem Release-Readiness-Signal zusammen.
- ContextEnvelopeV1 und `sparkompass_build_envelope` ordnen ContextPlan-Ausgaben in stabilen Prefix, variable Tail und On-Demand-Index mit Hashes, Cache-Hinweisen und Prefix-Reuse-Vergleich gegen vorherige Envelopes; ContextEnvelopeLedgerV1 sammelt die Prefix-Stabilität über mehrere Läufe.
- Context Graph und `sparkompass_expand_symbol` sind als erste Graph-/MCP-Stufe für Symbolnachbarschaften vorhanden.
- ProgramSliceV1 und `sparkompass_slice_symbol` liefern AST-gestützte JS/MJS-Code-Spans, Calls, einfache Datenhinweise, Tests und Evidence.
- DataFlowTraceV1 und `sparkompass_trace_flow` liefern begrenzte Argument-zu-Parameter-Fluesse über aufgelöste Calls.
- Verified Semantic Cache prüft adaptive Query-Schwelle, Abhängigkeitsdateien, Tool-Fingerprint, externes Oracle, Context-Erwartungen, Receipt, optionalen ContextPackRegistry-Vertrag und Akzeptanz-Orakel vor Wiederverwendung.
- SavingsLedgerV1 prüft echte gelieferte Ersparnis statt nur theoretische Kompakt-Kandidaten.
- ContextPackReceiptV1 erzwingt optionale Akzeptanz-Orakel direkt beim Packen und nutzt Expand-/Vollkontext-Fallback, wenn erwartete Fakten oder Muster fehlen.
- ContextPackReceiptVerificationV1 und `sparkompass_verify_receipt` prüfen gespeicherte Receipts gegen Originalquelle, Quellbelege und gelieferten Kontext.
- ContextPackRegistryV1, `sparkompass contextpack verify` und `sparkompass_verify_context_pack` machen `prüfeKontext(context_pack_id)` lokal prüfbar: Pack-ID nachschlagen, Receipt-Hash kontrollieren und dann dieselbe Quellen-/Delivered-Context-Verifikation ausführen.
- ContextPackFormatV1, `sparkompass receipt schema`, `sparkompass receipt lint` und `sparkompass_contextpack_format` machen den Receipt-Vertrag offen und lintbar, auch wenn die Originalquelle gerade nicht mitgeliefert wird.
- TaskOutcomeReceiptV1 und `sparkompass_task_outcome` belegen lokale Check-Ergebnisse mit Exit-Code, Output-Hash, Output-Orakel und optionaler Receipt-Verifikation.
- TaskOutcomeLedgerV1 und `sparkompass_task_outcome_ledger` messen verifizierte Tasks, Review-Fälle, Verifikationsrate, Review-Gründe, p95-Dauer und Tokens pro verifiziertem Task über mehrere Läufe.
- ShadowRunV1 prüft konkrete ContextPacks gegen Vollkontext und deterministische Soll-Fakten oder Regex-Muster.

Mehr dazu steht in [docs/quality-model.md](docs/quality-model.md) und [docs/release-checklist.md](docs/release-checklist.md).

## Grenzen

- Die Token-Schätzung ist absichtlich einfach und offline.
- `compress` ist verlustbehaftet: wichtige Details können fehlen.
- Riskante Kompression wird nicht blockiert, sondern mit Warnungen ausgegeben.
- Das Tool weiss nicht automatisch, welche Datei fachlich relevant ist.
- Es kann den internen Codex-App-Request nicht abfangen oder verändern.
- Es ersetzt kein Review der eigentlichen Codex-Antwort.
- Offizielle Nutzung und Abrechnung stehen in den OpenAI-Dashboards, nicht in diesem Tool.

## Quellen

- [Codex Pricing](https://developers.openai.com/codex/pricing)
- [Codex Best Practices](https://developers.openai.com/codex/learn/best-practices)
- [Codex Prompting](https://developers.openai.com/codex/prompting)
- [Custom instructions with AGENTS.md](https://developers.openai.com/codex/guides/agents-md)
- [Agent Skills](https://developers.openai.com/codex/skills)
- [Model Context Protocol in Codex](https://developers.openai.com/codex/mcp)
- [Codex Changelog: Plugins](https://developers.openai.com/codex/changelog)
- [OpenAI Prompt Caching](https://developers.openai.com/api/docs/guides/prompt-caching)
