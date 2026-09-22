# YAHealthy — Base44 Development Notes

## Stack
- **Frontend**: `YAHEALTHYFrontend` — React 18 + TypeScript + Vite (port 5173 in-container, mapped to host 3000), Tailwind, recharts.
- **Backend**: `YAHEALTHYbackend` — Express 5 (CommonJS), JWT auth, single `index.js` (~3500 lines), port 5000.
- **No real DB required**: without `SUPABASE_URL`/`SUPABASE_KEY` the backend runs an in-memory store (`ALLOW_MEMORY_DB=true` in compose). Data resets on backend restart.
- Vite proxies `/api` → `process.env.BACKEND_URL || http://localhost:5000`; in compose this points at the `backend` service.

## Run / verify
```bash
docker compose -f docker-compose.base44.yml up -d
curl -s localhost:5000/api/health   # backend health
curl -s -o /dev/null -w "%{http_code}" localhost:3000/login  # frontend
```

## Quirks
- **Never commit compiled `.js` next to `.tsx`**: Vite resolves `.js` BEFORE `.tsx` for extensionless imports, so a stale `tsc -b` artifact silently overrides your source edits. These were removed from `src/`; if `tsc -b` is run, delete the emitted `.js` files again (see `.gitignore`).
- `vite.config.js` / `vite.config.d.ts` were compiled artifacts of `vite.config.ts` — same rule, they were deleted.
- Backend secrets come from `/run/base44/app.env` (JWT_SECRET, optional SUPABASE_*); local dev placeholders are fine.
- `YAHEALTHYbackend/index.js.backup`, `Plugin/`, and the many `*.md`/`CRM_*` docs are historical; don't touch them.

## Accessibility (applied 2026-09)
Skip-to-content link, `<main>` landmark, `aria-current` nav links, labeled inputs (`htmlFor`/`id`), `role="alert"` form errors, `aria-live` loading/response regions, chart text alternative (`figcaption.sr-only`), `focus-visible` ring + `prefers-reduced-motion` in `index.css`, Delete buttons with food-name `aria-label`. Keep new UI to this standard.
