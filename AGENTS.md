# YAHEALTHY — Base44 Dev Environment

## Architecture
- **Frontend**: Vite 5 + React 18 + TypeScript + Tailwind, served on port 5173 (mapped to host 3000)
- **Backend**: Express 5 + Node.js, served on port 5000 (internal + exposed)
- **Database**: Supabase in production; in-memory store in dev (`ALLOW_MEMORY_DB=true`)
- **Auth**: JWT-based, bcrypt password hashing
- **i18n**: Bilingual Hebrew (RTL) / English (LTR). `src/i18n/translations.ts` holds all strings; `LanguageContext` sets `document.documentElement.dir`; toggle persists in `localStorage` (`yahealthy-lang`). Coach endpoints take `?lang=he|en`.

## Key Setup Notes
- **vite.config.js vs .ts**: Vite loads `vite.config.js` first — keep it in sync with `.ts` when changing config. The compiled `.js` duplicates under `src/` were removed; `.tsx` files are the single source of truth.
- **Proxy**: Frontend proxies `/api` to the backend. Proxy target comes from `VITE_PROXY_TARGET` (defaults to `http://localhost:5000`); in Docker it points to `http://backend:5000`.
- **`VITE_API_URL`** is left empty so the frontend uses same-origin relative paths through the Vite proxy (single-origin wiring).
- **Backend env**: `ALLOW_MEMORY_DB=true` lets the backend start without Supabase. `JWT_SECRET` is auto-generated if missing in dev mode.
- **AI Coach**: `utils/coach.js` (rule-based, data-grounded, bilingual) mounted at `/api/crm/users/:userId/insights` and `/ask` in index.js. The old `crm-routes.js`/`crm-ai-assistant.js` prototype (OpenAI + Postgres pool) was never integrated — do not wire it as-is.
- **RTL**: Tailwind logical utilities (`ms-`, `ps-`, `text-start`, `start-*`) are used throughout; avoid `ml-`/`mr-`/`space-x`. `.num` class keeps numbers LTR inside RTL text.

## Frontend structure
- `src/i18n/` — translations + LanguageContext (add all user-facing strings here)
- `src/components/layout/AppLayout.tsx` — sidebar (desktop) + bottom nav (mobile) + language toggle
- `src/components/ui/` — PageHeader, StatCard, ProgressBar, ProgressRing, EmptyState
- `src/pages/` — Login, Signup, Dashboard, FoodLog, Hydration, Sleep, Weight, Coaching

## Verify It Works
```bash
docker compose -f docker-compose.base44.yml up -d
curl http://localhost:3000/api/health   # should return JSON status
curl http://localhost:3000              # should return Vite HTML (lang="he" dir="rtl")
```

## Dev Commands
- Frontend: `npm run dev` (Vite with HMR)
- Backend: `npm run dev` (nodemon with auto-reload)
- Both run inside Docker containers with bind-mounted source.
- Type check: `node_modules/.bin/tsc -p /tmp/tsconfig.check.json` (or `npx tsc -b` — note the pre-existing TS6310 reference quirk in tsconfig.node.json).
