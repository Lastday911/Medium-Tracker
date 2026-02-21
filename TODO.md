# Medium Tracker - Dynamik-Roadmap

## Phase 1 - Datenmodell und Basis-Infrastruktur
- [x] PostgreSQL anbinden (Render Postgres)
- [x] Migrationen einführen
- [x] Tabellen anlegen: `categories`, `prompt_templates`, `output_schemas`, `model_policies`, `search_history`, `feature_flags`, `app_settings`
- [x] Seed-Daten aus aktueller Hardcodierung übernehmen
- [x] Basis-Skripte für Setup (`db:migrate`, `db:seed`) ergänzen

## Phase 2 - Backend entkoppeln (Hardcodierung entfernen)
- [x] Kategorien aus DB laden statt aus Konstanten
- [x] Output-Schema versioniert aus DB laden
- [x] OpenAI-Request-Parameter aus Policies/Settings aufbauen
- [x] Deutsche Fehlertexte bei fehlender/inkonsistenter Konfiguration

## Phase 3 - History-Feature
- [x] Suchläufe in `search_history` speichern (ohne API-Key)
- [x] Endpunkte für Verlauf ergänzen (`GET /api/history`, `GET /api/history/:id`, optional `DELETE /api/history/:id`)
- [x] Verlauf im UI anzeigen und Ergebnisse erneut öffnen/exportieren

## Phase 4 - Kategorien im UI verwalten
- [x] Admin-Endpunkte für Kategorien (`POST/PATCH/DELETE /api/admin/categories`)
- [x] Einfachen Admin-Schutz über `ADMIN_TOKEN` ergänzen
- [x] Admin-UI zum Erstellen/Bearbeiten/Deaktivieren von Kategorien
- [x] Kategorie-Dropdown vollständig dynamisch aus API laden

## Phase 5 - Weitere Dynamik
- [x] Prompt-Templates im Admin editierbar + versionierbar machen
- [x] Modell-Policies editierbar machen
- [x] Feature-Flags für Rollouts integrieren
- [ ] Optional: Favoriten, Saved Searches, Tags/Notizen

## Phase 6 - Qualität, Sicherheit und Rollout
- [x] API-/Integrations-Tests für Konfig- und History-Flows
- [x] Frontend-E2E für Verify, Suche, Verlauf, Export, Shares
- [x] Strukturierte Logs ohne Secret-Leaks
- [x] Rollout in Stufen (Read-only Config -> Admin-Schreibzugriff)
