import type { Question, QuestionType } from "../../shared/types";
import { TYPE_LABELS } from "../../shared/types";

export const newId = () => Math.random().toString(36).slice(2, 10);

export function blankQuestion(type: QuestionType): Question {
  const q: Question = { id: newId(), type, prompt: "" };
  if (type === "choice") q.options = [{ id: newId(), label: "" }, { id: newId(), label: "" }];
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
            className="prompt-input"
            placeholder="Type your question"
            value={q.prompt}
            maxLength={200}
            onChange={(e) => set(i, { ...q, prompt: e.target.value })}
          />

          {q.type === "choice" && (
            <ListField
              items={(q.options ?? []).map((o) => o.label)}
              max={8}
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
        {(Object.keys(TYPE_LABELS) as QuestionType[]).map((t) => (
          <button key={t} onClick={() => onChange([...questions, blankQuestion(t)])}>
            {TYPE_LABELS[t]}
          </button>
        ))}
      </div>
    </div>
  );
}

function ListField(props: { items: string[]; max: number; placeholder: string; addLabel: string; onChange: (v: string[]) => void }) {
  const { items, max, placeholder, addLabel, onChange } = props;
  return (
    <div className="list-field">
      {items.map((v, k) => (
        <div className="row" key={k}>
          <input value={v} placeholder={`${placeholder} ${k + 1}`} maxLength={80} onChange={(e) => onChange(items.map((x, j) => (j === k ? e.target.value : x)))} />
          <button className="icon" disabled={items.length <= 1} onClick={() => onChange(items.filter((_, j) => j !== k))} aria-label="Remove">✕</button>
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
