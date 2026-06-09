import { useState } from "react";
import { useApi } from "../lib/useApi";
import { api } from "../lib/api";
import { Loading, ErrorBanner, Modal, Field } from "../components/ui";
import { formatMoney } from "../lib/format";

interface Plan {
  id: string;
  name: string;
  description: string;
  priceMonthlyCents: number;
  maxSessions: number;
}

const EMPTY = { name: "", description: "", priceMonthlyCents: 0, maxSessions: 3 };

export function Plans() {
  const { data, loading, error, reload } = useApi<Plan[]>("/admin/plans");
  const [editing, setEditing] = useState<Plan | null>(null);
  const [creating, setCreating] = useState(false);

  async function remove(id: string) {
    if (!confirm("Delete this plan? Users on it will keep working with default limits.")) return;
    await api(`/admin/plans/${id}`, { method: "DELETE" });
    reload();
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-title">Plans</div>
          <div className="page-sub">Subscription tiers and their device limits. (Billing deferred.)</div>
        </div>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          + New Plan
        </button>
      </div>

      {error && <ErrorBanner message={error} />}
      {loading && <Loading />}

      {data && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Description</th>
                <th>Price / mo</th>
                <th>Device limit</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.length === 0 && (
                <tr>
                  <td colSpan={5} className="empty">
                    No plans yet. Create your first tier.
                  </td>
                </tr>
              )}
              {data.map((p) => (
                <tr key={p.id}>
                  <td className="cell-strong">{p.name}</td>
                  <td className="cell-dim">{p.description || "—"}</td>
                  <td>{formatMoney(p.priceMonthlyCents)}</td>
                  <td>{p.maxSessions}</td>
                  <td className="row-actions">
                    <button className="btn btn-sm btn-ghost" onClick={() => setEditing(p)}>
                      Edit
                    </button>
                    <button className="btn btn-sm btn-danger" onClick={() => remove(p.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(creating || editing) && (
        <PlanModal
          plan={editing}
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

function PlanModal({
  plan,
  onClose,
  onSaved,
}: {
  plan: Plan | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: plan?.name ?? EMPTY.name,
    description: plan?.description ?? EMPTY.description,
    priceDollars: plan ? plan.priceMonthlyCents / 100 : 0,
    maxSessions: plan?.maxSessions ?? EMPTY.maxSessions,
  });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setErr("");
    try {
      const payload = {
        name: form.name,
        description: form.description,
        priceMonthlyCents: Math.round(form.priceDollars * 100),
        maxSessions: Number(form.maxSessions),
      };
      if (plan) await api(`/admin/plans/${plan.id}`, { method: "PUT", body: JSON.stringify(payload) });
      else await api("/admin/plans", { method: "POST", body: JSON.stringify(payload) });
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={plan ? "Edit Plan" : "New Plan"}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={save} disabled={busy || !form.name}>
            {busy ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      {err && <ErrorBanner message={err} />}
      <Field label="Name">
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </Field>
      <Field label="Description">
        <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      </Field>
      <div className="field-row">
        <Field label="Price / month (USD)">
          <input
            type="number"
            min={0}
            step={0.01}
            value={form.priceDollars}
            onChange={(e) => setForm({ ...form, priceDollars: Number(e.target.value) })}
          />
        </Field>
        <Field label="Device limit">
          <input
            type="number"
            min={1}
            value={form.maxSessions}
            onChange={(e) => setForm({ ...form, maxSessions: Number(e.target.value) })}
          />
        </Field>
      </div>
    </Modal>
  );
}
