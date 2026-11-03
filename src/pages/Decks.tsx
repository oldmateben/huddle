import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import type { Deck } from "../../shared/types";
import { api } from "../api";
import { useMe } from "../components/AppShell";

const STATUS: Record<Deck["status"], string> = { draft: "Draft", live: "Live", closed: "Ended" };

export default function Decks() {
  const { me } = useMe();
  const { teamId } = useParams();
  const nav = useNavigate();
  const [decks, setDecks] = useState<Deck[] | null>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const team = me.teams.find((t) => t.id === teamId);

  useEffect(() => {
    if (!team) return;
    setDecks(null);
    api.decks(team.id).then(setDecks).catch((e) => setError(e.message));
  }, [team?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!teamId && me.teams.length) return <Navigate to={`/app/t/${me.teams[0].id}`} replace />;
  if (!team)
    return (
      <main className="page">
        <h1>No team yet</h1>
        {me.user.isAdmin ? (
          <p>Create your first team in <Link to="/app/admin">Admin</Link>. You can make yourself its leader.</p>
        ) : (
          <p>You're not in a team yet. Ask the admin or a team leader to add you.</p>
        )}
      </main>
    );

  async function create(e: React.FormEvent) {
    e.preventDefault();
    try {
      const d = await api.createDeck(team!.id, title);
      nav(`/app/d/${d.id}`);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function duplicate(d: Deck) {
    const copy = await api.duplicateDeck(d.id);
    setDecks((list) => [copy, ...(list ?? [])]);
  }

  async function remove(d: Deck) {
    if (!confirm(`Delete “${d.title}” and all its results? This can't be undone.`)) return;
    await api.deleteDeck(d.id);
    setDecks((list) => list?.filter((x) => x.id !== d.id) ?? null);
  }

  return (
    <main className="page">
      <div className="row between">
        <h1>{team.name}</h1>
        <Link to={`/app/t/${team.id}/members`}>{team.role === "leader" ? "Manage members" : "Members"}</Link>
      </div>
      <form className="row create" onSubmit={create}>
        <input value={title} maxLength={120} placeholder="Session name, e.g. Induction day 1" onChange={(e) => setTitle(e.target.value)} />
        <button className="primary">Create session</button>
      </form>
      {error && <p className="error">{error}</p>}
      {decks?.length === 0 && <p className="empty">No sessions yet. Create one above to start adding questions.</p>}
      <ul className="session-list">
        {decks?.map((d) => (
          <li key={d.id}>
            <Link to={`/app/d/${d.id}`} className="session-title">{d.title}</Link>
            <span className="muted">
              {d.questions.length} question{d.questions.length === 1 ? "" : "s"}, code {d.code}
            </span>
            <span className={`pill status-${d.status}`}>{STATUS[d.status]}</span>
            <Link to={`/app/d/${d.id}/report`}>Results</Link>
            <button className="link" onClick={() => duplicate(d)}>Duplicate</button>
            <button className="link danger" onClick={() => remove(d)}>Delete</button>
          </li>
        ))}
      </ul>
    </main>
  );
}
