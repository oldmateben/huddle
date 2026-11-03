import type { Deck, Me, Member, Question, Role } from "../shared/types";
import { FREE_DAILY_REQUESTS, TERMS_VERSION } from "../shared/types";
import { cleanQuestion, cleanText, isCode, isEmail, isTheme, isUuid } from "../shared/validate";
import { currentUser, enabledProviders, User } from "./auth";
import type { Env } from "./env";

const json = (body: unknown, status = 200) => Response.json(body, { status });
const fail = (status: number, error: string) => json({ error }, status);
const now = () => new Date().toISOString();
async function body<T = any>(req: Request): Promise<Partial<T>> {
  try {
    return ((await req.json()) ?? {}) as Partial<T>;
  } catch {
    return {};
  }
}

interface DeckRow {
  id: string;
  team_id: string;
  code: string;
  title: string;
  theme: string;
  anonymous: number;
  questions: string;
  status: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}
const toDeck = (r: DeckRow): Deck => ({
  id: r.id,
  teamId: r.team_id,
  code: r.code,
  title: r.title,
  theme: isTheme(r.theme) ? r.theme : "ink",
  anonymous: !!r.anonymous,
  questions: JSON.parse(r.questions),
  status: r.status as Deck["status"],
  createdBy: r.created_by,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

/** The user's role in a team. Admins are treated as leaders everywhere. */
async function roleIn(env: Env, user: User, teamId: string): Promise<Role | null> {
  if (user.is_admin) {
    const team = await env.DB.prepare(`SELECT 1 FROM teams WHERE id = ?`).bind(teamId).first();
    return team ? "leader" : null;
  }
  const m = await env.DB.prepare(`SELECT role FROM memberships WHERE team_id = ? AND user_id = ?`).bind(teamId, user.id).first<{ role: Role }>();
  return m?.role ?? null;
}

async function deckFor(env: Env, user: User, id: string): Promise<Deck | null> {
  const row = await env.DB.prepare(`SELECT * FROM decks WHERE id = ?`).bind(id).first<DeckRow>();
  if (!row || !(await roleIn(env, user, row.team_id))) return null;
  return toDeck(row);
}

const live = (env: Env, code: string) => env.LIVE.get(env.LIVE.idFromName(code));
const configure = (env: Env, d: Deck) =>
  live(env, d.code).configure({ code: d.code, title: d.title, theme: d.theme, anonymous: d.anonymous, questions: d.questions });

async function newCode(env: Env): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const code = String(100000 + Math.floor(Math.random() * 900000));
    if (!(await env.DB.prepare(`SELECT 1 FROM decks WHERE code = ?`).bind(code).first())) return code;
  }
  throw new Error("Could not allocate a code");
}

async function createDeck(env: Env, user: User, teamId: string, title: string, from?: Deck): Promise<Deck> {
  const d: Deck = {
    id: crypto.randomUUID(),
    teamId,
    code: await newCode(env),
    title,
    theme: from?.theme ?? "ink",
    anonymous: from?.anonymous ?? false,
    questions: from?.questions ?? [],
    status: "draft",
    createdBy: user.id,
    createdAt: now(),
    updatedAt: now(),
  };
  await env.DB.prepare(
    `INSERT INTO decks (id, team_id, code, title, theme, anonymous, questions, status, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)`,
  )
    .bind(d.id, teamId, d.code, d.title, d.theme, d.anonymous ? 1 : 0, JSON.stringify(d.questions), user.id, d.createdAt, d.updatedAt)
    .run();
  await configure(env, d);
  return d;
}

async function destroyDecks(env: Env, where: string, arg: string) {
  const { results } = await env.DB.prepare(`SELECT code FROM decks WHERE ${where} = ?`).bind(arg).all<{ code: string }>();
  await Promise.all(results.map((r) => live(env, r.code).destroy()));
}

/** Adds an existing or new user (by email) to a team. */
async function addMember(env: Env, by: User, teamId: string, email: string, role: Role) {
  email = email.toLowerCase();
  let u = await env.DB.prepare(`SELECT id FROM users WHERE email = ?`).bind(email).first<{ id: string }>();
  if (!u) {
    u = { id: crypto.randomUUID() };
    await env.DB.prepare(`INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)`).bind(u.id, email, now()).run();
  }
  await env.DB.prepare(
    `INSERT INTO memberships (team_id, user_id, role, added_by, added_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(team_id, user_id) DO UPDATE SET role = excluded.role`,
  )
    .bind(teamId, u.id, role, by.id, now())
    .run();
}

// ---------------------------------------------------------------------------

export async function handleApi(req: Request, env: Env, url: URL): Promise<Response> {
  const parts = url.pathname.split("/").slice(2); // after /api
  const m = req.method;

  // ----- public: config + participant join -----
  if (parts[0] === "config" && m === "GET")
    return json({ providers: enabledProviders(env), devLogin: env.DEV_LOGIN === "true" && url.hostname === "localhost" });

  if (parts[0] === "join" && isCode(parts[1])) {
    const code = parts[1];
    if (!(await env.DB.prepare(`SELECT 1 FROM decks WHERE code = ?`).bind(code).first())) return fail(404, "No session with that code. Check it and try again.");
    if (parts[2] === "ws") {
      const pid = url.searchParams.get("pid");
      const name = cleanText(url.searchParams.get("name") ?? "", 30);
      if (!isUuid(pid) || !name) return fail(400, "A name is needed to join.");
      return live(env, code).fetch(
        new Request("https://live/ws", {
          headers: { Upgrade: "websocket", "x-huddle-role": "participant", "x-huddle-pid": pid, "x-huddle-name": encodeURIComponent(name) },
        }),
      );
    }
    const state = await live(env, code).publicState();
    return state ? json(state) : fail(404, "No session with that code. Check it and try again.");
  }

  // ----- everything below needs a signed-in presenter -----
  const user = await currentUser(req, env);
  if (!user) return fail(401, "Sign in to continue.");

  if (parts[0] === "me") {
    if (m === "GET") {
      const { results } = user.is_admin
        ? await env.DB.prepare(`SELECT id, name, 'leader' AS role FROM teams ORDER BY name`).all<Me["teams"][number]>()
        : await env.DB.prepare(`SELECT t.id, t.name, m.role FROM memberships m JOIN teams t ON t.id = m.team_id WHERE m.user_id = ? ORDER BY t.name`)
            .bind(user.id)
            .all<Me["teams"][number]>();
      const me: Me = {
        user: { id: user.id, email: user.email, name: user.name, isAdmin: !!user.is_admin },
        teams: results,
        needsTerms: user.terms_version !== TERMS_VERSION,
      };
      return json(me);
    }
    if (parts[1] === "accept-terms" && m === "POST") {
      await env.DB.prepare(`UPDATE users SET terms_version = ?, terms_accepted_at = ? WHERE id = ?`).bind(TERMS_VERSION, now(), user.id).run();
      return json({ ok: true });
    }
  }

  // Presenters must accept the current terms before doing anything else.
  if (user.terms_version !== TERMS_VERSION) return fail(403, "Accept the terms of use to continue.");

  // ----- teams: /api/teams/:id/... -----
  if (parts[0] === "teams" && parts[1]) {
    const teamId = parts[1];
    const role = await roleIn(env, user, teamId);
    if (!role) return fail(404, "Team not found.");

    if (parts[2] === "decks") {
      if (m === "GET") {
        const { results } = await env.DB.prepare(`SELECT * FROM decks WHERE team_id = ? ORDER BY updated_at DESC`).bind(teamId).all<DeckRow>();
        return json(results.map(toDeck));
      }
      if (m === "POST") {
        const b = await body<{ title: string }>(req);
        return json(await createDeck(env, user, teamId, cleanText(b.title, 120) ?? "Untitled session"), 201);
      }
    }

    if (parts[2] === "members") {
      if (m === "GET") {
        const { results } = await env.DB.prepare(
          `SELECT u.id AS userId, u.email, u.name, m.role, u.last_login_at AS lastLoginAt FROM memberships m
           JOIN users u ON u.id = m.user_id WHERE m.team_id = ? ORDER BY m.role, u.email`,
        )
          .bind(teamId)
          .all<Member>();
        return json(results);
      }
      if (role !== "leader") return fail(403, "Only team leaders can change members.");
      if (m === "POST") {
        const b = await body<{ email: string; role: Role }>(req);
        if (!isEmail(b.email)) return fail(400, "Enter a valid email address.");
        const newRole: Role = b.role === "leader" && user.is_admin ? "leader" : "member";
        await addMember(env, user, teamId, b.email, newRole);
        return json({ ok: true });
      }
      if (m === "DELETE" && parts[3]) {
        const target = await env.DB.prepare(`SELECT role FROM memberships WHERE team_id = ? AND user_id = ?`).bind(teamId, parts[3]).first<{ role: Role }>();
        if (target?.role === "leader" && !user.is_admin) return fail(403, "Only the admin can remove a team leader.");
        await env.DB.prepare(`DELETE FROM memberships WHERE team_id = ? AND user_id = ?`).bind(teamId, parts[3]).run();
        return json({ ok: true });
      }
    }
  }

  // ----- decks: /api/decks/:id/... -----
  if (parts[0] === "decks" && parts[1]) {
    const deck = await deckFor(env, user, parts[1]);
    if (!deck) return fail(404, "Session not found.");

    if (!parts[2]) {
      if (m === "GET") return json(deck);
      if (m === "PUT") {
        const b = await body<Deck>(req);
        if (b.title !== undefined) deck.title = cleanText(b.title, 120) ?? deck.title;
        if (isTheme(b.theme)) deck.theme = b.theme;
        if (typeof b.anonymous === "boolean") deck.anonymous = b.anonymous;
        if (Array.isArray(b.questions)) {
          const qs = b.questions.slice(0, 50).map(cleanQuestion);
          if (qs.some((q) => !q)) return fail(400, "One of the questions is invalid.");
          deck.questions = qs as Question[];
        }
        deck.updatedAt = now();
        await env.DB.prepare(`UPDATE decks SET title = ?, theme = ?, anonymous = ?, questions = ?, updated_at = ? WHERE id = ?`)
          .bind(deck.title, deck.theme, deck.anonymous ? 1 : 0, JSON.stringify(deck.questions), deck.updatedAt, deck.id)
          .run();
        await configure(env, deck);
        return json(deck);
      }
      if (m === "DELETE") {
        await live(env, deck.code).destroy();
        await env.DB.prepare(`DELETE FROM decks WHERE id = ?`).bind(deck.id).run();
        return json({ ok: true });
      }
    }
    if (parts[2] === "duplicate" && m === "POST") return json(await createDeck(env, user, deck.teamId, `${deck.title} (copy)`.slice(0, 120), deck), 201);
    if (parts[2] === "results" && m === "GET") return json(await live(env, deck.code).results());
    if (parts[2] === "reset" && m === "POST") {
      const b = await body<{ questionId: string }>(req);
      await live(env, deck.code).reset(typeof b.questionId === "string" ? b.questionId : undefined);
      return json({ ok: true });
    }
    if (parts[2] === "ws")
      return live(env, deck.code).fetch(new Request("https://live/ws", { headers: { Upgrade: "websocket", "x-huddle-role": "presenter" } }));
  }

  // ----- admin -----
  if (parts[0] === "admin") {
    if (!user.is_admin) return fail(403, "Admin only.");

    if (parts[1] === "teams") {
      if (m === "POST" && !parts[2]) {
        const b = await body<{ name: string; leaderEmail: string }>(req);
        const name = cleanText(b.name, 80);
        if (!name) return fail(400, "Give the team a name.");
        const id = crypto.randomUUID();
        await env.DB.prepare(`INSERT INTO teams (id, name, created_at) VALUES (?, ?, ?)`).bind(id, name, now()).run();
        if (isEmail(b.leaderEmail)) await addMember(env, user, id, b.leaderEmail, "leader");
        return json({ id, name }, 201);
      }
      if (m === "PUT" && parts[2]) {
        const name = cleanText((await body<{ name: string }>(req)).name, 80);
        if (!name) return fail(400, "Give the team a name.");
        await env.DB.prepare(`UPDATE teams SET name = ? WHERE id = ?`).bind(name, parts[2]).run();
        return json({ ok: true });
      }
      if (m === "DELETE" && parts[2]) {
        await destroyDecks(env, "team_id", parts[2]);
        await env.DB.prepare(`DELETE FROM teams WHERE id = ?`).bind(parts[2]).run();
        return json({ ok: true });
      }
    }

    if (parts[1] === "users") {
      if (m === "GET") {
        const { results } = await env.DB.prepare(
          `SELECT u.id, u.email, u.name, u.is_admin AS isAdmin, u.last_login_at AS lastLoginAt, u.terms_accepted_at AS termsAcceptedAt,
                  (SELECT GROUP_CONCAT(t.name || ' (' || m.role || ')', ', ') FROM memberships m JOIN teams t ON t.id = m.team_id WHERE m.user_id = u.id) AS teams
           FROM users u ORDER BY u.email`,
        ).all();
        return json(results);
      }
      if (m === "DELETE" && parts[2]) {
        if (parts[2] === user.id) return fail(400, "You can't delete your own admin account.");
        await env.DB.prepare(`DELETE FROM users WHERE id = ?`).bind(parts[2]).run();
        return json({ ok: true });
      }
    }

    if (parts[1] === "usage" && m === "GET") {
      const { results: days } = await env.DB.prepare(
        `SELECT day, SUM(requests) AS requests FROM usage_daily GROUP BY day ORDER BY day DESC LIMIT 30`,
      ).all<{ day: string; requests: number }>();
      const { results: top } = await env.DB.prepare(
        `SELECT u.code, d.title, t.name AS team, SUM(u.requests) AS requests FROM usage_daily u
         LEFT JOIN decks d ON d.code = u.code LEFT JOIN teams t ON t.id = d.team_id
         WHERE u.day >= ? GROUP BY u.code ORDER BY requests DESC LIMIT 10`,
      )
        .bind(new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10))
        .all();
      return json({ dailyLimit: FREE_DAILY_REQUESTS, days: days.reverse(), top });
    }
  }

  return fail(404, "Not found.");
}
