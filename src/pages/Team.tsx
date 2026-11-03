import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { Member, Role } from "../../shared/types";
import { api } from "../api";
import { useMe } from "../components/AppShell";

export default function Team() {
  const { teamId = "" } = useParams();
  const { me } = useMe();
  const team = me.teams.find((t) => t.id === teamId);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const canEdit = team?.role === "leader";

  const load = () => api.members(teamId).then(setMembers).catch((e) => setMsg({ ok: false, text: e.message }));
  useEffect(() => void load(), [teamId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!team) return <main className="page"><p>Team not found.</p></main>;

  async function add(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.addMember(teamId, email.trim(), role);
      setMsg({ ok: true, text: `Added ${email.trim()}. They can now sign in with that email address.` });
      setEmail("");
      load();
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    }
  }

  async function remove(m: Member) {
    if (!confirm(`Remove ${m.email} from ${team!.name}?`)) return;
    try {
      await api.removeMember(teamId, m.userId);
      load();
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    }
  }

  return (
    <main className="page">
      <p><Link to={`/app/t/${teamId}`}>Back to {team.name}</Link></p>
      <h1>{team.name} members</h1>
      {canEdit && (
        <form className="row create" onSubmit={add}>
          <input type="email" value={email} placeholder="Email address they'll sign in with" onChange={(e) => setEmail(e.target.value)} required />
          {me.user.isAdmin && (
            <select value={role} onChange={(e) => setRole(e.target.value as Role)} aria-label="Role">
              <option value="member">Member</option>
              <option value="leader">Team leader</option>
            </select>
          )}
          <button className="primary">Add</button>
        </form>
      )}
      {msg && <p className={msg.ok ? "ok" : "error"}>{msg.text}</p>}
      <ul className="session-list">
        {members?.map((m) => (
          <li key={m.userId}>
            <span className="session-title">{m.name ?? m.email}</span>
            <span className="muted">{m.name ? m.email : m.lastLoginAt ? "" : "Hasn't signed in yet"}</span>
            <span className="pill">{m.role === "leader" ? "Team leader" : "Member"}</span>
            {canEdit && m.userId !== me.user.id && (m.role === "member" || me.user.isAdmin) && (
              <button className="link danger" onClick={() => remove(m)}>Remove</button>
            )}
          </li>
        ))}
      </ul>
      <p className="muted small">
        Members can create, run and edit all of this team's sessions and see their results. Team leaders can also add and remove members.
      </p>
    </main>
  );
}
