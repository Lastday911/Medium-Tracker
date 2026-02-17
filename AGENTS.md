# AGENTS.md

## Projektueberblick

Dieses Repository enthaelt **Medium Tracker**:
- Frontend: statische Dateien in `public/`
- Backend: Node.js + Express in `src/server.js`
- Ziel: aktuelle, komplexe KI-Themen fuer Medium per OpenAI API finden

Die App ist auf Deutsch ausgerichtet.

## Lokaler Start

```bash
npm install
npm start
```

Danach: `http://localhost:3000`

## Wichtige Routen

- `GET /health`
- `POST /api/verify-key`
- `GET /api/models` (Header: `x-openai-api-key`)
- `POST /api/find-topics`

## Produktregeln

- API-Key niemals persistieren oder loggen.
- Ergebnisse auf **maximal 5 Themen** begrenzen.
- Top-Empfehlung mit Ueberschrift, Zusammenfassung und Fokuspunkten liefern.
- UI-Texte auf Deutsch halten.
- Ergebnisaktionen muessen funktionieren:
  - Text kopieren
  - In Telegram senden
  - An WhatsApp senden
  - Als JSON speichern
  - Als Markdown speichern

## Code-Regeln

- Bestehende Funktionalitaet nicht brechen.
- Keine toten oder doppelten Codepfade einfuehren.
- Aenderungen klein und nachvollziehbar halten.
- Fehlertexte fuer Nutzer klar und auf Deutsch formulieren.

## Schnelltests vor Abschluss

```bash
node --check src/server.js
node --check public/app.js
```

Optional manuell pruefen:
1. API-Key verifizieren
2. Modell auswaehlen
3. Themensuche starten
4. Copy/Telegram/WhatsApp/Export-Buttons testen

## Deployment-Hinweis

Die App ist fuer Render geeignet (`npm install`, `npm start`).

