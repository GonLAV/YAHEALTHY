# YAHEALTHY — Base44 Dev Environment

## Stack
- **Backend**: Node.js + Express (`YAHEALTHYbackend/`), port 5000. In-memory data by default.
- **Frontend**: Vite + React + TS (`YAHEALTHYFrontend/`), Vite dev server on 5173, mapped to host port 3000.
- Single-origin wiring: the Vite dev server proxies `/api` → backend. The proxy target is configurable via `API_PROXY_TARGET` (defaults to `http://localhost:5000`); in compose it's set to `http://backend:5000`.

## Running
```bash
docker compose -f docker-compose.base44.yml up -d --build
```
Frontend (preview): http://localhost:3000 · Backend API: proxied via `/api` on port 3000.

## Data / credentials
- The backend runs against an **in-memory store** (`ALLOW_MEMORY_DB=true`) so it boots with no external credentials. All data resets on restart.
- No secrets are required at boot. Optional external integrations (not wired in dev):
  - `SUPABASE_URL` / `SUPABASE_KEY` — persistent DB (Supabase project). Without them the backend uses in-memory mode.
  - `JWT_SECRET` — auto-generated per process in dev; set for stable sessions.
  - `AI_API_KEY` (Google Vision), `PLACES_API_KEY` (Google Places) — optional features.

## Quirks
- Both `vite.config.js` and `vite.config.ts` exist; Vite loads `.js` first. Keep them in sync.
- `YAHEALTHYbackend/` and `YAHEALTHYFrontend/` each contain compiled `.js` alongside `.ts`/`.tsx` sources.
- `Plugin/` and `docs/` are tooling/docs, not part of the running app.
