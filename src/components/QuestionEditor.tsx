import type { Question, QuestionType } from "../../shared/types";
import { TYPE_LABELS } from "../../shared/types";

export const newId = () => Math.random().toString(36).slice(2, 10);

const eligibleSources = (questions: Question[]) => questions.filter((q) => ["text", "words", "board"].includes(q.type));
const moderateSource = (questions: Question[], sourceId?: string) => questions.map((q) =>
  q.id === sourceId && (q.type === "text" || q.type === "board") ? { ...q, moderated: true } : q,
);

export function blankQuestion(type: QuestionType, earlier: Question[] = []): Question {
  const q: Question = { id: newId(), type, prompt: "" };
  if (type === "choice" || type === "rank") q.options = [{ id: newId(), label: "" }, { id: newId(), label: "" }];
  if (type === "pick") Object.assign(q, { sourceId: eligibleSources(earlier).at(-1)?.id, votesEach: 3, limit: 12, allowOwn: true });
  if (type === "rank") q.limit = 5;
  if (type === "rating") q.scale = 5;
  if (type === "board") q.columns = ["Went well", "To improve", "Actions"];
  return q;
}

interface Props {
  questions: Question[];
  activeId: string | null;
  onChange: (qs: Question[]) => void;
}

export default function QuestionEditor({ questions, activeId, onChange }: Props) {
  const set = (i: number, q: Question) => onChange(questions.map((x, j) => (j === i ? q : x)));
  const chooseSource = (i: number, q: Question, sourceId: string) =>
    onChange(moderateSource(questions.map((x, j) => j === i ? { ...q, options: undefined, sourceId } : x), sourceId));
  const canAddPick = eligibleSources(questions).length > 0;
  const move = (i: number, d: number) => {
    const next = [...questions];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    onChange(next);
  };

  return (
    <div className="editor">
      {questions.map((q, i) => (
        <section key={q.id} className={`q-card ${q.id === activeId ? "is-active" : ""}`}>
          <header>
            <span className="q-num">{i + 1}</span>
            <span className="q-type">{TYPE_LABELS[q.type]}</span>
            {q.id === activeId && <span className="pill">On screen</span>}
            <span className="spacer" />
            <button className="icon" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">↑</button>
            <button className="icon" disabled={i === questions.length - 1} onClick={() => move(i, 1)} aria-label="Move down">↓</button>
            <button className="icon" onClick={() => onChange(questions.filter((_, j) => j !== i))} aria-label="Delete question">✕</button>
          </header>

          <input
            aria-label="Question prompt"
            className="prompt-input"
            placeholder="Type your question"
            value={q.prompt}
            maxLength={200}
            onChange={(e) => set(i, { ...q, prompt: e.target.value })}
          />

          {q.type === "rank" && (
            <div className="row" role="group" aria-label="Ranking options">
              <button aria-pressed={!q.sourceId} className={!q.sourceId ? "is-picked" : ""} onClick={() => set(i, { ...q, sourceId: undefined, options: q.options ?? blankQuestion("rank").options })}>
                Type the options
              </button>
              <button aria-pressed={!!q.sourceId} className={q.sourceId ? "is-picked" : ""} disabled={!eligibleSources(questions.slice(0, i)).length} onClick={() => !q.sourceId && chooseSource(i, q, eligibleSources(questions.slice(0, i)).at(-1)!.id)}>
                Use answers from an earlier question
              </button>
            </div>
          )}

          {(q.type === "choice" || (q.type === "rank" && !q.sourceId)) && (
            <ListField
              items={(q.options ?? []).map((o) => o.label)}
              max={8}
              min={q.type === "rank" ? 2 : 1}
              placeholder="Option"
              addLabel="Add option"
              onChange={(labels) =>
                set(i, {
                  ...q,
                  options: labels.map((label, k) => ({ id: q.options?.[k]?.id ?? newId(), label })),
                })
              }
            />
          )}

          {(q.type === "pick" || (q.type === "rank" && q.sourceId)) && (
            <>
              <label className="stack">
                Take answers from
                <select value={q.sourceId ?? ""} onChange={(e) => chooseSource(i, q, e.target.value)}>
                  {!eligibleSources(questions.slice(0, i)).some((s) => s.id === q.sourceId) && <option value={q.sourceId ?? ""} disabled>Choose an earlier question</option>}
                  {eligibleSources(questions.slice(0, i)).map((s) => <option key={s.id} value={s.id}>{s.prompt || TYPE_LABELS[s.type]}</option>)}
                </select>
              </label>
              {q.type === "pick" && (
                <label className="inline">
                  Votes per person
                  <select value={q.votesEach ?? 3} onChange={(e) => set(i, { ...q, votesEach: Number(e.target.value) as Question["votesEach"] })}>
                    {[1, 2, 3, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
              )}
              <label className="inline">
                Show at most
                <select value={q.limit ?? (q.type === "pick" ? 12 : 5)} onChange={(e) => set(i, { ...q, limit: Number(e.target.value) })}>
                  {Array.from({ length: q.type === "pick" ? 19 : 7 }, (_, k) => k + 2).map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
              {q.type === "pick" && questions.find((s) => s.id === q.sourceId)?.type !== "words" && (
                <label className="inline">
                  <input type="checkbox" checked={q.allowOwn !== false} onChange={(e) => set(i, { ...q, allowOwn: e.target.checked })} />
                  Allow voting for your own answer
                </label>
              )}
            </>
          )}

          {q.type === "rating" && (
            <label className="inline">
              Scale
              <select value={q.scale} onChange={(e) => set(i, { ...q, scale: Number(e.target.value) as 5 | 10 })}>
                <option value={5}>1 to 5</option>
                <option value={10}>1 to 10</option>
              </select>
            </label>
          )}

          {q.type === "board" && (
            <ListField
              items={q.columns ?? []}
              max={4}
              placeholder="Column name"
              addLabel="Add column"
              onChange={(columns) => set(i, { ...q, columns })}
            />
          )}

          {(q.type === "text" || q.type === "board") && (
            <label className="inline">
              <input type="checkbox" checked={!!q.moderated} onChange={(e) => set(i, { ...q, moderated: e.target.checked })} />
              Approve responses before they appear on screen
            </label>
          )}
        </section>
      ))}

      <div className="add-row">
        <span className="muted">Add a question:</span>
        {(Object.keys(TYPE_LABELS) as QuestionType[])
          .map((t) => (
          <button key={t} disabled={t === "pick" && !canAddPick} aria-describedby={t === "pick" && !canAddPick ? "pick-source-hint" : undefined} onClick={() => {
            const q = blankQuestion(t, questions);
            onChange([...moderateSource(questions, q.sourceId), q]);
          }}>
            {TYPE_LABELS[t]}
          </button>
        ))}
      </div>
      {!canAddPick && <p id="pick-source-hint" className="muted small">Add an open text, word cloud or retro board question first.</p>}
    </div>
  );
}

function ListField(props: { items: string[]; max: number; min?: number; placeholder: string; addLabel: string; onChange: (v: string[]) => void }) {
  const { items, max, min = 1, placeholder, addLabel, onChange } = props;
  return (
    <div className="list-field">
      {items.map((v, k) => (
        <div className="row" key={k}>
          <input aria-label={`${placeholder} ${k + 1}`} value={v} placeholder={`${placeholder} ${k + 1}`} maxLength={80} onChange={(e) => onChange(items.map((x, j) => (j === k ? e.target.value : x)))} />
          <button className="icon" disabled={items.length <= min} onClick={() => onChange(items.filter((_, j) => j !== k))} aria-label="Remove">✕</button>
        </div>
      ))}
      {items.length < max && (
        <button className="link" onClick={() => onChange([...items, ""])}>
          {addLabel}
        </button>
      )}
    </div>
  );
}
