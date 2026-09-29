# YAHEALTHY — Base44 Dev Environment

## Architecture
- **Frontend**: `YAHEALTHYFrontend` — Vite 5 + React 18 + TypeScript + Tailwind, served on port 5173 (mapped to host 3000)
- **Backend**: `YAHEALTHYbackend` — Express 5 + Node.js (CommonJS), served on port 5000 (internal + exposed), JWT auth, bcrypt hashing
- **Database**: Supabase in production; in-memory store in dev (`ALLOW_MEMORY_DB=true`). Without `SUPABASE_URL`/`SUPABASE_KEY` data resets on backend restart.
- **i18n**: Bilingual Hebrew (RTL) / English (LTR). `src/i18n/translations.ts` holds all strings except the staff dashboard's (`analytics.*`) and onboarding's (`onb.*`), which live in `src/i18n/strings/` and are registered when those lazy pages load (keeps them off the public bundle); `LanguageContext` sets `document.documentElement.dir`; toggle persists in `localStorage` (`yahealthy-lang`). Coach endpoints take `?lang=he|en`.

## Key Setup Notes
- **vite.config.js vs .ts**: Vite loads `vite.config.js` first — keep it in sync with `.ts` when changing config.
- **Proxy**: Frontend proxies `/api` to the backend. Proxy target comes from `VITE_PROXY_TARGET` (defaults to `http://localhost:5000`); in Docker it points to `http://backend:5000`.
- **`VITE_API_URL`** is left empty so the frontend uses same-origin relative paths through the Vite proxy (single-origin wiring).
- **Backend env**: `ALLOW_MEMORY_DB=true` lets the backend start without Supabase. `JWT_SECRET` is auto-generated if missing in dev mode.
- **AI Coach**: `utils/coach.js` (rule-based, data-grounded, bilingual, no LLM) mounted at `/api/crm/users/:userId/insights` and `/ask` in index.js. Pure layers: `buildCoachContext` (logs + preferences targets/diet/allergies + onboarding safety flags + engagement + `weekly-summary.summarizeWeekRows`) → `buildInsights` (≤4 cards: priority, reason with numbers, action, `cta.href`) and `answerQuestion` (he/en intents with typo tolerance). Meal ideas come from its own `MEALS` list filtered by `mealConflict` — never suggest anything matching a stated allergy; minors get no calorie numbers/cut advice. Tests: `tests/coach.test.js`. The old `crm-routes.js`/`crm-ai-assistant.js` prototype (OpenAI + Postgres pool) was never integrated — do not wire it as-is.
- **Weekly meal planner**: pure engine `utils/meal-planner.js` (7 days × breakfast/lunch/dinner/snack; ingredients reference `data/food-database.json` / `data/foods-usda.json` — no hand-typed nutrition; solves portion factors to hit `macroTargets.calorieOverride` + protein within ±7 %/±15 %; seeded PRNG; variety, swap, lock, regenerate; minors get base portions and no numbers; targets below the safe floor are raised to it). Allergy/diet parsing is shared with the coach in `utils/allergens.js` (kosher = no meat/poultry with dairy in one meal). API `routes/meal-planner.js` at `/api/meal-plans/week*` (mounted before the legacy `/api/meal-plans/:id`); storage `meal_planner_weeks` (migration 022) holds grams + checked shopping keys, numbers are recomputed on read. Page `/meal-plan` (`MealPlanPage.tsx`, helpers in `src/utils/mealPlan.ts`). Tests: `tests/meal-planner.test.js`, `e2e/tests/meal-plan.spec.mjs`.
- **Lifecycle messaging**: decisions in `utils/lifecycle.js` (pure), copy in `utils/lifecycle-templates.js`, I/O + hourly cron in `utils/lifecycle-runner.js` (off under `NODE_ENV=test`/Vercel/`LIFECYCLE_ENABLED=false`). Dedupe is the `lifecycle_sends` unique key (migration 018), never process memory. Marketing messages (lead nurture, win-back) need consent and start with "פרסומת"; WhatsApp only after opt-in. Staff endpoints under `/api/marketing/campaigns/*`.
- **RTL**: Tailwind logical utilities (`ms-`, `ps-`, `text-start`, `start-*`) are used throughout; avoid `ml-`/`mr-`/`space-x`. `.num` class keeps numbers LTR inside RTL text.
- **PWA / Web Push**: hand-written `public/sw.js` (no vite-plugin-pwa); the `swVersionPlugin` in both vite configs stamps its `SW_VERSION` at build so updates are detected. In dev it registers as `/sw.js?dev=1` with caching off. Push is `routes/push.js` + `utils/push.js` (`sendPush(userId, payload)` is the reusable delivery API); VAPID keys from `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT` (ephemeral in dev, push off in prod without them).
- **Backend secrets** come from `/run/base44/app.env` (JWT_SECRET, optional SUPABASE_*); local dev placeholders are fine.

## Frontend structure
- `src/i18n/` — translations + LanguageContext (add all user-facing strings here)
- `src/components/layout/AppLayout.tsx` — sidebar (desktop) + bottom nav (mobile) + language toggle + skip link
- `src/components/ui/` — PageHeader, StatCard, ProgressBar, ProgressRing, EmptyState
- `src/pages/` — Landing (`/`, public), Login, Signup, Onboarding (`/onboarding`), Dashboard, FoodLog, Hydration, Sleep, Weight, Coaching, Progress, Achievements (`/achievements`), MealPlan (`/meal-plan`: week grid / day tabs, swap/lock, shopping list with WhatsApp share), Invite (`/invite`), Settings (`/settings`: messaging prefs, push reminders from `components/settings/RemindersSettings.tsx`, targets + re-run onboarding, language, password/logout; `/reminders` redirects to `/settings#reminders`), MarketingDashboard (`/admin/marketing`, `StaffRoute`; includes lifecycle campaign stats), Recipes
- `src/components/` — `PrivateRoute` (redirects un-onboarded users to `/onboarding`; the onboarding route opts out with `allowIncompleteOnboarding`), `StaffRoute`, `share/` (Share-my-week modal), `engagement/`
- `src/utils/attribution.ts` — first-touch UTM/referral capture sent with signup

- **Public SEO pages** (`/`, `/en`, `/guides[/<slug>]`, `/en/guides[/<slug>]`): route list, head tags, JSON-LD and sitemap live in `src/seo/site.ts`; guide articles are data in `src/content/guides.ts` (cautious, non-medical, end with the consult-a-professional note). `npm run build` prerenders them via `src/entry-server.tsx` + `scripts/prerender.mjs` (react-dom/server, no browser); `main.tsx` hydrates. Keep the shell (`App.tsx`, providers, `PwaChrome`) free of static imports of `services/api` (axios), `AppLayout` or recharts — they load via `import()`; the landing page uses `services/publicApi.ts` (fetch). Set `VITE_SITE_URL` for deployable builds. The public pages must render identically on server and first client render (no `localStorage`/`window` reads during render). New private route → add to `PRIVATE_PATHS` + `public/robots.txt`. Checks: `npm run test:seo`, `npm run perf:public`. Hosting rules: see `YAHEALTHYFrontend/README.md` ("SEO & prerendering").
## Backend structure
- `index.js` — core API (auth, logs, coach) + mounts routers; `utils/config-check.js` runs right after dotenv
- `routes/` — `referrals` (013), `marketing` (plans + consented leads, 014), `engagement` (streaks/Health Score/achievements), `onboarding` (015), `share` (`/api/share/*` + public `/s/:token` pages, 016), `analytics` (staff dashboard, 019), `payments` (PayPlus), `foods`, `whatsapp`, `whapi`
- `middleware/requireStaff.js` — after `authMiddleware`; non-staff get **404** (not 403) by design
- **Observability**: log through `utils/logger.js` (`req.log` carries the request id; JSON lines in prod, pretty in dev; `LOG_LEVEL`/`LOG_FORMAT`; redacts emails/phones/tokens/secret-named keys) — no new `console.*` in non-legacy modules. `middleware/accessLog.js` logs route PATTERNS only (never raw URLs: `/s/:token`). Central `utils/error-handler.js` + `utils/process-handlers.js`; optional Sentry via `utils/error-tracker.js` (plain fetch to the envelope API, only when `SENTRY_DSN` is set). Jobs/5xx counts live in `utils/health-registry.js` (in memory, per process) → staff `GET /api/admin/health` (`routes/admin.js`, shown under "System health" on `/admin/marketing`). Browser crashes: `AppErrorBoundary` + `utils/errorReporting.ts` → `POST /api/client-errors` (8 KB cap, rate-limited, scrubbed). Tests: `tests/observability.test.js`.

## Migrations
- `YAHEALTHYbackend/migrations/NNN_name.sql`, applied by hand in the Supabase SQL editor, in filename order. Each new file is idempotent (`if not exists`) and documents its rollback in a `-- נתיב חזרה:` header.
- Next free number: take the next unused one and claim it early — 017 is reserved/unused; 018 is lifecycle messaging; 022 is the weekly meal planner.
- `migrations/ALL.sql` is GENERATED: `npm run build:migrations` after adding a file; `tests/migrations.test.js` fails if it drifts.

## Env & deploy
- Every `process.env.*` must be listed in `YAHEALTHYbackend/.env.example` (enforced by `tests/config-check.test.js`) and, if it gates a feature, in `utils/config-check.js`. Production fails fast only on JWT_SECRET, SUPABASE_* (unless ALLOW_MEMORY_DB), CORS_ORIGINS.
- Backend deploys to Vercel (`YAHEALTHYbackend/vercel.json` → everything to Express, so `/api/*` and `/s/*` both work there). Frontend `vercel.json` rewrites all but `/api/` and `/s/` to `app.html` (the un-prerendered SPA shell; `index.html` is the prerendered Hebrew landing page, and prerendered files win over rewrites). The service worker also uses `/app.html` as its offline shell. Release runbook: `docs/RELEASE-2026-09-27.md`.

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

Backend unit/integration suites (in-memory store, no Docker needed): `cd YAHEALTHYbackend && node tests/run-all.js`.

**CI** (`.github/workflows/ci.yml`, every push to main + PRs): `backend-system-test`, `backend-tests` (run-all), `frontend` (no-`.js`-next-to-`.tsx` guard, `tsc -b`, build+prerender, `test:seo`, `test:unit`, `perf:public`), `e2e` (Playwright; traces uploaded on failure), `evals-validate` (case validation + `--dry-run`). CI installs Chromium with `npx playwright install` (runners have no `/opt/pw-browsers`); never do that locally.

**E2E smoke tests (Playwright, `e2e/`)** — self-contained: global setup starts the backend (`ALLOW_MEMORY_DB=true`) and Vite on free ports, runs Chromium, then kills only the process groups it started. Needs `npm install` in `YAHEALTHYbackend/` and `YAHEALTHYFrontend/` first.
```bash
cd e2e && npm install          # @playwright/test only; never run `playwright install`
npm test                       # or from YAHEALTHYFrontend: npm run test:e2e
```
Chromium is taken from `PLAYWRIGHT_BROWSERS_PATH` (defaults to the preinstalled `/opt/pw-browsers`). Server logs and failure traces land in `e2e/test-results/`. Covers landing (he/en) lead form, `?ref=`+utm → signup → onboarding → Health Score, water → streak, `/invite` copy, share link create/visit/sign-up/revoke, staff page blocked for non-staff, mobile More sheet keyboard/RTL, settings (pref persists across reload, `/reminders` redirect, password change, campaigns table with mocked stats), coach (insight cards + CTA, allergy-safe dinner answer, he/RTL).

## Dev Commands
- Frontend: `npm run dev` (Vite with HMR)
- Backend: `npm run dev` (nodemon with auto-reload)
- Both run inside Docker containers with bind-mounted source.
- Backend tests: `node tests/run-all.js` (every `tests/*.test.js`, incl. config + migrations checks).
- Frontend unit tests: `cd YAHEALTHYFrontend && npm run test:unit` (vitest, ~2s, no browser/backend). Tests live next to the code as `src/**/*.test.ts(x)`; config is the standalone `vitest.config.ts` (only the React plugin + `@/` alias, so no need to sync it with vite.config.*). Node environment by default; DOM tests opt in with a `// @vitest-environment jsdom` first line. They are excluded from `tsc -b` (no emit) and type-checked by `npm run typecheck:test` (`tsconfig.test.json`, noEmit). Covers date/DST helpers, attribution, SEO routes/hreflang + PRIVATE_PATHS ↔ App.tsx guards, guide content rules, **i18n parity** (he/en keys, placeholders, every `t('…')` key in src exists — add strings to both languages or it fails), LanguageContext, PWA helpers.
- Type check: `node_modules/.bin/tsc -p /tmp/tsconfig.check.json` (or `npx tsc -b` — note the pre-existing TS6310 reference quirk in tsconfig.node.json).
