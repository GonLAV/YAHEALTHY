# YAHealthy Frontend

A modern, responsive React + Vite frontend for the YAHealthy nutrition and health tracking application.

## Features

- **Authentication**: User signup and login with JWT tokens
- **Dashboard**: Overview of daily nutrition stats with charts
- **Food Logging**: Log meals with detailed nutritional information
- **Analytics**: Track progress and insights over time
- **Responsive Design**: Works great on desktop and mobile devices

## Tech Stack

- **React 18** - UI framework
- **TypeScript** - Type-safe JavaScript
- **Vite** - Fast build tool
- **Tailwind CSS** - Utility-first CSS framework
- **Recharts** - Charts and visualizations
- **Axios** - HTTP client
- **React Router** - Client-side routing

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file (copy from `.env.example`):
```bash
cp .env.example .env
```

3. Update `.env` with your backend URL and Supabase credentials

4. Start development server:
```bash
npm run dev
```

5. Build for production:
```bash
npm run build
```

## Project Structure

```
src/
├── pages/           # Page components
├── components/      # Reusable components
├── services/        # API client and services
├── hooks/          # Custom React hooks
├── App.tsx         # Main app component
├── main.tsx        # Entry point
└── App.css         # Global styles
```

## Development

- Use `npm run dev` to start the development server
- Use `npm run build` to create an optimized production build
- Use `npm run preview` to preview the production build

## Notes

- The frontend connects to the backend API at `http://localhost:5000` by default
- Authentication tokens are stored in localStorage
- All API requests are authenticated with JWT tokens

## SEO & prerendering (public pages)

Public, indexable URLs — Hebrew at the root, English under `/en`:
`/`, `/en`, `/guides`, `/en/guides`, `/guides/<slug>`, `/en/guides/<slug>`.
The single route list, head tags (canonical, hreflang he/en/x-default, Open
Graph, Twitter, JSON-LD) and the sitemap all come from `src/seo/site.ts`;
guide content is data in `src/content/guides.ts`.

**Build** (`npm run build`):

1. `tsc -b && vite build` — the normal client bundle into `dist/`.
2. `npm run prerender` — `vite build --ssr src/entry-server.tsx --outDir dist-ssr`,
   then `node scripts/prerender.mjs`, which renders each public route with
   `react-dom/server` (no browser, no extra dependency) and writes:
   - `dist/index.html`, `dist/en/index.html`, `dist/guides/…/index.html`,
     `dist/en/guides/…/index.html` — full HTML with `<html lang dir>`, head
     tags and content; `#root` is stamped `data-prerendered-path`.
   - `dist/app.html` — the untouched SPA shell with `noindex`.
   - `dist/sitemap.xml`, and `dist/robots.txt` (from `public/robots.txt` + the
     absolute `Sitemap:` line).

Set **`VITE_SITE_URL`** (e.g. `https://www.example.com`) for any build that is
deployed; canonical/OG/sitemap URLs need the real origin. Without it the build
warns and uses `http://localhost:4173` (only right for `vite preview`).

In the browser, `src/main.tsx` hydrates the prerendered HTML when the document
is the page it was rendered for (and a signed-in visitor on `/` is not about to
be redirected); otherwise it renders from scratch.

**Hosting.** The backend (`YAHEALTHYbackend`, and its `vercel.json`, which
rewrites every path to the Express function) serves only the API and its own
legacy `public/` pages — it does not serve this frontend. Deploy `dist/` to a
static host (or nginx) with these rules, in order:

1. an existing file → that file (`/sitemap.xml`, `/robots.txt`, `/assets/*`, `/seo/*`);
2. `<path>/index.html` exists → serve it **without** a trailing-slash redirect
   (canonical URLs have no trailing slash);
3. `/api/*` → proxy to the backend;
4. anything else → `/app.html` (SPA fallback for `/dashboard`, `/login`, …).

nginx example: `location /api/ { proxy_pass http://backend:5000; }` and
`location / { try_files $uri $uri/index.html /app.html; }`.
Hashed files under `/assets/` can be cached immutably; HTML should be `no-cache`.
If a host can only fall back to `index.html`, it still works: the client sees
the path mismatch and renders the right route instead of hydrating.
`scripts/lib/static-server.mjs` implements exactly these rules for the checks.

**Checks** (after `npm run build`):

- `npm run test:seo` — robots/sitemap/prerendered HTML: hreflang pairs, one
  canonical per page, OG/Twitter, JSON-LD parses with no rating/review/offer
  fields, no private routes in the sitemap (cross-checked against the
  `<PrivateRoute>` routes in `App.tsx`), guide CTAs carry
  `utm_source=seo&utm_medium=guide&utm_campaign=<slug>`.
- `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers npm run perf:public` —
  Lighthouse-style run with the already-installed Playwright/Chromium (not a
  dependency; skipped if absent): crawler view with JS off, LCP/CLS/FCP/TTFB
  on a throttled mobile profile against CWV budgets, hydration in place
  without console errors, private-route fallback.
- `node scripts/render-seo-images.mjs` re-rasterises `public/seo/*.svg` into
  the committed OG image / logo PNGs after an SVG change.

Adding a public page: add it to `matchPublicRoute`/`PUBLIC_ROUTES` in
`src/seo/site.ts` and a `<Route>` in `App.tsx`; call `usePublicPage()` in the
page. Adding a private page: also add it to `PRIVATE_PATHS` and
`public/robots.txt` (the test fails otherwise).
