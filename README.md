# YAHEALTHY

A bilingual (Hebrew RTL / English LTR) nutrition product: a tracking web app, two WhatsApp bots, a public site that sells coaching and books appointments, and a staff screen. Nutrition coaching is given by a natural nutritionist and is not medical advice.

Everything below was checked against the code at the time of writing. Where the code and an older document disagree, the code wins. Agent and editor conventions live in [AGENTS.md](AGENTS.md).

---

## What the product is

### The app (signed in)

Every route below needs an account (`PrivateRoute`), and renders inside `AppLayout`: a sidebar on desktop, a bottom nav on mobile, and a language toggle.

| Route | Screen |
|---|---|
| `/dashboard` | Today: calories vs target, streak, badges, water, sleep |
| `/progress` | Charts over food, water, sleep and weight |
| `/food-log` | Log meals, save and reuse templates |
| `/hydration`, `/sleep` | Daily logs |
| `/weight` | Weight goal and weigh-ins |
| `/recipes` | The recipe library (`data/recipes.json`, 45 recipes); add a recipe to the week |
| `/shopping` | The planned week and the grocery list built from it |
| `/coaching` | Automated bilingual coach chat. Rule-based, grounded in the user's own data (`utils/coach.js`). No LLM. |
| `/targets` | Calorie and macro targets the user sets. A calculated target is held back until the dietitian approves the formula (see [Safety rules](#safety-rules-do-not-break)). |
| `/notifications` | Reminders: switch them on, per kind, and send a test. The bell in the app bar is the feed. See [Reminders](#reminders). |
| `/staff` | Staff only. See [Staff screen](#staff-screen). |

Signup is open (`/signup`, `POST /api/auth/signup`). The coach endpoints are `GET /api/crm/users/:userId/insights` and `POST /api/crm/users/:userId/ask`, with `?lang=he|en`.

### Public site (no account, `PublicLayout`)

| Route | Page |
|---|---|
| `/` | Landing page for visitors. Signed-in users are sent to `/dashboard`. |
| `/pricing` | What is sold, read from `GET /api/payments/plans`: Yael's personal menu (once), coaching with Adi and coaching with Yoni (monthly), and the supermarket session with Yael (booked first). Anything with no price is hidden. Buying goes to PayPlus's hosted page. |
| `/demo-pay` | The demo's stand-in for PayPlus. Its API answers 404 wherever demo payments are off, which includes production. |
| `/book` | Book a free diagnosis (physical or online) or a paid supermarket session |
| `/book/confirmed` | The booking, from a tokenised link: cancel or reschedule it |
| `/welcome`, `/payment-failed` | Where PayPlus sends the buyer back to |
| `/forgot-password`, `/reset-password` | Request a link; choose a password. After a first payment the same page acts as "set your password" (`&welcome=1`). |
| `/login`, `/signup` | |

Any unknown route redirects to `/dashboard` (and from there to `/login` if signed out). The floating WhatsApp button uses a number hard-coded in `src/components/WhatsAppWidget.tsx`.

### Booking and Google Calendar

`routes/booking.js`, `utils/booking.js` (slots), `utils/appointments.js`, `utils/google-calendar.js`.

- Three types: `physical` and `online` (the diagnosis, free) and `supermarket` (paid, walking the aisles).
- A slot is offered only when both her Google calendar (freeBusy) and our own `appointments` rows say it is free. Working hours are computed in `Asia/Jerusalem`, not as a UTC offset.
- A free booking is written to her calendar immediately; an online one gets a Google Meet link. If Google refuses the event, the booking is cancelled and the customer gets an error.
- A supermarket booking is held as `pending_payment` for `BOOKING_HOLD_MINUTES`, sent to PayPlus, and confirmed by the PayPlus callback.
- Customers cancel or reschedule with the token in their link. Confirmations and reminders go out on WhatsApp (`utils/appointment-messages.js`).
- In production, bookings are refused (503) until the Google credentials are set.

### WhatsApp bots

Messages arrive at `POST /api/whapi/messages` (`routes/whapi.js`) and are answered by Claude (`utils/whapi-brain.js`), using the prompts in `YAHEALTHYbackend/docs/bot/`.

| Bot | Persona | Tools (`TOOLS_BY_BOT`) | Who gets it |
|---|---|---|---|
| Adi (`adi`) | Nutrition. Prompt: `nuri-bot-prompt.md` | `calculate_daily_target`, `calculate_meal_nutrition`, `list_known_foods`: deterministic calculators over `data/food-database.json`, so a number comes from arithmetic, not from the model | Everyone. The default. |
| Yoni (`yoni`) | The chef. Prompt: `chef-bot-prompt.md` | `find_recipes`, `get_recipe` over the owner's recipe library (`utils/recipe-tools.js`). Calories are removed from what he sees. | Only customers whose active plan includes Yoni, i.e. the `yoni` plan |

- Customers switch by typing `יוני` / `yoni` / `שף` / `chef`, and back with `עדי` / `adi`.
- The paywall (`utils/yoni-gate.js`) is checked on every message, not only at the switch. A paying customer gets Yoni. A non-paying customer whose message trips a health flag gets Adi, with no mention of a price. Anyone else gets Adi plus one line saying how to join. If the lookup fails, the message goes to Yoni, so an outage never cuts off someone who paid.
- WhatsApp knows a customer only by phone number. The number given at checkout is what ties a sender to a paid plan.
- Health-flagged messages are also written to `whatsapp_messages` with status `escalated`, which is what the staff screen lists.
- There is a second, separate inbound webhook at `POST /api/whatsapp/webhook[/:secret]` (`routes/whatsapp.js`). It never replies. It stores messages as `pending`, or `escalated` if they trip a flag.

### Payments (PayPlus)

`routes/payments.js`, `utils/payplus.js`. No card data reaches this server; PayPlus hosts the page.

1. `POST /api/payments/checkout` (public) takes the email, an Israeli mobile number and what is being bought: a monthly plan (`PLANS`: `base` = coaching with Adi, `yoni` = with Yoni as well) or a one-time product (`PRODUCTS`: `menu` = Yael's personal menu), and returns a PayPlus link. Prices come from `PLAN_*_AMOUNT` and `PRODUCT_MENU_AMOUNT`; anything with no price refuses to sell.
2. PayPlus calls `POST /api/payments/callback`. The callback is verified by the HMAC-SHA256 `hash` header against `PAYPLUS_SECRET_KEY`, and a repeated delivery is ignored.
3. On an approved payment the callback creates the account if needed (with an unusable password), attaches the phone number, and records the subscription — or, for the menu, opens an order (`orders`, migration 016) that Yael works from the staff screen. A new account gets a welcome email with a set-password link. A `supermarket` payment confirms its appointment instead.

The callback's work lives in `handleTransaction`, which the demo payment page also calls. **Demo payments** (`isDemo` in `utils/payplus.js`) replace PayPlus with that page so a purchase can be clicked through end to end; they need all three of: `NODE_ENV` not `production`, `DEMO_PAYMENTS=true`, and PayPlus not configured.
4. Payments that need a person (no matching booking, no usable email or plan, a phone number already on another account) are flagged for the staff screen.

A subscription is recorded with no end date. Nothing in the code renews, re-bills or expires it.

### Staff screen

`/staff` in the app, backed by `routes/staff.js`, behind `authMiddleware` + `middleware/requireStaff.js`. It shows upcoming bookings, menu orders to fulfil (paid → in progress → delivered), bookings that need attention and recent bookings (cancel, resolve), health-flagged WhatsApp escalations (mark handled), and payments that need a person (resolve).

`requireStaff` reads `users.is_staff` from the database on every request, and answers 404 to non-staff. No endpoint can grant staff access; it is granted by SQL (see the [checklist](#going-live-checklist)). `/api/auth/me` returns `isStaff`, and the nav shows the item only when it is true.

### Reminders

`utils/nudges.js`, `routes/notifications.js`, `GET /api/cron/nudges` in `routes/cron.js`, table `nudges` (migration 017).

- **Opt-in.** Off by default (`users.preferences.nudges`); switched on per kind in `/notifications`, and off again by replying `עצור` on WhatsApp.
- **Four kinds, Israel time:** today's menu at 08:00 (only if meals are planned today), breakfast at 10:00 (only if none is logged), water at 11:00, 14:00 and 17:00 (only when behind 35% / 60% / 80% of the survey's water target), and "well done" at 20:00 (only when the water target was met or three meals were logged).
- **Health first.** Anyone with an unhandled `escalated` WhatsApp message gets no automatic reminders until staff mark it handled.
- **Delivery:** WhatsApp when the user has a phone and `WHAPI_TOKEN` is set, and always the in-app feed. `nudges` dedupes per (user, slot), so a job that runs twice in an hour sends once.
- **Schedule:** hourly, by `.github/workflows/nudges.yml` (Vercel's Hobby plan runs crons at most daily). It needs the GitHub secrets `API_URL` and `CRON_SECRET`, and does nothing until both exist.

---

## Repository map

| Path | What it is |
|---|---|
| `YAHEALTHYFrontend/` | Vite 5 + React 18 + TypeScript + Tailwind. `src/pages/`, `src/components/` (`layout/`, `ui/`), `src/i18n/translations.ts` (every user-facing string, `en` and `he`), `src/services/api.ts` (all API calls) |
| `YAHEALTHYbackend/index.js` | Express 5 app (CommonJS). Most app endpoints live here; the rest are mounted from `routes/`. Also serves `/api/docs` (Swagger, `openapi.js`) and a legacy static UI from `public/` at `/`, `/login` and `/dashboard` of the backend. |
| `YAHEALTHYbackend/api/index.js` | Vercel entry point. It re-exports the app. |
| `YAHEALTHYbackend/routes/` | `booking`, `cron`, `foods`, `notifications`, `payments`, `staff`, `whapi` (the bots), `whatsapp` (inbound inbox) |
| `YAHEALTHYbackend/utils/` | Domain logic: `database.js` (Supabase or in-memory), `auth.js`, `mailer.js`, `payplus.js`, `google-calendar.js`, `whapi-brain.js`, `health-flags.js`, `clinical-approval.js`, `yoni-gate.js`, calculators |
| `YAHEALTHYbackend/middleware/` | `rateLimit.js`, `requireStaff.js`, `requestContext.js`, `validate.js` |
| `YAHEALTHYbackend/migrations/` | Numbered SQL migrations, plus the generated `ALL.sql` |
| `YAHEALTHYbackend/tests/` | 18 suites, run by `tests/run-all.js` |
| `YAHEALTHYbackend/scripts/` | `dev-demo.js`, `build-all-sql.js`, `google-auth.js`, `approvals-hash.js`, `ingest-foods.js` |
| `YAHEALTHYbackend/data/` | `recipes.json`, `food-database.json`, `foods-usda.json`, `food-catalog-he.json`, `chef-knowledge.json`, `clinical-approvals.json` |
| `YAHEALTHYbackend/docs/bot/` | The copies of the two bot prompts that actually ship (see [Safety rules](#safety-rules-do-not-break)) |
| `docs/` | `bot/` (prompt sources, plus sales and ManyChat drafts that no code loads), `nutrition/`, product and compliance notes. See [Other documents](#other-documents). |
| `evals/` | Adversarial eval harness for the bots. See [evals/README.md](evals/README.md) (Hebrew). |
| `.github/workflows/` | `ci.yml` (tests), `deploy.yml` (backend to Vercel), `nudges.yml` (the hourly reminder tick) |
| `docker-compose.base44.yml` | Both services in containers |
| `Plugin/` | Historical Claude plugin packages. Nothing in the app loads it. Do not edit. |
| `YAHEALTHYbackend/*.md`, `CRM_*`, `supabase.sql`, `crm-schema.sql`, `index.js.backup`, `SETUP_SUMMARY.txt` | Historical. Do not follow them (see [Other documents](#other-documents)). |

---

## Running locally

Node 20 is what CI uses; Docker uses Node 22.

### Windows, no Docker: the demo

This runs the whole app with a week of data in it, and no accounts or services needed.

```powershell
# terminal 1
cd YAHEALTHYbackend
npm install
npm run demo          # node scripts/dev-demo.js

# terminal 2
cd YAHEALTHYFrontend
npm install
npm run dev           # Vite on http://localhost:5173, proxies /api to http://localhost:5000
```

Open http://localhost:5173 and sign in as `demo@yahealthy.test` / `demo-password-1234`.

What `scripts/dev-demo.js` does:

- Runs the backend on the in-memory store. It blanks every Supabase, Google, WHAPI, PayPlus, Anthropic and SMTP setting before the server loads, so it cannot touch a real service, even with a real `.env` present.
- Seeds a staff account that holds the Yoni plan: a survey, seven days of meals, water and sleep, a weight goal and a weigh-in, two planned meals, two customer bookings, and reminders switched on (with this morning's menu reminder and yesterday's "well done" already in the feed; the reminder job then runs every 5 minutes).
- Turns on demo payments: checkout and the paid supermarket session go to a stand-in payment page, and nothing is charged.
- Defaults `PORT=5000`, `APP_URL=http://localhost:5173` and demo prices. Everything is gone when it stops.

If ports 5000 and 5173 are taken:

```powershell
# terminal 1 (YAHEALTHYbackend)
$env:PORT = '5100'; $env:APP_URL = 'http://localhost:5174'; npm run demo
# terminal 2 (YAHEALTHYFrontend)
$env:VITE_PROXY_TARGET = 'http://localhost:5100'; npx vite --port 5174 --strictPort
```

### Against your own `.env`

```powershell
cd YAHEALTHYbackend
copy .env.example .env    # then edit it
npm run dev               # nodemon index.js
```

- `.env.example`'s `SUPABASE_URL` and `SUPABASE_KEY` placeholders are not recognised as placeholders. Left in, the server tries to reach a Supabase project that does not exist, and every request fails. Either put real values there, or blank both and add `ALLOW_MEMORY_DB=true`.
- Without Supabase and without `ALLOW_MEMORY_DB=true`, the server refuses to start.
- In development, outgoing email (password reset links) is printed to the server log instead of sent.
- Leave the frontend's `VITE_API_URL` empty (don't copy `YAHEALTHYFrontend/.env.example`, which sets it to `http://localhost:5000`). Empty means same-origin `/api` through the Vite proxy.

### Docker

```bash
docker compose -f docker-compose.base44.yml up -d
curl http://localhost:5000/api/health     # backend
curl http://localhost:3000                # frontend (Vite, container port 5173)
```

- The backend runs `nodemon index.js` with `ALLOW_MEMORY_DB=true`. The frontend runs Vite with `VITE_PROXY_TARGET=http://backend:5000`. Both bind-mount their source.
- The backend service reads `env_file: /run/base44/app.env`. The Base44 environment provides that file; anywhere else, create it (it can hold just `JWT_SECRET=...`), or compose will not start.
- Data is in memory, and is lost when the backend restarts, unless `app.env` supplies `SUPABASE_*`.

---

## Environment variables

Backend variables are read from `YAHEALTHYbackend/.env` (dotenv) locally, and from the Vercel project's environment in production. The deploy workflow does not pass them to Vercel.

The Prod column means:

- **Refuses to start**: the server throws at load without it.
- **Required**: the server starts, but the named feature is broken or refused.
- **Set**: has a default, but the default is wrong for production.

Every production check keys off `NODE_ENV=production`.

A **✗** in the `.env.example` column means the code reads the variable but `.env.example` does not list it.

### Server and security

| Variable | `.env.example` | Prod | What it does |
|---|---|---|---|
| `NODE_ENV` | ✓ | `production` | Turns on every production guard below |
| `JWT_SECRET` | ✓ | **Refuses to start** | Signs tokens. In dev, a random secret per boot (sessions end on restart). |
| `CORS_ORIGINS` | ✓ | **Refuses to start** | Comma-separated browser origins. Dev default: `http://localhost:5173`, `http://127.0.0.1:5173`. |
| `APP_URL` | ✓ | Required | The frontend's URL, used in emails, WhatsApp links and PayPlus return URLs. Default `http://localhost:5173`. |
| `API_PUBLIC_URL` | ✓ | Required | The backend's public URL. PayPlus is told to call `API_PUBLIC_URL/api/payments/callback`. |
| `PORT` | ✓ | – | Default 5000. Unused on Vercel. |
| `ALLOW_MEMORY_DB` | **✗** | never | `true` allows the in-memory store when Supabase is not configured |
| `VERCEL` | **✗** | set by Vercel | Skips `app.listen` and the weekly-summary scheduler |

### Database (Supabase)

| Variable | `.env.example` | Prod | What it does |
|---|---|---|---|
| `SUPABASE_URL` | ✓ | **Refuses to start** | |
| `SUPABASE_KEY` | ✓ | **Refuses to start** | Must be a **server** key: the secret key (`sb_secret_...`) or the legacy `service_role` JWT. Every table has row level security on and no policies, so an anon or publishable key can read and write nothing. The server logs an error at startup if it recognises a public key. |
| `SUPABASE_SERVICE_ROLE_KEY` | ✓ | Optional | Used for the `whapi_*` and `appointments` tables. Falls back to `SUPABASE_KEY`, which is fine when that is already a server key. |

### Email

| Variable | `.env.example` | Prod | What it does |
|---|---|---|---|
| `SMTP_URL` | ✓ | **Required** | For example `smtps://user%40gmail.com:app-password@smtp.gmail.com:465`. Without it, production refuses to send. Password resets fail, and a new customer who has just paid never receives the link to set a password, so they cannot sign in. The payment still records; only a log line says the mail failed. |
| `SMTP_FROM` | **✗** | Optional | Sender address. Default: the username in `SMTP_URL`. |
| `EMAIL_API_KEY` | ✓ | Don't use | Counts as "configured", but no transport exists for it. Sending throws unless `SMTP_URL` is set. |

### Payments (PayPlus) and plans

| Variable | `.env.example` | Prod | What it does |
|---|---|---|---|
| `PAYPLUS_API_KEY`, `PAYPLUS_SECRET_KEY`, `PAYPLUS_PAYMENT_PAGE_UID` | ✓ | Required | Without all three, checkout and paid bookings return 503. Without the secret, every callback is rejected. |
| `PAYPLUS_ENV` | ✓ | `production` | Anything else uses the PayPlus sandbox |
| `PAYPLUS_APPROVED_CODE` | **✗** | Optional | The callback `status_code` treated as approved. Default `000`. |
| `PLAN_BASE_AMOUNT` | ✓ | Required | NIS for `base` ("ליווי עם עדי"). Unset or 0 means it is not sold. |
| `PLAN_YONI_AMOUNT` | ✓ | Required | NIS for `yoni` ("ליווי עם יוני"), the plan that includes Yoni |
| `PRODUCT_MENU_AMOUNT` | ✓ | Required | NIS for Yael's personal menu, sold once. Unset or 0 means it is not sold. |
| `DEMO_PAYMENTS` | ✓ | never | `true` (outside production, with PayPlus unset) replaces PayPlus with the demo payment page |
| `YONI_SIGNUP_URL` | ✓ | Optional | The link in the "join to get Yoni" line. Default `APP_URL/pricing`. |

### Booking and Google Calendar

| Variable | `.env.example` | Prod | What it does |
|---|---|---|---|
| `SESSION_SUPERMARKET_AMOUNT` | ✓ | Required | NIS for the supermarket session. Unset or 0 means it is not offered. |
| `BOOKING_CLINIC_ADDRESS` | ✓ | Required | Where the physical diagnosis happens. Shown on the page, in the invite and on WhatsApp. |
| `BOOKING_TIMEZONE`, `BOOKING_DAYS`, `BOOKING_START`, `BOOKING_END` | ✓ | Optional | Defaults: `Asia/Jerusalem`, `0,1,2,3,4` (Sunday to Thursday), `09:00`, `17:00` |
| `BOOKING_PHYSICAL_DURATION_MIN`, `BOOKING_ONLINE_DURATION_MIN`, `BOOKING_SUPERMARKET_DURATION_MIN` | ✓ | Optional | Defaults 45 / 45 / 90 |
| `BOOKING_BUFFER_MIN`, `BOOKING_STEP_MIN`, `BOOKING_MIN_NOTICE_HOURS`, `BOOKING_HORIZON_DAYS`, `BOOKING_HOLD_MINUTES` | ✓ | Optional | Defaults 15, 30, 12, 21, 30 |
| `BOOKING_RATE_LIMIT` | **✗** | Optional | Booking, cancel and reschedule POSTs per IP per 15 minutes. Default 20. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` | ✓ | Required | Production refuses bookings (503) without them. Produced by `scripts/google-auth.js`. |
| `GOOGLE_CALENDAR_ID` | ✓ | Optional | Default `primary` |
| `GOOGLE_AUTH_PORT` | **✗** | – | Local callback port for `scripts/google-auth.js`. Default 53682. |

### WhatsApp and the bots

| Variable | `.env.example` | Prod | What it does |
|---|---|---|---|
| `WHAPI_TOKEN` | ✓ | Required | Sends bot replies, booking confirmations and reminders. Without it, the reminder job returns 503. |
| `WHAPI_WEBHOOK_SECRET` | ✓ | Required | Compared with the `X-Webhook-Secret` header. Unset in production means the bot webhook refuses every message. |
| `WHAPI_API_URL` | ✓ | Optional | Default `https://gate.whapi.cloud` |
| `WHATSAPP_WEBHOOK_SECRET` | **✗** | Set | Path secret for the inbox webhook (`/api/whatsapp/webhook/<secret>`). Unset leaves that endpoint open to anyone, in production too. |
| `ANTHROPIC_API_KEY` | ✓ | Required | Without it every bot reply fails, and the customer gets a generic "something went wrong". |
| `ANTHROPIC_MODEL` | ✓ | Optional | Default `claude-sonnet-5` |
| `ANTHROPIC_WORKSPACE_ID` | ✓ | If needed | Only for an organization-scoped API key |

### Scheduled jobs and data

| Variable | `.env.example` | Prod | What it does |
|---|---|---|---|
| `CRON_SECRET` | ✓ | Required | Vercel Cron sends `Authorization: Bearer <secret>`, and so does `nudges.yml` (from the GitHub secret of the same name). Unset means `/api/cron/reminders` and `/api/cron/nudges` refuse every call. |
| `USDA_API_KEY` | ✓ | – | Only for `scripts/ingest-foods.js` |
| `TEST_PORT` | **✗** | – | Tests only: pins a suite's server port. Otherwise a free port is used. |

In `.env.example` but read by no code: `AI_PROVIDER`, `AI_API_KEY`, `AI_ENDPOINT`, `PLACES_PROVIDER`, `PLACES_API_KEY`, `PLACES_ENDPOINT`, `DB_POOL_SIZE`, `DB_TIMEOUT`.

### Frontend and evals

| Variable | Where | What it does |
|---|---|---|
| `VITE_API_URL` | build time | Prefix for API calls. Empty means same-origin `/api`. |
| `VITE_PROXY_TARGET` | Vite dev server | Where `/api` is proxied. Default `http://localhost:5000`. |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | – | Declared in `vite-env.d.ts`, read nowhere |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_WORKSPACE_ID` | evals | Needed for any real eval run |
| `EVAL_MODEL`, `EVAL_JUDGE_MODEL` | evals | Model under test and judge. Both default to `claude-opus-5`. |
| `GEN_MODEL` | `evals/generate-cases.mjs` | Default `claude-sonnet-5` |

---

## Database

- **Production is Supabase.** Development can use the in-memory store (`ALLOW_MEMORY_DB=true`), which loses everything on restart.
- **Schema changes are hand-run SQL.** There is no migration runner. Run `migrations/ALL.sql` in the Supabase SQL Editor.
- **`ALL.sql` is generated.** Never edit it. After adding or changing a numbered migration, run:

  ```powershell
  cd YAHEALTHYbackend
  node scripts/build-all-sql.js           # rewrite ALL.sql
  node scripts/build-all-sql.js --check   # exit 1 if it is out of date
  ```

- **It is one transaction.** The generator drops each migration's own `begin;`/`commit;`, so a failure changes nothing. Every migration is written to be re-runnable, so `ALL.sql` is meant to be safe both on a fresh database and on one that already has some or all of it. That was checked once against PGlite, when the file was rebuilt; CI does not run it against Postgres.
- **`tests/migrations.test.js` enforces the rest.** It checks that `ALL.sql` equals the generator's output, that it includes every numbered file, that it is one transaction, and that no migration has a bare-word `default`.
- **`supabase.sql` and `crm-schema.sql` are historical.** Don't run them.

---

## Tests and CI

### Locally

```powershell
cd YAHEALTHYbackend
node tests/run-all.js                 # every suite; needs no env and no network
node tests/payments.test.js           # one suite
npm test                              # test-system.sh: needs bash and jq, and starts index.js on port 5000

cd ../YAHEALTHYFrontend
npx tsc --noEmit -p tsconfig.json     # type check
npx vite build                        # build
```

- **`npm test` starts `index.js` on port 5000**, the port your dev backend uses. Stop your dev backend first.
- **Don't run `npm run build` or `tsc -b` in the frontend.** `npm run build` is `tsc -b && vite build`, and `tsc -b` writes `.js` files next to the `.tsx` sources. Vite resolves `.js` first, so a stale emitted file silently overrides your edits.

`tests/run-all.js` runs every `*.test.js` in `tests/`, one at a time. Each suite starts what it needs itself, on a free port. Google, PayPlus, WHAPI and Anthropic are stubbed or not called.

| Suite | Covers |
|---|---|
| `booking` | Slots, booking, cancel and reschedule, the paid session through a signed PayPlus callback, staff routes, the reminder cron (Google stubbed) |
| `clinical-approval` | An approval is bound to a file hash; editing the file revokes it; replies carry the prompt version |
| `food-calculator`, `nutrition-calculator` | Unit tests for Adi's calculators |
| `foods` | The food database refuses unsourced values |
| `health-boundary` | Hebrew and English flags, the coach's hand-off, the target withheld until approval |
| `meal-plans` | Meal plans, the grocery list, ownership |
| `migrations` | `ALL.sql` generated, complete, one transaction |
| `nudges` | Reminders: wording and hold-backs, opt-in, the health pause, dedupe, WhatsApp, settings, the feed, the test button, `עצור` |
| `orders` | Yael's menu end to end, the order queue, demo pay and cancel, a paid session through the demo, the production lock |
| `payments` | Callback signature, idempotency, account creation, set-password, one subscription |
| `phone` | Israeli number normalisation, which ties WhatsApp to a paid plan |
| `recipe-tools` | Yoni's tools, with calories stripped, and which persona gets which tools |
| `staff-access` | `requireStaff`; subscription expiry |
| `token-lifecycle` | Logout, reset and password change revoke tokens; token types |
| `weight-progress` | What a weigh-in may be congratulated for |
| `yoni-gate` | The paywall order: paying first, then health flag, then upsell |
| `yoni-persona` | Yoni's prompt and naming, and that the shipped copy of `chef-bot-prompt.md` matches `docs/bot/` |

### CI (`.github/workflows/ci.yml`)

CI runs on every push to `main` and on every pull request. Each job uses Node 20 and `npm ci`.

| Job | Runs |
|---|---|
| `backend-system-test` | `npm test` (test-system.sh) with `ALLOW_MEMORY_DB=true` and a throwaway `JWT_SECRET`. Uploads the server log on failure. |
| `backend-suites` | `node tests/run-all.js` |
| `frontend` | `npx tsc --noEmit -p tsconfig.json`, then `npx vite build` |
| `evals-parse` | `node run-eval.mjs --bot both --dry-run` and `node run-eval.mjs --bot chef --only recipes --live --dry-run`. Parses the cases and makes no model calls. |

### Evals (not in CI)

The eval harness sends adversarial messages to the bots and has a separate model judge each reply. It is documented in [evals/README.md](evals/README.md).

```powershell
cd evals
npm install
$env:ANTHROPIC_API_KEY = 'sk-ant-...'
npm run eval:safety     # the safety cases, fastest
npm run eval            # every bare-prompt case, both bots
npm run eval:yoni       # Yoni through the real brain with his tools (--live): checks expectTools / forbidTools
npm run eval:live       # everything through the production code path
npm run eval:dry        # count and cost estimate, no API calls
```

- **`--live` loads `YAHEALTHYbackend/utils/whapi-brain.js`**, so run `npm install` in `YAHEALTHYbackend` too.
- **It sets `ANTHROPIC_MODEL` to `EVAL_MODEL`** (default `claude-opus-5`). Production defaults to `claude-sonnet-5`, so to test what actually ships, set `EVAL_MODEL` to the production `ANTHROPIC_MODEL`.
- **A failed blocker case exits 1.**
- **Results go to `evals/results/`.** That directory is git-ignored, except `history.tsv`.

---

## Deploy

| What | When | How |
|---|---|---|
| Backend (Vercel production) | A push to `main` that changes `YAHEALTHYbackend/**` or `deploy.yml`, or a manual run from the Actions tab | `.github/workflows/deploy.yml` |
| Meeting reminder cron | Daily at 15:00 UTC (18:00 Israel in summer, 17:00 in winter) | `YAHEALTHYbackend/vercel.json` → `GET /api/cron/reminders` |
| Reminders (water, breakfast, menu, well done) | Hourly at :05 | `.github/workflows/nudges.yml` → `GET /api/cron/nudges` (needs the `API_URL` and `CRON_SECRET` repository secrets) |
| Frontend | Nothing in this repository deploys it | – |

What `deploy.yml` does:

1. Runs `npm ci`.
2. Requires `index.js` with `ALLOW_MEMORY_DB=true`, so the whole module tree must parse and load.
3. Fails unless the GitHub secrets `JWT_SECRET`, `SUPABASE_URL`, `SUPABASE_KEY` and `VERCEL_TOKEN` exist. `VERCEL_PROJECT_ID` and `VERCEL_ORG_ID` are used too.
4. Runs `vercel --prod` from the repo root. The Vercel project's Root Directory is `YAHEALTHYbackend`.

Things to know about it:

- **It does not wait for CI.** A push to `main` deploys even if CI fails on the same commit.
- **A manual run deploys the chosen branch to production** (`--prod`).
- **Its comments say the Vercel project also deploys through Vercel's Git integration.**
- **Runtime env vars come from the Vercel project's settings**, not from GitHub.

On Vercel:

- **One function.** `vercel.json` rewrites every path to `api/index.js`, which re-exports the Express app, with a 60 s maximum duration.
- **No weekly summary emails.** The weekly summary is scheduled with node-cron (Sundays 08:00 Asia/Jerusalem) and only runs in a long-lived process, so it does not run on Vercel.
- **A failed reminder is not retried.** The reminder job marks an appointment only once its reminder is sent. Each run covers only tomorrow, so a meeting whose reminder failed is not in the next day's window.

For the frontend: a production build calls `VITE_API_URL + /api/...`. Build with `npx vite build`. Then either set `VITE_API_URL` to the backend's public URL at build time (and add the frontend's origin to `CORS_ORIGINS`), or serve the build behind a proxy that forwards `/api` to the backend. Use the frontend's URL as `APP_URL`.

---

## Safety rules (do not break)

**The health boundary.** `utils/health-flags.js` is the single list of Hebrew and English terms (pregnancy, diabetes, eating disorders, medication, allergies, minors and more) that mean a person, not a program, has to answer. It is substring-matched on purpose.

Everything reads it:

- `routes/whapi.js` escalates a flagged bot message to `whatsapp_messages` as `escalated`.
- `routes/whatsapp.js` marks a flagged inbound message `escalated`.
- `utils/yoni-gate.js` never answers a flagged non-payer with a price.
- `utils/coach.js` answers a flagged question with a hand-off, and logs no message text.

Add terms to that one file. Keep them in step with the safety gate in both bot prompts. `tests/health-boundary.test.js` and `tests/yoni-gate.test.js` guard it.

**Clinical approval.** Three files are clinical content, and each needs a registered professional's recorded approval, bound to the file's sha256 in `YAHEALTHYbackend/data/clinical-approvals.json` (`utils/clinical-approval.js`):

- Adi's prompt
- Yoni's prompt
- `utils/health-calculations.js`, the formula behind the app's calorie target

Editing any of these revokes its approval. `npm run approvals:hash` prints each file's current hash and status, and exits 1 while anything is unapproved.

As of this commit, none of the three is approved. In production:

- **An unapproved persona does not reach the model.** It answers with a fixed "we are completing a professional review" message.
- **The app withholds the calculated calorie target.** `GET /api/targets` returns `calories: null` with `withheldPendingApproval: true`.
- **The server still starts.** Some comments and script output say production refuses to start; it does not.

To record an approval, after she has read the exact text:

1. Run `npm run approvals:hash`.
2. In `clinical-approvals.json`, set `approvedSha256`, `approvedBy` and `approvedAt` for that entry.
3. Commit and deploy.

Every logged bot reply carries the prompt version that produced it (`adi:<12 hex>`).

**Vendored prompts must match.** The source of truth for editing is the repo-root `docs/bot/chef-bot-prompt.md` and `docs/bot/nuri-bot-prompt.md`. Vercel deploys only `YAHEALTHYbackend/`, so the copies in `YAHEALTHYbackend/docs/bot/` are what answer customers, and what the approval hashes cover. After editing a prompt, copy it across byte for byte.

`tests/yoni-persona.test.js` fails if the chef copy drifts. Nothing checks Adi's copy; the two are identical today.

**Other guards not to weaken:**

- `utils/weight-goal-safety.js` refuses a goal below BMI 18.5.
- `utils/weight-progress.js` decides when a weigh-in is congratulated.
- Food values come only from sourced data (`routes/foods.js`, `scripts/ingest-foods.js`), never typed in or produced by a model.
- No card data ever reaches the server.
- `requireStaff` fails closed.

---

## Going-live checklist

1. **Database:** run `YAHEALTHYbackend/migrations/ALL.sql` in the Supabase SQL Editor.
2. **Vercel project environment** (Production):
   - `NODE_ENV=production`, `JWT_SECRET`, `CORS_ORIGINS` (the frontend origin)
   - `SUPABASE_URL`, `SUPABASE_KEY` (a server key)
   - `APP_URL` (frontend), `API_PUBLIC_URL` (backend)
   - `SMTP_URL`. Without it, new customers never get their set-password link.
   - `PAYPLUS_API_KEY`, `PAYPLUS_SECRET_KEY`, `PAYPLUS_PAYMENT_PAGE_UID`, `PAYPLUS_ENV=production`
   - `PLAN_BASE_AMOUNT`, `PLAN_YONI_AMOUNT`, `PRODUCT_MENU_AMOUNT`, `SESSION_SUPERMARKET_AMOUNT`, `BOOKING_CLINIC_ADDRESS`
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` (`GOOGLE_CALENDAR_ID` if not `primary`)
   - `CRON_SECRET`
   - `WHAPI_TOKEN`, `WHAPI_WEBHOOK_SECRET`, `WHATSAPP_WEBHOOK_SECRET`
   - `ANTHROPIC_API_KEY` (and `ANTHROPIC_WORKSPACE_ID` for an org-scoped key), `ANTHROPIC_MODEL`
3. **GitHub secrets:** for `deploy.yml` — `JWT_SECRET`, `SUPABASE_URL`, `SUPABASE_KEY`, `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_ORG_ID`; for `nudges.yml` — `API_URL` (the backend's public URL) and `CRON_SECRET` (the same value as in Vercel).
4. **Google Calendar:** in Google Cloud, create a "Desktop app" OAuth client and enable the Calendar API. Then run:

   ```powershell
   cd YAHEALTHYbackend
   node scripts/google-auth.js --client-id <ID> --client-secret <SECRET> --save
   ```

   She approves the link, and `GOOGLE_*` is written to `.env`. Copy the same values into Vercel. Publish the OAuth consent screen: while the app is in "Testing", the refresh token expires after 7 days.
5. **WHAPI:** set the webhook to `<API_PUBLIC_URL>/api/whapi` (WHAPI appends `/messages`), with the custom header `X-Webhook-Secret: <WHAPI_WEBHOOK_SECRET>`.
6. **PayPlus:** nothing to set in its dashboard for the callback. Each payment link carries `API_PUBLIC_URL/api/payments/callback`, so that URL must be reachable from the internet.
7. **Staff access**, by SQL, per person:

   ```sql
   update public.users set is_staff = true where email = 'someone@example.com';
   ```

8. **The dietitian's recorded approval** of both prompts and of `utils/health-calculations.js`, as described in [Safety rules](#safety-rules-do-not-break). Her credential entry in `clinical-approvals.json` is still marked unverified.
9. **Run the evals** against the production model: `npm run eval`, `npm run eval:safety`, `npm run eval:yoni`, `npm run eval:live`. Release only with every blocker passing.
10. **Frontend:** build with `npx vite build`, host it, and point it at the backend (see [Deploy](#deploy)).

---

## Other documents

| Document | State |
|---|---|
| [AGENTS.md](AGENTS.md) | Conventions for agents and editors (RTL, i18n, accessibility, quirks). Current, with small gaps: its page list omits Landing and the password pages, and it names `crm-routes.js`/`crm-ai-assistant.js`, which are no longer in the repo. |
| [evals/README.md](evals/README.md) | How the eval harness works (Hebrew). Its case counts predate the recipe cases (the harness has 54: 49 bare and 5 tool cases), and it says the judge's JSON parsing is still broken; `run-eval.mjs` has since fixed it. |
| [docs/bot/](docs/bot/) | `chef-bot-prompt.md` and `nuri-bot-prompt.md` are the live prompt sources. `sales-bot-prompt.md` and `manychat-flows.md` are not loaded by any code. |
| [docs/nutrition/FORMULAS-RESEARCH-STATUS.md](docs/nutrition/FORMULAS-RESEARCH-STATUS.md) | Where the calorie formulas stand (marked partial, not verified). Relevant to the `app-calorie-target` approval. |
| [docs/product-truth.md](docs/product-truth.md) | The owner's product and pricing sheet (17/09). Its prices (for example, chef coaching at ₪149) are not what the code sells: `PLAN_*_AMOUNT` and the plan comments in `routes/payments.js` say 150 / 250. |
| [docs/SECURITY_CHECKLIST.md](docs/SECURITY_CHECKLIST.md), [docs/compliance-register.md](docs/compliance-register.md), [docs/product-gap-map.md](docs/product-gap-map.md) | Point-in-time audits (17–20/09), partly outdated. For example, they cite files that no longer exist (`requireEntitlement.js`, `routes/chef.js`), and say there are no roles and no coach endpoints. |
| `YAHEALTHYbackend/*.md`, `CRM_*`, `SETUP_SUMMARY.txt`, `YAHEALTHYFrontend/README.md` | Historical. `PRODUCTION_SETUP.md` tells you to run `supabase.sql` and use the anon key. Do neither. |
