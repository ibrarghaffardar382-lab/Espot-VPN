# Espot VPN — Chrome Extension

The browser client for Espot VPN. The user signs in with their VPN account, and the
extension routes the browser's traffic through the Espot VPN gateway (which in turn
relays it out through their assigned proxy).

This is a **Manifest V3** extension with no build step — load the folder as-is.

---

## Install (developer / unpacked)

1. Open `chrome://extensions` in Chrome (or any Chromium browser).
2. Toggle **Developer mode** on (top-right).
3. Click **Load unpacked** and select this `espot-vpn-extension` folder.
4. Pin the **Espot VPN** icon to the toolbar.

## Use

1. Click the toolbar icon.
2. Enter:
   - **Backend URL** — your deployed backend, e.g. `https://your-app.onrender.com`
     (the same server from the backend bundle).
   - **Username / Password** — the VPN user created in the admin portal.
3. Click **Connect**. The icon shows an **ON** badge and the popup shows your
   account, exit location and connection time.
4. Click **Disconnect** to stop and restore your normal connection.

A demo user exists if you ran the backend seed: **`demo` / `demo1234`**.

---

## How it works

- On connect, the extension calls `POST /api/client/login` and receives a session
  token plus the gateway's `scheme` / `host` / `port`.
- It sets Chrome's proxy (`chrome.proxy`) to the gateway and answers the gateway's
  proxy-auth challenge with the username + session token
  (`chrome.webRequest.onAuthRequired`).
- A once-a-minute **heartbeat** keeps the session alive and detects admin
  **force-logout** — if your session is revoked, the extension disconnects itself
  and shows a message.
- Each device gets a stable `deviceId`, so reconnecting reuses the same session
  instead of consuming another device slot. Concurrent **device limits** are
  enforced by the backend.

## Files

```
manifest.json     # MV3 manifest + permissions (proxy, webRequest, alarms, storage)
background.js     # service worker: proxy control, auth provider, heartbeat
popup.html/css/js # the connect/disconnect UI
icons/            # toolbar + store icons (16/32/48/128)
```

## Notes & limitations

- The gateway host must accept the HTTP `CONNECT` method for HTTPS sites to tunnel.
  See the backend README's Render caveat — you may need to run the gateway on a host
  that allows raw TCP. The extension uses whatever `scheme`/`host`/`port` the backend
  reports, so this is a server-side configuration choice.
- Traffic to the backend host itself is bypassed (not proxied) so login/heartbeat
  calls always work.
