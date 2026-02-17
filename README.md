# Medium Tracker

**Medium Tracker** ist eine Open-Source-Webapp für Medium-Autoren, die schnell aktuelle, komplexe und trendende KI-Themen finden wollen.

Die App nutzt OpenAI-Modelle mit Websuche, liefert genau **5 Themen**, eine **Top-Empfehlung** und bietet direkte Weitergabe per Copy/Telegram/WhatsApp sowie Export als JSON/Markdown.

## Features

- OpenAI API-Key im UI eingeben und serverseitig verifizieren
- Dynamischer Modelselektor über `GET /v1/models`
- Themensuche über Responses API + Websuche
- Aktuell auf eine Suchkategorie beschränkt: **Künstliche Intelligenz (AI)**
- Exakt 5 Themen + 1 Top-Empfehlung mit Fokuspunkten
- Aktionen:
  - Text kopieren
  - In Telegram senden
  - An WhatsApp senden
  - Als JSON speichern
  - Als Markdown speichern
- Für Render-Deployment vorbereitet

## Tech Stack

- Node.js
- Express
- Vanilla HTML/CSS/JavaScript

## Lokal starten

```bash
npm install
npm start
```

Danach im Browser öffnen:

`http://localhost:3000`

## Nutzung

1. API-Key eintragen (`sk-...`)
2. `API verifizieren` klicken
3. Modell auswählen
4. `Suche mir nach einem Thema` klicken
5. Ergebnis weitergeben oder exportieren

## API-Endpunkte

- `GET /health`
- `POST /api/verify-key`
  - Body: `{ "apiKey": "sk-..." }`
- `GET /api/models`
  - Header: `x-openai-api-key: sk-...`
- `POST /api/find-topics`
  - Body: `{ "apiKey": "sk-...", "model": "gpt-5.2" }`

## Sicherheit

- API-Key wird nicht persistiert
- API-Key wird nur pro Request verwendet
- Keine API-Keys in Git committen

## Render Deployment

1. Repository zu GitHub pushen
2. In Render neuen `Web Service` aus dem Repo erstellen
3. Build Command: `npm install`
4. Start Command: `npm start`
5. Deploy ausführen

## Troubleshooting

- `unsupported parameter`
  - Manche Modelle unterstützen bestimmte Parameter nicht
  - Lösung: anderes aktuelles GPT-Modell wählen
- `Model cannot ...`
  - Das Modell unterstützt die Operation (z. B. Websuche) nicht
  - Lösung: Modell wechseln
- `Response cannot be parsed in JSON`
  - App nutzt automatische JSON-Reparatur
  - Falls weiterhin Fehler: erneut suchen oder anderes Modell wählen
- Timeout bei Suche
  - Websuche kann dauern
  - Lösung: erneut suchen oder anderes Modell wählen

## Lizenz

MIT (siehe `package.json`; optional zusätzlich `LICENSE` Datei hinzufügen)
