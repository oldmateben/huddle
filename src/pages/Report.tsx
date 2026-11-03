import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { Deck, ResultsBundle } from "../../shared/types";
import { FREE_DAILY_REQUESTS, TYPE_LABELS } from "../../shared/types";
import { api } from "../api";
import Results from "../components/Results";

export default function Report() {
  const { id = "" } = useParams();
  const [deck, setDeck] = useState<Deck | null>(null);
  const [bundle, setBundle] = useState<ResultsBundle | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([api.deck(id), api.results(id)])
      .then(([d, b]) => (setDeck(d), setBundle(b)))
      .catch((e) => setError(e.message));
  }, [id]);

  if (error) return <main className="page"><p className="error">{error}</p></main>;
  if (!deck || !bundle) return <main className="page"><p className="muted">Loading…</p></main>;
  const todayUse = bundle.usage.byDay.find((d) => d.day === new Date().toISOString().slice(0, 10))?.requests ?? 0;

  return (
    <main className="page report" data-theme={deck.theme === "night" ? undefined : deck.theme}>
      <div className="toolbar no-print">
        <Link to={`/app/d/${id}`}>Back to session</Link>
        <span className="spacer" />
        <button onClick={() => downloadCsv(deck, bundle)}>Download CSV</button>
        <button className="primary" onClick={() => window.print()}>Save as PDF</button>
      </div>
      <h1>{deck.title}</h1>
      <p className="muted">
        {bundle.participants} participant{bundle.participants === 1 ? "" : "s"}. Code {deck.code}. Printed {new Date().toLocaleDateString()}.
        Hidden responses aren't included.
      </p>

      {deck.questions.map((q, i) => (
        <section key={q.id} className="report-q">
          <h2>{i + 1}. {q.prompt || "Untitled question"}</h2>
          <p className="muted small">{TYPE_LABELS[q.type]}</p>
          <Results question={q} results={hideHidden(bundle.results[q.id])} />
        </section>
      ))}

      <section className="report-q no-print usage">
        <h2>Usage</h2>
        <p>
          This session has used about <strong>{bundle.usage.total.toLocaleString()}</strong> requests in total, {todayUse.toLocaleString()} of them today.
          The free plan allows {FREE_DAILY_REQUESTS.toLocaleString()} a day across all sessions.
        </p>
      </section>
    </main>
  );
}

function hideHidden<T extends ResultsBundle["results"][string] | undefined>(r: T): T {
  if (r?.type === "text") return { ...r, items: r.items.filter((x) => !x.hidden) } as T;
  if (r?.type === "board") return { ...r, notes: r.notes.filter((x) => !x.hidden) } as T;
  return r;
}

function downloadCsv(deck: Deck, bundle: ResultsBundle) {
  const rows: (string | number)[][] = [["Question #", "Question", "Type", "Response", "Count / votes", "Column", "Name"]];
  deck.questions.forEach((q, i) => {
    const r = bundle.results[q.id];
    const base = [i + 1, q.prompt, TYPE_LABELS[q.type]];
    if (r?.type === "choice") q.options?.forEach((o) => rows.push([...base, o.label, r.counts[o.id] ?? 0, "", ""]));
    if (r?.type === "rating") r.distribution.forEach((n, k) => rows.push([...base, `Rated ${k + 1}`, n, "", ""]));
    if (r?.type === "words") r.words.forEach((w) => rows.push([...base, w.text, w.count, "", ""]));
    if (r?.type === "text") r.items.filter((x) => !x.hidden).forEach((x) => rows.push([...base, x.text, "", "", x.author ?? ""]));
    if (r?.type === "board")
      r.notes.filter((x) => !x.hidden).forEach((x) => rows.push([...base, x.text, x.votes, q.columns?.[x.column] ?? "", x.author ?? ""]));
  });
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv" }));
  a.download = `${deck.title.replace(/[^\w-]+/g, "-")}-${deck.code}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}
