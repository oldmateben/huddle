import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { randomName } from "../../shared/validate";
import type { PublicState, Question, Results } from "../../shared/types";
import { api } from "../api";
import { APP_NAME } from "../config";
import { participantId, savedName } from "../participant";
import { useSocket } from "../socket";

type Ack = { questionId: string; ok: boolean; msg: string } | null;

export default function Join() {
  const { code = "" } = useParams();
  const [state, setState] = useState<PublicState | null>(null);
  const [error, setError] = useState("");
  const [name, setName] = useState<string | null>(null);
  const [mine, setMine] = useState<unknown>(undefined);
  const [upvoted, setUpvoted] = useState<string[]>([]);
  const [board, setBoard] = useState<Results | null>(null);
  const [ack, setAck] = useState<Ack>(null);
  const lastSent = useRef<unknown>(undefined);

  useEffect(() => {
    api.join(code).then(setState).catch((e) => setError(e.message));
  }, [code]);

  const { send, status } = useSocket(name ? `/api/join/${code}/ws?pid=${participantId}&name=${encodeURIComponent(name)}` : null, (m) => {
    if (m.t === "state") {
      setState(m.state);
      setMine(m.mine);
      setUpvoted(m.upvoted ?? []);
    }
    if (m.t === "ack") {
      setAck(m);
      if (m.ok) setMine(lastSent.current); // highlights the option just chosen
    }
    if (m.t === "board") setBoard(m.results);
  });

  const q = state?.activeQuestion;
  let body;
  if (error) {
    body = (
      <div className="state">
        <p>{error}</p>
        <Link to="/">Enter a different code</Link>
      </div>
    );
  } else if (!state) {
    body = <p className="state muted">Loading…</p>;
  } else if (!name) {
    body = <NameStep anonymous={state.anonymous} onJoin={(n) => (savedName.set(n), setName(n))} />;
  } else if (state.status === "draft") {
    body = <p className="state">You're in. The session hasn't started yet, and this page updates when it does.</p>;
  } else if (state.status === "closed") {
    body = <p className="state">This session has ended. Thanks for taking part.</p>;
  } else if (!q) {
    body = <p className="state">Waiting for the next question…</p>;
  } else {
    body = (
      <Answer
        key={q.id}
        q={q}
        mine={mine}
        upvoted={upvoted}
        board={board?.type === "board" ? board : null}
        ack={ack?.questionId === q.id ? ack : null}
        send={(value) => ((lastSent.current = value), send({ t: "respond", questionId: q.id, value }))}
        upvote={(noteId) => send({ t: "upvote", questionId: q.id, noteId })}
      />
    );
  }

  return (
    <main className="join" data-theme={state?.theme}>
      <header className="join-head">
        <span className="brand">{APP_NAME}</span>
        <span className="muted">{state?.title}</span>
      </header>
      {name && status !== "open" && <p className="banner">Reconnecting…</p>}
      {body}
    </main>
  );
}

function NameStep({ anonymous, onJoin }: { anonymous: boolean; onJoin: (name: string) => void }) {
  const [name, setName] = useState(savedName.get());
  const clean = name.trim().slice(0, 30);
  return (
    <form className="stack name-step" onSubmit={(e) => (e.preventDefault(), clean && onJoin(clean))}>
      <h1>What should we call you?</h1>
      <input value={name} maxLength={30} placeholder="Your name or a nickname" onChange={(e) => setName(e.target.value)} autoFocus />
      <div className="row">
        <button type="button" onClick={() => setName(randomName())}>Pick a random name</button>
        <button className="primary" disabled={!clean}>Join</button>
      </div>
      <p className="small muted">
        {anonymous ? "This session is anonymous, so your name won't be shown with your responses." : "Your name may be shown next to what you write."}{" "}
        By joining you agree to the <Link to="/terms#participants" target="_blank">participant terms</Link>.
      </p>
    </form>
  );
}

interface AnswerProps {
  q: Question;
  mine: unknown;
  upvoted: string[];
  board: Extract<Results, { type: "board" }> | null;
  ack: Ack;
  send: (value: unknown) => boolean;
  upvote: (noteId: string) => boolean;
}

function Answer({ q, mine, upvoted, board, ack, send, upvote }: AnswerProps) {
  return (
    <section className="answer">
      <h1 className="answer-prompt">{q.prompt || "Untitled question"}</h1>
      {(q.type === "text" || q.type === "words" || q.type === "board") && (
        <p className="privacy">Keep it general. Don't include client or personal details.</p>
      )}
      {q.type === "choice" && <ChoiceInput q={q} mine={mine as string} send={send} />}
      {q.type === "rating" && <RatingInput q={q} mine={mine as number} send={send} />}
      {q.type === "words" && <WordsInput send={send} />}
      {q.type === "text" && <TextInput send={send} ack={ack} />}
      {q.type === "board" && <BoardInput q={q} board={board} upvoted={upvoted} send={send} upvote={upvote} ack={ack} />}
      {ack && (
        <p className={ack.ok ? "ok" : "error"} role="status">
          {ack.msg}
        </p>
      )}
    </section>
  );
}

function ChoiceInput({ q, mine, send }: { q: Question; mine?: string; send: (v: unknown) => boolean }) {
  return (
    <div className="choices">
      {(q.options ?? []).map((o) => (
        <button key={o.id} className={mine === o.id ? "choice is-picked" : "choice"} aria-pressed={mine === o.id} onClick={() => send(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function RatingInput({ q, mine, send }: { q: Question; mine?: number; send: (v: unknown) => boolean }) {
  const scale = q.scale ?? 5;
  return (
    <div>
      <div className="scale" style={{ gridTemplateColumns: `repeat(${scale}, 1fr)` }}>
        {Array.from({ length: scale }, (_, i) => i + 1).map((n) => (
          <button key={n} className={mine === n ? "is-picked" : ""} aria-pressed={mine === n} onClick={() => send(n)}>
            {n}
          </button>
        ))}
      </div>
      <div className="scale-ends muted">
        <span>Low</span>
        <span>High</span>
      </div>
    </div>
  );
}

function WordsInput({ send }: { send: (v: unknown) => boolean }) {
  const [words, setWords] = useState(["", "", ""]);
  return (
    <form className="stack" onSubmit={(e) => (e.preventDefault(), send(words.filter((w) => w.trim())))}>
      {words.map((w, i) => (
        <input
          key={i}
          value={w}
          maxLength={25}
          placeholder={i === 0 ? "One word or short phrase" : "Another (optional)"}
          onChange={(e) => setWords(words.map((x, j) => (j === i ? e.target.value : x)))}
        />
      ))}
      <button className="primary" disabled={!words.some((w) => w.trim())}>Send words</button>
    </form>
  );
}

/** Clears the box once the server confirms the entry. */
function useClearOnAck(ack: Ack, clear: () => void) {
  useEffect(() => {
    if (ack?.ok) clear();
  }, [ack]); // eslint-disable-line react-hooks/exhaustive-deps
}

function TextInput({ send, ack }: { send: (v: unknown) => boolean; ack: Ack }) {
  const [text, setText] = useState("");
  useClearOnAck(ack, () => setText(""));
  return (
    <form className="stack" onSubmit={(e) => (e.preventDefault(), send(text))}>
      <textarea value={text} maxLength={280} rows={4} placeholder="Type your response" onChange={(e) => setText(e.target.value)} />
      <div className="row between">
        <span className="muted">{280 - text.length} left</span>
        <button className="primary" disabled={!text.trim()}>Send</button>
      </div>
    </form>
  );
}

function BoardInput(props: {
  q: Question;
  board: Extract<Results, { type: "board" }> | null;
  upvoted: string[];
  send: (v: unknown) => boolean;
  upvote: (id: string) => boolean;
  ack: Ack;
}) {
  const { q, board, upvoted, send, upvote, ack } = props;
  const columns = q.columns ?? [];
  const [col, setCol] = useState(0);
  const [text, setText] = useState("");
  useClearOnAck(ack, () => setText(""));
  const notes = board?.notes.filter((n) => n.column === col) ?? [];

  return (
    <div>
      <div className="tabs" role="tablist">
        {columns.map((c, i) => (
          <button key={i} role="tab" aria-selected={col === i} className={col === i ? "is-picked" : ""} onClick={() => setCol(i)}>
            {c || `Column ${i + 1}`}
          </button>
        ))}
      </div>
      <form className="stack" onSubmit={(e) => (e.preventDefault(), send({ column: col, text }))}>
        <textarea value={text} maxLength={140} rows={3} placeholder={`Add a note to “${columns[col] ?? ""}”`} onChange={(e) => setText(e.target.value)} />
        <button className="primary" disabled={!text.trim()}>Add note</button>
      </form>
      <ul className="vote-list">
        {notes.map((n) => (
          <li key={n.id}>
            <span>{n.text}</span>
            <button className={upvoted.includes(n.id) ? "is-picked" : ""} aria-pressed={upvoted.includes(n.id)} onClick={() => upvote(n.id)} aria-label="Upvote">
              +{n.votes}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
