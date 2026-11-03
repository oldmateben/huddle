import type { Deck, Me, Member, PublicState, ResultsBundle, Role } from "../shared/types";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/${path}`, { ...init, headers: { "content-type": "application/json", ...init?.headers } });
  if (!res.ok) {
    const b = await res.json().catch(() => ({}));
    throw new ApiError(res.status, b.error ?? `Request failed (${res.status})`);
  }
  return res.json();
}
const send = (method: string, body?: unknown): RequestInit => ({ method, body: body === undefined ? undefined : JSON.stringify(body) });

export interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  isAdmin: number;
  lastLoginAt: string | null;
  termsAcceptedAt: string | null;
  teams: string | null;
}
export interface AdminUsage {
  dailyLimit: number;
  days: { day: string; requests: number }[];
  top: { code: string; title: string | null; team: string | null; requests: number }[];
}

export const api = {
  config: () => req<{ providers: string[]; devLogin: boolean }>("config"),
  join: (code: string) => req<PublicState>(`join/${code}`),

  me: () => req<Me>("me"),
  acceptTerms: () => req("me/accept-terms", send("POST")),

  decks: (teamId: string) => req<Deck[]>(`teams/${teamId}/decks`),
  createDeck: (teamId: string, title: string) => req<Deck>(`teams/${teamId}/decks`, send("POST", { title })),
  deck: (id: string) => req<Deck>(`decks/${id}`),
  saveDeck: (id: string, patch: Partial<Deck>) => req<Deck>(`decks/${id}`, send("PUT", patch)),
  deleteDeck: (id: string) => req(`decks/${id}`, send("DELETE")),
  duplicateDeck: (id: string) => req<Deck>(`decks/${id}/duplicate`, send("POST")),
  results: (id: string) => req<ResultsBundle>(`decks/${id}/results`),
  reset: (id: string, questionId?: string) => req(`decks/${id}/reset`, send("POST", { questionId })),

  members: (teamId: string) => req<Member[]>(`teams/${teamId}/members`),
  addMember: (teamId: string, email: string, role: Role) => req(`teams/${teamId}/members`, send("POST", { email, role })),
  removeMember: (teamId: string, userId: string) => req(`teams/${teamId}/members/${userId}`, send("DELETE")),

  createTeam: (name: string, leaderEmail: string) => req<{ id: string }>("admin/teams", send("POST", { name, leaderEmail })),
  renameTeam: (id: string, name: string) => req(`admin/teams/${id}`, send("PUT", { name })),
  deleteTeam: (id: string) => req(`admin/teams/${id}`, send("DELETE")),
  users: () => req<AdminUser[]>("admin/users"),
  deleteUser: (id: string) => req(`admin/users/${id}`, send("DELETE")),
  usage: () => req<AdminUsage>("admin/usage"),
};
