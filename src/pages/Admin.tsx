import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, AdminUsage, AdminUser } from "../api";
import { useMe } from "../components/AppShell";

export default function Admin() {
  const { me, reload } = useMe();
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [usage, setUsage] = useState<AdminUsage | null>(null);
  const [name, setName] = useState("");
  const [leader, setLeader] = useState("");
  const [error, setError] = useState("");

  const loadUsers = () => api.users().then(setUsers).catch((e) => setError(e.message));
  useEffect(() => {
    loadUsers();
    api.usage().then(setUsage).catch((e) => setError(e.message));
  }, []);

  if (!me.user.isAdmin) return <main className="page"><p>Admin only.</p></main>;

  async function createTeam(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.createTeam(name, leader.trim());
      setName("");
      setLeader("");
      reload();
      loadUsers();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <main className="page">
      <h1>Admin</h1>
      {error && <p className="error">{error}</p>}

      <section className="admin-section">
        <h2>Teams</h2>
        <form className="row create" onSubmit={createTeam}>
          <input value={name} maxLength={80} placeholder="Team name" onChange={(e) => setName(e.target.value)} required />
          <input type="email" value={leader} placeholder="Team leader's email (optional)" onChange={(e) => setLeader(e.target.value)} />
          <button className="primary">Create team</button>
        </form>
        <ul className="session-list">
          {me.teams.map((t) => (
            <li key={t.id}>
              <Link className="session-title" to={`/app/t/${t.id}`}>{t.name}</Link>
              <Link to={`/app/t/${t.id}/members`}>Members and leaders</Link>
              <button className="link" onClick={async () => {
                const n = prompt("New team name", t.name);
                if (n) await api.renameTeam(t.id, n).then(reload);
              }}>Rename</button>
              <button className="link danger" onClick={async () => {
                if (confirm(`Delete ${t.name}, all its sessions and results? This can't be undone.`)) await api.deleteTeam(t.id).then(reload);
              }}>Delete</button>
            </li>
          ))}
        </ul>
      </section>

      <section className="admin-section">
        <h2>Usage</h2>
        {usage && <UsageChart usage={usage} />}
      </section>

      <section className="admin-section">
        <h2>People</h2>
        <ul className="session-list">
          {users?.map((u) => (
            <li key={u.id}>
              <span className="session-title">{u.name ?? u.email}</span>
              <span className="muted">{u.name ? u.email : ""}</span>
              <span className="muted small">{u.teams ?? "No team"}</span>
              <span className="muted small">{u.lastLoginAt ? `Last signed in ${new Date(u.lastLoginAt).toLocaleDateString()}` : "Hasn't signed in"}</span>
              {!u.isAdmin && (
                <button className="link danger" onClick={async () => {
                  if (confirm(`Delete ${u.email}? They'll lose access to every team. Their sessions stay with the team.`)) await api.deleteUser(u.id).then(loadUsers);
                }}>Delete</button>
              )}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

function UsageChart({ usage }: { usage: AdminUsage }) {
  const peak = Math.max(...usage.days.map((d) => d.requests), 1);
  const scale = Math.max(peak, usage.dailyLimit * 0.1); // keep small days readable
  const busiest = usage.days.reduce((m, d) => Math.max(m, d.requests), 0);
  return (
    <div>
      <p>
        Busiest day in the last 30: <strong>{busiest.toLocaleString()}</strong> live-session requests, or{" "}
        {((busiest / usage.dailyLimit) * 100).toFixed(1)}% of the free daily allowance ({usage.dailyLimit.toLocaleString()}).
      </p>
      {usage.days.length ? (
        <div className="usage-chart" role="img" aria-label="Requests per day">
          {usage.days.map((d) => (
            <div key={d.day} className="usage-bar" title={`${d.day}: ${d.requests.toLocaleString()}`} style={{ height: `${(d.requests / scale) * 100}%` }} />
          ))}
        </div>
      ) : (
        <p className="empty">No sessions run yet.</p>
      )}
      {usage.top.length > 0 && (
        <>
          <h3>Busiest sessions (30 days)</h3>
          <ul className="plain">
            {usage.top.map((t) => (
              <li key={t.code}>
                {t.title ?? `Deleted session ${t.code}`} {t.team && <span className="muted">({t.team})</span>}: {t.requests.toLocaleString()}
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="muted small">Counts are live-session requests (joins, votes, updates). Loading pages and signing in add a little on top.</p>
    </div>
  );
}
