import { useState } from "react";
import { useApi } from "../lib/useApi";
import { api } from "../lib/api";
import { Loading, ErrorBanner, Badge } from "../components/ui";
import { formatBytes, timeAgo } from "../lib/format";

interface SessionRow {
  id: string;
  deviceName: string;
  deviceId: string;
  ip: string;
  userAgent: string;
  bytesUp: number;
  bytesDown: number;
  createdAt: string;
  lastSeenAt: string;
  revokedAt: string | null;
  user: { id: string; username: string; email: string };
}

export function Sessions() {
  const [activeOnly, setActiveOnly] = useState(true);
  const { data, loading, error, reload } = useApi<SessionRow[]>(
    `/admin/sessions?active=${activeOnly}`,
  );

  async function revoke(id: string) {
    await api(`/admin/sessions/${id}/revoke`, { method: "POST" });
    reload();
  }
  async function revokeAll() {
    if (!confirm("Force logout EVERY active session across all users?")) return;
    await api("/admin/sessions/revoke-all", { method: "POST" });
    reload();
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-title">Sessions</div>
          <div className="page-sub">Every logged-in device. Revoke to force a device offline instantly.</div>
        </div>
        <div className="toolbar">
          <button className={`btn btn-sm ${activeOnly ? "btn-primary" : "btn-ghost"}`} onClick={() => setActiveOnly(true)}>
            Active
          </button>
          <button className={`btn btn-sm ${!activeOnly ? "btn-primary" : "btn-ghost"}`} onClick={() => setActiveOnly(false)}>
            All
          </button>
          <button className="btn btn-danger btn-sm" onClick={revokeAll}>
            Force logout all
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
                <th>Device</th>
                <th>IP</th>
                <th>Data (↑/↓)</th>
                <th>Status</th>
                <th>Last seen</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.length === 0 && (
                <tr>
                  <td colSpan={7} className="empty">
                    No sessions to show.
                  </td>
                </tr>
              )}
              {data.map((s) => (
                <tr key={s.id}>
                  <td>
                    <div className="cell-strong">{s.user.username}</div>
                    <div className="cell-dim">{s.user.email}</div>
                  </td>
                  <td className="cell-dim">{s.deviceName}</td>
                  <td className="mono cell-dim">{s.ip || "—"}</td>
                  <td className="cell-dim">
                    {formatBytes(s.bytesUp)} / {formatBytes(s.bytesDown)}
                  </td>
                  <td>{s.revokedAt ? <Badge kind="gray">Ended</Badge> : <Badge kind="green">Active</Badge>}</td>
                  <td className="cell-dim">{timeAgo(s.lastSeenAt)}</td>
                  <td className="row-actions">
                    {!s.revokedAt && (
                      <button className="btn btn-sm btn-danger" onClick={() => revoke(s.id)}>
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
