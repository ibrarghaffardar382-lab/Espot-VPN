// Espot VPN — background service worker.
// Owns the proxy configuration, supplies proxy credentials, and keeps the
// session alive (and reacts to admin force-logout) via a heartbeat alarm.

const HEARTBEAT_ALARM = "espot-heartbeat";
const HEARTBEAT_MINUTES = 1;

// ---- in-memory state cache --------------------------------------------------
// Chrome MV3 service workers are killed and restarted frequently. Reading from
// chrome.storage.local on every onAuthRequired call can be too slow — the 407
// challenge callback times out and Chrome shows a native password dialog.
// We warm this cache at worker boot and keep it in sync on every setState call.
let _stateCache = null;

// ---- storage helpers --------------------------------------------------------
async function getState() {
  if (_stateCache !== null) return _stateCache;
  const { state } = await chrome.storage.local.get("state");
  _stateCache = state ?? { connected: false };
  return _stateCache;
}

async function setState(patch) {
  const current = await getState();
  const next = { ...current, ...patch };
  _stateCache = next;
  await chrome.storage.local.set({ state: next });
  return next;
}

async function getDeviceId() {
  let { deviceId } = await chrome.storage.local.get("deviceId");
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    await chrome.storage.local.set({ deviceId });
  }
  return deviceId;
}

function apiBase(backendUrl) {
  return backendUrl.replace(/\/+$/, "");
}

// ---- proxy control ----------------------------------------------------------
async function applyProxy(gateway) {
  const config = {
    mode: "fixed_servers",
    rules: {
      singleProxy: {
        scheme: gateway.scheme || "http",
        host: gateway.host,
        port: Number(gateway.port),
      },
      bypassList: ["localhost", "127.0.0.1", "[::1]", gateway.host],
    },
  };
  await chrome.proxy.settings.set({ value: config, scope: "regular" });
}

async function clearProxy() {
  await chrome.proxy.settings.clear({ scope: "regular" });
}

// Supply the proxy credentials (username + session token) when the gateway
// challenges with 407. Uses the in-memory cache so the callback never races
// against a slow chrome.storage.local read.
chrome.webRequest.onAuthRequired.addListener(
  (details, callback) => {
    if (!details.isProxy) {
      callback({});
      return;
    }
    // Use cached state — avoids async storage read timing out the 407 callback.
    const state = _stateCache;
    if (state && state.connected && state.gateway) {
      callback({
        authCredentials: {
          username: state.gateway.username,
          password: state.gateway.password,
        },
      });
    } else {
      // Cache not warm yet — fall back to async read.
      getState().then((s) => {
        if (s.connected && s.gateway) {
          callback({
            authCredentials: {
              username: s.gateway.username,
              password: s.gateway.password,
            },
          });
        } else {
          callback({});
        }
      });
    }
  },
  { urls: ["<all_urls>"] },
  ["asyncBlocking"],
);

// ---- connect / disconnect ---------------------------------------------------
async function connect({ backendUrl, username, password }) {
  const deviceId = await getDeviceId();
  const res = await fetch(`${apiBase(backendUrl)}/api/client/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username,
      password,
      deviceId,
      deviceName: navigator.userAgent.includes("Chrome")
        ? "Chrome browser"
        : "Browser",
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error || "Login failed");
  }

  await applyProxy(body.gateway);
  await setState({
    connected: true,
    backendUrl: apiBase(backendUrl),
    token: body.token,
    gateway: body.gateway,
    username,
    location: body.gateway.location,
    connectedAt: Date.now(),
    error: null,
  });
  chrome.alarms.create(HEARTBEAT_ALARM, { periodInMinutes: HEARTBEAT_MINUTES });
  updateBadge(true);
}

async function disconnect({ silent } = {}) {
  const state = await getState();
  chrome.alarms.clear(HEARTBEAT_ALARM);
  await clearProxy();
  if (!silent && state.backendUrl && state.token) {
    try {
      await fetch(`${state.backendUrl}/api/client/logout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${state.token}`,
        },
        body: JSON.stringify({ token: state.token }),
      });
    } catch {
      /* best-effort */
    }
  }
  await setState({
    connected: false,
    token: null,
    gateway: null,
    location: null,
    connectedAt: null,
  });
  updateBadge(false);
}

async function heartbeat() {
  const state = await getState();
  if (!state.connected || !state.backendUrl || !state.token) return;
  try {
    const res = await fetch(`${state.backendUrl}/api/client/heartbeat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${state.token}`,
      },
      body: JSON.stringify({ token: state.token }),
    });
    if (res.status === 401) {
      // Session was revoked by an admin (force logout) — disconnect locally.
      await disconnect({ silent: true });
      await setState({ error: "Your session was ended by an administrator." });
    }
  } catch {
    /* network hiccup — keep the tunnel, retry next tick */
  }
}

function updateBadge(connected) {
  chrome.action.setBadgeText({ text: connected ? "ON" : "" });
  chrome.action.setBadgeBackgroundColor({ color: "#1ba87a" });
}

// ---- message bridge (popup -> worker) ---------------------------------------
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      if (msg.type === "connect") {
        await connect(msg.payload);
        sendResponse({ ok: true });
      } else if (msg.type === "disconnect") {
        await disconnect();
        sendResponse({ ok: true });
      } else if (msg.type === "getState") {
        sendResponse({ ok: true, state: await getState() });
      }
    } catch (err) {
      sendResponse({ ok: false, error: err.message });
    }
  })();
  return true; // async response
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === HEARTBEAT_ALARM) heartbeat();
});

// ---- boot-time re-assertion -------------------------------------------------
// Runs every time the service worker starts (covers both Chrome startup AND
// mid-session worker restarts). Warms _stateCache immediately so that the
// onAuthRequired listener has credentials ready without a storage round-trip.
(async () => {
  const state = await getState(); // also sets _stateCache
  if (state.connected && state.gateway) {
    await applyProxy(state.gateway);
    // Re-create the alarm in case it was lost when the worker was killed.
    chrome.alarms.create(HEARTBEAT_ALARM, { periodInMinutes: HEARTBEAT_MINUTES });
    updateBadge(true);
  }
})();

// Keep onStartup as well for the explicit Chrome-start case (belt and braces).
chrome.runtime.onStartup.addListener(async () => {
  const state = await getState();
  if (state.connected && state.gateway) {
    await applyProxy(state.gateway);
    chrome.alarms.create(HEARTBEAT_ALARM, { periodInMinutes: HEARTBEAT_MINUTES });
    updateBadge(true);
  }
});
