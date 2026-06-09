# Espot VPN — Backend & Control Plane

This bundle is the **server side** of Espot VPN. A single Node.js service runs:

1. **Admin portal** — a web dashboard to manage users, proxies, plans, sessions and website blocks.
2. **Control-plane API** — endpoints the admin portal and the Chrome extension call.
3. **Centralized proxy gateway** — all user browser traffic is relayed through this
   server first, then out through the user's assigned upstream proxy. Because every
   tunnel is dialed from *this* server, an upstream/vendor proxy only ever sees one
   IP — even when many users/devices share the same upstream proxy.

> Billing (Stripe / monthly SaaS charges) is intentionally **not** included yet.
> Plans exist and carry a price field, but no payment is collected.

---

## What's inside

| Area | Tech |
| --- | --- |
| Runtime | Node.js 20+, TypeScript (run directly via `tsx`) |
| API | Express |
| Database | PostgreSQL via Drizzle ORM |
| Admin portal | React + Vite (built to `dist/public`, served by the API) |
| Proxy gateway | Node `http` CONNECT tunneling + SOCKS5 chaining (`socks`) |
| Auth | Admin: JWT. VPN users: app-managed credentials + per-device session tokens |

---

## Features

- **User management** — create/edit/suspend/delete VPN users, set their password,
  assign a plan and an upstream proxy, override device limits, see data usage.
- **Proxy management** — register HTTP/HTTPS/SOCKS5 upstream proxies; assign to users.
- **Session management** — see every logged-in device, its IP and data usage;
  force-logout a single device, all of a user's devices, or everyone. Per-user
  concurrent **device limits** are enforced at login.
- **Website blocking** — block domains globally, per plan, or per user. Enforced at
  the gateway (with subdomain matching) within a few seconds of the change.
- **Centralized routing** — shared egress IP via this gateway, as described above.
- **Dashboard** — live counts of users, sessions, proxies, plans and data relayed.

---

## Quick start (local)

```bash
npm install
cp .env.example .env          # then edit DATABASE_URL etc.
npm run db:push               # create the database tables
npm run seed                  # optional: demo plan/proxy/user (demo / demo1234)
npm run dev                   # starts on http://localhost:5000
```

Open `http://localhost:5000` and sign in with `ADMIN_USERNAME` / `ADMIN_PASSWORD`
from your `.env`.

### Environment variables

See `.env.example`. The important ones:

- `DATABASE_URL` — PostgreSQL connection string (required).
- `ADMIN_USERNAME` / `ADMIN_PASSWORD` — admin portal login.
- `JWT_SECRET` — signs admin sessions (use a long random value).
- `GATEWAY_PUBLIC_HOST` / `GATEWAY_SCHEME` / `GATEWAY_PORT` — what the extension is
  told to use as its proxy. By default the gateway shares the main HTTP port.

---

## Deploying to Render

A `render.yaml` blueprint is included. In the Render dashboard:

1. **New → Blueprint**, point it at this repo/folder.
2. Render creates the web service **and** a managed PostgreSQL database, wiring
   `DATABASE_URL` automatically.
3. Set the `sync: false` secrets when prompted: `ADMIN_USERNAME`, `ADMIN_PASSWORD`,
   and `GATEWAY_PUBLIC_HOST` (your service hostname, e.g. `your-app.onrender.com`).
   `JWT_SECRET` is generated for you.
4. The build runs `npm install && npm run build`; start runs `npm run db:push && npm start`.

Then visit `https://<your-service>.onrender.com` to reach the admin portal.

### ⚠️ Important caveat about the proxy on Render

Standard Render **web services terminate TLS and forward only normal HTTP** to your
app — they do not pass the HTTP `CONNECT` method through, which the proxy tunnel
needs. So while the **admin portal and API work perfectly** on a Render web service,
the **proxy gateway** generally needs a host that allows raw TCP / CONNECT, for
example:

- a Render service exposed over a raw TCP port, or
- a small VM / VPS where you run this same bundle and point `GATEWAY_PUBLIC_HOST`
  at it, or
- running `npm start` anywhere with a public IP and using `GATEWAY_PORT` for a
  dedicated proxy port.

The extension lets the user enter the backend URL, and the server tells it which
host/port/scheme to use as the proxy (`GATEWAY_PUBLIC_HOST` / `GATEWAY_PORT` /
`GATEWAY_SCHEME`), so you can run the control plane and the gateway on different
hosts if needed.

---

## Project layout

```
src/
  index.ts            # boots the HTTP server + proxy gateway on one port
  env.ts              # environment configuration
  api/
    app.ts            # Express app: mounts routes + serves the portal
    middleware/       # admin auth
    routes/           # auth, users, proxies, plans, sessions, blocklist,
                      # dashboard (admin) + client (extension) endpoints
  db/                 # Drizzle schema, connection, seed
  gateway/            # proxy server: CONNECT/HTTP relay, upstream chaining,
                      # credential resolution, force-logout cache
  lib/                # password hashing, JWT, blocklist logic, TTL cache, logger
client/               # React admin portal (Vite)
```

## How a user connects (end to end)

1. The Chrome extension calls `POST /api/client/login` with the user's username +
   password. The server checks the device limit and creates a **session** whose
   token doubles as the user's proxy password.
2. The extension configures the browser to use this server as its proxy and answers
   the proxy's auth challenge with `username` + the session **token**.
3. For each connection the gateway looks up the token → user → assigned upstream
   proxy + effective blocklist (cached ~8s), blocks disallowed hosts, and otherwise
   relays the traffic out through the upstream proxy.
4. Revoking the session in the admin portal makes the next connection fail within
   seconds, and the extension's heartbeat notices and disconnects.

---

## Common issues & fixes

### Traffic not going through the proxy / websites inaccessible

**Cause:** `GATEWAY_PUBLIC_HOST` is set to `localhost` (the default).

When the extension connects it receives the gateway host from the server and tells Chrome to use it as a proxy. If the host is `localhost`, Chrome tries to proxy through the user's own machine — not your server — and all traffic fails.

**Fix:** Set `GATEWAY_PUBLIC_HOST` in your environment variables to your server's actual public hostname:

```
# Render example:
GATEWAY_PUBLIC_HOST=my-vpn-app.onrender.com
GATEWAY_SCHEME=http     # Render handles TLS upstream; Node speaks plain HTTP
GATEWAY_PORT=           # Leave blank to share the main PORT
```

Redeploy after changing env vars. Users must disconnect and reconnect the extension to pick up the new gateway address.

---

### Extension asks for a password / shows a login dialog

**Cause:** Chrome's MV3 service workers are killed and restarted frequently. When the worker restarts mid-session, the in-memory credential cache is empty. If Chrome fires a 407 proxy challenge before the cache warms from storage, it falls through to the native password dialog.

**Fix (already applied in this release):** `background.js` now:
1. Keeps an in-memory `_stateCache` that is populated at worker boot before any requests can arrive.
2. Falls back to an async storage read only when the cache is cold (first request of a fresh boot).
3. Re-applies proxy settings and re-creates the heartbeat alarm at every worker restart, not just on `chrome.runtime.onStartup` (which only fires when Chrome itself starts).

If you still see the password dialog after reloading the extension, disconnect and reconnect once to write a fresh session to storage.
