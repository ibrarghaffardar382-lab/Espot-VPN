const $ = (id) => document.getElementById(id);

function send(type, payload) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type, payload }, (res) => resolve(res ?? { ok: false, error: "No response" }));
  });
}

function showError(msg) {
  const el = $("error");
  if (!msg) {
    el.classList.add("hidden");
    el.textContent = "";
  } else {
    el.classList.remove("hidden");
    el.textContent = msg;
  }
}

function timeAgo(ts) {
  if (!ts) return "—";
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

function render(state) {
  const connected = !!state.connected;
  $("statusText").textContent = connected ? "Connected" : "Disconnected";
  $("statusDot").classList.toggle("on", connected);
  $("connectedView").classList.toggle("hidden", !connected);
  $("loginView").classList.toggle("hidden", connected);

  if (connected) {
    $("metaUser").textContent = state.username || "—";
    const loc = state.location;
    $("metaLocation").textContent = loc ? [loc.city, loc.country].filter(Boolean).join(", ") || "Direct" : "Direct";
    $("metaTime").textContent = timeAgo(state.connectedAt);
  } else if (state.backendUrl) {
    $("backendUrl").value = state.backendUrl;
    if (state.username) $("username").value = state.username;
  }
  showError(state.error || "");
}

async function refresh() {
  const res = await send("getState");
  if (res.ok) render(res.state);
}

$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  showError("");
  const btn = $("connectBtn");
  btn.disabled = true;
  btn.textContent = "Connecting…";
  const res = await send("connect", {
    backendUrl: $("backendUrl").value.trim(),
    username: $("username").value.trim(),
    password: $("password").value,
  });
  btn.disabled = false;
  btn.textContent = "Connect";
  if (!res.ok) showError(res.error);
  else refresh();
});

$("disconnectBtn").addEventListener("click", async () => {
  const btn = $("disconnectBtn");
  btn.disabled = true;
  btn.textContent = "Disconnecting…";
  await send("disconnect");
  btn.disabled = false;
  btn.textContent = "Disconnect";
  refresh();
});

// Live-update if background changes state (e.g. admin force logout).
chrome.storage.onChanged.addListener((changes) => {
  if (changes.state) render(changes.state.newValue ?? { connected: false });
});

refresh();
