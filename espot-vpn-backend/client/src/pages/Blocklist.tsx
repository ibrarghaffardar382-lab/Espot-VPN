import { useState, useMemo, type FormEvent } from "react";
import { useApi } from "../lib/useApi";
import { api } from "../lib/api";
import { Loading, ErrorBanner, Badge, Field } from "../components/ui";

interface BlockRow {
  id: string;
  domain: string;
  scope: "global" | "plan" | "user";
  refId: string | null;
}
interface PlanLite { id: string; name: string }
interface UserLite { id: string; username: string }

export function Blocklist() {
  const { data, loading, error, reload } = useApi<BlockRow[]>("/admin/blocklist");
  const { data: plans } = useApi<PlanLite[]>("/admin/plans");
  const { data: users } = useApi<UserLite[]>("/admin/users");

  const [domain, setDomain] = useState("");
  const [scope, setScope] = useState<"global" | "plan" | "user">("global");
  const [refId, setRefId] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const labelFor = useMemo(() => {
    const planMap = new Map((plans ?? []).map((p) => [p.id, p.name]));
    const userMap = new Map((users ?? []).map((u) => [u.id, u.username]));
    return (b: BlockRow) => {
      if (b.scope === "global") return "Everyone";
      if (b.scope === "plan") return `Plan: ${planMap.get(b.refId ?? "") ?? "?"}`;
      return `User: ${userMap.get(b.refId ?? "") ?? "?"}`;
    };
  }, [plans, users]);

  async function add(e: FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      await api("/admin/blocklist", {
        method: "POST",
        body: JSON.stringify({ domain, scope, refId: scope === "global" ? null : refId || null }),
      });
      setDomain("");
      setRefId("");
      reload();
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    await api(`/admin/blocklist/${id}`, { method: "DELETE" });
    reload();
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-title">Blocklist</div>
          <div className="page-sub">Block websites globally, per plan, or per user. Enforced at the gateway within seconds.</div>
        </div>
      </div>

      <div className="split">
        <div className="card" style={{ padding: 22, alignSelf: "start" }}>
          <div className="section-title">Add a block</div>
          <form onSubmit={add} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {err && <ErrorBanner message={err} />}
            <Field label="Domain" hint="e.g. facebook.com — also blocks all subdomains">
              <input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="example.com" required />
            </Field>
            <Field label="Applies to">
              <select value={scope} onChange={(e) => setScope(e.target.value as typeof scope)}>
                <option value="global">Everyone (global)</option>
                <option value="plan">A specific plan</option>
                <option value="user">A specific user</option>
              </select>
            </Field>
            {scope === "plan" && (
              <Field label="Plan">
                <select value={refId} onChange={(e) => setRefId(e.target.value)} required>
                  <option value="">Select a plan…</option>
                  {(plans ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {scope === "user" && (
              <Field label="User">
                <select value={refId} onChange={(e) => setRefId(e.target.value)} required>
                  <option value="">Select a user…</option>
                  {(users ?? []).map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.username}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <button className="btn btn-primary" type="submit" disabled={busy || !domain} style={{ justifyContent: "center" }}>
              {busy ? "Adding…" : "Add block"}
            </button>
          </form>
        </div>

        <div>
          {error && <ErrorBanner message={error} />}
          {loading && <Loading />}
          {data && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Domain</th>
                    <th>Scope</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {data.length === 0 && (
                    <tr>
                      <td colSpan={3} className="empty">
                        Nothing blocked yet.
                      </td>
                    </tr>
                  )}
                  {data.map((b) => (
                    <tr key={b.id}>
                      <td className="cell-strong mono">{b.domain}</td>
                      <td>
                        <Badge kind={b.scope === "global" ? "amber" : "gray"}>{labelFor(b)}</Badge>
                      </td>
                      <td className="row-actions">
                        <button className="btn btn-sm btn-danger" onClick={() => remove(b.id)}>
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
