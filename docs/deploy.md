# Deploying the public demo

The Rider app runs on Vercel Hobby. The backend (API and PostgreSQL with PostGIS) runs on the owner's laptop in Docker Compose and is reached through Tailscale Funnel. Cost is $0 and no card is needed. If any service asks for a card, stop and reassess.

## 1. Backend on the laptop

1. Install Docker Desktop and Tailscale. Sign in to Tailscale and, in the admin console, enable HTTPS certificates and allow Funnel for this machine (Access controls, `funnel` node attribute).
2. `cp .env.example .env`, then set `POSTGRES_PASSWORD` and `CORS_ORIGINS` (the Vercel origins; `*` matches one subdomain label so preview deploys work).
3. `yarn demo:up`. It builds and starts the API and PostgreSQL (`restart: always`), runs migrations before the API starts, turns on `tailscale funnel` for port 5001 and keeps the Mac awake with `caffeinate`.
4. The command prints the public URL (`https://<machine>.<tailnet>.ts.net`). Check `<url>/health` from a phone off your Wi-Fi.
5. `yarn demo:down` stops all three.

Migrations live in `apps/api/migrations` and run with `yarn workspace @thirrem/api migrate`. The API container runs them on every start.

### Verify before relying on Funnel

- **Reboot:** reboot the laptop, run `yarn demo:up`, and confirm the URL is unchanged.
- **Websockets:** confirm a websocket connects through the URL once the API has a websocket endpoint.
- **Fallback:** if either fails, use an ngrok free dev domain. Its pages show a browser warning unless requests send the `ngrok-skip-browser-warning` header.

### Map and routing services

The map and routes use free public services, with no key and no card:

- Map tiles and label fonts come from [OpenFreeMap](https://openfreemap.org), fetched by the browser. The map attribution stays visible.
- Street and place search comes from the public [Photon](https://photon.komoot.io) geocoder, called by the API only, with the same caching, per-client limit (`SEARCH_RATE_LIMIT`) and User-Agent. When it is down the planner says so and the Rider can still click the map.
- Routes come from the public OSRM server, called by the API only. The API caches routes, limits each client (`ROUTE_RATE_LIMIT`) and sends a `thirrem-demo` User-Agent, as the public server asks. It is best-effort, so when it is down the planner shows a plain "Routing is unavailable" message.

Both can change or disappear. To swap the router, point `OSRM_URL` at any OSRM-compatible server.

## 2. Frontend on Vercel

1. Sign up at vercel.com with GitHub (Hobby plan).
2. Import the repo as a new project:
   - Root Directory: `apps/rider`
   - Enable "Include source files outside of the Root Directory in the Build Step" so `packages/*` are available.
   - `apps/rider/vercel.json` sets the install command (run from the repo root, Yarn workspaces), build command and SPA rewrites.
3. Environment variables (Production and Preview): `API_BASE_URL` = the Funnel URL, no trailing slash.
4. Push a branch first and check its preview deploy (landing page, signup, login), then merge to `main` for production.
5. Add the production `*.vercel.app` URL to `CORS_ORIGINS` in `.env`, then `yarn demo:up` again.

`API_BASE_URL` is read at build time. Locally it stays empty and the Vite dev proxy forwards `/rider` and `/health` to the API on port 5001.

## Configuration reference

| Variable | Where | Notes |
|---|---|---|
| `DATABASE_URL` | API | Required when `NODE_ENV=production`. Local default points at `yarn db:up`. |
| `PORT` | API | Default 5001. |
| `CORS_ORIGINS` | API | Comma-separated; `*` matches one subdomain label. localhost is added outside production. |
| `AUTH_RATE_LIMIT` | API | Signup and login attempts per client per minute. Default 10. |
| `OSRM_URL` | API | OSRM-compatible routing server. Default `https://router.project-osrm.org`. |
| `PHOTON_URL` | API | Photon-compatible geocoder. Default `https://photon.komoot.io`. |
| `SEARCH_RATE_LIMIT` | API | Place searches per client per minute. Default 60. |
| `ROUTE_RATE_LIMIT` | API | Route requests per client per minute. Default 30. |
| `TRUST_PROXY` | API | `true` behind Funnel so rate limiting sees the real client IP. |
| `POSTGRES_PASSWORD` | Compose | Required, no default. |
| `API_BASE_URL` | Vercel build | Public API URL. |

Signup and login allow 10 attempts per client per minute. Sessions last 7 days.
