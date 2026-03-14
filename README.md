# Medium Tracker

**Medium Tracker** is an open-source web app for Medium authors who want to quickly find current, complex, and trending AI topics.

The app uses OpenAI models with web search, returns exactly **5 topics**, one **top recommendation**, and supports direct sharing via Copy/Telegram/WhatsApp plus export as JSON/Markdown.

## Features

- Enter OpenAI API key in the UI and verify it server-side
- Dynamic model selector via `GET /v1/models`
- Topic search via the Responses API + `web_search`
- Dynamic categories from runtime config / fallback config
- Exactly 5 topics + 1 top recommendation with focus points
- Actions:
  - Copy text
  - Send to Telegram
  - Send to WhatsApp
  - Save as JSON
  - Save as Markdown
- Ready for Render deployment

## Tech Stack

- Node.js
- Express
- Vanilla HTML/CSS/JavaScript

## Run Locally

The app loads variables automatically from `.env` and `.env.local` if present.

```bash
npm install
npm start
```

Then open in the browser:

`http://localhost:3000`

### Local Fallback Mode

If no `DATABASE_URL` is configured, the app now starts in a built-in fallback mode:

- categories, prompt template, output schema, and model policies are loaded from local defaults
- API key verification and model loading still work
- topic search still works
- history and admin remain disabled until PostgreSQL is configured

## Usage

1. Enter API key (`sk-...`)
2. Click `Verify API`
3. Select a model (the first compatible model is preselected automatically)
4. Click `Find me a topic`
5. Share or export the result

## API Endpoints

- `GET /health`
- `POST /api/verify-key`
  - Body: `{ "apiKey": "sk-..." }`
- `GET /api/models`
  - Header: `x-openai-api-key: sk-...`
- `POST /api/find-topics`
  - Body: `{ "apiKey": "sk-...", "model": "gpt-5.4" }`
- `GET /api/categories`

### Admin Endpoints (Header: `x-admin-token: <ADMIN_TOKEN>`)

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
- `GET /api/admin/feature-flags`
- `PUT /api/admin/feature-flags/:flagKey`

## Tests

- `npm test` (full suite)
- `npm run test:api` (API/integration tests)
- `npm run test:ui` (frontend flow tests for verify, search, history, export, shares)

## Logging

- Structured JSON logs with events (`http_request_started`, `http_request_finished`, error events)
- Secret redaction for API keys/tokens in log data
- Optional for tests: `LOG_SILENT=true`

## Rollout Strategy (Read-only -> Write)

- Feature flag `admin_write_enabled` controls admin write access to configuration.
- By default, the admin area is read-only.
- Write access is enabled in a controlled rollout via flag (for example, `enabled=true`, `rollout_percent=100`).

## Security

- API key is not persisted
- API key is only used per request
- Do not commit API keys to Git

## Render Deployment

1. Push repository to GitHub
2. Create a new `Web Service` in Render from the repo
3. Build Command: `npm install`
4. Start Command: `npm start`
5. Set environment variables (`DATABASE_URL`, optional `ADMIN_TOKEN` for admin area)
6. Run deployment

## Troubleshooting

- `unsupported parameter`
  - Some models do not support certain parameters
  - Solution: choose a different current GPT model
- `Model cannot ...`
  - The model does not support the operation (for example, web search)
  - Solution: switch model
- `Response cannot be parsed in JSON`
  - App uses automatic JSON repair
  - If it still fails: run search again or choose another model
- Search timeout
  - Web search can take time
  - Solution: run search again or choose another model

## OpenAI Integration Notes

The app follows the current OpenAI API pattern:

- key verification and model listing via `GET /v1/models`
- topic generation via `POST /v1/responses`
- web grounding via `tools: [{ "type": "web_search" }]`
- structured output via `text.format` with JSON schema

## License

MIT (see `package.json`; optionally add a separate `LICENSE` file)
