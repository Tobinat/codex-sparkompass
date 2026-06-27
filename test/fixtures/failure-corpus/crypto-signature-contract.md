# Failure Corpus: Crypto Signature und Hashvertrag

## Muss exakt bleiben

- alg=RS256
- kid=prod-key-2026-07
- jwks_uri=https://auth.example.com/.well-known/jwks.json
- expected_sha256=sha256:9f4c2e1d8b7a6c5d4e3f2019a8b7c6d5e4f30192837465abcdefabcdef123456
- signature_header=X-Sparkompass-Signature

## Warum das kritisch ist

Der Signaturalgorithmus ist asymmetrisch und darf nicht zu einem symmetrischen Verfahren vereinfacht werden.
Der Key-Identifier waehlt den richtigen oeffentlichen Schluessel.
Die JWKS-Adresse ist die einzige erlaubte Quelle fuer Verifikationskeys.
Der erwartete Digest beweist die unveraenderte Artefaktdatei.
Der Header-Name muss exakt bleiben, weil Middleware nur diesen Header prueft.

## Rauschen

Die Signatur-Notiz wiederholt allgemeine Sicherheits-Hinweise.
Die Signatur-Notiz wiederholt allgemeine Sicherheits-Hinweise.
Die Signatur-Notiz wiederholt allgemeine Sicherheits-Hinweise.
Die Signatur-Notiz wiederholt allgemeine Sicherheits-Hinweise.
Die Signatur-Notiz wiederholt allgemeine Sicherheits-Hinweise.
