// One Durable Object per deck, named by the deck's 6-digit code. It holds the live
// state, every response, and the open WebSockets for presenters and participants.
import { DurableObject } from "cloudflare:workers";
import type { ClientMsg, LiveConfig, PublicState, Question, ResultsBundle, ServerMsg, Status } from "../shared/types";
import { cleanText, isUuid } from "../shared/validate";
import { aggregate, Row } from "./aggregate";
import type { Env } from "./env";

type Attachment = { role: "presenter" | "participant"; pid?: string };

const MAX_ENTRIES_PER_PERSON = 10; // text entries / board notes per question
const today = () => new Date().toISOString().slice(0, 10);

export class LiveSession extends DurableObject<Env> {
  private sql: SqlStorage;
  private alarmPending = false;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS participants (pid TEXT PRIMARY KEY, name TEXT NOT NULL, joined_at TEXT NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS responses (
      id TEXT PRIMARY KEY, question_id TEXT NOT NULL, pid TEXT NOT NULL, kind TEXT NOT NULL,
      value TEXT NOT NULL, hidden INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)`);
    this.sql.exec(`CREATE INDEX IF NOT EXISTS responses_q ON responses(question_id)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS upvotes (note_id TEXT NOT NULL, question_id TEXT NOT NULL, pid TEXT NOT NULL, PRIMARY KEY (note_id, pid))`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS usage (day TEXT PRIMARY KEY, requests INTEGER NOT NULL)`);
  }

  // ---------- small storage helpers ----------

  private get<T>(key: string): T | null {
    const row = this.sql.exec<{ value: string }>(`SELECT value FROM kv WHERE key = ?`, key).toArray()[0];
    return row ? (JSON.parse(row.value) as T) : null;
  }
  private set(key: string, value: unknown) {
    this.sql.exec(`INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)`, key, JSON.stringify(value));
  }
  private get config() {
    return this.get<LiveConfig>("config");
  }
  private get status(): Status {
    return this.get<Status>("status") ?? "draft";
  }
  private get activeId(): string | null {
    return this.get<string>("active");
  }
  private activeQuestion(): Question | null {
    const id = this.activeId;
    return this.config?.questions.find((q) => q.id === id) ?? null;
  }

  /** Counts one billable request for the usage tracker and schedules a flush to D1. */
  private bump() {
    this.sql.exec(
      `INSERT INTO usage (day, requests) VALUES (?, 1) ON CONFLICT(day) DO UPDATE SET requests = requests + 1`,
      today(),
    );
    if (!this.alarmPending) {
      this.alarmPending = true;
      this.ctx.storage.getAlarm().then((a) => {
        if (a === null) this.ctx.storage.setAlarm(Date.now() + 60_000);
      });
    }
  }

  /** Copies recent usage into D1 so the admin page can total it across sessions. */
  async alarm() {
    this.alarmPending = false;
    const code = this.config?.code;
    if (!code) return;
    const rows = this.sql.exec<{ day: string; requests: number }>(`SELECT day, requests FROM usage ORDER BY day DESC LIMIT 2`).toArray();
    await this.env.DB.batch(
      rows.map((r) =>
        this.env.DB.prepare(
          `INSERT INTO usage_daily (day, code, requests) VALUES (?, ?, ?) ON CONFLICT(day, code) DO UPDATE SET requests = excluded.requests`,
        ).bind(r.day, code, r.requests),
      ),
    );
  }

  // ---------- RPC methods called by the Worker ----------

  async configure(cfg: LiveConfig) {
    this.bump();
    this.set("config", cfg);
    if (this.activeId && !cfg.questions.some((q) => q.id === this.activeId)) this.set("active", null);
    this.broadcastState();
    const q = this.activeQuestion();
    if (q) this.pushResults(q);
  }

  async publicState(): Promise<PublicState | null> {
    if (!this.config) return null;
    this.bump();
    return this.state();
  }

  async results(): Promise<ResultsBundle> {
    this.bump();
    const cfg = this.config;
    const results: ResultsBundle["results"] = {};
    for (const q of cfg?.questions ?? []) results[q.id] = this.resultsFor(q, true);
    const byDay = this.sql.exec<{ day: string; requests: number }>(`SELECT day, requests FROM usage ORDER BY day`).toArray();
    return {
      status: this.status,
      activeQuestionId: this.activeId,
      participants: this.sql.exec<{ n: number }>(`SELECT COUNT(*) AS n FROM participants`).one().n,
      connected: this.ctx.getWebSockets("participant").length,
      results,
      usage: { total: byDay.reduce((s, d) => s + d.requests, 0), byDay },
    };
  }

  async reset(questionId?: string) {
    this.bump();
    if (questionId) {
      this.sql.exec(`DELETE FROM responses WHERE question_id = ?`, questionId);
      this.sql.exec(`DELETE FROM upvotes WHERE question_id = ?`, questionId);
    } else {
      this.sql.exec(`DELETE FROM responses`);
      this.sql.exec(`DELETE FROM upvotes`);
      this.sql.exec(`DELETE FROM participants`);
    }
    this.broadcastState();
    for (const q of this.config?.questions ?? []) this.pushResults(q);
  }

  async destroy() {
    await this.alarm(); // keep the usage history in D1
    for (const ws of this.ctx.getWebSockets()) ws.close(1000, "Session deleted");
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
  }

  // ---------- WebSockets (hibernation API) ----------

  async fetch(req: Request): Promise<Response> {
    if (req.headers.get("Upgrade") !== "websocket") return new Response("Expected WebSocket", { status: 426 });
    if (!this.config) return new Response("Not found", { status: 404 });
    this.bump();

    const role = req.headers.get("x-huddle-role") === "presenter" ? "presenter" : "participant";
    const pid = req.headers.get("x-huddle-pid") ?? "";
    const name = cleanText(decodeURIComponent(req.headers.get("x-huddle-name") ?? ""), 30) ?? "Guest";
    if (role === "participant" && !isUuid(pid)) return new Response("Bad participant id", { status: 400 });

    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server, [role]);
    server.serializeAttachment({ role, pid } satisfies Attachment);

    if (role === "participant") {
      this.sql.exec(
        `INSERT INTO participants (pid, name, joined_at) VALUES (?, ?, ?) ON CONFLICT(pid) DO UPDATE SET name = excluded.name`,
        pid,
        name,
        new Date().toISOString(),
      );
      this.send(server, this.stateFor(pid));
      const q = this.activeQuestion();
      if (q?.type === "board") this.send(server, { t: "board", questionId: q.id, results: this.resultsFor(q, false) });
    } else {
      this.send(server, { t: "state", state: this.state() });
    }
    this.broadcastPresence();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    this.bump();
    let msg: ClientMsg;
    try {
      msg = JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw));
    } catch {
      return;
    }
    const att = ws.deserializeAttachment() as Attachment;

    if (att.role === "presenter") {
      if (msg.t === "control") this.control(msg.status, msg.activeQuestionId);
      if (msg.t === "moderate") this.moderate(msg.id, msg.hidden);
      return;
    }
    if (msg.t === "respond") this.respond(ws, att.pid!, msg.questionId, msg.value);
    if (msg.t === "upvote") this.upvote(ws, att.pid!, msg.questionId, msg.noteId);
  }

  async webSocketClose(ws: WebSocket, code: number) {
    try {
      ws.close(code === 1005 ? 1000 : code);
    } catch {
      /* already closed */
    }
    this.broadcastPresence(ws);
  }

  async webSocketError(ws: WebSocket) {
    this.broadcastPresence(ws);
  }

  // ---------- presenter actions ----------

  private control(status: Status | undefined, activeQuestionId: string | null | undefined) {
    if (status && ["draft", "live", "closed"].includes(status) && status !== this.status) {
      this.set("status", status);
      this.ctx.waitUntil(this.env.DB.prepare(`UPDATE decks SET status = ? WHERE code = ?`).bind(status, this.config!.code).run());
    }
    if (activeQuestionId !== undefined) {
      const ok = activeQuestionId === null || this.config!.questions.some((q) => q.id === activeQuestionId);
      if (ok) this.set("active", activeQuestionId);
    }
    this.broadcastState();
    const q = this.activeQuestion();
    if (q) this.pushResults(q);
  }

  private moderate(id: string, hidden: boolean) {
    const row = this.sql.exec<{ question_id: string }>(`SELECT question_id FROM responses WHERE id = ?`, id).toArray()[0];
    if (!row) return;
    this.sql.exec(`UPDATE responses SET hidden = ? WHERE id = ?`, hidden ? 1 : 0, id);
    const q = this.config?.questions.find((x) => x.id === row.question_id);
    if (q) this.pushResults(q);
  }

  // ---------- participant actions ----------

  private respond(ws: WebSocket, pid: string, questionId: string, v: any) {
    const q = this.activeQuestion();
    const ack = (ok: boolean, msg: string) => this.send(ws, { t: "ack", questionId, ok, msg });
    if (this.status !== "live" || !q || q.id !== questionId) return ack(false, "The presenter has moved on to another question.");
    const now = new Date().toISOString();
    const put = (id: string, kind: string, value: unknown, hidden = false) =>
      this.sql.exec(
        `INSERT OR REPLACE INTO responses (id, question_id, pid, kind, value, hidden, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        id, q.id, pid, kind, JSON.stringify(value), hidden ? 1 : 0, now,
      );
    const entriesSoFar = () =>
      this.sql.exec<{ n: number }>(`SELECT COUNT(*) AS n FROM responses WHERE question_id = ? AND pid = ?`, q.id, pid).one().n;

    switch (q.type) {
      case "choice":
        if (!q.options?.some((o) => o.id === v)) return ack(false, "Pick one of the options.");
        put(`${q.id}:v:${pid}`, "v", v);
        ack(true, "Your vote is in. Tap another option to change it.");
        break;
      case "rating":
        if (!Number.isInteger(v) || v < 1 || v > (q.scale ?? 5)) return ack(false, "Pick a rating.");
        put(`${q.id}:v:${pid}`, "v", v);
        ack(true, "Your rating is in. Tap another number to change it.");
        break;
      case "words": {
        const words = (Array.isArray(v) ? v : []).map((w) => cleanText(w, 25)?.toLowerCase()).filter((w): w is string => !!w);
        const unique = [...new Set(words)].slice(0, 3);
        if (!unique.length) return ack(false, "Enter at least one word (25 characters max).");
        put(`${q.id}:v:${pid}`, "v", unique);
        ack(true, "Your words are in. Send again to replace them.");
        break;
      }
      case "text": {
        const text = cleanText(v, 280);
        if (!text) return ack(false, "Responses can be up to 280 characters.");
        if (entriesSoFar() >= MAX_ENTRIES_PER_PERSON) return ack(false, "You've reached the limit for this question.");
        put(`${q.id}:t:${crypto.randomUUID()}`, "t", text, !!q.moderated);
        ack(true, q.moderated ? "Sent. It appears once the presenter approves it." : "Sent. You can add another.");
        break;
      }
      case "board": {
        const text = cleanText(v?.text, 140);
        const column = Number(v?.column);
        if (!text || !Number.isInteger(column) || column < 0 || column >= (q.columns?.length ?? 0))
          return ack(false, "Notes can be up to 140 characters.");
        if (entriesSoFar() >= MAX_ENTRIES_PER_PERSON) return ack(false, "You've reached the limit for this board.");
        put(`${q.id}:n:${crypto.randomUUID()}`, "n", { text, column }, !!q.moderated);
        ack(true, q.moderated ? "Sent. It appears once the presenter approves it." : "Note added.");
        break;
      }
    }
    this.pushResults(q);
  }

  private upvote(ws: WebSocket, pid: string, questionId: string, noteId: string) {
    const q = this.activeQuestion();
    if (this.status !== "live" || q?.type !== "board" || q.id !== questionId) return;
    const note = this.sql.exec<{ hidden: number }>(`SELECT hidden FROM responses WHERE id = ? AND kind = 'n'`, noteId).toArray()[0];
    if (!note || note.hidden) return;
    const existing = this.sql.exec(`SELECT 1 FROM upvotes WHERE note_id = ? AND pid = ?`, noteId, pid).toArray().length;
    if (existing) this.sql.exec(`DELETE FROM upvotes WHERE note_id = ? AND pid = ?`, noteId, pid);
    else this.sql.exec(`INSERT INTO upvotes (note_id, question_id, pid) VALUES (?, ?, ?)`, noteId, q.id, pid);
    this.send(ws, this.stateFor(pid));
    this.pushResults(q);
  }

  // ---------- reads & broadcasts ----------

  private state(): PublicState {
    const cfg = this.config!;
    const status = this.status;
    return {
      title: cfg.title,
      theme: cfg.theme,
      anonymous: cfg.anonymous,
      status,
      activeQuestion: status === "live" ? this.activeQuestion() : null,
    };
  }

  /** State plus what this participant already answered, so a refresh restores their choice. */
  private stateFor(pid: string): ServerMsg {
    const state = this.state();
    const q = state.activeQuestion;
    if (!q) return { t: "state", state };
    const mine = this.sql.exec<{ value: string }>(`SELECT value FROM responses WHERE id = ?`, `${q.id}:v:${pid}`).toArray()[0];
    const upvoted =
      q.type === "board"
        ? this.sql.exec<{ note_id: string }>(`SELECT note_id FROM upvotes WHERE question_id = ? AND pid = ?`, q.id, pid).toArray().map((r) => r.note_id)
        : undefined;
    return { t: "state", state, mine: mine ? JSON.parse(mine.value) : undefined, upvoted };
  }

  private resultsFor(q: Question, includeHidden: boolean) {
    const rows = this.sql
      .exec<Row>(
        `SELECT r.id, r.kind, r.value, r.hidden, r.created_at, p.name FROM responses r
         LEFT JOIN participants p ON p.pid = r.pid WHERE r.question_id = ?`,
        q.id,
      )
      .toArray();
    const upvotes = new Map(
      this.sql
        .exec<{ note_id: string; n: number }>(`SELECT note_id, COUNT(*) AS n FROM upvotes WHERE question_id = ? GROUP BY note_id`, q.id)
        .toArray()
        .map((r) => [r.note_id, r.n]),
    );
    return aggregate(q, rows, upvotes, { includeHidden, anonymous: !!this.config?.anonymous });
  }

  private pushResults(q: Question) {
    this.broadcast("presenter", { t: "results", questionId: q.id, results: this.resultsFor(q, true) });
    if (q.type === "board" && q.id === this.activeId)
      this.broadcast("participant", { t: "board", questionId: q.id, results: this.resultsFor(q, false) });
  }

  private broadcastState() {
    this.broadcast("presenter", { t: "state", state: this.state() });
    for (const ws of this.ctx.getWebSockets("participant")) {
      const { pid } = ws.deserializeAttachment() as Attachment;
      this.send(ws, this.stateFor(pid!));
    }
  }

  private broadcastPresence(closing?: WebSocket) {
    const connected = this.ctx.getWebSockets("participant").filter((ws) => ws !== closing).length;
    this.broadcast("presenter", { t: "presence", connected });
  }

  private broadcast(tag: "presenter" | "participant", msg: ServerMsg) {
    const data = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets(tag)) {
      try {
        ws.send(data);
      } catch {
        /* socket closing */
      }
    }
  }

  private send(ws: WebSocket, msg: ServerMsg) {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      /* socket closing */
    }
  }
}
