# Quality Model

Sparkompass optimiert nicht nur auf kurze Ausgabe. Eine Kompression ist nur nützlich, wenn wichtige Orientierung erhalten bleibt.

## Metriken

- **Savings**: geschätzte Token-Ersparnis. Bei `compress` zwischen Rohtext und Kompaktfassung, bei `pack`, Dogfood und Benchmark zwischen Rohtext und tatsächlich geliefertem Kontext.
- **Anchors**: erkannte wichtige Begriffe wie Fehlercodes, Dateipfade, CLI-Optionen, Funktionsnamen und geschützte `--keep`-Begriffe.
- **Protected lines**: Zeilen, die wegen Fehlern, Pfaden, Überschriften, Exporten oder `--keep` bevorzugt erhalten bleiben.
- **Risk status**: `gut`, `ok` oder `riskant`.
- **Critical anchors**: Fehlercodes, Dateipfade, Code-Begriffe, gefährliche CLI-Optionen und `--keep`-Begriffe, die zu 100% erhalten bleiben müssen.
- **Anchor class breakdown**: getrennte Retention für Klassen wie `keep`, `error-code`, `path`, `cli-option` und `code`, damit ein einzelner Gesamtwert kritische Verluste nicht verdeckt.
- **Source evidence**: Rückverweise von kompakten Zeilen zu Originalzeilen mit Hash.
- **ContextPack Receipt**: maschinenlesbarer Beleg für Tokens, Anker, Quellen, Fallback und Gate-Status.
- **ContextPackReceiptVerification**: nachtraegliche Prüfung eines gespeicherten Receipts gegen Originalquelle, Quellbelege und optional den gelieferten Kontext.
- **ContextPackFormat**: offener Receipt-Vertrag mit JSON-Schema, portablen Invarianten und Linting ohne Originalquelle.
- **ContextPackRegistry**: lokaler Index für `context_pack_id`, Receipt, Quellpfad und gelieferten Kontext, damit ein Pack später per ID wiedergefunden und hashgenau verifiziert werden kann.
- **TaskOutcomeReceipt**: lokale Quittung für Test-, Lint-, Build- oder andere Check-Ergebnisse mit Exit-Code, Output-Hash, Output-Orakel und optionaler ContextPack-Receipt-Verifikation.
- **TaskOutcomeLedger**: lokales Journal aus TaskOutcomeReceipts, das verifizierte Tasks, Review-Fälle, Verifikationsrate, Review-Gründe, p95-Dauer und Output-/Kontexttokens pro verifiziertem Task ausweist.
- **CodexOfficialUsageReceipt**: Beleg aus dokumentierten `codex exec --json`-Events, der `turn.completed.usage` mit Input-, Cached-Input-, Output- und Reasoning-Output-Tokens übernimmt und den Roh-JSONL-Export hasht. Gesamt-Tokens werden als `input_tokens + output_tokens` berechnet; Cached-Input und Reasoning-Output sind Unterkategorien.
- **CodexUsageInvariants**: maschinenlesbare Prüfung pro Receipt, ob `cached_input_tokens <= input_tokens`, `reasoning_output_tokens <= output_tokens` und `total_tokens = input_tokens + output_tokens` für Summen und einzelne Events gelten.
- **CodexOfficialUsageLedger**: lokales Journal aus CodexOfficialUsageReceipts, das offizielle Codex-Laufwerte über mehrere Runs summiert, ohne daraus Preis- oder Rechnungswerte abzuleiten.
- **SparkompassExperimentPlan**: reproduzierbarer Ablaufvertrag für echte vierarmige Codex-Messläufe mit Raw-/Kompakt-Prompts, geplanten JSONL-Dateien, TaskOutcome-Pfaden, Prompt-Hashes, Metadaten und Auswertungsbefehlen. Das Artefakt behauptet keine Usage-Zahlen.
- **SparkompassExperimentScript**: ausführbares Runbook aus einem ExperimentPlan. Es schreibt keine Usage-Zahlen, sondern ordnet Preflight, 12 geplante `codex exec --json`-Runs, TaskOutcome-Befehle, DoctorOverhead, ExperimentEvidenceAudit, ExperimentRun und RouterDecision in eine wiederholbare Shell-Spur.
- **SparkompassExperimentEvidenceAudit**: Artefaktprüfung zwischen ExperimentPlan und ExperimentRun. Sie prüft geplante Usage-JSONL-Dateien, offizielle Usage-Gates, Usage-Invarianten, Prompt-Hashes und TaskOutcome-Receipts, ohne Codex zu starten oder neue Usage zu erzeugen.
- **SparkompassRunManifest**: Laufbeleg für eine Experiment-Variante mit Codex-Version, Modell, Reasoning, Sandbox, Git-Commit, Konfigurations-/Plugin-/Skill-/Tool-/Prompt-/ContextPack-Hashes, optionalem TaskOutcomeReceipt-Hash, offiziellen Usage-Werten und CodexUsageInvariants.
- **RunManifestEvidenceCompleteness**: prüft, ob ein RunManifest reproduzierbare Metadaten statt `unknown`-, `missing`- oder `unavailable`-Platzhaltern enthält. Mit `--require-metadata true` gehören Codex-Version, Modell, Reasoning, Sandbox, Git-Commit, Config-/Plugin-/Skill-/Tool-/Prompt-Hash und ContextPack-Hash zur Pflicht; Unvollständigkeit blockiert das Experiment-Gate.
- **SparkompassExperimentEfficiency**: Effizienzbeleg innerhalb der Vierarm-Matrix. Er zählt nur verifizierte TaskOutcomeReceipts als erfolgreiche Tasks und berechnet Tokens pro verifiziertem Task sowie erfolgreiche Tasks pro 1000 Tokens.
- **SparkompassExperimentRun**: kausale Matrix aus `basis_raw`, `basis_kompakt`, `plugin_raw` und `plugin_kompakt`, die reinen Kompressionsgewinn, Plugin-Grundlast, Netto-Produktgewinn, Integrationseffekt, verifizierte Task-Effizienz und erste Router-Empfehlung berechnet.
- **SparkompassDoctorOverhead**: lokaler Report für Plugin-, Skill-, Hook- und MCP-Tool-Katalog-Grundlast mit Gate, Hashes und Profilvergleich.
- **SparkompassRouterDecision**: deterministische lokale Entscheidung aus ExperimentRun und optionalem DoctorOverhead, die je nach offizieller Usage, Qualitätsbelegen, Evidenzlücken und Sicherheitsblockern `bypass`, `compact`, `lazy` oder `full` empfiehlt.
- **SparkompassGatePath**: maschinenlesbarer Release-Pfad, der den offiziellen A/B-Usage-Beleg mit `quality-noninferior`, Router-Entscheidung und den noch fehlenden End-to-End-Belegen verbindet, ohne das finale Gate vorzeitig zu behaupten.
- **ToolProfile**: reduzierte MCP-Tool-Sichtbarkeit über `minimal`, `standard`, `benchmark`, `release` und `debug`; wirksam, wenn der MCP-Server mit `SPARKOMPASS_TOOL_PROFILE` gestartet wird.
- **ContextPlan**: budgetierter Plan aus Sofortkontext, Nachlade-Belegen und ausgelassenen Einheiten für ein konkretes Ziel, inklusive Risk-Control-Gate für konservative Profile.
- **ContextDecisionTrace**: maschinenlesbare Entscheidungsakte zum ContextPlan mit Lane-Entscheidungen, Budget-Ablehnungen, Risk-Review-Gründen, Delta-/Requirement-Status, Unsicherheitsregister und Nachladehinweisen.
- **ContextBOM**: Materialliste für einen ContextPlan nach Lane, Datei, Typ, Entscheidungsklasse, Risiko, Muss-Fakten und Evidence-Hinweisen.
- **ContextControlReport**: Vorflugbericht, der ContextPlan, ContextEnvelope, Readiness-Gate, Evidence-Protokoll und Handoff-Hashes für einen konkreten Codex-Lauf zusammenführt.
- **ContextEvidenceAudit**: hashgenaue Prüfung der geplanten Control-Belege gegen aktuelle Dateien, Zeilen und Quellhashes.
- **ContextAblationAudit**: planbezogener Gegenfakten-Test, der Sofortkontext-Einheiten entfernt und misst, welche für ein Akzeptanz-Orakel kritisch sind.
- **ContextSlimmingPlan**: ablation-getriebener Vorschlag, der nur oracle-sichere Sofortkontext-Einheiten nach On-Demand verschiebt und kritische oder ungeprüfte Einheiten sofort sichtbar lässt.
- **ContextHandoffReceipt**: nutzbarer Handoff-Beleg mit Startprompt, sichtbarer Startkontext-Ersparnis, Readiness-Gates, Prompt-Cache-Layout und MCP-Nachladevertrag.
- **ContextHandoffLedger**: lokales Journal aus ContextHandoffReceipt-Einträgen, das geschätzte Startkontext-Ersparnis, Gate-Status und Nachlade-Evidence über mehrere Handoffs ausweist.
- **ContextEnvelope**: cache-freundliche Übergabestruktur aus stabilem Prefix, variablem Tail und On-Demand-Index auf Basis eines ContextPlans.
- **ContextEnvelopeLedger**: lokales Journal aus ContextEnvelope-Hashes, das Prefix-Wiederverwendung und Prefix-Invalidierung über mehrere Läufe ausweist.
- **SavingsLedger**: lokales Journal aus ContextPack Receipts, das echte gelieferte Ersparnis, Fallback-Rate und Qualitätswerte über mehrere Läufe ausweist.
- **SparkompassPilotRun**: reproduzierbarer Eigenlauf, der SavingsLedger, PromptPreparationLedger, TaskOutcomeLedger, ContextEnvelopeLedger und ContextHandoffLedger zusammen befüllt und Tokens pro verifiziertem Task sowie sendbare Prompt-Ersparnis sichtbar macht.
- **SparkompassImpactReport**: qualitätsgegatede Nutzerwirkungsansicht aus Savings-, Handoff-, PromptPreparation- und TaskOutcome-Ledgers mit kombinierten Sparbalken, p95-Werten und Blockern.
- **ShadowRun**: Vergleich von Vollkontext und geliefertem Sparkompass-Kontext gegen dasselbe Akzeptanzorakel.
- **ContextInventory**: semantische Repository-Karte aus Funktionen, Klassen, Exports, Imports, Headings, Log-Fehlern und Konfigurationswerten.
- **ContextGraph**: heuristischer Graph aus semantischen Einheiten, lokalen Imports, Symbolreferenzen und Testbezügen.
- **ProgramSlice**: begrenzter Code-Span zu einem Symbol mit direkten Calls, einfachen Read/Write-Hinweisen, Testbezug und Evidence-Hashes; für JavaScript/MJS parsergestützt mit Acorn.
- **DataFlowTrace**: begrenzter Trace über aufgelöste Funktionscalls mit Argument-zu-Parameter-Bindungen und Evidence.
- **ContextCache**: content-addressed Snapshot eines Inventars, der stabile Einheiten wiederverwendbar macht.
- **ContextDelta**: Vergleich zwischen Cache und aktuellem Inventar mit stabilen, neuen, geänderten und entfernten Einheiten.
- **ContextLookup**: budgetiertes Nachladen relevanter semantischer Einheiten anhand einer Query.
- **MCP evidence loading**: interaktives Nachladen begrenzter Originalstellen inklusive Hash-Abgleich, bevor Codex exakte Aussagen über Code trifft.
- **ToolOutputSummary**: strukturierte Zusammenfassung langer Tool-Ausgaben mit Status, ersten Fehlern, betroffenen Dateien, Wiederholungen, Fehlercodes und Rohdaten-Hash.
- **SparkompassPromptPreparation**: bewusst sendbarer Kompaktprompt aus einer großen geplanten Eingabe, mit ContextPack-ID, Gate, Hashes, Akzeptanz-Orakel und Sparbalken.
- **PromptPreparationLedger**: lokales Journal aus vorbereiteten Prompts, das sendbare Prompt-Ersparnis, verifizierte/review-pflichtige Vorbereitungen, p95-Werte und Fallbacks über mehrere Handoffs ausweist.
- **Verified Semantic Cache**: Wiederverwendung alter ContextPacks nur nach adaptiver Similarity-, Dependency-, Receipt- und Oracle-Prüfung.
- **ContextPolicy**: Risikoprofil für ContextPacks und ContextPlans, das Zielgröße, Startbudget, Erweiterungspfad und Risk-Lane-Regeln bestimmt.
- **ContextCalibration**: Suche nach der kleinsten direkt verifizierten Zielgröße für ein Risikoprofil.
- **SparkompassScorecard**: read-only Freigabeansicht aus Dogfood, Benchmark, TaskOutcome-Gates und lokalen Ledger-Spuren.
- **PackageDryRunAudit**: lokaler `npm pack --dry-run --json --ignore-scripts`-Beleg für Paketinhalt, Pflichtpfade, verbotene Artefakte, Größenlimits und ausführbare CLI-/Plugin-Bridges.
- **PackageInstallSmokeAudit**: temporäre Frischinstallation des lokal gepackten Pakets mit installierter CLI-, Benchmark- und MCP-Prüfung.
- **PluginInstallSmokeAudit**: temporäre Kopie des Codex-Plugin-Kandidaten mit CLI-Bridge-, MCP-Bridge-, Cache-Install-Bridge-, echtem MCP-Lookup-Tool-Call-, Hook- und Prompt-Redaktionsprüfung.
- **SparkompassReleaseAudit**: maschinenlesbare Zielprüfung, die Scorecard, Pilot, Impact Report, Inventar, Fallback-Proben, MCP-Werkzeuge, ExperimentPlan-/ExperimentScript-/ExperimentEvidenceAudit-/ExperimentRun-/Router-/GatePath-Probe, Package-Shape, PackageDryRunAudit, PackageInstallSmokeAudit, Plugin-Shape und PluginInstallSmokeAudit gegen die Projektanforderungen abgleicht.

## Release Gate

`npm run dogfood` muss bestehen:

- average saving >= 35%
- worst-case anchor retention >= 75%
- worst-case critical anchor retention = 100%
- worst-case source evidence coverage = 100%
- full-context fallbacks = 0
- expanded ContextPacks are reported separately
- zero riskante Verdichtungen
- schlechtester Einzelfall und p95-Tokenwerte sind sichtbar
- Sparquote basiert auf `delivered_tokens`, nicht auf verworfenen Kompakt-Kandidaten

`npm run benchmark` muss außerdem bestehen:

- Kontext-Erfolge = alle Benchmark-Fälle
- TaskOutcome-Erfolge = alle Benchmark-Fälle
- Failure-Corpus-Erfolge = alle Failure-Corpus-Fälle
- Regressionen gegen Vollkontext = 0
- Gegenfakten erkannt = alle erwarteten Soll-Fakten
- Oracle-Sensitivitaet = true
- BenchmarkEfficiencyMetricsV1 = verified
- Tokens pro bestandenem Fall, Gesamtkosten pro verifiziertem Task, p95 gelieferte/gesparte Tokens, Fallback-/Nachlade-/Cache-Raten und schlechtester Einzelfall sind sichtbar

`npm run scorecard` muss den kombinierten Freigabestatus melden:

- `Gate: verified-scorecard`
- Dogfood-Gate = `verified-publishable`
- Benchmark-Gate = `verified-benchmark`
- TaskOutcome-Erfolge = alle Benchmark-Fälle
- Blocker = keine
- Ledger-Hinweise sind sichtbar, ohne die Freigabe zu faelschen

Die MCP-Schicht muss in `npm test` bestehen:

- `tools/list` enthält die Kontextwerkzeuge
- `sparkompass_plan_context` liefert einen budgetierten ContextPlanV1 mit Sofort- und Nachlade-Spuren
- `sparkompass_plan_context` liefert `ContextDecisionTraceV1` mit Budget-, Lane-, Risiko- und Unsicherheitsentscheidungen
- `sparkompass_plan_context` berichtet `ContextPlanRiskControlsV1`; bei `strict` werden deferierte relevante Risiko-Einheiten review-pflichtig
- `sparkompass_context_bom` liefert ContextBOMV1 als kompakte Materialliste für den geplanten Kontext
- `sparkompass_context_bom` fasst den Decision Trace zusammen, damit die Materialliste auch die Auswahlgründe zeigt
- `sparkompass_build_envelope` liefert ContextEnvelopeV1 mit Prefix-/Tail-Segmenten und deterministischen Hashes
- `sparkompass_control_report` liefert ContextControlReportV1 mit Readiness-Gate, Handoff-Hashes und Evidence-Protokoll
- `sparkompass_evidence_audit` liefert ContextEvidenceAuditV1 und verifiziert geplante Evidence-IDs gegen aktuelle Quellzeilen-Hashes
- `sparkompass_ablation_audit` liefert ContextAblationAuditV1 und markiert oracle-kritische Sofortkontext-Einheiten
- `sparkompass_slim_context` liefert ContextSlimmingPlanV1 und schlägt nur ablation-sichere Sofortkontext-Einheiten für On-Demand vor
- `sparkompass_handoff_receipt` liefert ContextHandoffReceiptV1 mit Startprompt, Sparbalken, Quality Contract und On-Demand-Belegen
- `sparkompass_handoff_ledger` schreibt und berichtet `ContextHandoffLedgerV1`
- `sparkompass_scorecard` liefert SparkompassScorecardV1 mit Dogfood-, Benchmark-, TaskOutcome- und Ledger-Zusammenfassung inklusive PromptPreparation
- `sparkompass_pilot_run` liefert SparkompassPilotRunV1 und schreibt Pilot-Ledger für Savings, PromptPreparation, TaskOutcome, Envelope und Handoff
- `sparkompass_impact_report` liefert SparkompassImpactReportV1 aus Savings-, Handoff-, PromptPreparation- und TaskOutcome-Ledgers
- `sparkompass_release_audit` liefert SparkompassReleaseAuditV1 mit Anforderungsstatus, Evidenz, Blockern und Caveats
- `sparkompass_envelope_ledger` schreibt und berichtet `ContextEnvelopeLedgerV1`
- `sparkompass_lookup` findet budgetierte semantische Einheiten
- `sparkompass_expand_symbol` liefert eine begrenzte Graph-Neighborhood
- `sparkompass_load_evidence` laedt Originalzeilen mit passendem Hash
- `sparkompass_load_source_hash` laedt begrenzte Originalausschnitte direkt per `source_hash` oder `file_hash`
- `sparkompass_summarize_tool_output` liefert ToolOutputSummaryV1 für lange Logs oder Command-Ausgaben
- `sparkompass_load_tool_output` laedt begrenzte gespeicherte Rohlog-Ausschnitte mit Hash-Abgleich
- `sparkompass_slice_symbol` liefert ProgramSliceV1 mit Zielspan, Calls, Datenhinweisen und Evidence
- `sparkompass_trace_flow` liefert DataFlowTraceV1 mit Argument-zu-Parameter-Bindungen
- `sparkompass_verify_receipt` liefert ContextPackReceiptVerificationV1 für gespeicherte Receipts
- `sparkompass_verify_context_pack` liefert ContextPackRegistryVerificationV1 für registrierte Packs per `context_pack_id`
- `sparkompass_contextpack_format` liefert ContextPackFormatV1 oder ContextPackFormatValidationV1 für portable Receipt-Prüfung ohne Originalquelle
- `sparkompass_task_outcome` liefert TaskOutcomeReceiptV1 für bereits beobachtete lokale Check-Ausgaben
- `sparkompass_task_outcome_ledger` schreibt und berichtet `TaskOutcomeLedgerV1`
- `sparkompass_semantic_cache_lookup` liefert Hits nur bei bestandener Dependency-/Oracle-/Receipt-Prüfung
- `sparkompass_savings_ledger` schreibt und berichtet `SavingsLedgerV1`
- `sparkompass_shadow_compare` erkennt Regressionen gegen Vollkontext und bestaetigt Gegenfakten-Sensitivitaet
- der Plugin-Bridge-Server startet über STDIO

Das Gate ist absichtlich nicht perfekt. Es soll Regressionen früh sichtbar machen und verhindern, dass wir eine Version veröffentlichen, die nur aggressiv kürzt.

Durchschnittswerte sind Diagnosewerte, keine Freigabe allein. Release-Qualität hängt an Worst-Case-Metriken: Wenn ein einzelner Fall kritische Anker oder Quellbelege verliert, darf ein guter Durchschnitt das nicht verstecken.

## ContextPack Receipt v1

`sparkompass pack` erzeugt ein Receipt mit:

- `context_pack_id`
- `ContextPolicyV1` mit Risikoprofil, Nutzerziel, effektivem Ziel und Erweiterungszielen
- originalen, kompakten und gelieferten Tokens
- echte gelieferte Ersparnis in `saved_tokens`, `ersparnis_prozent` und `savings.delivered`
- theoretische Kompakt-Kandidaten-Ersparnis in `savings.compact`
- kritischen und informativen Ankern
- `AnchorClassBreakdownV1` für alle Anker und kritische Ankerklassen
- Quellbelegen mit Originalzeile und Hash
- optionalem `acceptance_oracle` für `--expect` und `--expect-regex`
- Fallback-Entscheidung
- Kontext-Versuche mit Zielgröße, Status, Tokens und Gründen
- `compact_context` und `delivered_context` mit Hash, Tokens und Liefermodus
- Gate-Status `verified-publishable`, `verified-expanded-context` oder `fallback-full-context`

Wenn eine Zielgröße unsicher ist, versucht `pack` zuerst größere Kompaktfassungen. Erst wenn kein Versuch die kritischen Gates besteht, wird Vollkontext geliefert. Zu den kritischen Gates gehoeren 100% kritische Anker, 100% Quellbelege, keine riskante Verdichtung und, falls gesetzt, ein bestandenes Akzeptanz-Orakel gegen den gelieferten Kontext.

Die kritischen Anker werden zusätzlich nach Klassen berichtet. Nicht jede CLI-Option ist automatisch kritisch; gefährliche Optionen wie `--force`, `--hard`, `--no-verify` oder `--unsafe` werden aber als kritische `cli-option` behandelt und müssen erhalten bleiben.

Das Akzeptanz-Orakel prüft immer auch den Originaltext. Wenn der Originaltext selbst eine Erwartung nicht enthält oder ein Regex ungültig ist, zeigt das Receipt `acceptance-oracle-source-failed`; Sparkompass erfindet dann keinen Erfolg.

Der Sparbalken in `pack` nutzt `savings.delivered`. Bei `fallback-full-context` ist die echte Ersparnis deshalb 0%, auch wenn der verworfene Kompakt-Kandidat kleiner war. Das verhindert, dass Sparkompass sich eine Ersparnis anrechnet, die Codex nie wirklich erhalten hat.

## ContextPackFormat v1

`sparkompass receipt schema`, `sparkompass receipt lint` und `sparkompass_contextpack_format` machen den `ContextPackReceiptV1`-Vertrag als `ContextPackFormatV1` sichtbar.

`receipt lint` erzeugt `ContextPackFormatValidationV1` und prüft ein gespeichertes Pack ohne Originalquelle auf portable Invarianten:

- erlaubtes Schema, Gate und Delivery Mode
- konsistente Tokenfelder, gelieferte Tokens und echte Ersparnis
- SHA-256-Form für Source-, Kompakt- und Delivered-Context-Hashes
- 100% kritische Anker und 100% kritische Ankerklassen
- 100% Source-Evidence-Coverage und plausible Evidence-Einträge
- keine riskante Qualitätswertung
- Fallback- und Delivery-Mode-Konsistenz
- bestandene Acceptance-Oracle-Spur, wenn ein Oracle aktiv ist

Das Linting ersetzt nicht `receipt verify`: Ohne Originalquelle kann es nicht beweisen, dass die Quellzeilen noch identisch sind. Es ist der portable Vertrag für Austausch, CI und spätere Codex-Integration; `receipt verify` bleibt die hashgenaue Quellenprüfung.

## ContextPackReceiptVerification v1

`sparkompass receipt verify` und `sparkompass_verify_receipt` erzeugen `ContextPackReceiptVerificationV1`.

Die Prüfung liest ein gespeichertes `ContextPackReceiptV1` oder ein Pack-JSON mit `.receipt` und vergleicht es gegen die Originalquelle. Sie prüft:

- Receipt-Schema
- Source-Hash gegen den aktuellen Originaltext
- alle Source-Evidence-Zeilenhashes gegen die passenden Originalzeilen
- optional den `delivered_context.hash`, wenn gelieferter Kontext übergeben wurde oder im Pack-JSON enthalten ist
- Gate-Status aus `verified-publishable`, `verified-expanded-context` oder `fallback-full-context`
- kritische Anker-Erhaltung = 100%
- alle kritischen Ankerklassen = 100%
- Source-Evidence-Coverage = 100%
- keine riskante Verdichtung
- bestandenes Acceptance-Oracle für den gelieferten Kontext, wenn ein Oracle aktiv war

Der Originaltext ist für eine vollständige Verifikation erforderlich. Ohne Originalquelle meldet die Prüfung `receipt-needs-review`, statt ein altes Receipt blind zu vertrauen. Der gelieferte Kontext ist optional, weil alte Workflows manchmal nur das Receipt speichern; wenn er vorhanden ist, wird er hashgenau geprüft.

## ContextPackRegistry v1

`sparkompass contextpack register`, `sparkompass contextpack verify`, `sparkompass pack --registry` und `sparkompass_verify_context_pack` erzeugen beziehungsweise nutzen `ContextPackRegistryV1`.

Die Registry speichert lokal:

- `context_pack_id`
- Receipt und Receipt-Hash
- Quelllabel, Source-Hash und bevorzugt einen Quellpfad
- den gelieferten Kontext oder einen Kontextpfad
- Gate-Status und einen Ladehinweis für die ID-Prüfung

`ContextPackRegistryVerificationV1` ist die praktische Form von `prüfeKontext(context_pack_id)`: Zuerst wird die ID in der Registry gefunden, dann werden Registry-Schema, Pack-ID und Receipt-Hash geprüft. Danach läuft wieder `ContextPackReceiptVerificationV1` gegen Originalquelle und gelieferten Kontext. Ein Registry-Treffer allein ist also kein Erfolg; Erfolg entsteht erst, wenn die Quellen- und Kontext-Hashes weiterhin passen.

Original-Rohtext wird nicht automatisch in die Registry geschrieben. Der bevorzugte Pfad ist: Quellpfad merken, Source-Hash prüfen, bei Bedarf begrenzte Originalstellen per `sparkompass_load_source_hash` laden. `--store-source-text` existiert nur für lokale Sonderfälle, in denen keine Datei als Beleg verfügbar ist.

## TaskOutcomeReceipt v1

`sparkompass task run`, `sparkompass task record` und `sparkompass_task_outcome` erzeugen `TaskOutcomeReceiptV1`.

Das Artefakt verbindet einen lokalen Check mit einer reproduzierbaren Spur:

- Befehl und Arbeitsverzeichnis
- erwarteter und tatsächlicher Exit-Code
- Timeout- und Dauerangaben
- Hashes und Token-Schätzungen für stdout, stderr und kombinierte Ausgabe
- `ToolOutputSummaryV1` für die kompakte Sicht auf lange Ausgaben
- optionales Output-Orakel aus `--expect-output` und `--expect-output-regex`
- optionales `ContextPackReceiptVerificationV1`, wenn ein Pack-Receipt mit Originalquelle verknüpft wurde

Das Gate `verified-task-outcome` erfordert:

- kein Timeout
- Exit-Code entspricht `expected_exit_code`
- alle Output-Erwartungen wurden gefunden, wenn ein Output-Orakel gesetzt ist
- ein verknüpftes ContextPack-Receipt ist verifiziert, wenn es angegeben wurde

`sparkompass task run` führt einen lokalen Befehl bewusst über die CLI aus. `sparkompass_task_outcome` in MCP registriert nur bereits vorhandenen Output und führt keine Shell-Befehle aus. Damit kann Codex Task-Ergebnisse belegen, ohne dass das Kontextwerkzeug selbst versteckt Kommandos startet. Mit `--ledger` schreibt `task run` oder `task record` den Beleg zusätzlich in ein `TaskOutcomeLedgerV1`.

TaskOutcome ist kein Beweis, dass eine offene Aufgabe semantisch perfekt gelöst wurde. Es ist die lokale, hashbare Spur für konkrete Akzeptanzsignale wie Tests, Linter, Builds, Compiler-Ausgaben oder erwartete Output-Fakten.

## TaskOutcomeLedger v1

`sparkompass task run --ledger`, `sparkompass task record --ledger`, `sparkompass task-ledger add`, `sparkompass task-ledger report` und `sparkompass_task_outcome_ledger` erzeugen beziehungsweise lesen `TaskOutcomeLedgerV1`.

Das Ledger macht aus einzelnen Check-Belegen eine Verlaufsmessung:

- verifizierte und review-pflichtige TaskOutcomes
- Verifikationsrate und Review-Rate
- häufigste Review-Gründe aus Exit-Code-, Output-Orakel- oder Receipt-Fehlern
- fehlgeschlagene Exit-Code-Prüfungen und Output-Orakel-Fehler
- verknüpfte ContextPacks und Receipt-Verifikationsfehler
- p95 Output-Tokens
- p95 Dauer
- p95 ContextPack-Tokens, wenn TaskOutcomes mit ContextPack-Receipts verbunden sind
- Output-Tokens pro verifiziertem Task
- ContextPack-Tokens pro verifiziertem Task, wenn TaskOutcomes mit ContextPack-Receipts verbunden sind

Diese Kennzahl ersetzt keine fachliche Abnahme. Sie beantwortet die engere, messbare Frage: Wie viel lokaler Output- und Kontextaufwand war nötig, um konkrete Checks erfolgreich zu bestehen?

## SparkompassScorecard v1

`sparkompass scorecard` und `sparkompass_scorecard` erzeugen `SparkompassScorecardV1`.

Die Scorecard schreibt keine neuen Receipts, Caches oder Ledger-Dateien. Sie führt vorhandene und reproduzierbare Qualitätssignale zusammen:

- Dogfood-Gate, durchschnittliche Ersparnis, Worst-Case-Anker, p95-Tokens, riskante Verdichtungen und Fallbacks
- Benchmark-Gate, Kontext-Erfolge, TaskOutcome-Erfolge, Failure-Corpus-Klassen, ContextPack-Qualität, Effizienzmetriken, Regressionen, Gegenfakten und Tokens pro bestandenem Fall
- SavingsLedger-Summen, wenn ein Ledger vorhanden ist
- TaskOutcomeLedger-Summen, Verifikationsrate und Review-Gründe, wenn ein Ledger vorhanden ist
- ContextEnvelopeLedger-Summen, wenn ein Ledger vorhanden ist
- ContextHandoffLedger-Summen, wenn ein Ledger vorhanden ist
- PromptPreparationLedger-Summen, sendbare Prompt-Ersparnis und Fallbacks, wenn ein Ledger vorhanden ist

Das Gate `verified-scorecard` erfordert keine Ledger-Einträge, weil ein frischer Klon sonst kuenstlich blockiert würde. Fehlende Savings-, TaskOutcome-, Envelope-, Handoff- oder PromptPreparation-Ledger erscheinen als Hinweise. Wenn ein TaskOutcomeLedger oder PromptPreparationLedger vorhanden ist, aber Review-Fälle, Output-Orakel-Fehler, Receipt-Verifikationsfehler oder blockierte Vorbereitungen enthält, erscheinen diese ebenfalls als Hinweise. Blockierend sind Dogfood-/Benchmark-Fehler, verlorene kritische Anker, fehlende Quellbelege, Vollkontext-Fallbacks, riskante Verdichtungen, Regressionen oder unvollständige Benchmark-TaskOutcomes.

## SparkompassPilotRun v1

`sparkompass pilot` und `sparkompass_pilot_run` erzeugen `SparkompassPilotRunV1`.

Der Pilot ist die schreibende Gegenprobe zur read-only Scorecard. Er führt einen reproduzierbaren Eigenlauf aus und schreibt dabei:

- ContextPackReceipts in ein `SavingsLedgerV1`
- ein `SparkompassPromptPreparationV1` in ein `PromptPreparationLedgerV1`
- ein `TaskOutcomeReceiptV1` mit ContextPack-Receipt-Verifikation in ein `TaskOutcomeLedgerV1`
- ein `ContextEnvelopeV1` in ein `ContextEnvelopeLedgerV1`
- ein `ContextHandoffReceiptV1` in ein `ContextHandoffLedgerV1`

Das Gate `verified-pilot-run` erfordert einen publishable Dogfood-Lauf, einen verifizierten Benchmark, mindestens einen verifizierten Eintrag in jedem Pilot-Ledger und eine verifizierte Scorecard gegen genau diese Ledger. Der Standardlauf zeichnet Sparkompass' eigene Dogfood-/Benchmark-Gates als TaskOutcome auf. Über CLI kann `--task-command` einen echten Projektcheck koppeln; das MCP-Werkzeug führt bewusst keine frei wählbaren Shell-Befehle aus.

Die wichtigste Kennzahl ist `context_tokens_per_verified_task`: Sie verbindet gelieferte ContextPack-Tokens mit einem verifizierten TaskOutcome. Dazu kommen echte gelieferte Ersparnis, sendbare Prompt-Ersparnis, Prefix-Reuse und geschätzte Startkontext-Ersparnis. Das beweist keine Abrechnung, aber es beweist, dass Sparkompass eine nachvollziehbare, lokal reproduzierbare Belegspur erzeugt hat.

## SparkompassImpactReport v1

`sparkompass impact` und `sparkompass_impact_report` erzeugen `SparkompassImpactReportV1`.

Der Impact Report liest vorhandene Ledger und schreibt keine neuen Messdaten. Er kombiniert:

- `SavingsLedgerV1` für echte gelieferte ContextPack-Ersparnis
- `ContextHandoffLedgerV1` für geschätzte Startkontext-Ersparnis
- `PromptPreparationLedgerV1` für sendbare Prompt-Ersparnis und Prompt-Verifikation
- `TaskOutcomeLedgerV1` für verifizierte Tasks, Output-Orakel und Receipt-Verifikationsstatus

Das Gate `verified-impact` erfordert vorhandene Messdaten und keine Qualitätsblocker. Blockierend sind unter anderem fehlende verifizierte Einträge in vorhandenen Ledgers, Vollkontext-Fallbacks, riskante Verdichtungen, blockierte Handoffs, review-pflichtige Prompt-Vorbereitungen, Review-Tasks, Output-Orakel-Fehler, Receipt-Verifikationsfehler, kritische Anker unter 100% oder Quellbelege unter 100%. Wenn alle Ledgers leer oder nicht vorhanden sind, meldet der Report `impact-ledger-empty`, statt eine Sparwirkung zu behaupten.

Die Hauptzahlen sind:

- gelieferte ContextPack-Ersparnis
- geschätzte Startkontext-Ersparnis
- sendbare Prompt-Ersparnis
- kombinierte Kontext-Ersparnis
- verifizierte Packs, Handoffs und Tasks
- Tokens pro verifiziertem Task
- p95 gelieferte Tokens, p95 Startprompt-Tokens und p95 Output-Tokens

Der Report ist damit die lesbare Nutzerwirkungsschicht: Er sagt nicht nur, dass Tokens entfernt wurden, sondern ob die Ersparnis mit verifizierten Ergebnissen verbunden ist.

## SparkompassReleaseAudit v1

`sparkompass release-audit` und `sparkompass_release_audit` erzeugen `SparkompassReleaseAuditV1`.

Das Audit ist die maschinenlesbare Zielkarte vor einer Release-Entscheidung. Es prüft die großen Projektanforderungen gegen lokale Evidenz:

- Context-Control-Plane
- semantisches Inventar
- nachvollziehbare ContextDecisionTrace-Entscheidungen
- hashgenau nachladbare Evidence-IDs
- SourceHashHandoffContractProbeV1 für `source_hash_load_hint` in Plan/Handoff-Artefakten
- ContextPackIdVerificationProbeV1 für `context_pack_id` Registry-Nachweis mit Receipt-Verifikation
- planbezogene Ablation gegen ein Akzeptanz-Orakel
- ablation-getriebener Slimming-Plan für Sofortkontext
- qualitätsgegatede Nutzerwirkung aus Ledgers
- 100% kritische Anker
- Quellbelege und Receipts
- Fallback bei Unsicherheit
- Task-Erfolg und Regressionsgates
- Failure-Corpus und Gegenfakten
- interaktive Kontextwerkzeuge
- Delta-Kontext und verifizierter semantischer Cache
- Semantic-Cache-Hits mit ContextPack-ID-Registry-Verifikation
- ExperimentPlan-Probe mit reproduzierbarem Vierarm-Laufplan
- ExperimentScript-Probe mit ausführbarem Runbook und Audit-vor-Run-Reihenfolge
- ExperimentEvidenceAudit-Probe mit vollständigen geplanten Usage-/TaskOutcome-/Prompt-Artefakten
- ExperimentRun/Router/GatePath-Probe mit Usage-Invarianten, RunManifest-Metadaten inklusive ContextPack-Hash, TaskOutcome-Qualitätsgate und vorbereitetem End-to-End-Gate
- Pilot-Ledger-Messung
- lokaler Plugin-Kandidat
- Package-Shape
- PackageDryRunAuditV1
- PackageInstallSmokeAuditV1
- PluginInstallSmokeAuditV1

Das Gate `verified-release-audit` erfordert, dass alle Anforderungen verifiziert sind. Der Standardlauf startet einen Pilot mit temporärem Ledger-Verzeichnis, damit keine Projektdateien beschrieben werden; mit `--ledger-dir` kann die Spur bewusst an einen Ort gelegt werden. Der Audit führt außerdem eine ExperimentPlan-Probe, eine ExperimentScript-Probe, eine ExperimentEvidenceAudit-Probe, eine ExperimentRun/Router/GatePath-Probe, einen Package-Dry-Run, einen Package-Install-Smoke und einen Plugin-Install-Smoke aus. Der Package-Smoke nutzt `--ignore-scripts`, damit keine rekursive `prepack`-Prüfung entsteht. Das Audit ersetzt weder Veröffentlichung noch Plugin-Directory-Validierung. Es sagt nur: Die lokale Belegkette trägt das definierte Ziel gerade.

## PackageDryRunAudit v1

`sparkompass package-audit` und `sparkompass_package_audit` erzeugen `PackageDryRunAuditV1`.

Das Artefakt führt lokal `npm pack --dry-run --json --ignore-scripts` aus und prüft:

- Paketname und Version gegen `package.json`
- Pflichtpfade für CLI, MCP, Docs, Skill, Plugin, Hook und Beispiele
- verbotene lokale Artefakte wie `.sparkompass`, Testfixtures, `node_modules`, `.env`, `.git` oder versehentlich erzeugte `.tgz`-Dateien
- ausführbare Modi für CLI- und Plugin-Bridge-Skripte
- Package-Größe, entpackte Größe und Dateianzahl gegen konservative Limits
- dass der Dry-Run selbst kein Tarball-Artefakt im Workspace hinterlässt

Das Gate `verified-package-dry-run` ist die paketierbare Form der lokalen Belegkette. Es beweist keine npm-Veröffentlichung, verhindert aber, dass eine lokal gute Version mit fehlenden Bridges, privaten Dateien oder zu großem Paket in Richtung Release wandert.

## PackageInstallSmokeAudit v1

`sparkompass package-smoke` und `sparkompass_package_install_smoke` erzeugen `PackageInstallSmokeAuditV1`.

Das Artefakt packt das lokale Paket in ein temporäres Tarball, installiert dieses Tarball in ein frisches temporäres Projekt und prüft dort:

- installierte `package.json`
- installierte CLI- und MCP-Bin-Dateien
- `sparkompass doctor`
- `sparkompass benchmark --json`
- MCP `tools/list` inklusive Lookup- und Package-Smoke-Werkzeug
- dass kein Tarball im Workspace-Root liegen bleibt

Das Gate `verified-package-install-smoke` beweist keine npm-Veröffentlichung. Es beweist aber lokal, dass das Paket nach dem Installieren startbar ist und die wichtigsten Entrypoints nicht nur im Quellbaum, sondern auch aus dem gepackten Artefakt funktionieren.

## PluginInstallSmokeAudit v1

`sparkompass plugin-smoke` und `sparkompass_plugin_install_smoke` erzeugen `PluginInstallSmokeAuditV1`.

Das Artefakt kopiert den lokalen Plugin-Kandidaten in ein temporäres Plugin-Verzeichnis und prüft dort:

- Manifest-Shape, MCP-Konfiguration, Hook-Konfiguration und Skill-Datei
- CLI-Bridge über `sparkompass doctor`
- MCP-Bridge über `tools/list`
- MCP-Werkzeugausführung über `tools/call` mit `sparkompass_lookup`
- Cache-Install-Bridge aus einer simulierten Codex-Plugin-Cache-Kopie, inklusive `repoRoot`/`rootPath`-Zielrepo-Auflösung
- UserPromptSubmit-Hook mit großem Hook-Payload
- dass der Hook eine Empfehlung ausgibt, aber sensible Prompt-Anker nicht echoet

Das Gate `verified-plugin-install-smoke` beweist keine Veröffentlichung im Codex Plugin Directory. Es beweist aber lokal, dass die Plugin-Hülle als kopierte Instanz startbar ist, ihre Brücken zu CLI, MCP und Hook-Advice funktionieren, eine installierte Cache-Kopie die Marketplace-Quelle findet und ein installiertes Kontextwerkzeug wirklich gegen das angegebene Zielrepo ausgeführt werden kann.

## ContextEvidenceAudit v1

`sparkompass evidence-audit` und `sparkompass_evidence_audit` erzeugen `ContextEvidenceAuditV1`.

Der Audit baut zuerst denselben `ContextControlReportV1`, den ein Handoff verwenden würde, und prüft dann die geplanten Evidence-Einträge aus:

- Sofortkontext
- Muss-Fakten-Coverage
- On-Demand-Nachladevertrag

Für jeden Beleg wird die Datei im aktuellen Arbeitsbaum gelesen, die geplante Zeile nachgeschlagen und der getrimmte Zeileninhalt erneut als `sha256` gehasht. Das Gate `verified-evidence-audit` erfordert, dass alle geprüften Belege existieren und der aktuelle Hash zum geplanten Hash passt.

Mögliche Fehler sind:

- `file-missing`
- `line-missing`
- `hash-mismatch`

Wenn `--max-evidence` kleiner als die gesamte Belegliste ist, erscheint `evidence-audit-truncated` als Warnung. Wenn der zugrunde liegende Control-Report review-pflichtig ist, bleibt der Evidence-Audit trotzdem sichtbar: Er beweist dann nur die Hash-Spur, nicht die fachliche Freigabe.

Dieses Artefakt ist die Brücke zwischen Sparen und Vertrauen. Es sagt nicht "die Aufgabe ist gelöst", sondern: "Die kleine Kontextübergabe hat eine aktuelle, prüfbare Spur zur Originalquelle."

## ContextAblationAudit v1

`sparkompass ablation-audit` und `sparkompass_ablation_audit` erzeugen `ContextAblationAuditV1`.

Der Audit baut einen `ContextPlanV1`, setzt daraus den geplanten Sofortkontext zusammen und prüft ihn gegen ein explizites Akzeptanz-Orakel aus `--expect` und `--expect-regex`. Danach entfernt Sparkompass jede Sofortkontext-Einheit einzeln und prüft das Oracle erneut.

Das Ergebnis trennt:

- `oracle-critical`: Ohne diese Einheit fällt mindestens eine Muss-Fakt oder ein Muss-Muster weg.
- `ablation-safe-candidate`: Das Oracle besteht auch ohne diese Einheit; sie ist ein Kandidat für On-Demand-Laden, aber nicht automatisch entbehrlich.

Das Gate `verified-ablation-audit` erfordert:

- mindestens eine Oracle-Erwartung
- einen verifizierten ContextPlan
- ein bestehendes Baseline-Oracle auf dem geplanten Sofortkontext
- geladene und hashpassende Source-Segmente
- Gegenfakten-Sensitivitaet des Oracles

Der Audit ist absichtlich streng bei fehlenden Oracles. Ohne `--expect` oder `--expect-regex` gibt es kein sinnvolles Qualitätskriterium, deshalb wird `ablation-audit-needs-review` gemeldet. Das verhindert, dass Sparkompass Kontext nur aufgrund von Scores entfernt.

ContextAblationAudit ist kein Ersatz für Tests, Compiler oder echte TaskOutcomeReceipts. Es ist die planbezogene Gegenprobe: Wenn wir sparen wollen, sehen wir zuerst, welche Sofortkontext-Teile für das definierte Oracle wirklich tragen.

## ContextSlimmingPlan v1

`sparkompass slim` und `sparkompass_slim_context` erzeugen `ContextSlimmingPlanV1`.

Der Plan baut auf demselben `ContextPlanV1` und `ContextAblationAuditV1` auf. Er verschiebt keine Inhalte automatisch aus einem Codex-Prompt heraus, sondern erstellt eine konservative Review-Liste:

- `keep_immediate`: Oracle-kritische Einheiten, ungeprüfte Einheiten und sichere Kandidaten oberhalb des `--max-moves`-Limits.
- `move_to_on_demand`: Sofortkontext-Einheiten, deren Entfernung das definierte Oracle nicht bricht.

Das Gate `verified-slimming-plan` erfordert:

- einen verifizierten ContextPlan
- einen verifizierten ContextAblationAudit
- vollständige Ablation-Coverage für die geprüften Sofortkontext-Einheiten
- mindestens eine oracle-kritische Einheit, die im Sofortkontext bleibt
- mindestens einen ablation-sicheren Move-Kandidaten mit positiver Zusatzersparnis

Damit ist der Slimming-Plan die Schicht zwischen Ablation und Handoff: Codex oder ein Nutzer sieht, was sicher sofort bleiben muss und was als MCP-On-Demand-Evidence genügen könnte. Ohne explizites Oracle oder bei unvollständiger Prüfung bleibt das Ergebnis review-pflichtig.

## ContextBOM v1

`sparkompass bom` und `sparkompass_context_bom` erzeugen `ContextBOMV1`.

Die BOM ist die Materialliste für den geplanten Handoff. Sie baut auf `ContextPlanV1` auf und fügt keine zweite Auswahl-Logik ein. Stattdessen fasst sie zusammen:

- Lane-Mix aus `immediate_context`, `on_demand_evidence` und Omitted-Vorschau
- Tokenkosten pro Lane, Datei und Typ
- Entscheidungsklassen wie `immediate:seed`, `immediate:density` oder `on-demand:budget-limit`
- Risikoregister für sicherheits-, auth-, token-, migrations- oder löschnahe Einheiten
- `ContextPlanRiskControlsV1` aus dem zugrunde liegenden Plan
- Muss-Fakten-Coverage inklusive Evidence-Hinweisen
- Evidence-Protokoll für sofort geladene, requirement-bezogene und on-demand Belege

Das Gate `verified-bom` ist grün, wenn der zugrunde liegende Plan verifiziert ist, Muss-Fakten nicht fehlen und unmittelbarer Startkontext vorhanden ist. Die BOM ist bewusst bounded: Sie enthält IDs, Hashes, Belege und Zusammenfassungen, aber keine großen Rohdateien.

## ContextPolicy v1

`pack`, `sparkompass_pack`, `semantic-cache add`, `plan`, `bom`, `control`, `handoff` und `envelope` akzeptieren `riskProfile` beziehungsweise `--risk-profile`:

- `compact`: maximiert Ersparnis und startet bei kleinerem Zielbudget.
- `balanced`: Standardprofil für normale Logs, Notizen und Aufgaben.
- `careful`: startet mit mehr Kontext für Code, Logs, Konfiguration und unklare Aufgaben.
- `strict`: konservativ für sicherheitskritische oder fachlich riskante Inhalte.

Wenn ein Nutzer bei `strict` ein sehr kleines Pack-Ziel wie 10% setzt, hebt die Policy das effektive Ziel auf mindestens 50%. Das Receipt zeigt sowohl das Nutzerziel als auch das effektive Ziel.

In `ContextPlanV1` setzt dieselbe Policy zusätzlich Startbudget- und Risk-Lane-Regeln. `compact` und `balanced` dürfen riskante relevante Einheiten als Nachlade-Beleg zurückhalten. `careful` und `strict` markieren den Plan als `plan-needs-review`, wenn riskante relevante Einheiten wegen Budgetdruck nur deferred sind. Damit ist Sparkompass bei Auth-, Token-, Secret-, Migrations- oder Delete-nahen Stellen konservativer, ohne normale Plaene kuenstlich aufzublaehen.

## ContextCalibration v1

`sparkompass calibrate` und `sparkompass_calibrate_context` erzeugen `ContextCalibrationV1`.

Die Kalibrierung testet mehrere Zielgrößen ohne automatische Erweiterung. Dadurch findet sie die kleinste Zielgröße, die direkt `verified-publishable` ist. Wenn `--expect` oder `--expect-regex` gesetzt sind, müssen Kandidaten auch dieses Akzeptanz-Orakel bestehen. Das Ergebnis enthält:

- Suchbereich und Schrittweite
- Risikoprofil und Policy
- alle getesteten Zielgrößen mit Status, Gründen, Tokens, Sparquote und Oracle-Status
- empfohlene Zielgröße und passenden `sparkompass pack`-Hinweis

Damit wird aus einem manuellen Prozentwert ein reproduzierbares Budgetverfahren.

## SavingsLedger v1

`sparkompass pack --ledger`, `sparkompass ledger add`, `sparkompass ledger report` und `sparkompass_savings_ledger` erzeugen beziehungsweise lesen `SavingsLedgerV1`.

Der Ledger speichert pro ContextPack:

- ContextPack-ID und Receipt-Hash
- Gate-Status, Risikoprofil, Qualitätsstatus und Fallback-Modus
- originale, kompakte und gelieferte Tokens
- echte gelieferte Ersparnis
- theoretische Kompakt-Kandidaten-Ersparnis
- kritische Anker-Erhaltung und Quellbeleg-Abdeckung

Die Summen zeigen:

- echte Gesamtersparnis über `delivered_tokens`
- Kompakt-Kandidaten-Ersparnis als Diagnosewert
- p95 gelieferte und gesparte Tokens
- Fallback-Rate, erweiterte ContextPacks und Vollkontext-Fallbacks
- schlechteste kritische Anker-Erhaltung und Quellbeleg-Abdeckung

Damit wird der einzelne Sparbalken zu einer wiederholbaren Nutzenspur: Ein Team kann sehen, ob Sparkompass im Alltag tatsächlich weniger Kontext an Codex liefert, ohne die eigenen Qualitätsgates zu verschlechtern.

## ShadowRun v1

`sparkompass shadow` und `sparkompass_shadow_compare` erzeugen `ShadowRunV1`.

Der Shadow-Modus nimmt denselben Rohtext zweimal:

- als Vollkontext
- als gelieferten Sparkompass-ContextPack inklusive Fallback-Policy

Beide Varianten werden gegen dasselbe Akzeptanzorakel geprüft. In v1 ist dieses Oracle bewusst einfach und reproduzierbar: alle per `--expect` genannten Soll-Fakten müssen enthalten sein, und alle per `--expect-regex` genannten Muster müssen matchen. Damit lassen sich neben exakten Fehlercodes auch strukturierte Fakten wie Stacktrace-Pfade, Zeilennummern oder Dateinamensmuster prüfen.

Das Gate `verified-shadow` erfordert:

- Vollkontext besteht das Oracle
- Sparkompass-Kontext besteht dasselbe Oracle
- Regressionen gegen Vollkontext = 0
- alle Gegenfakten werden erkannt
- ContextPack Receipt bleibt sicher: 100% kritische Anker, 100% Quellbelege, keine riskante Verdichtung

Wenn der Vollkontext besteht, der Sparkompass-Kontext aber eine Soll-Fakt oder ein Soll-Muster verliert, meldet Shadow `shadow-regression` und die CLI beendet mit Exit-Code 2. Damit wird der Anspruch "Tokens pro erfolgreichem Task" für konkrete Eingaben testbar, ohne ein LLM-Judge-System einzuführen.

## ContextInventory v1

`sparkompass inventory` ist der erste Schritt vom Datei-Scan zur Context-Control-Plane. Es erzeugt adressierbare Einheiten mit:

- `id`
- `type`
- `file`
- `line`
- `name`
- `source_hash`
- geschätzten Tokens

Dieses Inventar ist noch heuristisch. Es ist die Grundlage für spätere Abhängigkeitsgraphen, Delta-Kontext, gezieltes Nachladen und Budgetoptimierung.

## ContextPlan v1

`sparkompass plan` und `sparkompass_plan_context` erzeugen `ContextPlanV1`.

Der Planer nimmt ein Ziel, optionale Dateien, Done-Kriterien, ein Tokenbudget und optional einen `ContextCacheV1`. Er bewertet semantische Einheiten nach:

- Aufgabenrelevanz
- expliziten Dateien
- Einheitentyp
- Risiko-Signalen
- Dependency-/Import-Signalen
- Delta-Status gegen den Cache
- optionaler ein-Hop-Nachbarschaft im Context Graph

Das Ergebnis trennt:

- `immediate_context`: Einheiten, die sofort in den Startkontext gehoeren
- `on_demand_evidence`: relevante Einheiten, die nur bei Bedarf über MCP nachgeladen werden sollen
- `omitted`: Einheiten ohne erkennbare Relevanz für das aktuelle Ziel

Der Plan enthält `ContextBudgetOptimizerV1`:

- Strategie: `seed-then-density-greedy`
- Seeds: explizit genannte Dateien sowie neue oder geänderte Einheiten
- Restbudget: Auswahl nach `selection_efficiency`, also Nutzwert pro Token
- Nachvollziehbarkeit: jede Einheit bekommt `selection_priority`, `selection_efficiency` und `selection_lane_reason`

Das ist noch kein vollständiger Solver, aber es ist der erste testbare Schritt vom globalen Prozentziel zu einem Budget-Optimierer. Unter knappem Budget kann ein kleiner, präziser Treffer sofort geladen werden, während ein riesiger, aber teurer Treffer nur als Nachlade-Beleg erscheint.

Der Plan enthält außerdem `ContextDecisionTraceV1`:

- Lane-Entscheidungen für `immediate_context`, `on_demand_evidence` und Omitted-Vorschau
- Budget-Entscheidungen inklusive `skipped_for_budget` und Top-Budget-Ablehnungen
- Risk-Entscheidungen aus `ContextPlanRiskControlsV1`
- Delta- und Requirement-Entscheidungen mit Coverage-Status
- `uncertainty_register` mit `blocking`, `review` und `info` Einträgen
- Quality Contract für Nachladen und Hash-/Evidence-Nutzung

Das Gate `verified-decision-trace` bedeutet: Der zugrunde liegende Plan ist verifiziert und es gibt keine blockierende Unsicherheit. Review- oder Info-Hinweise bleiben sichtbar, damit begrenzte Vorschauen nicht mit vollständiger Kenntnis verwechselt werden.

Der Plan enthält außerdem `ContextPlanRiskControlsV1`:

- Risikoprofil und Risk-Lane-Policy aus `ContextPolicyV1`
- policy-basiertes Startbudget und Mindestbudget für riskante Aufgaben
- Anzahl relevanter Risiko-Einheiten im Sofortkontext und in `on_demand_evidence`
- Preview deferierter Risiko-Einheiten mit `sparkompass_load_evidence`-Hinweis
- Gate-Gründe wie `strict-risk-unit-deferred` oder `strict-start-budget-below-risk-floor`

Bei `strict` und `careful` werden diese Gate-Gründe in das Plan-Gate übernommen. Der Handoff wird dadurch review-pflichtig, bis das Budget erhöht oder der riskante Beleg bewusst geladen wurde.

Wenn `--expect` oder `--expect-regex` gesetzt sind, enthält der Plan außerdem `ContextPlanRequirementCoverageV1`:

- `covered-immediately`: eine Muss-Fakt liegt auf einer sofort geplanten Evidence-Spur
- `requires-evidence-load`: die Muss-Fakt wurde in einer Quelle gefunden, muss aber vor Verwendung geladen werden
- `missing`: die Muss-Fakt wurde im geplanten Repository-Inventar nicht gefunden

Fehlende Muss-Fakten setzen das Plan-Gate auf `plan-needs-review`. Damit kann ein Agent schon vor `pack` erkennen, welche Originalstellen er laden muss, bevor er eine verdichtete ContextPack-Übergabe baut.

Wenn `--cache` gesetzt ist, erhalten Einheiten `delta_status`:

- `stable`: gleiche Identity und gleicher Source-Hash wie im Cache
- `changed`: gleiche Identity, aber anderer Source-Hash
- `added`: keine passende Identity im Cache
- `unknown`: kein Cache genutzt

`changed` und `added` erhöhen den Nutzenwert, damit Folgeturns zuerst neuen oder geänderten Kontext sehen.

Mit Cache-Vergleich erzeugt der Plan außerdem `ContextPlanDeltaCoverageV1`:

- `covered`: alle neuen/geänderten Einheiten sind im Sofortkontext oder als `on_demand_evidence` adressierbar
- `partial`: mindestens eine neue/geänderte Einheit ist wegen Budget- oder Listenbegrenzung nicht adressierbar
- `cache-missing`: ein Cache wurde angefordert, konnte aber nicht geladen werden
- `no-changes`: es gibt keine neuen oder geänderten Einheiten

`partial` und `cache-missing` setzen das Plan-Gate auf `plan-needs-review`, weil ein Handoff sonst geänderten Kontext übersehen könnte.

Ohne direkte Aufgabenrelevanz werden Typ-, Risiko- und Import-Signale nur zur Sortierung genutzt. Sie machen eine Einheit nicht mehr allein relevant. Eine Einheit landet im Plan, wenn sie zum Ziel passt, explizit genannt wurde, neu/geändert ist oder bei `--graph` beziehungsweise `includeGraph` als direkter Graph-Nachbar einer relevanten Einheit gefunden wurde. Solche Einheiten tragen `graph_related: true` und `score_breakdown.graph_value`.

Das Gate `verified-plan` erfordert, dass Sofortkontext ausgewählt wurde, explizit genannte Dateien vertreten sind, das Sofortbudget nicht überschritten wird, Delta-Coverage bei Cache-Nutzung vollständig adressierbar ist und die Risk-Control-Regeln des Profils erfüllt sind. Damit wird der globale Prozentwert durch eine konkrete Kontextentscheidung unter Budget ergänzt.

Wenn ein Cache-Pfad übergeben wird, schliesst der Planer diese Datei aus dem aktuellen Inventar aus. Der Cache darf helfen, Delta-Status zu bestimmen, soll aber nicht selbst als vermeintlich relevante Repository-Quelle in den Startkontext geraten.

## ContextEnvelope v1

`sparkompass envelope` und `sparkompass_build_envelope` erzeugen `ContextEnvelopeV1`.

Die Envelope baut keinen neuen Kontext aus dem Nichts. Sie nimmt einen `ContextPlanV1` und ordnet dessen Ergebnis für Agenten- und API-Übergaben:

- `stable_prefix`: statisches Handoff-Protokoll, das möglichst bytegleich wiederverwendet werden soll
- `semi_stable_prefix`: geplante Repository-Einheiten, die nicht als `changed` oder `added` markiert sind
- `variable_tail`: Ziel, Done-Kriterien, Muss-Fakten und geänderte oder neue Einheiten
- `on_demand_index`: Requirement- und Deferred-Evidence, die nicht in jeden Startprompt gehoert

Das Ergebnis enthält `PromptCacheStrategyV1`, `ContextEnvelopeCacheMetricsV1` und optional `ContextEnvelopePrefixReuseV1`:

- geschätzte Prompt-, Prefix-, Tail- und On-Demand-Tokens
- Hashes für stabilen Prefix, statischen Prefix, variable Tail, On-Demand-Index und Gesamtprompt
- `prefix_status`, ob der wiederverwendbare Prefix die konfigurierte Schätzschwelle erreicht
- Sendereihenfolge für Startprompt und separate On-Demand-Reihenfolge
- bei vorheriger Envelope: Status `full-prefix-reusable`, `static-prefix-only-reusable`, `prefix-changed` oder `previous-envelope-invalid`
- geschätzte wiederverwendbare und invalidierte Prefix-Tokens

Das Envelope-Gate ist `verified-envelope`, wenn der darunterliegende Plan `verified-plan` ist. Cache-Hinweise sind bewusst advisory: Sie helfen, stabile Inhalte vorne und variable Inhalte hinten zu halten, beweisen aber keinen real abgerechneten Prompt-Cache-Hit.

## ContextControlReport v1

`sparkompass control` und `sparkompass_control_report` erzeugen `ContextControlReportV1`.

Der Report ist der Vorflugbericht vor einem Codex-Handoff. Er baut aus einem `ContextPlanV1` und einem `ContextEnvelopeV1` eine knappe Entscheidung:

- `ready-for-handoff`: Plan und Envelope sind verifiziert, Muss-Fakten fehlen nicht, und es gibt Sofortkontext.
- `needs-review`: eine Muss-Fakt fehlt, das Plan-Gate ist nicht verifiziert oder es wurde kein Sofortkontext ausgewählt.

Das Ergebnis enthält:

- Plan-, Requirement-, Envelope- und Prompt-Cache-Gates
- Delta-Coverage mit abgedeckten und fehlenden neuen/geänderten Einheiten
- Sofortkontext, On-Demand-Evidence und ausgelassene Einheiten als Lanes
- Sendereihenfolge, On-Demand-Reihenfolge und Handoff-Hashes
- Evidence-Protokoll mit `sparkompass_load_evidence`- und `sparkompass_load_source_hash`-Hinweisen; maschinenlesbar als `load_hint`, `source_hash_load_hint` und `load_hints.source_hash`
- advisory warnings wie fehlender Delta-Cache oder zu kleiner Prefix

Advisory Warnings blockieren den Handoff nicht automatisch. Sie sagen, wo Sparkompass noch besser sparen oder stabilere Prefixe bauen könnte, ohne die Ergebnisqualität kuenstlich zu verweigern.

## ContextHandoffReceipt v1

`sparkompass handoff` und `sparkompass_handoff_receipt` erzeugen `ContextHandoffReceiptV1`.

Der Receipt ist die nutzernahe Übergabeschicht über `ContextControlReportV1`: Er enthält nicht nur die Analyse, sondern den Startprompt, den ein Mensch oder Agent bewusst an Codex geben kann. Das Artefakt berichtet:

- lokale Startkontext-Ersparnis als Balken, berechnet aus geschätzten Inventar-Tokens gegen `ContextEnvelope.prompt`
- Startprompt-Hash, Stable-Prefix-Hash, Variable-Tail-Hash und On-Demand-Index-Hash
- Quality Contract aus Plan-Gate, Envelope-Gate, Readiness-Gate und Muss-Fakten-Coverage
- Prompt-Cache-Layout mit Prefix-/Tail-Tokens und Caveat
- MCP-Nachladevertrag mit Evidence-IDs, Quellhashes und Hash-Nachladen für on-demand Belege; der Menschenreport zeigt `raw=sparkompass_load_source_hash`
- `start_prompt.text` als konkret nutzbaren engen Startkontext

Das Gate `verified-handoff` ist nur grün, wenn der zugrunde liegende ControlReport `ready-for-handoff` ist. Fehlende Muss-Fakten, fehlender Sofortkontext oder ein nicht verifizierter Plan bleiben blockierend. Prompt-Cache-Hinweise und lokale Sparwerte bleiben Schätzungen; sie dürfen sichtbar sein, aber nicht als offizielle Abrechnung ausgegeben werden.

## ContextHandoffLedger v1

`sparkompass handoff --ledger`, `sparkompass handoff-ledger add`, `sparkompass handoff-ledger report` und `sparkompass_handoff_ledger` erzeugen beziehungsweise lesen `ContextHandoffLedgerV1`.

Der Ledger speichert pro Handoff:

- Handoff-ID und Handoff-Hash
- Gate-, Readiness-, Plan- und Envelope-Status
- Muss-Fakten-Coverage und blockierende Warnungen
- geschätzte Inventar-, Startprompt-, Sofortkontext-, Deferred- und On-Demand-Index-Tokens
- geschätzte Startkontext-Ersparnis gegen das lokale Inventar
- Prompt-Cache-Layout, Prefix-/Tail-Tokens und Handoff-Hashes
- Anzahl sofortiger und nachladbarer Evidence-Refs

Die Summen zeigen verifizierte und review-pflichtige Handoffs, p95 Startprompt-Tokens, p95 gesparte Starttokens, blockierte Handoffs und die gesamte geschätzte Startkontext-Ersparnis. Das ist bewusst eine Planungsmetrik: Es beweist, dass Sparkompass kleinere Startprompts vorbereitet hat, nicht dass OpenAI diese Einsparung exakt so abgerechnet hat.

## SparkompassUserPromptHookAdvisory v1

`sparkompass prompt-advisory`, `sparkompass_prompt_advisory` und der lokale Plugin-Hook unter `plugins/codex-sparkompass/hooks/hooks.json` erzeugen `SparkompassUserPromptHookAdvisoryV1` aus geplanter Prompt-Eingabe oder aus der von Codex übergebenen Hook-Eingabe.

Das Artefakt enthält:

- geschätzte Prompt-Größe in Bytes, Zeilen und Tokens
- Schwellen für Warnung nach Tokens und Zeilen
- Signale wie `large-paste`, `tool-output`, `code-heavy` oder `repo-context`
- einen empfohlenen nächsten Sparkompass-Befehl
- ein Caveat, dass der Hook den Prompt nicht verändert und keine Abrechnungsdaten beweist

Human-Reports spiegeln keine Prompt-Inhalte zurück. Das Artefakt ist ein lokaler Hinweisgeber vor dem Codex-Lauf: große Logs gehen zu `sparkompass tool-output`, allgemeine lange Eingaben zu `sparkompass pack`, repository-nahe Prompts zu `sparkompass handoff`. Der Hook ruft nur den regulaeren CLI-Befehl mit `--hook-payload --quiet-ok` auf, darf einen Lauf nicht blockieren und ersetzt keine ContextPack- oder Handoff-Verifikation.

## SparkompassPromptPreparation v1

`sparkompass prompt-prepare` und `sparkompass_prepare_prompt` erzeugen `SparkompassPromptPreparationV1`. Das Artefakt ist die aktive Schicht hinter der Advisory: Es nimmt eine geplante große Eingabe oder ein Hook-Payload, extrahiert den eigentlichen User-Prompt und baut daraus einen sendbaren kompakten Prompt.

Der vorbereitete Prompt enthält:

- `context_pack_id`, Source-Hash und Delivered-Context-Hash
- ContextPack-Gate, Fallback-Modus und kritische Anker
- Quellbeleg-Abdeckung und Akzeptanz-Orakel-Status
- kompakten gelieferten Kontext statt Rohprompt
- Sparbalken für gelieferten ContextPack-Kontext und für den tatsächlich sendbaren Prompt inklusive Metadaten

Die Gate-Regel folgt `pack`: Kritische Anker, Quellbelege und Erwartungen müssen bestehen; wenn die kompakte Fassung unsicher ist, wird erweitert oder auf Vollkontext zurückgefallen. Dadurch wird das Ergebnis nicht schlechter gemacht, nur um Tokens zu sparen. Auch dieses Artefakt ist kein interner Codex-Request-Rewriter. Es ist der belegte Prompt, den ein Nutzer oder Agent bewusst senden kann.

`sparkompass prompt-prepare --ledger`, `sparkompass prompt-ledger report` und `sparkompass_prompt_preparation_ledger` erzeugen `PromptPreparationLedgerV1`. Der Ledger unterscheidet die gelieferte ContextPack-Ersparnis von der sendbaren Prompt-Ersparnis inklusive Metadaten. Er berichtet verifizierte und review-pflichtige Vorbereitungen, p95 sendbare Prompt-Tokens, p95 gesparte Tokens, Fallback-Rate, Vollkontext-Fallbacks, schlechteste kritische Anker-Erhaltung und schlechteste Quellbeleg-Abdeckung. Damit wird sichtbar, ob diese Codex-nahe Fähigkeit über mehrere Nutzungen wirklich spart und dabei verifiziert bleibt.

## ContextEnvelopeLedger v1

`sparkompass envelope --ledger`, `sparkompass envelope-ledger add`, `sparkompass envelope-ledger report` und `sparkompass_envelope_ledger` erzeugen beziehungsweise lesen `ContextEnvelopeLedgerV1`.

Der Ledger speichert pro Envelope:

- Prompt-, Prefix-, Tail- und On-Demand-Tokens
- Stable-/Static-/Variable-/Full-Prompt-Hashes
- Gate-Status und Ziel
- Status der Prefix-Wiederverwendung gegen den vorherigen Ledger-Eintrag
- geschätzte wiederverwendete und invalidierte Prefix-Tokens

Die Summen zeigen, wie oft voller Prefix, nur statischer Prefix oder kein Prefix wiederverwendbar war. Damit wird Prompt-Layout-Qualität über mehrere Agenten-Turns messbar, ohne Prompt-Caching als echte Abrechnungsersparnis auszugeben.

## ContextGraph v1

`sparkompass graph` erzeugt `ContextGraphV1`:

- Knoten: semantische Einheiten aus dem Inventar
- Kanten: lokale Imports, Symbolreferenzen und Testbezuege
- Neighborhood: ein begrenzter Ausschnitt um ein Symbol oder Thema

Der Graph ist bewusst heuristisch. Er ersetzt noch keine vollständige AST- oder Datenflussanalyse, macht aber den nächsten Architekturpfad testbar: Codex kann vom Symbol zur Nachbarschaft springen und danach Belege gezielt laden.

## ProgramSlice v1

`sparkompass slice` erzeugt `ProgramSliceV1`. Für JavaScript/MJS nutzt es Acorn, für nicht unterstützte oder nicht parsebare Dateien fällt es sichtbar auf den heuristischen Modus zurück.

- Zielsymbol und Quellspan
- Code-Excerpt mit Hash
- direkte Calls mit optionaler Auflösung auf bekannte Symbole
- einfache Reads/Writes als Datenhinweise
- lokale Imports
- Testbezuege aus dem Context Graph
- Evidence-Block für Belege und späteres Nachladen
- `analysis.mode`, `parser` und `parser_version`, damit die Herkunft der Slice-Daten sichtbar bleibt

Die Qualität ist `verified-slice`, wenn keine Warnungen gefunden wurden. Bei unaufgelösten Calls oder ungewoehnlichen Spans meldet der Slice `review-needed`. Das ist absichtlich konservativ: Ein Slice darf beim Kontextsparen helfen, aber er darf Unsicherheit nicht als Vollständigkeit verkaufen.

## DataFlowTrace v1

`sparkompass flow` erzeugt `DataFlowTraceV1`:

- Startsymbol aus einem ProgramSlice
- aufgelöste Call-Kanten bis zu einer begrenzten Tiefe
- Argumentausdrücke und die Zielparameter, an die sie gebunden werden
- Identifiers innerhalb der Argumente
- Evidence-Hashes für Start- und Ziel-Slices
- konservative Warnungen bei unaufgelösten Kanten oder abgeschnittenen Traces

Der Trace ist keine vollständige statische Datenflussanalyse. Er ist ein belegbarer Zwischenstand: Codex kann sehen, welche Werte entlang bekannter Funktionscalls weitergereicht werden, und bei Unsicherheit gezielt Belege oder größeren Kontext nachladen.

## ContextCache, Delta und Lookup

`sparkompass cache` speichert ein `ContextCacheV1`. Die Einheiten werden über `identity_key` und `source_hash` verglichen.

`sparkompass delta` erzeugt `ContextDeltaV1`:

- stable
- added
- changed
- removed
- reuse percent

`sparkompass lookup` erzeugt `ContextLookupV1` und liefert passende Einheiten mit Quellbelegen unter einem Tokenbudget.

`sparkompass-mcp` macht diese Bausteine interaktiv nutzbar:

- `sparkompass_inventory`
- `sparkompass_lookup`
- `sparkompass_plan_context`
- `sparkompass_context_bom`
- `sparkompass_build_envelope`
- `sparkompass_control_report`
- `sparkompass_handoff_receipt`
- `sparkompass_handoff_ledger`
- `sparkompass_scorecard`
- `sparkompass_pilot_run`
- `sparkompass_impact_report`
- `sparkompass_release_audit`
- `sparkompass_experiment_plan`
- `sparkompass_experiment_script`
- `sparkompass_experiment_audit`
- `sparkompass_experiment_run`
- `sparkompass_doctor_overhead`
- `sparkompass_router_decision`
- `sparkompass_package_audit`
- `sparkompass_package_install_smoke`
- `sparkompass_plugin_install_smoke`
- `sparkompass_envelope_ledger`
- `sparkompass_expand_symbol`
- `sparkompass_load_evidence`
- `sparkompass_load_source_hash`
- `sparkompass_summarize_tool_output`
- `sparkompass_load_tool_output`
- `sparkompass_slice_symbol`
- `sparkompass_trace_flow`
- `sparkompass_cache_write`
- `sparkompass_delta`
- `sparkompass_pack`
- `sparkompass_verify_receipt`
- `sparkompass_verify_context_pack`
- `sparkompass_task_outcome`
- `sparkompass_task_outcome_ledger`
- `sparkompass_calibrate_context`
- `sparkompass_savings_ledger`
- `sparkompass_shadow_compare`
- `sparkompass_semantic_cache_add`
- `sparkompass_semantic_cache_lookup`

Damit kann Codex zuerst eine kleine Repository-Landkarte verwenden und Originalstellen nur nachladen, wenn eine Antwort, Änderung oder Prüfung diese Belege wirklich braucht.

## VerifiedSemanticCache v1

`sparkompass semantic-cache add` speichert einen lokalen `VerifiedSemanticCacheV1`-Eintrag mit:

- Query und Query-Termen
- budgetiert ausgewählten semantischen Abhängigkeiten
- Unit-Hashes und Datei-Hashes
- `SemanticCacheToolFingerprintV1` mit Node-, Sparkompass-, Dependency- und optionalen externen Tool-Versionen
- optionalem externem Orakel-Schluessel, zum Beispiel `npm test`
- optionalen Context-Erwartungen aus `--expect` und `--expect-regex`
- ContextPack Receipt und Kontext-Hash
- optionalem `SemanticCacheContextPackRegistryContractV1`, wenn `--registry` gesetzt wurde

`sparkompass semantic-cache lookup` ist nur ein Hit, wenn:

- die Query-Ähnlichkeit die `SemanticCacheVerificationPolicyV1`-Schwelle erreicht
- alle gespeicherten Abhängigkeiten im aktuellen Lookup vorhanden sind
- die Abhängigkeitsdateien unverändert sind
- der gespeicherte Tool-Fingerprint zum aktuellen Runtime-/Tool-Fingerprint passt
- ein gespeichertes Orakel erneut angegeben und identisch ist
- gespeicherte Context-Erwartungen erneut angegeben und identisch sind
- das gespeicherte ContextPack weiterhin 100% kritische Anker und 100% Quellbelege hat
- das gespeicherte ContextPack nicht riskant ist
- ein gespeicherter Registry-Vertrag, falls vorhanden, per `context_pack_id` und `ContextPackReceiptVerificationV1` erneut verifiziert werden kann

Die Policy ist adaptiv: Ohne Orakel oder Context-Erwartungen steigt die Mindest-Ähnlichkeit; mit exaktem Inventar und stabilen Dependencies darf sie sinken, bleibt aber größer als null. `--min-similarity` setzt bewusst eine explizite Schwelle. `--tool-version` bindet externe Werkzeuge wie Test-Runner, Compiler oder Linter in den Fingerprint ein; bei Abweichung wird der Cache-Treffer blockiert. Der Cache nutzt Ähnlichkeit also nur als Kandidatensuche. Die Freigabe passiert durch Verifikation.

## ToolOutputSummary v1

`sparkompass tool-output` und `sparkompass_summarize_tool_output` verdichten rohe Tool-Ausgaben, ohne sie inhaltlich umzuerzählen. Die Summary enthält:

- Rohdaten-Hash und `sparkompass://tool-output/...` Ref
- Exit-Code und Fehlerindikatoren
- erkannte Fehlercodes
- fehlgeschlagene Tests
- betroffene Dateien und Zeilen
- wiederholte relevante Zeilen
- erste Fehlerzeilen
- geschätzte Tokens und Ersparnis der Summary

Das ist für lange Test-, Build- und Lint-Ausgaben gedacht: Codex bekommt zuerst den strukturierten Befund. Rohdaten werden nur bei Bedarf gelesen oder mit `--store` lokal abgelegt. Ohne `--store` erzeugt der Befehl keine Workspace-Artefakte.

`sparkompass tool-output load` und `sparkompass_load_tool_output` bilden die Nachladestufe. Sie laden nur einen begrenzten Ausschnitt per Summary, Raw-Datei oder ID, können per `--pattern` zur ersten passenden Zeile springen und prüfen den Raw-Hash gegen die gespeicherte Summary. Damit wird ein langes Rohlog zum nachladbaren Beleg statt zum Startprompt.

## Benchmark v1

`sparkompass benchmark` vergleicht definierte Akzeptanzorakel gegen Vollkontext und gelieferten ContextPack. Das ist noch kein universeller Korrektheitsbeweis, aber es verschiebt die Kennzahl von "Tokens entfernt" zu "Tokens pro bestandener Aufgabe".

Der Benchmark prüft außerdem Gegenfakten: Für jede erwartete Soll-Fakt oder jedes Soll-Muster wird der passende Kontext testweise aus dem gelieferten Kontext entfernt. Das Benchmark-Gate bleibt nur grün, wenn das Oracle diesen Verlust erkennt. So testen wir nicht nur die Kompression, sondern auch die Wächter, die über ihre Qualität entscheiden.

Jeder Fall erzeugt zusätzlich ein `BenchmarkTaskOutcomeSummaryV1`, abgeleitet aus einem `TaskOutcomeReceiptV1`. Dieses Receipt gilt nur als verifiziert, wenn der simulierte Aufgaben-Output `TASK_SUCCESS=true`, `REGRESSION=false` und `COUNTERFACTUALS_OK=true` enthält und die Receipt-Prüfung bestanden ist. `BenchmarkContextPackQualityV1` prüft daneben die Pack-Qualität selbst: erlaubtes Gate, 100% kritische Anker, 100% Quellbelege, keine riskanten ContextPacks und keine Vollkontext-Fallbacks. `BenchmarkEfficiencyMetricsV1` macht die Produktkennzahl sichtbar: gelieferte Kontexttokens plus Benchmark-Outputtokens pro verifiziertem Task, Task-Erfolgsdelta gegen Vollkontext, p95 gesparte Tokens, Fallback-Rate, Nachlade-Rate und Cache-Hit-Rate. Damit wird der Benchmark dichter an die reale Codex-Frage gebunden: Hat der kleinere Kontext die Aufgabe noch erfolgreich getragen, und wie teuer war dieser verifizierte Erfolg?

Ein kleiner Failure-Corpus prüft typische gefährliche Verlustklassen: Negationen und Flags, exakte Zahlen/Versionen/Prioritäten, abgeschnittene Stacktraces, gleichnamige Symbole, Sicherheits-Datenfluss, dynamische Imports und Monorepo-Abhängigkeiten. `FailureCorpusCoverageV1` macht diese Pflichtklassen maschinenlesbar; `verified-benchmark` bleibt nur grün, wenn alle Pflichtklassen vorhanden und verifiziert sind. Der Benchmark nutzt im Repo die Fixture-Dateien und fällt außerhalb davon auf eingebaute Fixtures zurück. Die Details stehen in [docs/failure-corpus.md](failure-corpus.md).

Der Report enthält zusätzlich Worst-Case- und Kostenmetriken:

- schlechteste Ersparnis
- Tokens pro bestandenem Benchmark-Fall
- Gesamtkosten pro verifiziertem Benchmark-Task
- p95 gelieferte und gesparte Tokens
- Task-Erfolgsdelta gegen Vollkontext
- Fallback-, Nachlade- und Cache-Hit-Rate
- schlechtester Einzelfall
- verifizierte TaskOutcome-Erfolge

## Bewusste Spannung

Mehr Sparen kann schlechtere Antworten erzeugen. Mehr Schutz kann die Zielgröße überschreiten. Sparkompass entscheidet dann für den Inhalt: geschützte Fakten bleiben erhalten und die Ausgabe meldet die Warnung.

## Nicht-Verweigerung

`compress` gibt auch riskante Ergebnisse aus. Es blockiert nicht. Nutzer sollen den kompakten Text sehen können, aber dazu eine klare Warnung bekommen.

## Selbstkritische Fragen vor Releases

- Werden Fehlercodes, Dateipfade und Done-Kriterien gehalten?
- Besteht ein konkreter ShadowRun gegen dieselben Soll-Fakten und Soll-Muster wie der Vollkontext?
- Lässt sich ein gespeichertes ContextPack-Receipt gegen die Originalquelle und, wenn vorhanden, den gelieferten Kontext erneut verifizieren?
- Gibt es für wichtige Änderungen ein TaskOutcomeReceipt mit bestandenem Exit-Code, Output-Orakel und optionaler Receipt-Verifikation?
- Erkennen die Benchmark-Orakel absichtlich entfernte Soll-Fakten?
- Bestehen alle Failure-Corpus-Fälle?
- Wird ein schwacher Einzelfall sichtbar, statt im Durchschnitt zu verschwinden?
- Werden kritische Aussagen durch `sparkompass_load_evidence` belegbar?
- Werden semantische Cache-Treffer bei geänderten Abhängigkeiten oder falschem Orakel abgelehnt?
- Gibt es genug Ersparnis, damit der Schritt lohnt?
- Sind Warnungen klar genug, um riskante Verdichtung zu erkennen?
- Startet der Plugin-MCP-Server und beantwortet er mindestens `tools/list` und einen `tools/call`?
- Läuft `npm pack --dry-run`, ohne Testdaten oder lokale Dateien zu verpacken?
