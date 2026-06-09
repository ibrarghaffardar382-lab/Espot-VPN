import { useState } from "react";
import { useApi } from "../lib/useApi";
import { api } from "../lib/api";
import { Loading, ErrorBanner, Modal, Field, Badge } from "../components/ui";

interface ProxyRow {
  id: string;
  label: string;
  protocol: "http" | "https" | "socks5";
  host: string;
  port: number;
  username: string | null;
  password: string | null;
  country: string;
  city: string;
  status: "active" | "inactive";
  assignedUsers: number;
}

interface TestState {
  state: "loading" | "ok" | "err";
  msg?: string;
}

export function Proxies() {
  const { data, loading, error, reload } = useApi<ProxyRow[]>("/admin/proxies");
  const [editing, setEditing] = useState<ProxyRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [tests, setTests] = useState<Record<string, TestState>>({});

  async function remove(p: ProxyRow) {
    if (!confirm(`Delete proxy "${p.label}"? Users assigned to it will fall back to a direct connection.`)) return;
    await api(`/admin/proxies/${p.id}`, { method: "DELETE" });
    reload();
  }

  async function test(p: ProxyRow) {
    setTests((t) => ({ ...t, [p.id]: { state: "loading" } }));
    try {
      const r = await api<{ ok: boolean; exitIp?: string; latencyMs?: number; error?: string }>(
        `/admin/proxies/${p.id}/test`,
        { method: "POST" },
      );
      if (r.ok) {
        setTests((t) => ({ ...t, [p.id]: { state: "ok", msg: `Exit IP ${r.exitIp} · ${r.latencyMs} ms` } }));
      } else {
        setTests((t) => ({ ...t, [p.id]: { state: "err", msg: r.error ?? "Failed" } }));
      }
    } catch (e) {
      setTests((t) => ({ ...t, [p.id]: { state: "err", msg: (e as Error).message } }));
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-title">Proxies</div>
          <div className="page-sub">Upstream vendor proxies. All user traffic is relayed through this server first, so the vendor only sees one IP.</div>
        </div>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          + New Proxy
        </button>
      </div>

      {error && <ErrorBanner message={error} />}
      {loading && <Loading />}

      {data && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Label</th>
                <th>Endpoint</th>
                <th>Protocol</th>
                <th>Location</th>
                <th>Status</th>
                <th>Users</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.length === 0 && (
                <tr>
                  <td colSpan={7} className="empty">
                    No proxies yet. Add your first upstream node.
                  </td>
                </tr>
              )}
              {data.map((p) => (
                <tr key={p.id}>
                  <td className="cell-strong">{p.label}</td>
                  <td className="mono cell-dim">
                    {p.host}:{p.port}
                  </td>
                  <td>
                    <Badge kind="gray">{p.protocol.toUpperCase()}</Badge>
                  </td>
                  <td className="cell-dim">{[p.city, p.country].filter(Boolean).join(", ") || "—"}</td>
                  <td>{p.status === "active" ? <Badge kind="green">Active</Badge> : <Badge kind="gray">Inactive</Badge>}</td>
                  <td className="cell-dim">{p.assignedUsers}</td>
                  <td className="row-actions">
                    <button
                      className="btn btn-sm btn-ghost"
                      onClick={() => test(p)}
                      disabled={tests[p.id]?.state === "loading"}
                    >
                      {tests[p.id]?.state === "loading" ? "Testing…" : "Test"}
                    </button>
                    <button className="btn btn-sm btn-ghost" onClick={() => setEditing(p)}>
                      Edit
                    </button>
                    <button className="btn btn-sm btn-danger" onClick={() => remove(p)}>
                      Delete
                    </button>
                    {tests[p.id] && tests[p.id].state !== "loading" && (
                      <span style={{ color: tests[p.id].state === "ok" ? "#34d399" : "#f87171", fontSize: "12px" }}>
                        {tests[p.id].msg}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(creating || editing) && (
        <ProxyModal
          proxy={editing}
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

function parseProxyString(raw: string): { host: string; port: string; username: string; password: string } | null {
  const trimmed = raw.trim();
  if (!trimmed.includes(":")) return null;
  const parts = trimmed.split(":");
  const [host, port, username, ...rest] = parts;
  if (!host || !/^\d+$/.test(port ?? "")) return null;
  return {
    host,
    port,
    username: username ?? "",
    password: rest.join(":"),
  };
}

function ProxyModal({
  proxy,
  onClose,
  onSaved,
}: {
  proxy: ProxyRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    label: proxy?.label ?? "",
    protocol: proxy?.protocol ?? "http",
    host: proxy?.host ?? "",
    port: proxy?.port?.toString() ?? "",
    username: proxy?.username ?? "",
    password: proxy?.password ?? "",
    country: proxy?.country ?? "",
    city: proxy?.city ?? "",
    status: proxy?.status ?? "active",
  });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setErr("");
    try {
      const payload = {
        label: form.label,
        protocol: form.protocol,
        host: form.host,
        port: Number(form.port),
        username: form.username || null,
        password: form.password || null,
        country: form.country,
        city: form.city,
        status: form.status,
      };
      if (proxy) await api(`/admin/proxies/${proxy.id}`, { method: "PUT", body: JSON.stringify(payload) });
      else await api("/admin/proxies", { method: "POST", body: JSON.stringify(payload) });
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={proxy ? "Edit Proxy" : "New Proxy"}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={save} disabled={busy || !form.label || !form.host || !form.port}>
            {busy ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      {err && <ErrorBanner message={err} />}
      <Field label="Quick paste" hint="host:port:user:pass — auto-fills the fields below">
        <input
          placeholder="91.239.130.17:11202:user:pass"
          onChange={(e) => {
            const parsed = parseProxyString(e.target.value);
            if (!parsed) return;
            setForm((f) => ({
              ...f,
              host: parsed.host,
              port: parsed.port,
              username: parsed.username,
              password: parsed.password,
              label: f.label || `${parsed.host}:${parsed.port}`,
            }));
          }}
        />
      </Field>
      <Field label="Label">
        <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="e.g. US-East Residential" />
      </Field>
      <div className="field-row">
        <Field label="Host">
          <input value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} placeholder="proxy.vendor.com" />
        </Field>
        <Field label="Port">
          <input type="number" value={form.port} onChange={(e) => setForm({ ...form, port: e.target.value })} />
        </Field>
      </div>
      <div className="field-row">
        <Field label="Protocol">
          <select value={form.protocol} onChange={(e) => setForm({ ...form, protocol: e.target.value as ProxyRow["protocol"] })}>
            <option value="http">HTTP</option>
            <option value="https">HTTPS</option>
            <option value="socks5">SOCKS5</option>
          </select>
        </Field>
        <Field label="Status">
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ProxyRow["status"] })}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </Field>
      </div>
      <div className="field-row">
        <Field label="Username" hint="Optional">
          <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
        </Field>
        <Field label="Password" hint="Optional">
          <input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </Field>
      </div>
      <div className="field-row">
        <Field label="Country">
          <input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} placeholder="US" />
        </Field>
        <Field label="City">
          <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="New York" />
        </Field>
      </div>
    </Modal>
  );
}
