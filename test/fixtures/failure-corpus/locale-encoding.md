# Failure Corpus: Locale, Encoding und Normalisierung

## Muss exakt bleiben

- charset=UTF-8
- normalization=NFC
- locale=de-DE
- collation=de_DE.UTF-8
- case_sensitive=true for query "Ärger" != "ärger"

## Warum das kritisch ist

UTF-8 bewahrt Umlaute in München, Straße und Größe.
NFC verhindert Trefferverluste durch kombinierte Zeichen.
Die deutsche Locale sortiert Ä, Ö, Ü und ß bewusst anders als rohe Bytes.
case_sensitive=true verhindert, dass Ärger und ärger gleich behandelt werden.
Falsches Encoding macht aus Müller schnell kaputte Such- und Slug-Daten.

## Rauschen

Die Internationalisierungsnotiz wiederholt allgemeine UI-Hinweise.
Die Internationalisierungsnotiz wiederholt allgemeine UI-Hinweise.
Die Internationalisierungsnotiz wiederholt allgemeine UI-Hinweise.
Die Internationalisierungsnotiz wiederholt allgemeine UI-Hinweise.
Die Internationalisierungsnotiz wiederholt allgemeine UI-Hinweise.
