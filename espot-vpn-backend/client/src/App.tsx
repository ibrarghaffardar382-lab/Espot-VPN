import { useState } from "react";
import { useAuth } from "./lib/auth";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { Users } from "./pages/Users";
import { Proxies } from "./pages/Proxies";
import { Plans } from "./pages/Plans";
import { Sessions } from "./pages/Sessions";
import { Blocklist } from "./pages/Blocklist";

type Page = "dashboard" | "users" | "proxies" | "plans" | "sessions" | "blocklist";

const NAV: { id: Page; label: string; icon: string }[] = [
  { id: "dashboard", label: "Dashboard", icon: "◈" },
  { id: "users", label: "Users", icon: "◉" },
  { id: "proxies", label: "Proxies", icon: "⇄" },
  { id: "plans", label: "Plans", icon: "▤" },
  { id: "sessions", label: "Sessions", icon: "⚡" },
  { id: "blocklist", label: "Blocklist", icon: "⊘" },
];

export function App() {
  const { loggedIn, username, logout } = useAuth();
  const [page, setPage] = useState<Page>("dashboard");

  if (!loggedIn) return <Login />;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">E</div>
          <div>
            <div className="brand-name">Espot VPN</div>
            <div className="brand-sub">Control Plane</div>
          </div>
        </div>
        <nav className="nav">
          {NAV.map((n) => (
            <button
              key={n.id}
              className={`nav-item ${page === n.id ? "active" : ""}`}
              onClick={() => setPage(n.id)}
            >
              <span className="ico">{n.icon}</span>
              {n.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="admin-chip">
            <div className="avatar">{(username ?? "A").charAt(0).toUpperCase()}</div>
            <div style={{ flex: 1 }}>
              <div style={{ color: "var(--text)", fontWeight: 600 }}>{username}</div>
              <div style={{ fontSize: 11, color: "var(--text-faint)" }}>Administrator</div>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={logout} title="Sign out">
              ⏻
            </button>
          </div>
        </div>
      </aside>
      <main className="main">
        {page === "dashboard" && <Dashboard onNavigate={(p) => setPage(p as Page)} />}
        {page === "users" && <Users />}
        {page === "proxies" && <Proxies />}
        {page === "plans" && <Plans />}
        {page === "sessions" && <Sessions />}
        {page === "blocklist" && <Blocklist />}
      </main>
    </div>
  );
}
