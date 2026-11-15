// End-to-end check against a running `npx wrangler dev` (local only: uses the dev sign-in).
// Run: npm run test:e2e   (expects http://localhost:8787 and a fresh or existing local DB)
const B = "http://localhost:8787";
const W = "ws://localhost:8787";
const log = (...a) => console.log(...a);
const ok = (c, m) => { if (!c) { console.log("FAIL:", m); process.exitCode = 1; } else log("  ✓", m); };

async function login(email) {
  const r = await fetch(`${B}/auth/dev?email=${encodeURIComponent(email)}`, { redirect: "manual" });
  const loc = r.headers.get("location");
  const c = r.headers.get("set-cookie")?.split(";")[0];
  return { loc, cookie: c };
}
const api = (cookie) => async (path, method = "GET", body) => {
  const r = await fetch(`${B}/api/${path}`, { method, headers: { cookie: cookie ?? "", "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
};
function socket(url, headers) {
  const ws = new WebSocket(url, { headers });
  const msgs = [];
  ws.onmessage = (e) => msgs.push(JSON.parse(e.data));
  const opened = new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  return { ws, msgs, opened, send: (m) => ws.send(JSON.stringify(m)), last: (t) => [...msgs].reverse().find((m) => m.t === t) };
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

log("config");
ok((await api()("config")).body.devLogin === true, "dev login enabled locally");

log("auth");
const stranger = await login("random@example.com");
ok(stranger.loc.includes("not-invited"), "uninvited email is refused");
const admin = await login("ben.hafner@gmail.com");
ok(admin.loc === "/app" && admin.cookie, "admin signs in on first visit");
const A = api(admin.cookie);
let me = await A("me");
ok(me.body.user.isAdmin && me.body.needsTerms, "admin must accept terms");
ok((await A("admin/users")).status === 403, "API blocked until terms accepted");
await A("me/accept-terms", "POST");
ok((await A("me")).body.needsTerms === false, "terms accepted");

log("teams");
const team = (await A("admin/teams", "POST", { name: "Test Team", leaderEmail: "ben@work.example" })).body;
ok(team.id, "admin creates team with a leader");
const leader = await login("ben@work.example");
ok(leader.loc === "/app", "invited leader can sign in");
const L = api(leader.cookie);
await L("me/accept-terms", "POST");
me = (await L("me")).body;
ok(me.teams[0]?.role === "leader" && !me.user.isAdmin, "leader sees team as leader");
await L(`teams/${team.id}/members`, "POST", { email: "jo@example.com", role: "leader" });
const members = (await L(`teams/${team.id}/members`)).body;
ok(members.find((m) => m.email === "jo@example.com")?.role === "member", "leader can add members but not leaders");
ok((await L("admin/usage")).status === 403, "leader can't reach admin");
const member = await login("jo@example.com");
const M = api(member.cookie);
await M("me/accept-terms", "POST");
const jo = members.find((m) => m.email === "jo@example.com");
const leaderRow = members.find((m) => m.email === "ben@work.example");
ok((await M(`teams/${team.id}/members/${leaderRow.userId}`, "DELETE")).status === 403, "member can't remove people");
const other = (await A("admin/teams", "POST", { name: "Personal" })).body;
ok((await M(`teams/${other.id}/decks`)).status === 404, "member can't see other teams");

log("deck");
const deck = (await L(`teams/${team.id}/decks`, "POST", { title: "Induction" })).body;
ok(/^\d{6}$/.test(deck.code), `deck created with code ${deck.code}`);
const sourceError = "'Vote on earlier answers' needs an earlier open text, word cloud or retro board question to take answers from.";
const source = { id: "ideas", type: "text", prompt: "Ideas", moderated: false };
const pick = { id: "vote", type: "pick", prompt: "Choose ideas", sourceId: source.id };
const laterSource = await M(`decks/${deck.id}`, "PUT", { questions: [pick, source] });
ok(laterSource.status === 400 && laterSource.body.error === sourceError, "pick can't take answers from a later question");
const ineligibleSource = await M(`decks/${deck.id}`, "PUT", { questions: [{ ...source, type: "rating" }, pick] });
ok(ineligibleSource.status === 400 && ineligibleSource.body.error === sourceError, "pick can't take answers from a rating question");
const savedPick = await M(`decks/${deck.id}`, "PUT", { questions: [source, { ...pick, votesEach: 4, limit: 99 }] });
ok(savedPick.status === 200, "pick after open text saves");
const loadedPick = (await M(`decks/${deck.id}`)).body.questions[1];
ok(loadedPick.votesEach === 3 && loadedPick.limit === 20 && loadedPick.allowOwn === true, "saved pick clamps votes and limit and defaults to allowing own answers");
const rank = { id: "rank", type: "rank", prompt: "Rank ideas", options: [{ id: "a", label: " First  idea " }, { id: "b", label: "Second idea" }] };
const bothRank = await M(`decks/${deck.id}`, "PUT", { questions: [source, { ...rank, sourceId: source.id }] });
ok(bothRank.status === 400 && bothRank.body.error === "One of the questions is invalid.", "rank can't have both typed options and a source");
const savedRank = await M(`decks/${deck.id}`, "PUT", { questions: [rank] });
ok(savedRank.status === 200 && savedRank.body.questions[0].options.length === 2 && savedRank.body.questions[0].options[0].label === "First idea", "rank with typed options saves and cleans labels");
const saved = await M(`decks/${deck.id}`, "PUT", {
  theme: "forest",
  questions: [
    { id: "q1", type: "choice", prompt: "Lunch?", options: [{ id: "a", label: "Pizza" }, { id: "b", label: "Sushi" }] },
    { id: "q2", type: "board", prompt: "Retro", columns: ["Good", "Bad"], moderated: false },
    { id: "q3", type: "text", prompt: "Thoughts", moderated: true },
    { id: "q4", type: "words", prompt: "One word" },
  ],
});
ok(saved.status === 200 && saved.body.questions.length === 4, "team member edits the deck");
ok((await api()(`join/${deck.code}`)).body.status === "draft", "public join shows draft");
ok((await api()("join/000000")).status === 404, "unknown code is 404");

log("live");
const P = socket(`${W}/api/decks/${deck.id}/ws`, { cookie: leader.cookie });
await P.opened;
const bad = socket(`${W}/api/decks/${deck.id}/ws`, {});
await bad.opened.then(() => ok(false, "anon presenter ws should fail")).catch(() => ok(true, "presenter socket needs sign-in"));
const pid1 = crypto.randomUUID(), pid2 = crypto.randomUUID();
const p1 = socket(`${W}/api/join/${deck.code}/ws?pid=${pid1}&name=Curious%20Otter`);
const p2 = socket(`${W}/api/join/${deck.code}/ws?pid=${pid2}&name=Sam`);
await Promise.all([p1.opened, p2.opened]);
await wait(300);
ok(P.last("presence")?.connected === 2, "presenter sees 2 connected");
P.send({ t: "control", status: "live", activeQuestionId: "q1" });
await wait(300);
ok(p1.last("state")?.state.activeQuestion?.id === "q1", "participants see question 1");
p1.send({ t: "respond", questionId: "q1", value: "a" });
p2.send({ t: "respond", questionId: "q1", value: "b" });
p1.send({ t: "respond", questionId: "q1", value: "b" }); // change vote
await wait(300);
ok(JSON.stringify(P.last("results")?.results.counts) === '{"a":0,"b":2}', "live choice results with vote change");
p1.send({ t: "respond", questionId: "q2", value: "x" });
await wait(200);
ok(p1.last("ack")?.ok === false, "can't answer a question that isn't on screen");

P.send({ t: "control", activeQuestionId: "q2" });
await wait(300);
p1.send({ t: "respond", questionId: "q2", value: { column: 0, text: "Great vibes" } });
await wait(300);
const note = p2.last("board")?.results.notes[0];
ok(note?.text === "Great vibes" && note.author === "Curious Otter", "board note reaches other participants with name");
p2.send({ t: "upvote", questionId: "q2", noteId: note.id });
await wait(300);
ok(P.last("results")?.results.notes[0].votes === 1, "upvote counted");
ok(p2.last("state")?.upvoted?.includes(note.id), "upvoter sees their upvote");

P.send({ t: "control", activeQuestionId: "q3" });
await wait(200);
p2.send({ t: "respond", questionId: "q3", value: "A private thought" });
await wait(300);
const item = P.last("results")?.results.items[0];
ok(item?.hidden === true, "moderated text arrives hidden");
P.send({ t: "moderate", id: item.id, hidden: false });
await wait(300);
ok(P.last("results")?.results.items[0].hidden === false, "presenter approves it");

await M(`decks/${deck.id}`, "PUT", { anonymous: true });
await wait(300);
const bundle = (await A(`decks/${deck.id}/results`)).body;
ok(bundle.results.q2.notes[0].author === undefined, "anonymous mode hides names");
ok(bundle.participants === 2 && bundle.usage.total > 10, `usage tracked: ${bundle.usage.total} requests`);

P.send({ t: "control", status: "closed" });
await wait(300);
ok(p1.last("state")?.state.status === "closed", "participants see session ended");
ok((await L(`teams/${team.id}/decks`)).body[0].status === "closed", "deck status saved to D1");

log("cleanup");
const dup = (await L(`decks/${deck.id}/duplicate`, "POST")).body;
ok(dup.questions.length === 4 && dup.code !== deck.code, "duplicate keeps questions, new code");
ok((await L(`decks/${deck.id}`, "DELETE")).status === 200, "deck deleted");
ok((await api()(`join/${deck.code}`)).status === 404, "deleted deck's code no longer works");
for (const s of [P, p1, p2]) s.ws.close();
log(process.exitCode ? "\nSOME CHECKS FAILED" : "\nALL CHECKS PASSED");
