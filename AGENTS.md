# YAHEALTHY — Base44 Dev Environment

## Architecture
- **Frontend**: `YAHEALTHYFrontend` — Vite 5 + React 18 + TypeScript + Tailwind, served on port 5173 (mapped to host 3000)
- **Backend**: `YAHEALTHYbackend` — Express 5 + Node.js (CommonJS), served on port 5000 (internal + exposed), JWT auth, bcrypt hashing
- **Database**: Supabase in production; in-memory store in dev (`ALLOW_MEMORY_DB=true`). Without `SUPABASE_URL`/`SUPABASE_KEY` data resets on backend restart.
- **i18n**: Bilingual Hebrew (RTL) / English (LTR). `src/i18n/translations.ts` holds all strings; `LanguageContext` sets `document.documentElement.dir`; toggle persists in `localStorage` (`yahealthy-lang`). Coach endpoints take `?lang=he|en`.

## Key Setup Notes
- **vite.config.js vs .ts**: Vite loads `vite.config.js` first — keep it in sync with `.ts` when changing config.
- **Proxy**: Frontend proxies `/api` to the backend. Proxy target comes from `VITE_PROXY_TARGET` (defaults to `http://localhost:5000`); in Docker it points to `http://backend:5000`.
- **`VITE_API_URL`** is left empty so the frontend uses same-origin relative paths through the Vite proxy (single-origin wiring).
- **Backend env**: `ALLOW_MEMORY_DB=true` lets the backend start without Supabase. `JWT_SECRET` is auto-generated if missing in dev mode.
- **AI Coach**: `utils/coach.js` (rule-based, data-grounded, bilingual) mounted at `/api/crm/users/:userId/insights` and `/ask` in index.js. The old `crm-routes.js`/`crm-ai-assistant.js` prototype (OpenAI + Postgres pool) was never integrated — do not wire it as-is.
- **RTL**: Tailwind logical utilities (`ms-`, `ps-`, `text-start`, `start-*`) are used throughout; avoid `ml-`/`mr-`/`space-x`. `.num` class keeps numbers LTR inside RTL text.
- **Backend secrets** come from `/run/base44/app.env` (JWT_SECRET, optional SUPABASE_*); local dev placeholders are fine.

## Frontend structure
- `src/i18n/` — translations + LanguageContext (add all user-facing strings here)
- `src/components/layout/AppLayout.tsx` — sidebar (desktop) + bottom nav (mobile) + language toggle + skip link
- `src/components/ui/` — PageHeader, StatCard, ProgressBar, ProgressRing, EmptyState
- `src/pages/` — Login, Signup, Dashboard, FoodLog, Hydration, Sleep, Weight, Coaching, Recipes

## Quirks
- **Never commit compiled `.js` next to `.tsx`**: Vite resolves `.js` BEFORE `.tsx` for extensionless imports, so a stale `tsc -b` artifact silently overrides your source edits. If `tsc -b` is run, delete the emitted `.js` files again (see `.gitignore`).
- `YAHEALTHYbackend/index.js.backup`, `Plugin/`, and the many `*.md`/`CRM_*` docs are historical; don't touch them.
- The merge that brought `main` in (2026-09) had to reconstruct `CoachingPage.tsx` and `App.tsx` from commit `521550a` — `main` itself contained a broken splice of both (duplicate declarations). Coaching keeps the automated bilingual chat (`crmApi.askCoach`) by product decision.

## Accessibility standard (keep new UI to this)
Skip-to-content link, `<main>` landmark, `aria-current` nav links, labeled inputs (`htmlFor`/`id`), `role="alert"` form errors, `role="status" aria-live` loading/response regions, chart text alternative (`figcaption.sr-only`), `focus-visible` ring + `prefers-reduced-motion` in `index.css`, Delete buttons with food-name `aria-label`.

## Verify It Works
```bash
docker compose -f docker-compose.base44.yml up -d
curl http://localhost:5000/api/health   # backend health (also via proxy: :3000/api/health)
curl http://localhost:3000              # should return Vite HTML (lang="he" dir="rtl")
```

## Dev Commands
- Frontend: `npm run dev` (Vite with HMR)
- Backend: `npm run dev` (nodemon with auto-reload)
- Both run inside Docker containers with bind-mounted source.
- Type check: `node_modules/.bin/tsc -p /tmp/tsconfig.check.json` (or `npx tsc -b` — note the pre-existing TS6310 reference quirk in tsconfig.node.json).
