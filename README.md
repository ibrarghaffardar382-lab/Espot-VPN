# Espot VPN — Full Source (Standalone Handoff)

This is the complete, self-contained source for Espot VPN. It has **no dependency on
Replit** — clone/unzip it anywhere and work on it directly. There are three projects:

```
espot-vpn-backend/    Control-plane API + admin portal + proxy gateway (Node + TypeScript)
espot-vpn-extension/  Chrome (Manifest V3) browser client
espot-vpn-mobile/     Expo / React Native mobile client
```

Each project has its own `README.md` with full setup, run, and deploy instructions.
Start there. This file is just the map.

---

## What each part does

- **espot-vpn-backend** — the server. It is one Node process that serves:
  1. the **admin portal** (a React dashboard, prebuilt into `dist/public`),
  2. the **control-plane API** the portal, extension, and mobile app call, and
  3. the **proxy gateway** that actually relays user browser traffic out through each
     user's assigned upstream proxy.

  All three run on a single HTTP port (default `8888`). It needs a PostgreSQL
  database (`DATABASE_URL`). See `espot-vpn-backend/README.md` and
  `espot-vpn-backend/.env.example` for all environment variables.

- **espot-vpn-extension** — a Manifest V3 Chrome extension, **no build step**. Load the
  folder unpacked in `chrome://extensions`. The user signs in, the extension points
  Chrome's proxy at the gateway and answers its auth challenge with the user's session
  token. See `espot-vpn-extension/README.md`.

- **espot-vpn-mobile** — an Expo/React Native app (the mobile client). See
  `espot-vpn-mobile/README.md` for running it with Expo and building with EAS.

---

## Quick start (backend)

```bash
cd espot-vpn-backend
cp .env.example .env          # then fill in DATABASE_URL and admin credentials
npm install
npm run db:push               # create the database tables
npm run seed                  # optional: demo admin/plan/user
npm start                     # runs the server (tsx src/index.ts)
```

The server runs the TypeScript directly with `tsx` — there is **no compile step** to
start it. (`npm run build` only builds the React admin portal into `dist/public`.)

## Deployment

- **Render** — `espot-vpn-backend/render.yaml` is a ready blueprint (web service +
  managed Postgres). NOTE: a standard Render web service can run the portal + API but
  **cannot carry the proxy gateway traffic** (it doesn't pass the HTTP `CONNECT`
  method). For a working VPN the gateway must run on a host with a raw TCP port — a
  small VPS works well. See the caveat in `espot-vpn-backend/README.md`.
- **VPS / any host with a public IP** — install Node, set the env vars, run
  `npm start` (process-manage with pm2 or systemd). Point `GATEWAY_PUBLIC_HOST` at the
  server's public IP/hostname.

## Required environment (backend)

See `espot-vpn-backend/.env.example` for the authoritative list. The important ones:

- `DATABASE_URL` — PostgreSQL connection string (required)
- `PORT` — HTTP port (the portal, API, and proxy all share it)
- `ADMIN_USERNAME` / `ADMIN_PASSWORD` — admin portal login
- `JWT_SECRET` — signs admin sessions (VPN client session tokens are random,
  database-stored, and are **not** derived from this)
- `GATEWAY_PUBLIC_HOST` / `GATEWAY_SCHEME` / `GATEWAY_PORT` — what the clients are told
  to use as their proxy host/scheme/port

---

## Repo layout (backend)

```
src/
  index.ts            boots the HTTP server + proxy gateway on one port
  env.ts              environment variable parsing
  api/                Express app, routes, auth middleware
  gateway/            proxy server: CONNECT/HTTP relay, upstream chaining, auth
  db/                 Drizzle schema, connection, seed
  lib/                crypto, tokens, blocklist, logging, helpers
client/               React admin portal source (built into dist/public)
dist/public/          prebuilt admin portal (served by the API)
render.yaml           Render deployment blueprint
```
