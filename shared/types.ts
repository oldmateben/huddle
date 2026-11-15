// Shared by the Worker (worker/) and the React app (src/).

export const TERMS_VERSION = "2026-11-15";
export const FREE_DAILY_REQUESTS = 100_000;

export type QuestionType = "choice" | "rating" | "words" | "text" | "board" | "pick" | "rank";
export type Theme = "ink" | "sticky" | "forest" | "night";
export type Status = "draft" | "live" | "closed";
export type Role = "leader" | "member";

export const TYPE_LABELS: Record<QuestionType, string> = {
  choice: "Multiple choice",
  rating: "Rating scale",
  words: "Word cloud",
  text: "Open text",
  board: "Retro board",
  pick: "Vote on earlier answers",
  rank: "Ranking",
};

export const THEMES: Record<Theme, string> = {
  ink: "Ink",
  sticky: "Sticky note",
  forest: "Forest",
  night: "Night",
};

export interface Option { id: string; label: string }

export interface Question {
  id: string;
  type: QuestionType;
  prompt: string;
  options?: Option[]; // choice, rank
  scale?: 5 | 10; // rating
  columns?: string[]; // board
  moderated?: boolean; // text, board: hold entries until approved
  sourceId?: string; // pick, rank: an earlier text, words or board question
  votesEach?: 1 | 2 | 3 | 5; // pick: options each person may choose (default 3)
  limit?: number; // source options: pick 2-20 (default 12), rank 2-8 (default 5)
  allowOwn?: boolean; // pick: allow voting for your own answer (default true)
}

export interface Deck {
  id: string;
  teamId: string;
  code: string;
  title: string;
  theme: Theme;
  anonymous: boolean;
  questions: Question[];
  status: Status;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** What a live session needs to know about its deck. */
export interface LiveConfig {
  code: string;
  title: string;
  theme: Theme;
  anonymous: boolean;
  questions: Question[];
}

export interface PublicState {
  title: string;
  theme: Theme;
  anonymous: boolean;
  status: Status;
  activeQuestion: Question | null;
}

export interface Item {
  id: string;
  text: string;
  hidden: boolean;
  createdAt: string;
  author?: string;
}
export type BoardNote = Item & { column: number; votes: number };

export type Results =
  | { type: "choice"; counts: Record<string, number>; total: number }
  | { type: "rating"; distribution: number[]; average: number; total: number }
  | { type: "words"; words: { text: string; count: number }[]; total: number }
  | { type: "text"; items: Item[]; total: number }
  | { type: "board"; notes: BoardNote[]; total: number }
  | { type: "pick"; options: Option[]; counts: Record<string, number>; total: number; leftOut: number }
  | { type: "rank"; options: Option[]; scores: Record<string, number>; firsts: Record<string, number>; total: number; leftOut: number };

export interface Usage {
  total: number;
  byDay: { day: string; requests: number }[];
}

export interface ResultsBundle {
  status: Status;
  activeQuestionId: string | null;
  participants: number; // everyone who has joined
  connected: number; // currently connected
  results: Record<string, Results>;
  usage: Usage;
}

// ---- WebSocket messages ----
export type ClientMsg =
  | { t: "respond"; questionId: string; value: unknown }
  | { t: "upvote"; questionId: string; noteId: string }
  | { t: "control"; status?: Status; activeQuestionId?: string | null }
  | { t: "moderate"; id: string; hidden: boolean }
  | { t: "rebuild"; questionId: string };

export type ServerMsg =
  | { t: "state"; state: PublicState; mine?: unknown; upvoted?: string[]; own?: string[] }
  | { t: "ack"; questionId: string; ok: boolean; msg: string }
  | { t: "board"; questionId: string; results: Results }
  | { t: "results"; questionId: string; results: Results }
  | { t: "presence"; connected: number };

// ---- presenter API ----
export interface Me {
  user: { id: string; email: string; name: string | null; isAdmin: boolean };
  teams: { id: string; name: string; role: Role }[];
  needsTerms: boolean;
}

export interface Member {
  userId: string;
  email: string;
  name: string | null;
  role: Role;
  lastLoginAt: string | null;
}
