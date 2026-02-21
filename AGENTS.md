# AGENTS.md

## Projektueberblick

Dieses Repository enthaelt **Medium Tracker**:
- Frontend: statische Dateien in `public/`
- Backend: Node.js + Express in `src/server.js`
- Datenbank: PostgreSQL (Runtime-Konfiguration, Verlauf, Admin-Konfiguration)
- Ziel: aktuelle, komplexe KI-Themen fuer Medium per OpenAI API finden

Die App ist auf Deutsch ausgerichtet.

## Umsetzungsstatus

- Phase 1 abgeschlossen: DB-Modell, Migrationen, Seeds
- Phase 2 abgeschlossen: Backend entkoppelt von Hardcodierung (Runtime-Config aus DB)
- Phase 3 abgeschlossen: History-Endpunkte + History-UI
- Phase 4 abgeschlossen: Kategorie-Admin-Endpunkte + Admin-UI + `ADMIN_TOKEN` Schutz
- Phase 5 abgeschlossen: Prompt-Template-Versionierung, Modell-Policy-Verwaltung, Feature-Flags
- Phase 6 abgeschlossen: API-/UI-Tests, strukturierte Logs mit Secret-Redaction, Rollout-Mechanik

## Lokaler Start

```bash
npm install
npm start
```

Danach: `http://localhost:3000`

Empfohlene Umgebungsvariablen:

- `DATABASE_URL` (erforderlich fuer DB-gestuetzten Betrieb)
- `ADMIN_TOKEN` (erforderlich fuer Admin-Endpunkte)
- `LOG_LEVEL=debug` (optional)
- `LOG_SILENT=true` (optional, v. a. fuer Tests)

## Wichtige Routen

Oeffentlich:
- `GET /health`
- `POST /api/verify-key`
- `GET /api/models` (Header: `x-openai-api-key`)
- `GET /api/categories`
- `POST /api/find-topics` (Body: `apiKey`, `model`, optional `category`)
- `GET /api/history`
- `GET /api/history/:id`
- `DELETE /api/history/:id`

Admin (Header: `x-admin-token`, alternativ `Authorization: Bearer <token>`):
- `GET /api/admin/feature-flags`
- `PUT /api/admin/feature-flags/:flagKey`
- `GET /api/admin/categories`
- `POST /api/admin/categories`
- `PATCH /api/admin/categories/:slug`
- `DELETE /api/admin/categories/:slug` (deaktiviert Kategorie)
- `GET /api/admin/prompt-templates`
- `POST /api/admin/prompt-templates/versions`
- `POST /api/admin/prompt-templates/activate`
- `GET /api/admin/model-policies`
- `POST /api/admin/model-policies`
- `PATCH /api/admin/model-policies/:modelId`
- `DELETE /api/admin/model-policies/:modelId`

## Rollout-Regeln

Feature-Flags steuern Rollout und Schreibzugriffe:

- `history_enabled`
- `category_admin_enabled`
- `dynamic_config_enabled`
- `admin_write_enabled` (wichtig fuer Admin-Schreibzugriffe)

Wichtig:
- Admin-Reads koennen aktiv sein, waehrend Writes read-only bleiben.
- Write-Routen sind gesperrt, solange `admin_write_enabled` nicht fuer den Request aktiv ist.

## Produktregeln

- API-Key niemals persistieren oder loggen.
- Ergebnisse auf **maximal 5 Themen** begrenzen.
- Kategorien fuer die Themensuche:
  - `general_trends` (Allgemeine KI-Trends)
  - `engineering_research` (KI-Engineering & Forschung)
  - `business_strategy` (KI in Business & Produktivitaet)
- Top-Empfehlung mit Ueberschrift, Zusammenfassung und Fokuspunkten liefern.
- UI-Texte auf Deutsch halten.
- Ergebnisaktionen muessen funktionieren:
  - Text kopieren
  - In Telegram senden
  - An WhatsApp senden
  - Als JSON speichern
  - Als Markdown speichern
- History-Flow muss funktionieren (Laden + Loeschen)
- Admin-Flow muss funktionieren (Kategorie/Prompt/Policy/Flags)

## Code-Regeln

- Bestehende Funktionalitaet nicht brechen.
- Keine toten oder doppelten Codepfade einfuehren.
- Aenderungen klein und nachvollziehbar halten.
- Fehlertexte fuer Nutzer klar und auf Deutsch formulieren.
- Strukturierte Logs beibehalten (JSON-Events).
- Niemals Secrets im Log ausgeben (Redaction beachten).

## Schnelltests vor Abschluss

```bash
node --check src/server.js
node --check public/app.js
npm run test:api
npm run test:ui
# oder komplett:
npm test
```

Optional manuell pruefen:
1. API-Key verifizieren
2. Modell auswaehlen
3. Kategorie auswaehlen
4. Themensuche starten
5. Copy/Telegram/WhatsApp/Export-Buttons testen
6. Verlauf laden/loeschen testen
7. Admin laden (mit `ADMIN_TOKEN`)
8. Kategorie anlegen/bearbeiten/deaktivieren
9. Prompt-Template-Version erstellen/aktivieren
10. Modell-Policy erstellen/bearbeiten/loeschen
11. Feature-Flags setzen (inkl. `admin_write_enabled`)

## Deployment-Hinweis

Die App ist fuer Render geeignet (`npm install`, `npm start`).
Vor Deploy sicherstellen:

- `DATABASE_URL` gesetzt
- `ADMIN_TOKEN` gesetzt
- Feature-Flags in DB passend zum Rollout-Plan gesetzt
