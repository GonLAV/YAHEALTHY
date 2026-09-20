# YAHEALTHY — Base44 Dev Environment

## Architecture
- **Frontend**: Vite 5 + React 18 + TypeScript + Tailwind, served on port 5173 (mapped to host 3000)
- **Backend**: Express 5 + Node.js, served on port 5000 (internal + exposed)
- **Database**: Supabase in production; in-memory store in dev (`ALLOW_MEMORY_DB=true`)
- **Auth**: JWT-based, bcrypt password hashing

## Key Setup Notes
- **Dual config files**: The repo has both `.tsx`/`.ts` and compiled `.js`/`.jsx` duplicates. Vite loads `vite.config.js` (not `.ts`) — keep both in sync when editing config.
- **Proxy**: Frontend proxies `/api` to the backend. The proxy target is set via `VITE_PROXY_TARGET` env var (defaults to `http://localhost:5000`); in Docker it points to `http://backend:5000`.
- **`VITE_API_URL`** is left empty so the frontend uses same-origin relative paths through the Vite proxy (single-origin wiring).
- **Backend env**: `ALLOW_MEMORY_DB=true` lets the backend start without Supabase. `JWT_SECRET` is auto-generated if missing in dev mode.

## Verify It Works
```bash
docker compose -f docker-compose.base44.yml up -d
curl http://localhost:3000/api/health   # should return JSON status
curl http://localhost:3000              # should return Vite HTML
```

## Dev Commands
- Frontend: `npm run dev` (Vite with HMR)
- Backend: `npm run dev` (nodemon with auto-reload)
- Both run inside Docker containers with bind-mounted source.
