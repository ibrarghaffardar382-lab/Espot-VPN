import { useState, useMemo } from "react";
import { useApi } from "../lib/useApi";
import { api } from "../lib/api";
import { Loading, ErrorBanner, Modal, Field, Badge } from "../components/ui";
import { formatBytes } from "../lib/format";

interface UserRow {
  id: string;
  email: string;
  username: string;
  status: "active" | "suspended";
  planId: string | null;
  proxyId: string | null;
  maxSessionsOverride: number | null;
  dataUsedBytes: number;
  plan: { id: string; name: string; maxSessions: number } | null;
  proxy: { id: string; label: string; country: string } | null;
  activeSessions: number;
}
interface PlanLite { id: string; name: string; maxSessions: number }
interface ProxyLite { id: string; label: string; country: string }

export function Users() {
  const { data, loading, error, reload } = useApi<UserRow[]>("/admin/users");
  const { data: plans } = useApi<PlanLite[]>("/admin/plans");
  const { data: proxies } = useApi<ProxyLite[]>("/admin/proxies");
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.toLowerCase();
    return data.filter((u) => u.username.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  }, [data, query]);

  async function revokeAll(u: UserRow) {
    if (!confirm(`Force logout all devices for ${u.username}?`)) return;
    await api(`/admin/sessions/user/${u.id}/revoke-all`, { method: "POST" });
    reload();
  }
  async function remove(u: UserRow) {
    if (!confirm(`Delete user ${u.username}? This cannot be undone.`)) return;
    await api(`/admin/users/${u.id}`, { method: "DELETE" });
    reload();
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-title">Users</div>
          <div className="page-sub">VPN customers, their plan, proxy and live devices.</div>
        </div>
        <div className="toolbar">
          <input className="search" placeholder="Search users…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            + New User
          </button>
        </div>
      </div>

      {error && <ErrorBanner message={error} />}
      {loading && <Loading />}

      {data && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>User</th>
                <th>Status</th>
                <th>Plan</th>
                <th>Proxy</th>
                <th>Devices</th>
                <th>Data used</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="empty">
                    No users found.
                  </td>
                </tr>
              )}
              {filtered.map((u) => {
                const limit = u.maxSessionsOverride ?? u.plan?.maxSessions ?? 3;
                return (
                  <tr key={u.id}>
                    <td>
                      <div className="cell-strong">{u.username}</div>
                      <div className="cell-dim">{u.email}</div>
                    </td>
                    <td>
                      {u.status === "active" ? <Badge kind="green">Active</Badge> : <Badge kind="red">Suspended</Badge>}
                    </td>
                    <td className="cell-dim">{u.plan?.name ?? "—"}</td>
                    <td className="cell-dim">{u.proxy ? `${u.proxy.label}` : "Direct"}</td>
                    <td>
                      <Badge kind={u.activeSessions > 0 ? "green" : "gray"}>
                        {u.activeSessions} / {limit}
                      </Badge>
                    </td>
                    <td className="cell-dim">{formatBytes(u.dataUsedBytes)}</td>
                    <td className="row-actions">
                      {u.activeSessions > 0 && (
                        <button className="btn btn-sm btn-ghost" onClick={() => revokeAll(u)} title="Force logout">
                          Logout
                        </button>
                      )}
                      <button className="btn btn-sm btn-ghost" onClick={() => setEditing(u)}>
                        Edit
                      </button>
                      <button className="btn btn-sm btn-danger" onClick={() => remove(u)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {(creating || editing) && (
        <UserModal
          user={editing}
          plans={plans ?? []}
          proxies={proxies ?? []}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            reload();
          }}
        />
      )}
    </>
  );
}

function UserModal({
  user,
  plans,
  proxies,
  onClose,
  onSaved,
}: {
  user: UserRow | null;
  plans: PlanLite[];
  proxies: ProxyLite[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    email: user?.email ?? "",
    username: user?.username ?? "",
    password: "",
    status: user?.status ?? "active",
    planId: user?.planId ?? "",
    proxyId: user?.proxyId ?? "",
    maxSessionsOverride: user?.maxSessionsOverride?.toString() ?? "",
  });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setErr("");
    try {
      const payload: Record<string, unknown> = {
        email: form.email,
        username: form.username,
        status: form.status,
        planId: form.planId || null,
        proxyId: form.proxyId || null,
        maxSessionsOverride: form.maxSessionsOverride ? Number(form.maxSessionsOverride) : null,
      };
      if (form.password) payload.password = form.password;
      if (user) {
        await api(`/admin/users/${user.id}`, { method: "PUT", body: JSON.stringify(payload) });
      } else {
        if (!form.password) {
          setErr("Password is required for a new user");
          setBusy(false);
          return;
        }
        await api("/admin/users", { method: "POST", body: JSON.stringify(payload) });
      }
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={user ? `Edit ${user.username}` : "New User"}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      {err && <ErrorBanner message={err} />}
      <div className="field-row">
        <Field label="Username">
          <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
        </Field>
        <Field label="Status">
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as "active" | "suspended" })}>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </select>
        </Field>
      </div>
      <Field label="Email">
        <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      </Field>
      <Field label={user ? "New password (leave blank to keep)" : "Password"}>
        <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
      </Field>
      <div className="field-row">
        <Field label="Plan">
          <select value={form.planId} onChange={(e) => setForm({ ...form, planId: e.target.value })}>
            <option value="">— None —</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Proxy">
          <select value={form.proxyId} onChange={(e) => setForm({ ...form, proxyId: e.target.value })}>
            <option value="">Direct (no proxy)</option>
            {proxies.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label} {p.country ? `· ${p.country}` : ""}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Device limit override" hint="Leave blank to use the plan's limit (default 3).">
        <input
          type="number"
          min={1}
          value={form.maxSessionsOverride}
          onChange={(e) => setForm({ ...form, maxSessionsOverride: e.target.value })}
        />
      </Field>
    </Modal>
  );
}
