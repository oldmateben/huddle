import type { Question, Theme } from "./types";
import { THEMES } from "./types";

export const isCode = (s: unknown): s is string => typeof s === "string" && /^\d{6}$/.test(s);
export const isUuid = (s: unknown): s is string =>
  typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
export const isId = (s: unknown): s is string => typeof s === "string" && /^[a-z0-9]{1,16}$/.test(s);
export const isEmail = (s: unknown): s is string =>
  typeof s === "string" && s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
export const isTheme = (s: unknown): s is Theme => typeof s === "string" && s in THEMES;

/** Collapses whitespace and enforces a length limit. Null if empty or too long. */
export function cleanText(s: unknown, max: number): string | null {
  if (typeof s !== "string") return null;
  const t = s.replace(/\s+/g, " ").trim();
  return t.length && t.length <= max ? t : null;
}

export function cleanQuestion(raw: any): Question | null {
  if (!isId(raw?.id)) return null;
  const q: Question = { id: raw.id, type: raw.type, prompt: cleanText(raw.prompt ?? "", 200) ?? "" };
  switch (raw.type) {
    case "choice":
      q.options = (Array.isArray(raw.options) ? raw.options : [])
        .slice(0, 8)
        .filter((o: any) => isId(o?.id))
        .map((o: any) => ({ id: o.id, label: cleanText(o.label, 80) ?? "" }));
      return q;
    case "rating":
      q.scale = raw.scale === 10 ? 10 : 5;
      return q;
    case "board":
      const columns: string[] = (Array.isArray(raw.columns) ? raw.columns : []).slice(0, 4).map((c: unknown) => cleanText(c, 40) ?? "");
      q.columns = columns.length ? columns : [""];
      q.moderated = !!raw.moderated;
      return q;
    case "text":
      q.moderated = !!raw.moderated;
      return q;
    case "words":
      return q;
    case "pick":
      if (!isId(raw.sourceId)) return null;
      q.sourceId = raw.sourceId;
      q.votesEach = raw.votesEach === 1 || raw.votesEach === 2 || raw.votesEach === 5 ? raw.votesEach : 3;
      q.limit = cleanLimit(raw.limit, 20, 12);
      q.allowOwn = raw.allowOwn !== false;
      return q;
    case "rank":
      if (raw.sourceId !== undefined) {
        if (!isId(raw.sourceId) || raw.options !== undefined) return null;
        q.sourceId = raw.sourceId;
        q.limit = cleanLimit(raw.limit, 8, 5);
      } else {
        if (!Array.isArray(raw.options) || raw.options.length < 2 || raw.options.length > 8) return null;
        q.options = raw.options
          .filter((o: any) => isId(o?.id))
          .map((o: any) => ({ id: o.id, label: cleanText(o.label, 80) ?? "" }));
        if (q.options!.length < 2) return null;
      }
      return q;
    default:
      return null;
  }
}

function cleanLimit(raw: unknown, max: number, fallback: number): number {
  return typeof raw === "number" && Number.isFinite(raw) ? Math.max(2, Math.min(max, Math.floor(raw))) : fallback;
}

export function cleanQuestions(raw: unknown[]): Question[] | string {
  const questions: Question[] = [];
  for (const value of raw) {
    const q = cleanQuestion(value);
    if (!q) return "One of the questions is invalid.";
    questions.push(q);
  }
  for (const [i, q] of questions.entries()) {
    if (q.sourceId && !questions.slice(0, i).some((source) =>
      source.id === q.sourceId && (source.type === "text" || source.type === "words" || source.type === "board"))) {
      return "'Vote on earlier answers' needs an earlier open text, word cloud or retro board question to take answers from.";
    }
  }
  return questions;
}

const ADJECTIVES = ["Curious", "Brave", "Sunny", "Quiet", "Clever", "Swift", "Gentle", "Bold", "Witty", "Calm", "Lucky", "Merry"];
const ANIMALS = ["Otter", "Koala", "Wombat", "Magpie", "Platypus", "Echidna", "Possum", "Kookaburra", "Dingo", "Quokka", "Galah", "Numbat"];
export function randomName(): string {
  const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
  return `${pick(ADJECTIVES)} ${pick(ANIMALS)}`;
}
