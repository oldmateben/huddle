import type { BoardNote, Item, Question, Results } from "../shared/types";

export type Row = {
  id: string;
  kind: string; // v = vote, t = text, n = board note
  value: string; // JSON
  hidden: number;
  created_at: string;
  name: string | null;
};

/** Turns stored responses into chartable results. */
export function aggregate(
  q: Question,
  rows: Row[],
  upvotes: Map<string, number>,
  opts: { includeHidden: boolean; anonymous: boolean },
): Results {
  const visible = rows.filter((r) => opts.includeHidden || !r.hidden);
  const val = (r: Row) => JSON.parse(r.value);
  const item = (r: Row): Item => ({
    id: r.id,
    text: typeof val(r) === "string" ? val(r) : val(r).text,
    hidden: !!r.hidden,
    createdAt: r.created_at,
    ...(opts.anonymous || !r.name ? {} : { author: r.name }),
  });
  const votes = visible.filter((r) => r.kind === "v");

  switch (q.type) {
    // step 2: aggregate votes and rankings using resolved options.
    case "pick":
      return { type: "pick", options: [], counts: {}, total: 0, leftOut: 0 };
    case "rank":
      return { type: "rank", options: [], scores: {}, firsts: {}, total: 0, leftOut: 0 };
    case "choice": {
      const counts: Record<string, number> = Object.fromEntries((q.options ?? []).map((o) => [o.id, 0]));
      for (const r of votes) if (val(r) in counts) counts[val(r)]++;
      return { type: "choice", counts, total: votes.length };
    }
    case "rating": {
      const distribution = new Array<number>(q.scale ?? 5).fill(0);
      let sum = 0;
      for (const r of votes) {
        const n = val(r) as number;
        if (n >= 1 && n <= distribution.length) {
          distribution[n - 1]++;
          sum += n;
        }
      }
      return { type: "rating", distribution, average: votes.length ? sum / votes.length : 0, total: votes.length };
    }
    case "words": {
      const counts = new Map<string, number>();
      for (const r of votes) for (const w of val(r) as string[]) counts.set(w, (counts.get(w) ?? 0) + 1);
      const words = [...counts].map(([text, count]) => ({ text, count })).sort((a, b) => a.text.localeCompare(b.text));
      return { type: "words", words, total: votes.length };
    }
    case "text": {
      const items = visible.filter((r) => r.kind === "t").map(item).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return { type: "text", items, total: items.length };
    }
    case "board": {
      const notes: BoardNote[] = visible
        .filter((r) => r.kind === "n")
        .map((r) => ({ ...item(r), column: val(r).column as number, votes: upvotes.get(r.id) ?? 0 }))
        .sort((a, b) => b.votes - a.votes || a.createdAt.localeCompare(b.createdAt));
      return { type: "board", notes, total: notes.length };
    }
  }
}
