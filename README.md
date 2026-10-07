# TimePlan Tool

A single-page weekly time-planning application built with React, TypeScript, Vite, Tailwind CSS, and dnd-kit.

## Features

- **CSV Import** — upload a CSV exported directly from your spreadsheet; category header rows are detected automatically
- **Activity Backlog** — left panel listing all imported activities grouped by category, with duration and weekly-target details
- **Weekly Time-Grid Planner** — Google Calendar-like weekly view with continuous timeline (00:00-24:00), scroll, and overlap support
- **Daily Plan** — switch to a separate plan for today without changing the weekly schedule; it resets to an empty plan on a new date
- **Starred Activities** — star backlog items to pin them above the category groups
- **JSON Save/Load** — export the full ready schedule to a named JSON file on your machine, then import it back anytime
- **Custom Days** — add or remove day columns (e.g. Sunday) the same way as managing time slots
- **Drag-and-Drop** — powered by FullCalendar interaction plugin; drag backlog items into the calendar, move/resize events in 15-minute steps
- **Now Indicator** — a red line marks the current time in the weekly view
- **Progress Tracking** — per-activity scheduled / target / remaining count with a progress bar
- **Statistics** — total scheduled minutes per day and for the full week
- **Persistence** — state is auto-saved to `localStorage` and restored on reload

## CSV Format

The CSV must match the following column layout (exported from the spreadsheet exactly):

| A — Tevékenység | B — Napi (perc) | C — Heti (óra) | D — Heti alkalmak | E — Megjegyzés |
|---|---|---|---|---|

Rows where columns B–D are all empty are treated as **category headers** (e.g. `Minőségi`, `Technikai`, `Magán`).

## Getting Started

```bash
npm install
```

For the planner, run `npm run dev` and open
[http://localhost:5173/](http://localhost:5173/).

## Build

```bash
npm run build
```

## Authentication and Cloud Sync

The app uses Pocket ID Authorization Code + PKCE. Planner data and the four
presets are stored in the API database per verified OIDC subject. UI visibility
preferences stay in the browser. The API is a separate Node.js 20+ service.

### Local Development

The local development ports are configured together in
[`dev-ports.json`](./dev-ports.json): `frontend` defaults to `5173` and `api`
to `4001`. Change the relevant value there; Vite and the API use these values
when started in development mode, and the frontend's local API URL is derived
from the API port automatically. If you change the frontend port, also update
the Pocket ID redirect URI and the matching `OIDC_REDIRECT_URI` and
`CORS_ORIGIN` values in `server/.env`.

1. Configure the Pocket ID client to allow this redirect URI exactly:
	 `http://localhost:5173/`
2. Copy `.env.example` to `.env` and set `VITE_OIDC_ISSUER` and
	 `VITE_OIDC_CLIENT_ID`. The local API URL is read from `dev-ports.json`.
3. Install and configure the API:

	 ```bash
	 cd server
	 cp .env.example .env
	 npm install
	 ```

	 Set `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`,
	 `OIDC_REDIRECT_URI=http://localhost:5173/`, and
	 `CORS_ORIGIN=http://localhost:5173` in `server/.env`. The client ID must
	 match the frontend value. Never put the client secret in a `VITE_` variable.
4. Start both development servers from the repository root with one command:

	 ```bash
	 npm run dev:all
	 ```

	 Open `http://localhost:5173/`.
	 This runs Vite and the API as two child processes; stopping the command stops
	 both. `npm run dev` and `npm run dev:api` remain available separately.

### Production Deployment

- Register `https://<frontend-domain>/` as the Pocket ID redirect URI.
	Set the exact same value in the API's `OIDC_REDIRECT_URI`.
- Set frontend build variables `VITE_OIDC_ISSUER` and `VITE_OIDC_CLIENT_ID`.
	Set `VITE_API_BASE_URL=` (empty) so the browser calls `/api` on the same
	origin. These values are public; the OIDC client secret is not.
- Set API `PORT` if the production API should use a non-default port (otherwise
	the API port in `dev-ports.json` is used), `CORS_ORIGIN=https://<frontend-domain>`
	without a path, and provide `OIDC_ISSUER`, `OIDC_CLIENT_ID`,
	`OIDC_CLIENT_SECRET`, and a persistent `DATABASE_PATH` in the server
	environment.
- Build the frontend with `npm run build`, then install server dependencies with
	`cd server && npm ci --omit=dev`. Start the single production Node process
	with `pm2 start ecosystem.config.cjs --cwd server` (or run that command from
	`server/`). The Express process serves both `dist/` at `/` and the
	API at `/api`.
- Put that one process behind an HTTPS reverse proxy, forwarding both `/api/`
	and `/` to `127.0.0.1:4001`. The Node server intentionally does not
	bind to a public interface. The PM2 config uses one forked instance.
- Back up the SQLite database regularly and keep its containing directory
	persistent across deployments.

The API exposes `POST /api/auth/token` and `POST /api/auth/refresh` as the
server-side Pocket ID token proxy, plus authenticated `GET /api/state` and
`PUT /api/state` for the account's planner document. The first account to use
this browser imports its existing local planner if the cloud record is empty.
If a cloud record already exists, it is loaded and the old local snapshot is
kept in browser storage for recovery. After this one-time migration, a different
empty account starts with a blank planner rather than inheriting local data.

Access and refresh tokens are stored in browser `localStorage`, matching the
documented SPA trade-off in `AUTH_SETUP.md`; this is exposed to successful XSS.
The client secret remains server-only. For applications that need stronger
browser-side token isolation, use a BFF with `httpOnly` cookies instead.

### Checks

```bash
npm run build
npm run lint
npm test --prefix server
```
