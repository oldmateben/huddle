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

log("sourced voting and ranking");
const flow = (await L(`teams/${team.id}/decks`, "POST", { title: "Brainstorm flow" })).body;
const flowQuestions = [
  { id: "ideas", type: "text", prompt: "Ideas", moderated: true },
  { id: "pick", type: "pick", prompt: "Vote", sourceId: "ideas", votesEach: 2, limit: 3, allowOwn: false },
  { id: "rank", type: "rank", prompt: "Rank", sourceId: "ideas", limit: 3 },
  { id: "words", type: "words", prompt: "Words" },
  { id: "wordpick", type: "pick", prompt: "Vote words", sourceId: "words", allowOwn: false, limit: 2 },
  { id: "typed", type: "rank", prompt: "Typed rank", options: [{ id: "a", label: "A" }, { id: "b", label: "B" }] },
  { id: "board", type: "board", prompt: "Board", columns: ["Ideas"] },
  { id: "boardpick", type: "pick", prompt: "Vote board", sourceId: "board", limit: 2 },
];
await L(`decks/${flow.id}`, "PUT", { questions: flowQuestions });
const F = socket(`${W}/api/decks/${flow.id}/ws`, { cookie: leader.cookie });
const fid1 = crypto.randomUUID(), fid2 = crypto.randomUUID();
const f1 = socket(`${W}/api/join/${flow.code}/ws?pid=${fid1}&name=AuthorOne`);
const f2 = socket(`${W}/api/join/${flow.code}/ws?pid=${fid2}&name=AuthorTwo`);
await Promise.all([F.opened, f1.opened, f2.opened]);
const control = async (id, status) => { F.send({ t: "control", activeQuestionId: id, ...(status ? { status } : {}) }); await wait(200); };
const respond = async (who, questionId, value) => { who.send({ t: "respond", questionId, value }); await wait(200); return who.last("ack"); };
const rebuild = async (questionId) => { F.send({ t: "rebuild", questionId }); await wait(200); };
const flowResult = async (id) => (await L(`decks/${flow.id}/results`)).body.results[id];
const cleanPayload = (msg) => {
  const text = JSON.stringify(msg);
  return ![fid1, fid2, "AuthorOne", "AuthorTwo", '"authors"', '"from"', '"author"'].some((secret) => text.includes(secret));
};
await control("pick", "live");
ok(f1.last("state").state.activeQuestion.options.length === 0 &&
  (await respond(f1, "pick", ["o1"])).msg === "The presenter hasn't opened the options yet.", "pick waits when there aren't two visible answers");
await control("ideas");
await respond(f1, "ideas", "First idea");
await respond(f2, "ideas", "  FIRST   idea ");
await respond(f2, "ideas", "Second idea");
await respond(f2, "ideas", "Third idea");
await respond(f2, "ideas", "Hidden idea");
for (const item of F.last("results").results.items.filter((i) => i.text !== "Hidden idea")) F.send({ t: "moderate", id: item.id, hidden: false });
await wait(200);
await control("pick");
let options = f1.last("state").state.activeQuestion.options;
ok(JSON.stringify(options) === JSON.stringify([{ id: "o1", label: "First idea" }, { id: "o2", label: "Second idea" }, { id: "o3", label: "Third idea" }]), "pick freezes visible answers, collapses case and spacing duplicates, and keeps the first label");
ok(JSON.stringify(f1.last("state").own) === '["o1"]' && JSON.stringify(f2.last("state").own) === '["o1","o2","o3"]', "participant state lists own ids including duplicate authors");
ok((await respond(f1, "pick", ["o1"])).msg === "You can't vote for your own answer on this question.", "own answer refused with exact copy");
for (const value of [["o1", "o2", "o3"], ["unknown"], ["o2", "o2"], [], null, "o2", [{ id: "o2" }]]) {
  const ack = await respond(f1, "pick", value);
  ok(ack.ok === false && ack.msg === "Choose up to 2 options.", `pick rejects invalid value ${JSON.stringify(value)}`);
}
ok((await respond(f1, "pick", ["o2", "o3"])).msg === "Your votes are in. You can change them while this question is open.", "pick accepts valid choices with exact success copy");
await respond(f1, "pick", ["o3"]);
ok(JSON.stringify(F.last("results").results.counts) === '{"o1":0,"o2":0,"o3":1}' && F.last("results").results.total === 1, "resending replaces votes and updates presenter counts");
for (const anonymous of [false, true]) {
  await L(`decks/${flow.id}`, "PUT", { anonymous });
  await wait(200);
  ok(cleanPayload(F.last("state")) && cleanPayload(f1.last("state")) && cleanPayload(f2.last("state")) &&
    cleanPayload(F.last("results")) && cleanPayload(await flowResult("pick")), `state and voting results contain plain options and no authorship (${anonymous ? "anonymous" : "named"})`);
}
const allowedQuestions = flowQuestions.map((q) => q.id === "pick" ? { ...q, allowOwn: true } : q);
await L(`decks/${flow.id}`, "PUT", { questions: allowedQuestions });
await wait(200);
ok((await respond(f1, "pick", ["o1"])).ok && f1.last("state").own === undefined, "allowOwn true accepts own answer and omits own state");
await control("ideas");
await respond(f1, "ideas", "Late idea");
const late = F.last("results").results.items.find((i) => i.text === "Late idea");
F.send({ t: "moderate", id: late.id, hidden: false });
await wait(200);
await control("pick");
ok(JSON.stringify(f1.last("state").state.activeQuestion.options) === JSON.stringify(options), "late source answer leaves frozen options unchanged");
await rebuild("pick");
let result = F.last("results").results;
ok(result.total === 0 && Object.values(result.counts).every((n) => n === 0) && result.leftOut === 1, "rebuild clears votes and counts unique answers beyond limit");
// Raise the limit so the newly collected answer appears on rebuild.
await L(`decks/${flow.id}`, "PUT", { questions: allowedQuestions.map((q) => q.id === "pick" ? { ...q, limit: 4 } : q) });
await rebuild("pick");
ok(f1.last("state").state.activeQuestion.options.some((o) => o.label === "Late idea"), "rebuild includes a late visible answer");
await control("rank");
for (const value of [["o1", "o2"], ["o1", "o1", "o3"], ["o1", "o2", "unknown"], null]) {
  const ack = await respond(f1, "rank", value);
  ok(!ack.ok && ack.msg === "Put every option in order.", `rank rejects invalid ordering ${JSON.stringify(value)}`);
}
ok((await respond(f1, "rank", ["o1", "o2", "o3"])).msg === "Your ranking is in. Send again to change it.", "rank allows own answers with exact success copy");
await respond(f2, "rank", ["o2", "o3", "o1"]);
result = F.last("results").results;
ok(JSON.stringify(result.scores) === '{"o1":4,"o2":5,"o3":3}' && JSON.stringify(result.firsts) === '{"o1":1,"o2":1,"o3":0}' && result.total === 2, "sourced rank scores and first places match the known ordering");
ok(f1.last("state").own === undefined && cleanPayload(result), "rank omits authorship and own state");
await L(`decks/${flow.id}/reset`, "POST", { questionId: "ideas" });
await wait(200);
ok(f1.last("state").state.activeQuestion.options.length === 0 && (await flowResult("rank")).total === 0 &&
  (await flowResult("pick")).options.length === 0 && (await flowResult("pick")).total === 0, "resetting source clears dependent snapshots and votes");
await control("words");
await respond(f1, "words", ["zebra", "apple", "pear"]);
await respond(f2, "words", ["zebra"]);
await control("wordpick");
ok(JSON.stringify(f1.last("state").state.activeQuestion.options) === '[{"id":"o1","label":"zebra"},{"id":"o2","label":"apple"}]' &&
  (await flowResult("wordpick")).leftOut === 1, "words source orders by frequency then alphabetically and applies limit");
ok((await respond(f1, "wordpick", ["o1"])).ok && f1.last("state").own === undefined, "words source ignores allowOwn false");
await control("typed");
await respond(f1, "typed", ["b", "a"]);
ok(JSON.stringify(F.last("results").results.scores) === '{"a":1,"b":2}' && f1.last("state").state.activeQuestion.options[0].id === "a", "typed rank uses configured options without a snapshot");
await control("board");
await respond(f1, "board", { column: 0, text: "Older note" });
await respond(f2, "board", { column: 0, text: "Popular note" });
const popular = F.last("results").results.notes.find((n) => n.text === "Popular note");
f1.send({ t: "upvote", questionId: "board", noteId: popular.id });
await wait(200);
await control("boardpick");
ok(f1.last("state").state.activeQuestion.options[0].label === "Popular note", "board snapshot puts most upvoted notes first");
await respond(f1, "boardpick", ["o1"]);
await L(`decks/${flow.id}`, "PUT", { questions: allowedQuestions.map((q) => q.id === "boardpick" ? { ...q, sourceId: "ideas" } : q) });
await wait(200);
ok(f1.last("state").state.activeQuestion.options.length === 0 && (await flowResult("boardpick")).total === 0, "changing source clears snapshot and votes");
await L(`decks/${flow.id}/reset`, "POST", {});
await wait(200);
ok((await flowResult("wordpick")).options.length === 0 && (await flowResult("wordpick")).total === 0, "reset all clears snapshots and votes");
await L(`decks/${flow.id}`, "DELETE");
for (const s of [F, f1, f2]) s.ws.close();

log("merge duplicates");
const mergeDeck = (await L(`teams/${team.id}/decks`, "POST", { title: "Merge checks" })).body;
await L(`decks/${mergeDeck.id}`, "PUT", { questions: [
  { id: "board", type: "board", prompt: "Ideas", columns: ["One", "Two"] },
  { id: "boardpick", type: "pick", prompt: "Vote board", sourceId: "board", allowOwn: false },
  { id: "text", type: "text", prompt: "Ideas" },
  { id: "textpick", type: "pick", prompt: "Vote text", sourceId: "text", allowOwn: false },
] });
const G = socket(`${W}/api/decks/${mergeDeck.id}/ws`, { cookie: leader.cookie });
const gids = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
const guests = gids.map((id, i) => socket(`${W}/api/join/${mergeDeck.code}/ws?pid=${id}&name=Guest${i}`));
const [g1, g2, g3] = guests;
await Promise.all([G.opened, ...guests.map((g) => g.opened)]);
const mergeControl = async (id) => { G.send({ t: "control", activeQuestionId: id, status: "live" }); await wait(200); };
const mergeResult = async (id) => (await L(`decks/${mergeDeck.id}/results`)).body.results[id];
const merge = async (ids, into) => { G.send({ t: "merge", ids, into }); await wait(200); };
const upvote = async (who, id) => { who.send({ t: "upvote", questionId: "board", noteId: id }); await wait(200); };
await mergeControl("board");
await respond(g1, "board", { column: 0, text: "Other idea" });
await respond(g1, "board", { column: 0, text: "Kept idea" });
await respond(g2, "board", { column: 1, text: "Similar idea" });
let notes = G.last("results").results.notes;
const otherNote = notes.find((n) => n.text === "Other idea");
const keptNote = notes.find((n) => n.text === "Kept idea");
const duplicateNote = notes.find((n) => n.text === "Similar idea");
for (const g of [g1, g2]) {
  for (const n of [otherNote, keptNote, duplicateNote]) await upvote(g, n.id);
}
await upvote(g3, duplicateNote.id);
await merge([duplicateNote.id], keptNote.id);
notes = G.last("results").results.notes;
let keptNoteResult = notes.find((n) => n.id === keptNote.id);
ok(!notes.some((n) => n.id === duplicateNote.id) && !g1.last("board").results.notes.some((n) => n.id === duplicateNote.id) &&
  keptNoteResult.merged === 1 && JSON.stringify(keptNoteResult.mergedIds) === JSON.stringify([duplicateNote.id]), "board merge removes duplicate from presenter and participant results and exposes undo ids only to presenter");
ok(keptNoteResult.votes === 3, "board merge counts two people who voted on both once, plus the merged-only voter");
ok(guests.every((g) => JSON.stringify([...g.last("state").upvoted].sort()) ===
  JSON.stringify((g === g3 ? [keptNote.id] : [otherNote.id, keptNote.id]).sort())), "merged upvotes select the kept note on phones");
const privateMergePayload = (msg) => {
  const json = JSON.stringify(msg);
  return ![...gids, '"pid"', '"mergedIds"'].some((secret) => json.includes(secret));
};
ok(guests.every((g) => g.msgs.filter((m) => m.t === "board" || m.t === "state").every(privateMergePayload)), "participant board and state never contain merged ids or participant ids");
const beforeStaleUpvote = JSON.stringify(await mergeResult("board"));
await upvote(g3, duplicateNote.id);
ok(JSON.stringify(await mergeResult("board")) === beforeStaleUpvote, "upvoting a merged-away note is ignored");
await merge(keptNoteResult.mergedIds, null);
notes = G.last("results").results.notes;
ok(notes.find((n) => n.id === keptNote.id).votes === 2 && notes.find((n) => n.id === duplicateNote.id).votes === 3 &&
  notes.every((n) => n.merged === undefined && n.mergedIds === undefined), "board undo restores separate notes and their original upvotes");
await merge([duplicateNote.id], keptNote.id);
await upvote(g1, keptNote.id);
ok(G.last("results").results.notes.find((n) => n.id === keptNote.id).votes === 2 &&
  !g1.last("state").upvoted.includes(keptNote.id), "toggling kept note removes all of a person's grouped upvotes");
await upvote(g1, keptNote.id);
ok(G.last("results").results.notes.find((n) => n.id === keptNote.id).votes === 3 &&
  g1.last("state").upvoted.includes(keptNote.id), "toggling kept note adds one vote when no grouped upvote remains");
await mergeControl("boardpick");
let mergeOptions = g2.last("state").state.activeQuestion.options;
ok(mergeOptions.length === 2 && mergeOptions[0].label === "Kept idea" &&
  g2.last("state").own.includes(mergeOptions[0].id), "board pick uses combined distinct votes for ordering and includes merged authors in own");
await mergeControl("text");
await respond(g1, "text", "Text A");
await respond(g2, "text", "Text B");
await respond(g3, "text", "Text C");
await respond(g3, "text", "Hidden text");
const texts = G.last("results").results.items;
const ta = texts.find((i) => i.text === "Text A").id;
const tb = texts.find((i) => i.text === "Text B").id;
const tc = texts.find((i) => i.text === "Text C").id;
const th = texts.find((i) => i.text === "Hidden text").id;
G.send({ t: "moderate", id: th, hidden: true });
await wait(200);
for (const [ids, into, label] of [
  [[ta], keptNote.id, "across questions"], [[ta], ta, "into itself"], [[ta], th, "into a hidden entry"],
  [[ta, "missing"], tb, "with a missing source"], [["missing"], null, "undo of missing ids"],
  ["bad", tb, "with a non-array ids value"], [[ta], {}, "with an invalid target"],
]) {
  const before = JSON.stringify(await mergeResult("text"));
  await merge(ids, into);
  ok(JSON.stringify(await mergeResult("text")) === before, `merge refused ${label} without changes`);
}
const beforeParticipantMerge = JSON.stringify(await mergeResult("text"));
g1.send({ t: "merge", ids: [ta], into: tb });
await wait(200);
ok(JSON.stringify(await mergeResult("text")) === beforeParticipantMerge, "participants cannot merge entries");
await mergeControl("textpick");
const frozenMergeOptions = JSON.stringify(g2.last("state").state.activeQuestion.options);
await merge([ta], tb);
let mergedText = (await mergeResult("text")).items;
ok(!mergedText.some((i) => i.id === ta) && mergedText.find((i) => i.id === tb).merged === 1, "text merge removes duplicate and shows merged count");
await mergeControl("textpick");
ok(JSON.stringify(g2.last("state").state.activeQuestion.options) === frozenMergeOptions, "merge leaves existing sourced options frozen");
G.send({ t: "rebuild", questionId: "textpick" });
await wait(200);
mergeOptions = g1.last("state").state.activeQuestion.options;
const textGroupOption = mergeOptions.find((o) => o.label === "Text B");
ok(mergeOptions.length === 2 && !mergeOptions.some((o) => o.label === "Text A") &&
  g1.last("state").own.includes(textGroupOption.id) && !(await respond(g1, "textpick", [textGroupOption.id])).ok,
  "pick rebuilt after merge has one group option and refuses the merged author's own vote");
const beforeMergedTarget = JSON.stringify(await mergeResult("text"));
await merge([tc], ta);
ok(JSON.stringify(await mergeResult("text")) === beforeMergedTarget, "merge into an already merged entry is refused");
await merge([ta], null);
mergedText = (await mergeResult("text")).items;
ok(mergedText.some((i) => i.id === ta) && mergedText.find((i) => i.id === tb).merged === undefined, "text undo restores duplicate and clears merged count");
await merge([ta], tb);
await merge([tb], tc);
mergedText = (await mergeResult("text")).items;
const chain = mergedText.find((i) => i.id === tc);
ok(chain.merged === 2 && chain.mergedIds.length === 2 && [ta, tb].every((id) => chain.mergedIds.includes(id)) &&
  !mergedText.some((i) => i.id === ta || i.id === tb), "merge chain is flattened so A and B both belong directly to C");
await merge(chain.mergedIds, null);
mergedText = (await mergeResult("text")).items;
ok([ta, tb, tc].every((id) => mergedText.some((i) => i.id === id && i.merged === undefined)), "undo on flattened ids restores both entries");
await L(`decks/${mergeDeck.id}`, "DELETE");
for (const s of [G, ...guests]) s.ws.close();

log("cleanup");
const dup = (await L(`decks/${deck.id}/duplicate`, "POST")).body;
ok(dup.questions.length === 4 && dup.code !== deck.code, "duplicate keeps questions, new code");
ok((await L(`decks/${deck.id}`, "DELETE")).status === 200, "deck deleted");
ok((await api()(`join/${deck.code}`)).status === 404, "deleted deck's code no longer works");
for (const s of [P, p1, p2]) s.ws.close();
log(process.exitCode ? "\nSOME CHECKS FAILED" : "\nALL CHECKS PASSED");
