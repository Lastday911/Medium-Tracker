# Medium Tracker - Nächste TODOs

- [ ] Backend-Rate-Limiting für `/api/verify-key`, `/api/models` und `/api/find-topics` einbauen.
- [ ] Serverseitige Logging-Strategie ergänzen (strukturierte Logs ohne API-Key-Leaks).
- [ ] E2E-Tests mit Playwright anlegen (Verify-Flow, Modellauswahl, Suche, Export, Share-Buttons).
- [ ] Unit-Tests für Frontend-Helferfunktionen (Markdown/JSON-Export, Share-Text, Clipboard-Fallback).
- [ ] API-Fehlermatrix dokumentieren (429, Timeout, Modell inkompatibel, Tool nicht unterstützt).
- [ ] Caching für Modellliste pro API-Key-Session einführen, um unnötige API-Calls zu reduzieren.
- [ ] Security Hardening ergänzen (`helmet`, CORS-Restriktion, Request-Size/Timeout-Guards).
- [ ] `render.yaml` ergänzen, damit Render-Deployment reproduzierbar per Repo funktioniert.
- [ ] GitHub-Standards ergänzen (`LICENSE` Datei, `CONTRIBUTING.md`, Issue-/PR-Templates).
- [ ] Optionalen "Schnellmodus" vs. "Tiefenanalyse" für Websuche im UI ergänzen.
