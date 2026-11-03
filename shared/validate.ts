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
    default:
      return null;
  }
}

const ADJECTIVES = ["Curious", "Brave", "Sunny", "Quiet", "Clever", "Swift", "Gentle", "Bold", "Witty", "Calm", "Lucky", "Merry"];
const ANIMALS = ["Otter", "Koala", "Wombat", "Magpie", "Platypus", "Echidna", "Possum", "Kookaburra", "Dingo", "Quokka", "Galah", "Numbat"];
export function randomName(): string {
  const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
  return `${pick(ADJECTIVES)} ${pick(ANIMALS)}`;
}
