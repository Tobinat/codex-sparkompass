# Failure Corpus: Money Currency und Rundung

## Muss exakt bleiben

- amount_cents=123456
- currency=EUR
- vat_rate=19%
- fee_bps=30
- rounding_mode=half_up
- minor_units=2

## Warum das kritisch ist

Der Betrag wird in kleinster Einheit gespeichert und darf nicht als grober Dezimalwert interpretiert werden.
Der ISO-Waehrungscode entscheidet ueber Buchhaltung, Auszahlung und Anzeige.
Der Steuerprozentsatz ist Bestandteil der Rechnung und muss exakt bleiben.
Die Plattformgebuehr wird in Basispunkten berechnet.
Die Rundungsregel verhindert Cent-Differenzen zwischen Auftrag, Rechnung und Zahlung.
Die Anzahl der Nachkommastellen ist fuer diese Waehrung fest definiert.

## Rauschen

Die Billing-Notiz wiederholt allgemeine Checkout-Hinweise.
Die Billing-Notiz wiederholt allgemeine Checkout-Hinweise.
Die Billing-Notiz wiederholt allgemeine Checkout-Hinweise.
Die Billing-Notiz wiederholt allgemeine Checkout-Hinweise.
Die Billing-Notiz wiederholt allgemeine Checkout-Hinweise.
