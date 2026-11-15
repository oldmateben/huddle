import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { Deck, Question, Results as R, Status, Theme } from "../../shared/types";
import { THEMES, TYPE_LABELS } from "../../shared/types";
import { api } from "../api";
import { useMe } from "../components/AppShell";
import QuestionEditor from "../components/QuestionEditor";
import Results from "../components/Results";
import ShareCard from "../components/ShareCard";
import { useSocket } from "../socket";

export default function DeckPage() {
  const { id = "" } = useParams();
  const { setChrome } = useMe();
  const [deck, setDeck] = useState<Deck | null>(null);
  const [results, setResults] = useState<Record<string, R>>({});
  const [live, setLive] = useState<{ status: Status; activeId: string | null }>({ status: "draft", activeId: null });
  const [connected, setConnected] = useState(0);
  const [mode, setMode] = useState<"build" | "present">("build");
  const [saving, setSaving] = useState<string>("");
  const [error, setError] = useState("");
  const latest = useRef<Deck | null>(null);
  const timer = useRef<number>();
  latest.current = deck;

  useEffect(() => {
    Promise.all([api.deck(id), api.results(id)])
      .then(([d, r]) => {
        setDeck(d);
        setResults(r.results);
        setLive({ status: r.status, activeId: r.activeQuestionId });
        setConnected(r.connected);
        if (r.status === "live") setMode("present");
      })
      .catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => {
    setChrome(mode === "build");
    return () => setChrome(true);
  }, [mode, setChrome]);

  const { send, status: socket } = useSocket(deck ? `/api/decks/${id}/ws` : null, (m) => {
    if (m.t === "state") setLive((l) => ({ status: m.state.status, activeId: m.state.activeQuestion?.id ?? (m.state.status === "live" ? null : l.activeId) }));
    if (m.t === "results") setResults((r) => ({ ...r, [m.questionId]: m.results }));
    if (m.t === "presence") setConnected(m.connected);
  });

  /** Edits save after a short pause. */
  const edit = (patch: Partial<Deck>) => {
    setDeck((d) => d && { ...d, ...patch });
    setSaving("Saving…");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const d = latest.current!;
      api
        .saveDeck(id, { title: d.title, theme: d.theme, anonymous: d.anonymous, questions: d.questions })
        .then(() => setSaving("Saved"))
        .catch((e) => setSaving(e.message || "Couldn't save. Check your connection."));
    }, 600);
  };

  const control = useCallback(
    (c: { status?: Status; activeQuestionId?: string | null }) => {
      if (!send({ t: "control", ...c })) setError("Not connected. Wait a moment and try again.");
      else setError("");
    },
    [send],
  );

  const qs = deck?.questions ?? [];
  const idx = qs.findIndex((q) => q.id === live.activeId);
  const go = useCallback((i: number) => qs[i] && control({ activeQuestionId: qs[i].id }), [qs, control]);

  useEffect(() => {
    if (mode !== "present") return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea, select")) return;
      if (e.key === "ArrowRight") go(idx + 1);
      if (e.key === "ArrowLeft") go(idx - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, idx, go]);

  if (error && !deck) return <main className="page"><p className="error">{error}</p><Link to="/app">Back to sessions</Link></main>;
  if (!deck) return <main className="page"><p className="muted">Loading…</p></main>;
  const active = qs[idx];

  const toolbar = (
    <div className="toolbar no-print">
      <Link to={`/app/t/${deck.teamId}`}>All sessions</Link>
      <div className="seg" role="tablist">
        <button role="tab" aria-selected={mode === "build"} className={mode === "build" ? "is-picked" : ""} onClick={() => setMode("build")}>Build</button>
        <button role="tab" aria-selected={mode === "present"} className={mode === "present" ? "is-picked" : ""} onClick={() => setMode("present")}>Present</button>
      </div>
      <span className="spacer" />
      <span className="muted small">{saving}</span>
      {socket !== "open" && <span className="small error">Reconnecting…</span>}
      <Link to={`/app/d/${id}/report`}>Results</Link>
      {mode === "present" && <button onClick={() => document.documentElement.requestFullscreen?.()}>Full screen</button>}
    </div>
  );

  if (mode === "build")
    return (
      <main className="page">
        {toolbar}
        <input className="title-input" value={deck.title} maxLength={120} onChange={(e) => edit({ title: e.target.value })} aria-label="Session name" />
        <div className="settings">
          <label className="inline">
            Look
            <select value={deck.theme} onChange={(e) => edit({ theme: e.target.value as Theme })}>
              {Object.entries(THEMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="inline">
            <input type="checkbox" checked={deck.anonymous} onChange={(e) => edit({ anonymous: e.target.checked })} />
            Anonymous (don't show names with responses)
          </label>
        </div>
        <ShareCard code={deck.code} title={deck.title} />
        <QuestionEditor questions={qs} activeId={live.activeId} onChange={(questions: Question[]) => edit({ questions })} />
      </main>
    );

  return (
    <main className="stage" data-theme={deck.theme}>
      {toolbar}
      {error && <p className="error">{error}</p>}
      <div className="join-banner">
        <span>Join at <strong>{location.host}</strong> with code</span>
        <span className="code-digits">{deck.code}</span>
        <span className="muted">{connected} connected</span>
        <ShareCard code={deck.code} title={deck.title} />
      </div>

      {live.status === "draft" && (
        <div className="state">
          <p>{qs.length ? "Ready when you are. People who join now see a waiting screen until you start." : "Add a question in Build first."}</p>
          {qs.length > 0 && <button className="primary big" onClick={() => control({ status: "live", activeQuestionId: live.activeId ?? qs[0].id })}>Start session</button>}
        </div>
      )}

      {live.status === "closed" && (
        <div className="state">
          <p>This session has ended. Participants can no longer respond.</p>
          <div className="row">
            <button onClick={() => control({ status: "live" })}>Reopen</button>
            <Link className="button primary" to={`/app/d/${id}/report`}>View results</Link>
          </div>
        </div>
      )}

      {live.status === "live" && active && (
        <section className="stage-body">
          <h1 className="stage-prompt">{active.prompt || "Untitled question"}</h1>
          <Results question={active} results={results[active.id]} onModerate={(rid, hidden) => send({ t: "moderate", id: rid, hidden })} />
        </section>
      )}
      {live.status === "live" && !active && <p className="state">Pick a question below to put it on screen.</p>}

      {live.status === "live" && (
        <nav className="controls no-print">
          <button disabled={idx <= 0} onClick={() => go(idx - 1)}>Previous</button>
          <div className="dots">
            {qs.map((q, i) => (
              <button key={q.id} className={i === idx ? "dot is-picked" : "dot"} title={q.prompt || TYPE_LABELS[q.type]} onClick={() => go(i)} aria-label={`Question ${i + 1}`}>
                {i + 1}
              </button>
            ))}
          </div>
          <button disabled={idx >= qs.length - 1} onClick={() => go(idx + 1)}>Next</button>
          <span className="spacer" />
          {active && (active.type === "pick" || (active.type === "rank" && active.sourceId)) && (
            <button onClick={() => {
              if ((results[active.id]?.total ?? 0) > 0 && !confirm("This clears the votes so far.")) return;
              if (!send({ t: "rebuild", questionId: active.id })) setError("Not connected. Wait a moment and try again.");
              else setError("");
            }}>Refresh options</button>
          )}
          {active && <button className="link" onClick={() => confirm("Clear all responses to this question?") && api.reset(id, active.id)}>Clear responses</button>}
          <button className="danger" onClick={() => confirm("End the session for everyone?") && control({ status: "closed" })}>End session</button>
        </nav>
      )}
    </main>
  );
}
