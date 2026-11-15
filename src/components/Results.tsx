import type { BoardNote, Item, Question, Results as R } from "../../shared/types";

interface Props {
  question: Question;
  results?: R;
  /** Presenter only: show (hidden=false) or hide (hidden=true) a text entry or note. */
  onModerate?: (id: string, hidden: boolean) => void;
  onMerge?: (ids: string[], into: string | null) => void;
}

export default function Results({ question: q, results, onModerate, onMerge }: Props) {
  if (!results || results.type !== q.type) return <p className="empty">No responses yet.</p>;

  switch (results.type) {
    case "choice": {
      const max = Math.max(1, ...Object.values(results.counts));
      return (
        <div className="bars">
          {(q.options ?? []).map((o) => {
            const n = results.counts[o.id] ?? 0;
            const pct = results.total ? Math.round((n / results.total) * 100) : 0;
            return (
              <div className="bar-row" key={o.id}>
                <span className="bar-label">{o.label || "Untitled option"}</span>
                <div className="bar-track">
                  <div className="bar" style={{ width: `${(n / max) * 100}%` }} />
                </div>
                <span className="bar-count">
                  {n} <small>{pct}%</small>
                </span>
              </div>
            );
          })}
          <Total n={results.total} noun="vote" />
        </div>
      );
    }

    case "pick":
    case "rank": {
      if (!results.options.length) return <p className="empty">No answers to vote on yet. Go back to the earlier question and collect or approve some.</p>;
      const counts = results.type === "pick" ? results.counts : results.scores;
      const max = Math.max(1, ...Object.values(counts));
      const options = [...results.options].sort((a, b) => (counts[b.id] ?? 0) - (counts[a.id] ?? 0));
      return (
        <div className="bars">
          {options.map((o) => {
            const n = counts[o.id] ?? 0;
            const pct = results.total ? Math.round((n / results.total) * 100) : 0;
            return (
              <div className="bar-row" key={o.id}>
                <span className="bar-label">
                  {o.label || "Untitled option"}
                  {results.type === "rank" && <small className="first-choices">first choice for {results.firsts[o.id] ?? 0}</small>}
                </span>
                <div className="bar-track"><div className="bar" style={{ width: `${(n / max) * 100}%` }} /></div>
                <span className="bar-count">{n} <small>{results.type === "pick" ? `${pct}%` : "points"}</small></span>
              </div>
            );
          })}
          {results.leftOut > 0 && <p className="muted">{results.options.length} of {results.options.length + results.leftOut} answers shown</p>}
          <Total n={results.total} noun="person" plural="people" />
        </div>
      );
    }

    case "rating": {
      const max = Math.max(1, ...results.distribution);
      return (
        <div className="rating">
          <p className="rating-average">
            {results.total ? results.average.toFixed(1) : "–"}
            <small> / {q.scale ?? 5}</small>
          </p>
          <div className="columns-chart">
            {results.distribution.map((n, i) => (
              <div className="col" key={i}>
                <span className="col-count">{n || ""}</span>
                <div className="col-bar" style={{ height: `${(n / max) * 100}%` }} />
                <span className="col-label">{i + 1}</span>
              </div>
            ))}
          </div>
          <Total n={results.total} noun="rating" />
        </div>
      );
    }

    case "words": {
      if (!results.words.length) return <p className="empty">No words yet.</p>;
      const counts = results.words.map((w) => w.count);
      const lo = Math.min(...counts);
      const span = Math.max(...counts) - lo || 1;
      return (
        <div>
          <div className="cloud">
            {results.words.map((w, i) => (
              <span key={w.text} className={`tone-${i % 3}`} style={{ fontSize: `${1.1 + ((w.count - lo) / span) * 3}rem` }} title={`${w.count}`}>
                {w.text}
              </span>
            ))}
          </div>
          <Total n={results.total} noun="person" plural="people" />
        </div>
      );
    }

    case "text": {
      const shown = results.items.filter((i) => !i.hidden);
      return (
        <div>
          {onModerate && <Pending items={results.items} onModerate={onModerate} />}
          {shown.length ? (
            <div className="notes">
              {shown.map((it, i) => (
                <Note key={it.id} item={it} index={i} entries={shown} onMerge={onMerge} onHide={onModerate && (() => onModerate(it.id, true))} />
              ))}
            </div>
          ) : (
            <p className="empty">No responses yet.</p>
          )}
        </div>
      );
    }

    case "board": {
      const cols = q.columns ?? [];
      return (
        <div>
          {onModerate && <Pending items={results.notes} onModerate={onModerate} columns={cols} />}
          <div className="board" style={{ gridTemplateColumns: `repeat(${Math.max(cols.length, 1)}, minmax(14rem, 1fr))` }}>
            {cols.map((c, ci) => (
              <section key={ci} className="board-col">
                <h3>{c || `Column ${ci + 1}`}</h3>
                {results.notes
                  .filter((n) => n.column === ci && !n.hidden)
                  .map((n, i) => (
                    <Note key={n.id} item={n} index={i} votes={n.votes} entries={results.notes.filter((n) => !n.hidden)} onMerge={onMerge} onHide={onModerate && (() => onModerate(n.id, true))} />
                  ))}
              </section>
            ))}
          </div>
        </div>
      );
    }
  }
}

function Total({ n, noun, plural }: { n: number; noun: string; plural?: string }) {
  return (
    <p className="total">
      {n} {n === 1 ? noun : plural ?? `${noun}s`}
    </p>
  );
}

function Note({ item, index, votes, onHide, entries = [], onMerge }: { item: Item; index: number; votes?: number; onHide?: () => void; entries?: Item[]; onMerge?: Props["onMerge"] }) {
  return (
    <article className="note" style={{ ["--tilt" as string]: `${((index * 7) % 5) - 2}deg` }}>
      <p>{item.text}</p>
      <footer>
        <span className="author">{item.author}</span>
        {votes !== undefined && <span className="votes">+{votes}</span>}
        {!!item.merged && <span className="muted">+{item.merged} merged</span>}
        {onMerge && !!item.mergedIds?.length && (
          <button className="link no-print" onClick={() => onMerge(item.mergedIds!, null)}>Undo</button>
        )}
        {onMerge && (
          <select className="no-print" aria-label={`Merge “${item.text}” into`} value="" disabled={entries.length < 2} onChange={(e) => {
            if (e.target.value) onMerge([item.id], e.target.value);
          }}>
            <option value="">Merge into…</option>
            {entries.filter((other) => other.id !== item.id).map((other) => <option key={other.id} value={other.id}>{other.text}</option>)}
          </select>
        )}
        {onHide && (
          <button className="link no-print" onClick={onHide}>
            Hide
          </button>
        )}
      </footer>
    </article>
  );
}

function Pending({ items, onModerate, columns }: { items: (Item | BoardNote)[]; onModerate: (id: string, hidden: boolean) => void; columns?: string[] }) {
  const pending = items.filter((i) => i.hidden);
  if (!pending.length) return null;
  return (
    <aside className="pending no-print">
      <h3>Not on screen ({pending.length})</h3>
      <ul>
        {pending.map((p) => (
          <li key={p.id}>
            <span>
              {"column" in p && columns && <small>{columns[p.column]}: </small>}
              {p.text}
              {p.author && <small className="muted"> ({p.author})</small>}
            </span>
            <button onClick={() => onModerate(p.id, false)}>Show</button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
