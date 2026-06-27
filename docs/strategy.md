# Strategie: Deutsche Token-Sparlösung für Codex

## Leitbild

Wir bauen eine offene Werkbank für bewusste KI-Nutzung: deutsch, lokal, transparent und praktisch. Sie hilft Nutzern, Codex nicht größer zu briefen als nötig und trotzdem bessere Ergebnisse zu bekommen.

## Kernprinzip

Token sparen heißt nicht: weniger denken. Token sparen heißt: Kontext so präzise schneiden, dass Codex schneller auf das Wesentliche kommt.

## Stand

1. `audit`: Repository scannen, größte Kontext-Treiber zeigen, AGENTS.md und Codex-Konfig prüfen.
2. `prompt`: knappe, robuste Codex-Prompts aus Ziel, Dateien, Grenzen und Done-Kriterien bauen.
3. `doctor`/`doctor overhead`: schnelle Checkliste für Menschen, die gerade vor einem teuren oder unklaren Codex-Lauf stehen, plus lokale Messung von Plugin-, Skill-, Hook- und MCP-Tool-Grundlast.
4. `compress`: lange Logs, Notizen oder Fehlermeldungen vor dem Einfügen in Codex heuristisch verdichten.
5. `pack`: verifizierte ContextPacks mit kritischen Ankern, Quellbelegen, Receipt und Fallback erzeugen.
6. `receipt schema/lint/verify` und `contextpack register/verify`: den offenen ContextPack-Receipt-Vertrag ausgeben, gespeicherte Receipts ohne Originalquelle linten, mit Originalquelle hashgenau nachprüfen und registrierte Packs per `context_pack_id` erneut verifizieren.
7. `task run/record`: lokale Test-, Lint- oder Build-Ergebnisse als TaskOutcomeReceipt mit Output-Hash, Exit-Code, sensitivem Output-Orakel und optionaler Receipt-Verifikation belegen.
8. `task-ledger`: TaskOutcomeReceipts über mehrere Läufe sammeln und Verifikationsrate, Review-Gründe, Output-Orakel-Sensitivität, p95-Dauer sowie Output-/Kontexttokens pro verifiziertem Task berichten.
9. `codex-usage`: dokumentierte `codex exec --json`-Usage-Events als CodexOfficialUsageReceipt lesen und in einem CodexOfficialUsageLedger sammeln.
10. `experiment plan`/`experiment script`/`experiment audit`/`experiment run`/`router decide`: echte vierarmige Codex-JSONL-Messläufe reproduzierbar vorbereiten, als ausführbares Runbook materialisieren, geplante Artefakte gegen den Plan prüfen, offizielle Usage-Belege und optionale TaskOutcome-Receipts zu RunManifests verbinden und daraus Kompressionsgewinn, Plugin-Grundlast, Netto-Produktgewinn, Integrationseffekt sowie `bypass`, `compact`, `lazy` oder `full` ableiten.
11. `plan`: Sofortkontext, Nachlade-Belege und ausgelassene Einheiten unter Budget trennen, optional delta-bewusst gegen einen Cache, graph-bewusst für direkte Abhängigkeiten, optimiert nach Nutzen pro Token und bei `strict`/`careful` risk-aware gegated.
12. `bom`: geplanten Kontext als ContextBOM nach Lane, Datei, Typ, Entscheidung, Risiko und Muss-Fakten sichtbar machen.
13. `control`: Plan, Envelope, Evidence-Protokoll, Handoff-Hashes und Readiness-Gate zu einem Vorflugbericht zusammenführen.
14. `evidence-audit`: geplante Evidence-IDs aus dem Control-Report gegen aktuelle Dateien, Zeilen und Quellhashes prüfen.
15. `ablation-audit`: Sofortkontext-Einheiten einzeln entfernen und gegen ein Akzeptanz-Orakel als kritisch oder On-Demand-Kandidat markieren.
16. `slim`: aus ablation-sicheren Sofortkontext-Einheiten einen konservativen On-Demand-Vorschlag mit Zusatzersparnis bauen, während oracle-kritische und ungeprüfte Einheiten sofort sichtbar bleiben.
17. `handoff`: Startprompt, Sparbalken, Readiness-Gates, Prompt-Cache-Layout und MCP-Nachladevertrag als ContextHandoffReceipt sichtbar machen.
18. `handoff-ledger`: Handoff-Receipts über mehrere Codex-Starts sammeln und geschätzte sowie qualitätsgegatede positive Startkontext-Ersparnis berichten.
19. `envelope`: einen ContextPlan als stabilen Prefix, variable Tail und On-Demand-Index für cache-freundliche Übergaben strukturieren.
20. `envelope-ledger`: Prefix-Wiederverwendung über mehrere ContextEnvelope-Läufe sammeln und berichten.
21. `inventory`: semantische Einheiten aus Code, Logs, Markdown und Konfiguration sichtbar machen.
22. `cache`, `delta`, `lookup`, `source`: stabile Einheiten wiederverwenden, relevante Einheiten budgetiert suchen und begrenzte Rohstellen direkt per `source_hash` nachladen.
23. `graph`: lokale Imports, Symbolreferenzen und Testbezüge als erste Context-Graph-Neighborhood sichtbar machen.
24. `slice`: konkrete ProgramSlice-Artefakte mit Code-Span, Calls, Datenhinweisen, Tests und Evidence erzeugen.
25. `flow`: Argument-zu-Parameter-Flüsse über aufgelöste Funktionscalls begrenzt nachvollziehen.
26. `tool-output`: lange Tool-Ausgaben in Status, Fehler, Dateien, Wiederholungen und Rohdaten-Hash strukturieren und gespeicherte Rohlog-Ausschnitte gezielt nachladen.
27. `semantic-cache`: wiederkehrende Aufgaben nur dann aus altem Kontext bedienen, wenn Abhängigkeiten, Tool-Fingerprint, Receipt, optionaler ContextPackRegistry-Vertrag und Orakel verifiziert sind.
28. `sparkompass-mcp`: Kontextsuche, ContextPlan, ContextDecisionTrace, ContextBOM, ContextControlReport, ContextEvidenceAudit, ContextAblationAudit, ContextSlimmingPlan, ContextHandoffReceipt, ContextHandoffLedger, ContextEnvelope, Scorecard, ImpactReport, ExperimentPlan, ExperimentScript, ExperimentEvidenceAudit, ExperimentRun, DoctorOverhead, RouterDecision, EnvelopeLedger, TaskOutcomeLedger, ToolOutputSummary, TaskOutcomeReceipt, Symbolumfeld, Program-Slices, DataFlow-Traces, Belegladen per Unit oder Hash, Cache, Delta, Semantic Cache, ContextPack, Receipt-Verifikation und ContextPack-ID-Verifikation als interaktive Codex-Werkzeuge anbieten.
29. `dogfood` und `benchmark`: Sparquote, Worst-Case-Metriken, Anker-Erhaltung, Gegenfakten-Erkennung und Regressionen gegen Vollkontext messen.
30. `scorecard`: Dogfood, Benchmark, TaskOutcome-Erfolge, PromptPreparation-Historie und Ledger-Spuren zu einem read-only Release-Signal zusammenführen.
31. `ContextPolicyV1`: Risikoprofile bestimmen Startbudget, Risk-Lane-Regeln und Erweiterungspfad für verifizierte ContextPacks und ContextPlans.
32. `calibrate`: kleinste direkt verifizierte Zielgröße für ein Risikoprofil finden.
33. `ledger`: echte gelieferte Ersparnis aus ContextPack-Receipts über mehrere Läufe sammeln.
34. `shadow`: Vollkontext und Sparkompass-Kontext gegen dieselben Soll-Fakten vergleichen.
35. `prompt-advisory`/Plugin-Hook/MCP: bei geplanten Prompts oder `UserPromptSubmit` große Eingaben lokal erkennen und zu `tool-output`, `pack` oder `handoff` routen, ohne Inhalte oder Codex-Requests umzuschreiben.
36. `prompt-prepare`/MCP: aus großen geplanten Eingaben einen bewusst sendbaren kompakten Codex-Prompt mit ContextPack-ID, Hashes, Gate, Akzeptanz-Orakel und Sparbalken bauen.
37. `prompt-ledger`/MCP: vorbereitete Prompts über mehrere Handoffs sammeln und sendbare Prompt-Ersparnis, p95-Werte, Fallbacks und Review-Fälle berichten.
38. `pilot`: einen reproduzierbaren Eigenlauf als SparkompassPilotRunV1 erzeugen, der Savings-, PromptPreparation-, TaskOutcome-, Envelope- und Handoff-Ledger zusammen befüllt.
39. `impact`: Savings-, Handoff-, PromptPreparation- und TaskOutcome-Ledgers als SparkompassImpactReportV1 zu einer qualitätsgegateden Nutzerwirkungsansicht zusammenführen.
40. `package-audit`/`package-smoke`: Paketinhalt per Dry-Run und Nutzbarkeit nach temporärer Frischinstallation prüfen.
41. `plugin-smoke`: den Codex-Plugin-Kandidaten temporär kopieren und CLI-Bridge, MCP-Bridge, echten Lookup-Tool-Call sowie UserPromptSubmit-Hook prüfen.
42. `release-audit`: die Zielanforderungen als SparkompassReleaseAuditV1 gegen Scorecard, Pilot, Impact Report, Inventar, Fallback-Proben, MCP, ExperimentPlan-Probe, ExperimentScript-Probe, ExperimentEvidenceAudit-Probe, ExperimentRun/Router/GatePath-Probe, Package-Dry-Run, Package-Install-Smoke, Plugin-Shape und Plugin-Install-Smoke prüfen.

## Neue Wege

- Kontext-BOM: Ein "Bill of Materials" für KI-Kontext. Nicht nur Dateigröße, sondern Entscheidungsrelevanz, Lane, Risiko und Muss-Fakten.
- Prompt-Diaet: Ein Generator, der vage Wünsche in kleine, testbare Codex-Auftraege verwandelt.
- Sparbalken: Sichtbar machen, wie groß Rohtext und kompakte Fassung im Vergleich sind.
- Schutzanker: Fehlercodes, Dateipfade und per `--keep` genannte Begriffe werden bevorzugt erhalten.
- ContextPack Receipt: Jede Verdichtung bekommt Belege, Hashes, kritische Ankerklassen und eine Fallback-Entscheidung.
- ContextPackFormat: Der Receipt-Vertrag ist als offenes Schema und Lint-Gate verfügbar, damit CI, MCP und spätere Codex-Integration Packs prüfen können, ohne Rohtext mitzuschicken.
- Receipt-Verifikation: Ein gespeichertes Receipt kann später gegen Originalquelle, Quellbelege und gelieferten Kontext nachgewiesen oder verworfen werden.
- ContextPackRegistry: Ein Pack kann lokal mit Receipt, Quellpfad und geliefertem Kontext registriert werden, damit Codex später mit `prüfeKontext(context_pack_id)` dieselbe Hash-Verifikation wieder auslösen kann.
- TaskOutcomeReceipt: Lokale Checks wie Tests, Linter oder Builds bekommen Exit-Code, Output-Hash, Output-Orakel, Sensitivitätsprüfung und optional eine verknüpfte Receipt-Prüfung.
- TaskOutcomeLedger: Aus einzelnen Check-Belegen entsteht eine Verlaufsspur für verifizierte Tasks, review-pflichtige Tasks, Review-Gründe, Output-Orakel-Sensitivität, Verifikationsrate und Tokens pro verifiziertem Task.
- CodexOfficialUsageReceipt: Ein echter Codex-JSONL-Lauf bekommt einen eigenen Beleg mit offiziellen `turn.completed.usage`-Tokenfeldern, Rohdaten-Hash und CodexUsageInvariants.
- CodexOfficialUsageLedger: Offizielle Codex-Laufwerte können über mehrere Runs summiert werden, ohne lokale Schätzungen als Abrechnung auszugeben.
- ExperimentPlan: Die echte Vierarm-Messung bekommt vorab einen Ablaufvertrag mit Prompt-Hashes, geplanten JSONL-Pfaden, TaskOutcome-Dateien, vollständigen Metadaten und Auswertungsbefehlen.
- ExperimentScript: Der Ablaufvertrag wird zu einem ausführbaren Runbook, das alle geplanten Codex-Runs, TaskOutcome-Befehle, DoctorOverhead, EvidenceAudit, ExperimentRun und Router in stabiler Reihenfolge startet.
- ExperimentEvidenceAudit: Die geplanten JSONL-/TaskOutcome-/Prompt-Artefakte werden vor `experiment run` gegen Plan, Usage-Invarianten und Hashes geprüft.
- RunManifest: Jede Experiment-Variante hält Codex-Version, Modell, Reasoning, Sandbox, Git-Commit, Config-/Plugin-/Skill-/Tool-/Prompt-/ContextPack-Hashes, optionalen TaskOutcome-Beleg, offizielle Usage-Werte, Invarianten und eine Metadatenvollständigkeitsprüfung zusammen.
- ExperimentRun: Der A/B-Beleg wird zur vierarmigen Matrix, die Kompressionsgewinn, Plugin-Grundlast, Netto-Produktgewinn, Integrationseffekt und verifizierte Tasks pro Token getrennt misst.
- ExperimentEfficiency: `compact` wird erst release-tauglich, wenn TaskOutcomeReceipts zeigen, dass die optimierte Variante weniger Tokens pro verifiziert erfolgreichem Task braucht.
- DoctorOverhead: Plugin-, Skill-, Hook- und MCP-Katalog-Grundlast wird lokal messbar, statt nur gefühlt teuer zu sein.
- RouterDecision: Sparkompass entscheidet erst nach Usage-, Qualitäts- und Overhead-Belegen zwischen `bypass`, `compact`, `lazy` und `full`, statt blind immer zu komprimieren.
- ToolProfile: `minimal`, `standard`, `benchmark`, `release` und `debug` erlauben, die sichtbare MCP-Werkzeugliste pro Lauf zu verkleinern.
- ContextPlan: Vor dem Lesen wird entschieden, welche Einheiten sofort, später oder gar nicht geladen werden; Folgeturns priorisieren `changed` und `added`, graph-aware Planung nimmt direkte Nachbarn nur bei Bedarf dazu, und strikte Profile machen deferierte Risiko-Einheiten review-pflichtig.
- ContextDecisionTrace: Jede Planentscheidung bekommt Lane, Grund, Budgetwirkung, Unsicherheitsstatus und Nachladehinweis, damit Sparen nachvollziehbar statt magisch wird.
- ContextBOM: Der geplante Kontext wird als Materialliste sichtbar, bevor daraus ein Handoff gebaut wird.
- BudgetOptimizer: Der Startkontext wird mit Seeds plus Nutzen-pro-Token-Auswahl gefüllt, statt nur nach absolutem Score oder Dateigröße zu gehen.
- ContextControlReport: Ein Vorflugbericht sagt, ob der geplante Codex-Handoff bereit ist, welche Belege nachzuladen sind und welche Hashes die Übergabe fixieren.
- ContextEvidenceAudit: Vor dem Handoff wird geprüft, ob geplante Evidence-IDs noch auf aktuelle Zeilen mit passenden Hashes zeigen.
- ContextAblationAudit: Vor weiterer Verkleinerung wird geprüft, welche Sofortkontext-Einheiten ein Oracle wirklich tragen.
- ContextSlimmingPlan: Aus ablation-sicheren Einheiten entsteht ein Review-Vorschlag für On-Demand-Evidence, ohne oracle-kritische oder ungeprüfte Einheiten aus dem Sofortkontext zu nehmen.
- ContextHandoffReceipt: Der geplante Startprompt bekommt einen sichtbaren Sparbalken, Qualitätsvertrag, Handoff-Hashes und MCP-Nachladevertrag per Unit-ID und `source_hash`.
- ContextHandoffLedger: Die Handoff-Sparbalken werden über mehrere Codex-Starts summiert, inklusive Gate-Status, Nachlade-Evidence und der Trennung zwischen verifiziert sicher und wirklich sparend.
- ContextEnvelope: Der geplante Kontext wird in wiederverwendbare Prefix-Segmente, variable Task-Daten und einen Nachlade-Index getrennt; vorherige Envelopes können per Hash verglichen werden, damit Prefix-Stabilität über Turns sichtbar wird.
- ContextEnvelopeLedger: Prefix-Stabilität wird über mehrere Agenten-Turns messbar, inklusive voller Wiederverwendung, statischem Fallback und invalidierten Prefix-Tokens.
- MCP-Nachladen: Codex kann erst suchen und dann nur die benötigte Originalstelle laden.
- Hash-Nachladen: Wenn ein kompakter Handoff nur `source_hash` enthält, kann Codex später genau den begrenzten Ursprung nachfordern, ohne vorsorglich ganze Dateien zu lesen. `SourceHashHandoffContractProbeV1` prüft, dass Plan- und Handoff-Artefakte diesen Weg wirklich ausweisen.
- Symbol-Neighborhoods: Codex kann vom Aufgabensymbol zu Imports, Referenzen und Tests springen.
- Program-Slices: Codex kann einen AST-gestützten JS/MJS-Code-Span plus Calls, Reads/Writes, Tests und Evidence laden.
- DataFlow-Traces: Codex kann sehen, welche Argumente in welche Zielparameter weitergereicht werden.
- ToolOutputSummary: Codex bekommt zuerst den strukturierten Befund langer Terminalausgaben, nicht das komplette Rohlog; gespeicherte Rohlogs werden nur als begrenzte Evidence-Ausschnitte nachgeladen.
- Verifizierter semantischer Cache: Ähnlichkeit findet Kandidaten, aber nur Belege, Abhängigkeiten, Tool-Fingerprint, optionaler ContextPack-ID-Registry-Vertrag und Orakel geben frei.
- Gegenfaktische Entfernungstests: Das System prüft, ob seine eigenen Benchmark-Orakel wichtige Verluste wirklich bemerken.
- Worst-Case-Gate: Der schlechteste Einzelfall und p95-Tokenwerte werden sichtbar, damit ein guter Durchschnitt keine gefährliche Verdichtung verdeckt.
- Failure-Corpus: Negationen, Zahlen, Prioritäten, Stacktraces, gleichnamige Symbole, Sicherheits-Datenfluss, dynamische Imports, Monorepo-Abhängigkeiten, Env-/URL-/Permission-Werte, numerische Grenzen mit Einheiten, boolesche Policy-/Moduswerte, Diff-Polarität, Reihenfolge/Praezedenz, Zeitfenster/Ablaufzeiten, API-/Schema-Verträge, Datenbank-/Migrationsverträge, Idempotenz-/Nebenlaeufigkeitsverträge, Locale-/Encoding-/Normalisierungsverträge, Auth-/Scope-/Rollenverträge, Crypto-/Signatur-/Hashverträge, Geld-/Währungs-/Rundungsverträge, destruktive Operationen, Regex-/Glob-/Matcher-Verträge sowie Web-Security-Header-/Cookie-Verträge werden als wiederholbare Benchmark-Fälle gegen Kompressionsverlust getestet.
- ContextPolicy: `compact`, `balanced`, `careful` und `strict` machen das Risiko eines Pack- oder Plan-Laufs explizit und reproduzierbar.
- ContextCalibration: Sparkompass sucht die sichere Kompressionsgrenze, statt Prozentwerte zu erraten.
- SavingsLedger: Der Sparbalken wird zur Verlaufsmessung, die Fallbacks, sicher verifizierte Packs, echte gelieferte Tokens und qualitätsgegatede positive Pack-Ersparnis getrennt ausweist.
- SparkompassPilotRun: Ein Eigenlauf schreibt mehrere Ledger-Spuren gleichzeitig und macht Tokens pro verifiziertem Task, sendbare Prompt-Ersparnis, echte gelieferte Ersparnis, Prefix-Stabilität und Startkontext-Ersparnis zusammen sichtbar.
- SparkompassImpactReport: Pack-, Handoff-, PromptPreparation- und TaskOutcome-Ledgers werden zu einem Nutzerwirkungs-Gate mit kombinierten Sparbalken, p95-Werten und Qualitätsblockern.
- SparkompassScorecard: Dogfood, Benchmark, TaskOutcome, PromptPreparation und Ledger-Warnungen werden zu einem einzigen Freigabesignal.
- SparkompassReleaseAudit: Jede große Zielanforderung bekommt einen eigenen Status mit Beleg, Blocker und Caveat, bevor eine Veröffentlichung behauptet wird.
- ShadowRun: Eine konkrete Eingabe kann gegen Vollkontext geprüft werden, bevor die Ersparnis als Erfolg gilt.
- Prompt-Advisory: Codex kann per CLI, MCP oder Hook vor großen User-Prompts lokal einen Sparhinweis bekommen, ohne dass der Promptinhalt wieder ausgegeben oder automatisch ersetzt wird.
- Prompt-Preparation: Aus der Warnlampe wird ein konkreter Handoff; große Prompts können als ContextPack-geprüfter, sendbarer Kompaktprompt vorbereitet werden, ohne einen internen Request heimlich zu verändern.
- PromptPreparationLedger: Die Codex-nahe Prompt-Vorbereitung bekommt eine Verlaufsspur, damit Teams sehen, ob sendbare Prompts über mehrere Läufe wirklich kleiner und weiterhin verifiziert bleiben.
- Agenten-Hygiene: Hinweise, wann Subagents, MCP und Skills Mehrwert liefern und wann sie nur Kontext aufblasen.
- Deutsche Lernspur: Beispiele, Reports und Erklaerungen für Teams, Schulen, Vereine und kleine Unternehmen.
- Lokaler Respekt: Keine Cloud-Pflicht, keine Telemetrie, keine versteckten Uploads.

## Roadmap

### 0.2 - Verified Compression

- kritische Ankerklassen
- Quellbelege mit Hash
- ContextPack Receipts
- automatischer Erweiterungs- oder Vollkontext-Fallback
- Dogfood-Gate `verified-publishable`
- Benchmark-Gate gegen Vollkontext und gegenfaktische Entfernung
- Worst-Case-Metriken für Dogfood und Benchmark
- erster Compression Failure Corpus
- ContextPolicyV1 mit Risikoprofilen, Startbudgets und Risk-Lane-Regeln
- ContextPlanV1 mit ContextBudgetOptimizerV1, ContextPlanDeltaCoverageV1 und ContextPlanRiskControlsV1 für budgetierte, delta-bewusste, graph-aware und risiko-gegatete Kontextentscheidungen
- ContextDecisionTraceV1 für nachvollziehbare Budget-, Lane-, Risiko- und Unsicherheitsentscheidungen
- ContextBOMV1 für bounded Materiallisten aus Lane-Mix, Dateien, Typen, Entscheidungsklassen, Risiken und Muss-Fakten
- ContextControlReportV1 als Vorflugbericht für Readiness, Evidence-Protokoll und Handoff-Hashes
- ContextEvidenceAuditV1 für hashgenaue Nachladeprüfung geplanter Evidence-IDs
- ContextAblationAuditV1 für planbezogene Gegenfakten-Tests gegen ein Akzeptanz-Orakel
- ContextSlimmingPlanV1 für ablation-getriebene On-Demand-Vorschläge bei erhaltener Oracle-Qualität
- ContextHandoffReceiptV1 für sichtbare Startprompt-Ersparnis, Qualitätsvertrag und MCP-Nachladevertrag
- ContextHandoffLedgerV1 für geschätzte und qualitätsgegatede positive Startkontext-Ersparnis über mehrere Codex-Handoffs
- ContextEnvelopeV1 für cache-freundliche Übergabereihenfolge mit Prefix-/Tail-Hashes und Prefix-Reuse-Vergleich
- ContextEnvelopeLedgerV1 für mehrturnfähige Prefix-Reuse-Messung
- SparkompassPromptPreparationV1 für sendbare kompakte Prompts mit ContextPack-Gate und Sparbalken
- PromptPreparationLedgerV1 für Verlaufsmessung vorbereiteter sendbarer Prompts
- ToolOutputSummaryV1 und ToolOutputEvidenceV1 für lange Logs und Tool-Ausgaben mit Rohdaten-Hash und gezieltem Nachladen
- ContextCalibrationV1 für sichere Zielgrößen
- SavingsLedgerV1 für echte gelieferte Ersparnis, sicher verifizierte Packs und qualitätsgegatede positive ContextPack-Ersparnis
- ContextPackReceiptVerificationV1 für nachtraegliche Receipt-Prüfung
- ContextPackFormatV1 für offenen Receipt-Vertrag und portables Linting
- ContextPackRegistryV1 und ContextPackRegistryVerificationV1 für ID-basierte ContextPack-Prüfung
- TaskOutcomeReceiptV1 für lokale Check-Ergebnisse mit sensitivem Output-Orakel
- TaskOutcomeLedgerV1 für Verifikationsrate, Review-Gründe, Output-Orakel-Sensitivität und Tokens pro verifiziertem Task über mehrere echte Checks
- SparkompassUserPromptHookAdvisoryV1 für nicht-blockierende CLI-/MCP-/Hook-Hinweise vor großen User-Prompts
- SparkompassPilotRunV1 für reproduzierbare Eigenläufe mit Savings-, PromptPreparation-, TaskOutcome-, Envelope- und Handoff-Ledgern
- SparkompassImpactReportV1 für qualitätsgegatede Nutzerwirkung aus Pack-, Handoff-, PromptPreparation- und TaskOutcome-Ledgers
- CodexUsageInvariantsV1 für die prüfbare Tokenformel in offiziellen Codex-Usage-Receipts
- SparkompassExperimentPlanV1 für reproduzierbar geplante vierarmige offizielle Codex-JSONL-Läufe
- SparkompassExperimentScriptV1 für ausführbare Runbooks aus einem ExperimentPlan
- SparkompassExperimentEvidenceAuditV1 für Artefakt-Vollständigkeit zwischen Plan und ExperimentRun
- SparkompassExperimentEfficiencyV1 für verifizierte erfolgreiche Tasks pro Token innerhalb der Vierarm-Matrix
- RunManifestEvidenceCompletenessV1 für reproduzierbare Experiment-Metadaten ohne Platzhalter
- SparkompassScorecardV1 für kombiniertes Release-Readiness-Signal
- SparkompassReleaseAuditV1 für maschinenlesbare Zielerfüllung vor Release-Entscheidungen
- ShadowRunV1 für konkrete Regressionstests gegen Vollkontext
- SparkompassDoctorOverheadV1 für lokale Plugin-/Skill-/Hook-/MCP-Grundlast
- SparkompassRouterDecisionV1 für den qualitäts- und nutzungsgegateden Modus `bypass`, `compact`, `lazy` oder `full`
- SparkompassGatePathV1 für den messbaren Gate-Pfad von `verified-codex-official-usage-comparison` über `quality-noninferior` zu `verified-end-to-end-noninferior`
- ToolProfileV1 für profilierte MCP-Tool-Sichtbarkeit

### 0.3 - Context Graph

- AST- und Symbolindex
- Aufrufer-/Abhängigkeitsgraph
- Test-Code-Verknüpfungen
- Git-Delta-Kontext
- MCP-Werkzeuge für Originalstellen, Symbole und Datenfluss-Slices
- MCP-Werkzeug für ContextSlimmingPlanV1 als Ablation-zu-Handoff-Brücke
- MCP-Werkzeug für ContextHandoffReceiptV1 als Agenten-Übergabeformat mit ContextEnvelopeV1 darunter
- CLI-, MCP- und Plugin-Hook-Weg für `SparkompassUserPromptHookAdvisoryV1`, der große Prompts lokal erkennt und auf verifizierte Sparkompass-Flows hinweist

### 0.4 - Adaptive Context

- dynamische Token-Budgets
- Nutzenoptimierung je semantischer Einheit
- automatische Suche nach der sicheren Kompressionsgrenze
- verifiziertes semantisches Caching mit Dependency-, Tool-Fingerprint- und Oracle-Gates
- adaptive Ledger-Auswertung für Kosten pro erfolgreichem Task
- Shadow-Orakel für echte Test-, Lint- oder Compiler-Ergebnisse

### 1.0 - Community Standard

- offenes ContextPack-Format auf Basis des lokalen ContextPackFormatV1-Drafts
- reproduzierbare Benchmark-Suite
- Adapter für mehrere Coding-Agenten
- Plugin-SDK für alternative Kompressoren
- öffentliches Dashboard für Qualität, Kosten und Fehlermuster

## Erfolgskriterien

- Nutzer verstehen vor einem Codex-Lauf, welche Dateien den Kontext treiben.
- Kritische Anker bleiben in freigegebenen ContextPacks zu 100% erhalten.
- Gespeicherte ContextPack-Receipts können gegen Originalquelle und gelieferten Kontext erneut verifiziert werden.
- Gespeicherte ContextPack-Receipts können auch ohne Originalquelle gegen den offenen ContextPackFormatV1-Vertrag gelintet werden.
- Registrierte ContextPacks können per `context_pack_id` gefunden und über Receipt-, Source- und Delivered-Context-Hashes erneut geprüft werden.
- Semantic-Cache-Hits können registrierte ContextPacks per `context_pack_id` erneut prüfen, bevor alter Kontext wiederverwendet wird.
- Lokale Test-, Lint- oder Build-Ergebnisse können als TaskOutcomeReceipt mit einem ContextPack verbunden werden.
- Teams sehen für echte Check-Historie, wie viele Output- und ContextPack-Tokens pro verifiziertem Task gebraucht wurden.
- Kontextplaene zeigen nachvollziehbar, was sofort geladen, später nachgeladen oder ausgelassen wird, und blockieren `strict`/`careful` Handoffs, wenn relevante Risiko-Einheiten nur deferred sind.
- ContextBOMs zeigen, warum diese Einheiten im Startkontext, als On-Demand-Beleg oder nur als Omitted-Vorschau landen.
- ContextControlReports zeigen vor dem Codex-Lauf, ob der Handoff bereit ist oder noch Muss-Fakten beziehungsweise Belege fehlen.
- ContextEvidenceAudits zeigen vor dem Codex-Lauf, ob diese Belege noch hashgenau nachladbar sind.
- ContextAblationAudits zeigen, welche Sofortkontext-Einheiten für ein Akzeptanz-Orakel kritisch sind und welche nur nach Review in On-Demand wandern könnten.
- ContextSlimmingPlans zeigen, welche ablation-sicheren Einheiten in On-Demand verschoben werden können, wie viel Sofortkontext zusätzlich gespart wird und welche kritischen Einheiten sofort bleiben.
- ContextHandoffReceipts zeigen den tatsächlichen Startprompt, die lokale Startkontext-Ersparnis und den Nachladevertrag, bevor ein Nutzer den Kontext an Codex gibt.
- ContextHandoffLedgers zeigen, ob mehrere geplante Codex-Starts zusammen wirklich kleiner werden und wie viele davon verifiziert waren.
- CLI, MCP und Codex-Hook weisen bei großen Prompts auf Sparkompass-Flows hin, ohne Prompt-Inhalte zu echoen oder die interne Codex-Anfrage zu verändern.
- ContextEnvelopes zeigen, welche geplanten Inhalte stabil vorne, variabel hinten oder nur als Nachladebeleg genutzt werden sollen; ContextEnvelopeLedger zeigt, ob diese Stabilität über mehrere Läufe tatsächlich gehalten wurde.
- Unsichere Verdichtungen fallen auf Vollkontext oder erweiterten Kontext zurück.
- Codex kann Originalstellen über MCP nachladen, statt komplette Dateien vorsorglich zu lesen.
- Teams sehen nicht nur theoretische, sondern tatsächlich gelieferte Ersparnis über mehrere Läufe.
- Impact-Reports zeigen, ob diese Ersparnis mit verifizierten Tasks, sauberen Handoffs und ohne Qualitätsblocker verbunden ist.
- Konkrete Sparläufe können gegen Vollkontext regressionsfrei belegt werden.
- Release-Entscheidungen sehen Dogfood, Benchmark, TaskOutcome und Ledger-Hinweise in einer Scorecard.
- Release-Audits bilden die Projektziele auf konkrete lokale Evidenz ab, inklusive ExperimentPlan-, ExperimentScript- und ExperimentEvidenceAudit-Probe vor ExperimentRun/Router, statt nur Einzelmetriken zu sammeln.
- Wiederholte lange Prompts werden durch Skills oder Vorlagen ersetzt.
- `AGENTS.md` bleibt kurz, konkret und lokal geschichtet.
- Teams können Sparregeln teilen, ohne sensible Daten hochzuladen.
