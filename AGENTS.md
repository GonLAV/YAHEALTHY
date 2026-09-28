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
- **Lifecycle messaging**: decisions in `utils/lifecycle.js` (pure), copy in `utils/lifecycle-templates.js`, I/O + hourly cron in `utils/lifecycle-runner.js` (off under `NODE_ENV=test`/Vercel/`LIFECYCLE_ENABLED=false`). Dedupe is the `lifecycle_sends` unique key (migration 018), never process memory. Marketing messages (lead nurture, win-back) need consent and start with "פרסומת"; WhatsApp only after opt-in. Staff endpoints under `/api/marketing/campaigns/*`.
- **RTL**: Tailwind logical utilities (`ms-`, `ps-`, `text-start`, `start-*`) are used throughout; avoid `ml-`/`mr-`/`space-x`. `.num` class keeps numbers LTR inside RTL text.
- **PWA / Web Push**: hand-written `public/sw.js` (no vite-plugin-pwa); the `swVersionPlugin` in both vite configs stamps its `SW_VERSION` at build so updates are detected. In dev it registers as `/sw.js?dev=1` with caching off. Push is `routes/push.js` + `utils/push.js` (`sendPush(userId, payload)` is the reusable delivery API); VAPID keys from `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT` (ephemeral in dev, push off in prod without them).
- **Backend secrets** come from `/run/base44/app.env` (JWT_SECRET, optional SUPABASE_*); local dev placeholders are fine.

## Frontend structure
- `src/i18n/` — translations + LanguageContext (add all user-facing strings here)
- `src/components/layout/AppLayout.tsx` — sidebar (desktop) + bottom nav (mobile) + language toggle + skip link
- `src/components/ui/` — PageHeader, StatCard, ProgressBar, ProgressRing, EmptyState
- `src/pages/` — Landing (`/`, public), Login, Signup, Onboarding (`/onboarding`), Dashboard, FoodLog, Hydration, Sleep, Weight, Coaching, Progress, Achievements (`/achievements`), Invite (`/invite`), MarketingDashboard (`/admin/marketing`, `StaffRoute`), Recipes
- `src/components/` — `PrivateRoute` (redirects un-onboarded users to `/onboarding`; the onboarding route opts out with `allowIncompleteOnboarding`), `StaffRoute`, `share/` (Share-my-week modal), `engagement/`
- `src/utils/attribution.ts` — first-touch UTM/referral capture sent with signup

## Backend structure
- `index.js` — core API (auth, logs, coach) + mounts routers; `utils/config-check.js` runs right after dotenv
- `routes/` — `referrals` (013), `marketing` (plans + consented leads, 014), `engagement` (streaks/Health Score/achievements), `onboarding` (015), `share` (`/api/share/*` + public `/s/:token` pages, 016), `analytics` (staff dashboard, 019), `payments` (PayPlus), `foods`, `whatsapp`, `whapi`
- `middleware/requireStaff.js` — after `authMiddleware`; non-staff get **404** (not 403) by design

## Migrations
- `YAHEALTHYbackend/migrations/NNN_name.sql`, applied by hand in the Supabase SQL editor, in filename order. Each new file is idempotent (`if not exists`) and documents its rollback in a `-- נתיב חזרה:` header.
- Next free number: take the next unused one and claim it early — 017 is reserved/unused; 018 is lifecycle messaging.
- `migrations/ALL.sql` is GENERATED: `npm run build:migrations` after adding a file; `tests/migrations.test.js` fails if it drifts.

## Env & deploy
- Every `process.env.*` must be listed in `YAHEALTHYbackend/.env.example` (enforced by `tests/config-check.test.js`) and, if it gates a feature, in `utils/config-check.js`. Production fails fast only on JWT_SECRET, SUPABASE_* (unless ALLOW_MEMORY_DB), CORS_ORIGINS.
- Backend deploys to Vercel (`YAHEALTHYbackend/vercel.json` → everything to Express, so `/api/*` and `/s/*` both work there). Frontend `vercel.json` rewrites all but `/api/` and `/s/` to `index.html` (SPA deep links). Release runbook: `docs/RELEASE-2026-09-27.md`.

## Quirks
- **Never commit compiled `.js` next to `.tsx`**: Vite resolves `.js` BEFORE `.tsx` for extensionless imports, so a stale `tsc -b` artifact silently overrides your source edits. If `tsc -b` is run, delete the emitted `.js` files again (see `.gitignore`).
- `YAHEALTHYbackend/index.js.backup`, `Plugin/`, and the many `*.md`/`CRM_*` docs are historical; don't touch them.
- **`/s/` proxy/rewrite must be `^/s/`** (regex key in the Vite proxy): a plain `/s` prefix also swallows `/signup` and `/sleep`. Share pages are rendered by the backend; the frontend host must forward `^/s/` or `SHARE_BASE_URL` must point at the backend.
- `utils/mailer.js` reads env at require time — keep `dotenv.config()` above every `require('./utils/...')` in index.js.
- The weekly-summary cron does not run on Vercel (`VERCEL` set); serverless has no scheduler.
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
- Backend tests: `node tests/run-all.js` (every `tests/*.test.js`, incl. config + migrations checks).
- Type check: `node_modules/.bin/tsc -p /tmp/tsconfig.check.json` (or `npx tsc -b` — note the pre-existing TS6310 reference quirk in tsconfig.node.json).
