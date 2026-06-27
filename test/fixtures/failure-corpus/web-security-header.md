# Failure Corpus: Web Security Header und Cookies

## Muss exakt bleiben

- Set-Cookie: session=opaque; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=900
- Access-Control-Allow-Origin: https://app.example.com
- Access-Control-Allow-Credentials: true
- Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-r4nd0m'; frame-ancestors 'none'
- csrf_header=X-CSRF-Token required, reject missing Origin mismatch

## Warum das kritisch ist

Das Cookie darf nicht ohne HttpOnly, Secure, SameSite, Path oder Max-Age ausgeliefert werden.
Die CORS-Origin muss exakt auf die App-Domain begrenzt bleiben.
Credentials duerfen nur zusammen mit der expliziten Origin erlaubt sein.
Die CSP-Nonce und frame-ancestors 'none' verhindern Script- und Framing-Regressions.
Der CSRF-Header ist Pflicht und muss bei Origin-Mismatch ablehnen.

## Rauschen

Die Web-Security-Notiz erklaert allgemeine Browser-Schutzmechanismen.
Die Web-Security-Notiz erklaert allgemeine Browser-Schutzmechanismen.
Die Web-Security-Notiz erklaert allgemeine Browser-Schutzmechanismen.
Die Web-Security-Notiz erklaert allgemeine Browser-Schutzmechanismen.
Die Web-Security-Notiz erklaert allgemeine Browser-Schutzmechanismen.
