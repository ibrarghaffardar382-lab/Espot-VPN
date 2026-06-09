import { useApi } from "../lib/useApi";
import { Loading, ErrorBanner, Badge } from "../components/ui";
import { formatBytes, timeAgo } from "../lib/format";

interface Summary {
  totalUsers: number;
  activeUsers: number;
  totalProxies: number;
  activeSessions: number;
  totalPlans: number;
  totalDataBytes: number;
  recentSessions: {
    id: string;
    deviceName: string;
    ip: string;
    lastSeenAt: string;
    revokedAt: string | null;
    username: string;
  }[];
}

export function Dashboard({ onNavigate }: { onNavigate: (p: string) => void }) {
  const { data, loading, error } = useApi<Summary>("/admin/dashboard/summary");

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-title">Dashboard</div>
          <div className="page-sub">Real-time overview of your VPN network.</div>
        </div>
      </div>

      {error && <ErrorBanner message={error} />}
      {loading && <Loading />}

      {data && (
        <>
          <div className="stat-grid">
            <Stat label="Total Users" value={data.totalUsers} foot={`${data.activeUsers} active`} onClick={() => onNavigate("users")} />
            <Stat label="Live Sessions" value={data.activeSessions} foot="connected now" onClick={() => onNavigate("sessions")} />
            <Stat label="Proxies" value={data.totalProxies} foot="upstream nodes" onClick={() => onNavigate("proxies")} />
            <Stat label="Plans" value={data.totalPlans} foot="subscription tiers" onClick={() => onNavigate("plans")} />
            <Stat label="Data Relayed" value={formatBytes(data.totalDataBytes)} foot="all-time" />
          </div>

          <div className="section-title">Recent activity</div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Device</th>
                  <th>IP</th>
                  <th>Status</th>
                  <th>Last seen</th>
                </tr>
              </thead>
              <tbody>
                {data.recentSessions.length === 0 && (
                  <tr>
                    <td colSpan={5} className="empty">
                      No sessions yet.
                    </td>
                  </tr>
                )}
                {data.recentSessions.map((s) => (
                  <tr key={s.id}>
                    <td className="cell-strong">{s.username}</td>
                    <td className="cell-dim">{s.deviceName}</td>
                    <td className="mono cell-dim">{s.ip || "—"}</td>
                    <td>
                      {s.revokedAt ? <Badge kind="gray">Ended</Badge> : <Badge kind="green">Active</Badge>}
                    </td>
                    <td className="cell-dim">{timeAgo(s.lastSeenAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

function Stat({
  label,
  value,
  foot,
  onClick,
}: {
  label: string;
  value: number | string;
  foot: string;
  onClick?: () => void;
}) {
  return (
    <div className="stat" style={{ cursor: onClick ? "pointer" : "default" }} onClick={onClick}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-foot">{foot}</div>
    </div>
  );
}
