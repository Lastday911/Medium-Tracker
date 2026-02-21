# AGENTS.md

## Project Overview

This repository contains **Medium Tracker**:
- Frontend: static files in `public/`
- Backend: Node.js + Express in `src/server.js`
- Database: PostgreSQL (runtime configuration, history, admin configuration)
- Goal: find current, complex AI topics for Medium via the OpenAI API

The app is designed for German-language usage.

## Implementation Status

- Phase 1 completed: DB model, migrations, seeds
- Phase 2 completed: backend decoupled from hardcoding (runtime config from DB)
- Phase 3 completed: history endpoints + history UI
- Phase 4 completed: category admin endpoints + admin UI + `ADMIN_TOKEN` protection
- Phase 5 completed: prompt template versioning, model policy management, feature flags
- Phase 6 completed: API/UI tests, structured logs with secret redaction, rollout mechanism

## Local Start

```bash
npm install
npm start
```

Then: `http://localhost:3000`

Recommended environment variables:

- `DATABASE_URL` (required for DB-backed operation)
- `ADMIN_TOKEN` (required for admin endpoints)
- `LOG_LEVEL=debug` (optional)
- `LOG_SILENT=true` (optional, especially for tests)

## Important Routes

Public:
- `GET /health`
- `POST /api/verify-key`
- `GET /api/models` (header: `x-openai-api-key`)
- `GET /api/categories`
- `POST /api/find-topics` (body: `apiKey`, `model`, optional `category`)
- `GET /api/history`
- `GET /api/history/:id`
- `DELETE /api/history/:id`

Admin (header: `x-admin-token`, alternatively `Authorization: Bearer <token>`):
- `GET /api/admin/feature-flags`
- `PUT /api/admin/feature-flags/:flagKey`
- `GET /api/admin/categories`
- `POST /api/admin/categories`
- `PATCH /api/admin/categories/:slug`
- `DELETE /api/admin/categories/:slug` (disables category)
- `GET /api/admin/prompt-templates`
- `POST /api/admin/prompt-templates/versions`
- `POST /api/admin/prompt-templates/activate`
- `GET /api/admin/model-policies`
- `POST /api/admin/model-policies`
- `PATCH /api/admin/model-policies/:modelId`
- `DELETE /api/admin/model-policies/:modelId`

## Rollout Rules

Feature flags control rollout and write access:

- `history_enabled`
- `category_admin_enabled`
- `dynamic_config_enabled`
- `admin_write_enabled` (important for admin write access)

Important:
- Admin reads can be active while writes remain read-only.
- Write routes are blocked as long as `admin_write_enabled` is not active for the request.

## Product Rules

- Never persist or log the API key.
- Limit results to **a maximum of 5 topics**.
- Categories for topic search:
  - `general_trends` (general AI trends)
  - `engineering_research` (AI engineering & research)
  - `business_strategy` (AI in business & productivity)
- Provide a top recommendation with title, summary, and focus points.
- Keep UI text in German.
- Result actions must work:
  - Copy text
  - Send to Telegram
  - Send to WhatsApp
  - Save as JSON
  - Save as Markdown
- History flow must work (load + delete)
- Admin flow must work (category/prompt/policy/flags)

## Code Rules

- Do not break existing functionality.
- Do not introduce dead or duplicate code paths.
- Keep changes small and traceable.
- User-facing error messages must be clear and in German.
- Keep structured logs (JSON events).
- Never output secrets in logs (respect redaction).

## Quick Tests Before Completion

```bash
node --check src/server.js
node --check public/app.js
npm run test:api
npm run test:ui
# or full suite:
npm test
```

Optional manual checks:
1. Verify API key
2. Select model
3. Select category
4. Start topic search
5. Test copy/Telegram/WhatsApp/export buttons
6. Test loading/deleting history
7. Open admin area (with `ADMIN_TOKEN`)
8. Create/edit/disable category
9. Create/activate prompt template version
10. Create/edit/delete model policy
11. Set feature flags (including `admin_write_enabled`)

## Deployment Note

The app is ready for Render (`npm install`, `npm start`).
Before deploying, make sure:

- `DATABASE_URL` is set
- `ADMIN_TOKEN` is set
- Feature flags in DB are set according to the rollout plan
