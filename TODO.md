# Medium Tracker - Dynamic Roadmap

## Phase 1 - Data Model and Base Infrastructure
- [x] Connect PostgreSQL (Render Postgres)
- [x] Introduce migrations
- [x] Create tables: `categories`, `prompt_templates`, `output_schemas`, `model_policies`, `search_history`, `feature_flags`, `app_settings`
- [x] Transfer seed data from current hardcoding
- [x] Add base setup scripts (`db:migrate`, `db:seed`)

## Phase 2 - Decouple Backend (Remove Hardcoding)
- [x] Load categories from DB instead of constants
- [x] Load versioned output schema from DB
- [x] Build OpenAI request parameters from policies/settings
- [x] German error messages for missing/inconsistent configuration

## Phase 3 - History Feature
- [x] Store search runs in `search_history` (without API key)
- [x] Add history endpoints (`GET /api/history`, `GET /api/history/:id`, optional `DELETE /api/history/:id`)
- [x] Show history in UI and reopen/export results

## Phase 4 - Manage Categories in UI
- [x] Admin endpoints for categories (`POST/PATCH/DELETE /api/admin/categories`)
- [x] Add simple admin protection via `ADMIN_TOKEN`
- [x] Admin UI for creating/editing/disabling categories
- [x] Load category dropdown fully dynamic from API

## Phase 5 - More Dynamic Behavior
- [x] Make prompt templates editable + versioned in admin
- [x] Make model policies editable
- [x] Integrate feature flags for rollouts
- [ ] Optional: favorites, saved searches, tags/notes

## Phase 6 - Quality, Security, and Rollout
- [x] API/integration tests for config and history flows
- [x] Frontend E2E for verify, search, history, export, shares
- [x] Structured logs without secret leaks
- [x] Staged rollout (read-only config -> admin write access)
