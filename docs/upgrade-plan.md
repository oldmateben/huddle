# Huddle upgrade plan and specs

Nov 15, 2026 · Ben

## Summary

Build the brainstorm-to-vote flow first, then facilitator controls, then reporting. The first is the feature Mentimeter users ask for most, and Huddle already has most of the parts.

This doc is a build brief for Claude Code or Codex. Phases 1 and 2 are specified to file level against the repo as it stood on 15 November 2026 (commit 82156ea). Phases 3 to 5 are outlines to firm up once the first two are in use.

Two things hold across every phase: Huddle must never invite client or case information, and it must stay inside Cloudflare's free plan.

## Handoff for Claude Code

### Before you start (Ben)

1. Export this doc as Markdown and commit it to the repo as `docs/upgrade-plan.md`.
2. Add one line to `CLAUDE.md` pointing at it, so every session finds it.
3. Tick or answer the open questions at the end. Anything left open falls back to the spec's stated defaults, and Claude Code will list the assumptions it made.
4. Paste the prompt below into a fresh Claude Code session in the repo.

### Prompt to paste

```text
You are upgrading Huddle, a live-poll tool for training sessions. Read these in order before touching any code:
1. CLAUDE.md (hard rules and conventions; they override anything in the plan)
2. docs/upgrade-plan.md (the plan and specs)
3. shared/types.ts, shared/validate.ts, worker/live.ts, worker/aggregate.ts

Then run the existing end-to-end checks and confirm they pass before changing anything. Report the baseline.

Scope for this session: Phase 1 only (1a, then 1b), exactly as specified in the plan. Do not start Phase 2 or later.

Working rules:
- Work in the order under Build order below, one pull request per step. Stop after each step with a short summary and wait for me to say go.
- Follow the plan's names, messages and defaults. If the code contradicts the plan (line numbers and file shapes may have drifted since the plan was written), tell me what you found and propose a fix. Do not silently diverge.
- Add the plan's tests with the step they belong to. Existing checks must stay green.
- Every new live message must go through the existing request counter so the usage tracker stays accurate.
- No new dependencies without asking me first.
- No features that invite uploads, documents, client information or case details.
- If the plan leaves something unspecified, choose the simplest option, and list it under Assumptions in the pull request description.
```

### Build order

| Step | What | Done when |
| --- | --- | --- |
| 0 | Read the files above, run the end-to-end checks, report the baseline | Baseline reported, nothing changed |
| 1 | Phase 1a data model and validation: new types, `pick` and `rank` cases, `cleanQuestions` | Saving a deck with a bad `sourceId` is refused; validation tests pass |
| 2 | Phase 1a live session: options snapshot, `respond()`, `aggregate()`, `rebuild`, reset handling, `allowOwn` | Votes and rankings work through the session; related tests pass |
| 3 | Phase 1a screens: editor, join screen, results, deck page, report and CSV | A full brainstorm, curate, vote, rank run works in a browser |
| 4 | Phase 1b merge duplicates | Merge and undo work, upvotes combine without double counting |
| 5 | Stop. Ben runs two or three real sessions | Ben decides the order inside Phase 2 |

### Later sessions

- **Phase 2:** build the headcount log and icon first, because a session that wasn't logged can't be reconstructed. Then per-question anonymity, hold and reveal, and the timer.
- **Phases 3 to 5:** outlines only. Ask Ben for a short design pass before writing any code.

### Definition of done for each step

- The plan's tests for that step exist and pass, and the existing checks are still green.
- The pull request description lists what changed by file, any place the code contradicted the plan, and the assumptions made.
- Wording on screen follows the plan's copy, in plain sentence case.
- If terms or privacy wording changed, `TERMS_VERSION` was bumped and the legal page reviewed, as noted under Cost and terms.

## Where Huddle is today

Huddle has five question types, moderation, deck-level anonymity, four looks, CSV and PDF export, and a usage tracker. It has no ranking, no way to vote on earlier answers, and no hide-and-reveal.

| Area | In the repo now | Gap the plan fills |
| --- | --- | --- |
| Question types | Multiple choice, rating scale, word cloud, open text, retro board | Vote on earlier answers, ranking (Phase 1); quiz (Phase 4) |
| Collecting ideas | Open text and board notes, up to 10 entries a person per question; upvotes on board notes only | Merging duplicates (Phase 1) |
| Moderation | Per question on text and board: hold until approved, hide and unhide | Reused as the curation step in Phase 1 |
| Anonymity | One switch for the whole deck | Per-question override (Phase 2) |
| Presenter controls | Start, move between questions, clear responses, end; count of connected people | Hide and reveal, timer, headcount icon (Phase 2) |
| Results | Pushed live to the presenter screen; participants only see the board | Cross-session and before/after views (Phase 3) |
| Export | CSV download, PDF through print | New types added to both (Phase 1) |
| Looks | Ink, Sticky note, Forest, Night | Team defaults, custom colours, templates (Phase 4) |
| Tests | 34 end-to-end checks in `scripts/e2e.mjs`, no unit tests | New checks with each phase |

The existing backlog in `CLAUDE.md` already lists ranking, quiz mode, templates and the names list. This plan keeps those and reorders them: ranking moves ahead of quiz because it completes the Phase 1 flow.

## Phased plan

Six phases, each shippable on its own. Sizes are relative guesses for an AI-assisted build, not estimates.

| Phase | What ships | Why here | Size | Done when |
| --- | --- | --- | --- | --- |
| 1a. Vote on earlier answers | New question type that turns approved answers from an earlier question into voting options; ranking type | The reason to pick Huddle over Menti | Medium | A presenter can run brainstorm, curate, vote and show a ranked result without leaving the session |
| 1b. Merge duplicates | Presenter groups near-identical answers before the vote | Makes 1a usable with 20 or more people | Small | Merged answers appear once and carry combined upvotes |
| 2. Facilitator controls | Per-question anonymity, hide and reveal, timer, live headcount | Makes it trustworthy live | Medium | A presenter can collect answers unseen, reveal them, and see who has joined |
| 3. Insight | Compare the same question across sessions; before and after within a session | Gives evidence that training landed | Medium to large | A report shows the shift between two runs of a question |
| 4. Look and reuse | Team templates, team default look, custom colours, quiz mode | Polish and repeat use | Medium | A team leader can publish a template others start from |
| 5. M365 fit | Results-only display link, Teams tab, tenant sign-in | Reach inside work | Small to medium | Only start once there are regular presenters beyond Ben |
| 6. Friends and sign-in | Invite email, email one-time-code sign-in, per-team usage view | A few friends want to run their own sessions, some without Google | Small to medium | A friend with no Google account can be invited, sign in with a code, and run their own team's sessions |

Build 1a and 1b in that order, then stop and run two or three real sessions before starting Phase 2. What facilitators trip over in those sessions should set the order inside Phase 2.

## Phase 1 spec: brainstorm, curate, vote, rank

Phase 1 adds two question types, `pick` and `rank`, whose options can come from the answers to an earlier question. It then adds a merge step so duplicates are tidied before the vote.

### How a session runs

1. The presenter asks an open text, word cloud or retro board question. People send ideas.
2. The presenter curates on the same screen: hides off-topic answers (exists today) and merges duplicates (1b).
3. The presenter moves to a "Vote on earlier answers" question. Huddle freezes the visible answers into a list of options at that moment.
4. People spend their votes on their phones. Bars update live on the presenter screen.
5. Optionally, a ranking question takes the same source and people put the top few in order.

### Decisions built into this spec

- **Options are frozen when the question first goes on screen.** Late answers to the earlier question don't change a vote in progress. A "Refresh options" button rebuilds the list and clears the votes so far.
- **Options never show who wrote them**, whatever the anonymity setting.
- **Exact duplicates collapse automatically** (same text ignoring case and spacing). Near-duplicates need the merge step.
- **Ranking uses a simple points count.** With n options, first place earns n points, second n minus 1, and so on. Highest total wins; first-choice counts are shown beside it.
- **Ranking is capped at 8 options** so it stays usable on a phone. Voting allows up to 20.

### Voting for your own answer (decided)

A presenter setting on each vote question, default on. It's a soft guard: fine for facilitation, not a security control.

- **Setting.** `allowOwn?: boolean` on `pick` questions, shown in the editor as "Allow voting for your own answer". Default `true`.
- **Where it doesn't apply.** `rank` always allows your own answers, and the setting is hidden when the source is a word cloud, because the most popular words are written by many people.
- **Server.** The options snapshot stores each option's author ids, on the server only. A `pick` vote that includes an option the sender wrote is refused with "You can't vote for your own answer on this question."
- **Phone.** Each person's state lists the option ids they wrote (`own: string[]`). Their screen greys those out and labels them "Yours". Nobody learns who wrote anything else.
- **Known gap, accepted.** Someone who rejoins under a new name gets a new identity and can vote for their own. The exported report shows votes as recorded and no authorship.

Tests:

- [ ] Test: with `allowOwn` false, voting for an option you wrote is refused; with it true, accepted
- [ ] Test: `allowOwn` is ignored for word-cloud sources and for `rank`
- [ ] Test: participant state lists own option ids but no author names

### 1a. Data model (shared/types.ts)

```ts
export type QuestionType = "choice" | "rating" | "words" | "text" | "board" | "pick" | "rank";

// TYPE_LABELS additions
pick: "Vote on earlier answers",
rank: "Ranking",

export interface Option { id: string; label: string }

export interface Question {
  // existing fields unchanged
  sourceId?: string; // pick, rank: an earlier text, words or board question
  votesEach?: 1 | 2 | 3 | 5; // pick: options each person may choose (default 3)
  limit?: number; // most options to take from the source: pick 2-20 (default 12), rank 2-8 (default 5)
}

// Results additions
| { type: "pick"; options: Option[]; counts: Record<string, number>; total: number; leftOut: number }
| { type: "rank"; options: Option[]; scores: Record<string, number>; firsts: Record<string, number>; total: number; leftOut: number }

// ClientMsg addition (presenter only)
| { t: "rebuild"; questionId: string }
```

`total` is the number of people who voted. `leftOut` is how many source answers didn't fit under `limit`. A `rank` question has either typed options (2 to 8) or a `sourceId`, never both.

### 1a. Validation (shared/validate.ts, worker/api.ts)

- `cleanQuestion` gains `pick` and `rank` cases: clamp `votesEach` and `limit` to the allowed values, and require `sourceId` to pass `isId` when present.
- Add `cleanQuestions(raw: unknown[]): Question[] | string`. It runs `cleanQuestion` on each, then checks every `sourceId` points at an **earlier** question in the list whose type is `text`, `words` or `board`. It returns an error string otherwise.
- `worker/api.ts` line 229 calls `cleanQuestions` in place of mapping `cleanQuestion`, and returns the string as the 400 message.
- Error copy: "'Vote on earlier answers' needs an earlier open text, word cloud or retro board question to take answers from."

### 1a. Live session (worker/live.ts, worker/aggregate.ts)

**Snapshot.** Store frozen options in the existing `kv` table under `opts:<questionId>` as `{ sourceId, options: (Option & { from: string[] })[], leftOut }`. `from` holds the source response ids, for the report only, and is never sent to participants. No schema change.

- Build it in `control()` when a sourced question becomes active while the session is live and no snapshot exists.
- Take visible answers only (not hidden, not merged away). Order: text oldest first; board most upvotes first, then oldest; words highest count first, then alphabetical.
- Collapse exact duplicates, cut to `limit`, give ids `o1` to `oN`.
- If fewer than 2 answers qualify, store nothing. Participants see "Waiting for the presenter". The presenter sees "No answers to vote on yet. Go back to the earlier question and collect or approve some."

**State.** `state()` returns a copy of a sourced question with `options` filled from the snapshot, so the join screen renders it like a choice question.

**Responding.** New cases in `respond()`, both stored as `${q.id}:v:${pid}` with kind `v`, so a resend replaces the earlier vote:

| Type | Valid value | Reply on success |
| --- | --- | --- |
| `pick` | Array of 1 to `votesEach` distinct option ids from the snapshot | "Your votes are in. You can change them while this question is open." |
| `rank` | Array of every option id exactly once, in order | "Your ranking is in. Send again to change it." |

**Aggregating.** `aggregate()` takes the resolved options as a new `opts.options` argument. `pick` counts each chosen id. `rank` adds n minus position points per id and counts first places.

**Keeping snapshots honest.**

- `rebuild` message: delete the snapshot and that question's votes, build again, broadcast state and results.
- `reset(questionId)`: also delete that question's snapshot. If the question is a source, delete the snapshots and votes of every question that depends on it.
- `reset()` with no id: delete every `opts:*` key.
- `configure()`: delete a snapshot, and its votes, when its question is gone or its `sourceId` has changed.

### 1a. Screens

| File | Change |
| --- | --- |
| `src/components/QuestionEditor.tsx` | `blankQuestion` defaults for both types. "Take answers from" dropdown listing eligible earlier questions, "Votes per person", "Show at most". The add button for "Vote on earlier answers" is disabled with a hint until an eligible question exists. Ranking gets a switch between "Type the options" and "Use answers from an earlier question". |
| `src/pages/Join.tsx` | `PickInput`: tappable options with a "2 of 3 votes used" counter, sent on each change. `RankInput`: a list with up and down buttons (no drag library) and a "Send ranking" button. Neither shows the "Keep it general" note, since nothing is typed. |
| `src/components/Results.tsx` | `pick`: horizontal bars, highest first. `rank`: bars by points with "first choice for 4" beside each. Both show "12 of 19 answers shown" when `leftOut` is above zero. |
| `src/pages/DeckPage.tsx` | "Refresh options" button on an active sourced question, with a confirm when votes exist: "This clears the votes so far." |
| `src/pages/Report.tsx` | Both types in the on-screen report and the CSV (one row per option: label, votes or points, first choices). |

### 1b. Merge duplicates

- **Storage.** Add `merged_into TEXT` to the `responses` table in the `LiveSession` constructor. SQLite has no `ADD COLUMN IF NOT EXISTS`, so check `PRAGMA table_info(responses)` first.
- **Message.** `{ t: "merge"; ids: string[]; into: string | null }`, presenter only. Every id and `into` must be text or board entries on the same question. `into` can't itself be merged. `null` undoes the merge.
- **Results.** Merged-away rows drop out of `items` and `notes`. The kept entry gains `merged?: number`. Board upvotes count distinct people across the kept note and everything merged into it, so nobody counts twice.
- **Screen.** Each entry on the presenter view gets "Merge into…" listing the other visible entries on that question. A kept entry shows "+2 merged" with "Undo".
- **Scope.** Text and board only. Word clouds already combine identical words.

### Tests to add (scripts/e2e.mjs)

- [ ] Saving a deck where `pick` points at a later or ineligible question is refused with the error copy above
- [ ] Activating a `pick` question freezes options from visible answers only; a hidden answer is absent
- [ ] Exact duplicates collapse to one option
- [ ] A participant can't send more than `votesEach` choices or an unknown option id
- [ ] Resending replaces the earlier votes and counts update on the presenter socket
- [ ] A late answer to the source doesn't change options until `rebuild`; `rebuild` clears votes
- [ ] `rank` rejects a partial or repeated ordering and scores a known example correctly
- [ ] Clearing the source question clears the dependent snapshot and votes
- [ ] Options carry no author, in or out of anonymous mode
- [ ] Merge: the merged note disappears, upvotes combine without double counting, undo restores it

### Cost and terms

- **Requests.** Every new message goes through `webSocketMessage`, which already calls `bump()`. Building a snapshot costs nothing extra. Expect 1 to 5 requests a person for a vote and 1 for a ranking, so a 30-person session adds about 100 to 200 requests.
- **Terms.** No new kind of data is collected. One thing does change: open text answers, which today only appear on the presenter screen, will show on other participants' phones as options. Check `src/pages/Legal.tsx`, and bump `TERMS_VERSION` if its wording about who sees answers needs to change.

## Phase 2 spec: facilitator controls

Phase 2 adds four controls: hide names on one question, hold results until revealed, a countdown timer, and a live headcount. All four are small additions to the live session; none needs a database migration.

| Control | Question setting | Live state (DO kv) | New message | Behaviour |
| --- | --- | --- | --- | --- |
| Hide names on this question | `anonymous?: true` on text and board | None | None | `resultsFor()` passes `q.anonymous \|\| cfg.anonymous` to `aggregate()`. The join screen says "Your name won't be shown with this answer." |
| Hold results | `holdResults?: boolean` on any type | `shown:<questionId>` | `{ t: "reveal"; questionId; shown: boolean }` | The presenter screen shows "14 responses in" and a "Reveal results" button in place of the chart. Board notes aren't pushed to participants until revealed. |
| Timer | `seconds?: 30 \| 60 \| 90 \| 120 \| 180 \| 300` | `ends:<questionId>` (ISO time) | `{ t: "timer"; questionId; action: "start" \| "stop" }` | `PublicState` gains `endsAt` and `serverNow`; screens count down locally. After `endsAt`, `respond()` refuses with "Time's up for this question." |
| Headcount | None | None. Uses the existing count of connected people. | None. The existing `presence` message already sends the count. | A person icon with a live count in the bottom corner of the presenter screen. The count drops when someone leaves and rises when they rejoin. It replaces the "connected" text and shows no names. |

### Rules worth keeping

- **A question can only add anonymity, never remove it.** An anonymous session tells people at the name step that names won't be shown, so no question may switch names back on.
- **Anonymity is about display.** Names stay stored against the participant for the session, as they are today. The join screen and terms should keep saying "shown", not "collected".
- **The timer sends no per-second messages.** One state broadcast on start and one on stop. Expiry is checked inside `respond()`, so the existing usage-flush alarm is left alone.
- **Hold results is enforced on the server for the board**, because that's the one type participants see. For other types the server flag keeps two presenter screens in step, and the cover itself is in the presenter view.

### Headcount log (decided)

Phase 2 also records headcount per question, so the Phase 3 report can show who dropped off and who joined. It must be logged from the first session, because a session that wasn't logged can't be reconstructed.

- **What's stored.** In the session's own storage, one row per question: connected at start, joined during, left during, answered. Counts only. No names or participant ids are kept in the log.
- **How it's worked out.** When a question goes on screen, and again when the next one replaces it, the session compares the current connected ids with the previous set, then discards the ids and keeps the counts.
- **Brief disconnects don't count as leaving.** A reconnect within about 60 seconds is ignored, because locked phones drop and rejoin.
- **Wording.** The label says "connected", never "attended". A rejoin under a new name counts as a new join, which is the accepted gap.
- **Cost.** No extra requests. It reads sockets the session already holds.

Tests:

- [ ] Test: a participant who disconnects for 10 seconds and returns is not counted as leaving
- [ ] Test: a participant who leaves for good between questions shows once under "left"
- [ ] Test: the log holds counts only, with no names or ids

### Files

`shared/types.ts`, `shared/validate.ts` (three new optional fields, clamped), `worker/live.ts` (reveal, timer, expiry check), `src/components/QuestionEditor.tsx` (three settings), `src/pages/DeckPage.tsx` (reveal, timer, headcount icon), `src/pages/Join.tsx` (countdown, per-question name note). Changing your name mid-session stays on the backlog.

### Tests to add

- [ ] A question with `anonymous: true` returns no authors in a named session
- [ ] A held board question sends no notes to participants until reveal
- [ ] A response after `endsAt` is refused; stop reopens the question
- [ ] The presence count drops when a participant disconnects and rises when they rejoin, and no names are sent

### Optional stretch

A phone-sized presenter remote at `/app/decks/:id/remote`. The session already broadcasts to every presenter socket, so this is a compact screen with next, back, reveal and timer, and no server work.

## Phases 3 to 5 in outline

These are directions, not specs. Each needs a short design pass once Phases 1 and 2 have been used in real sessions.

### Phase 3: insight

- **Before and after in one session.** Link two rating or choice questions with a shared `pairId`. The report shows the shift, for example "Confidence 2.8 to 4.1". This is the cheapest evidence that a session worked, and no rival makes it easy.
- **Same deck, different runs.** Record which deck a duplicate came from (a `copied_from` column on decks, in a new numbered migration). A compare view asks each run's live session for its results and lines questions up by id. Start with choice and rating only, where numbers compare cleanly.
- **Read-only results link.** A signed link to the report for people without a Huddle sign-in, with an expiry.
- **Cost.** A comparison costs one request per run compared. Results stay in each session's own storage until the deck is deleted, as now.
- **Headcount in the report (decided).** The report shows a small table per question: here at start, joined during, left during, answered. Still anonymous. A one-line note appears under any question where headcount moved by 20% or more, and at least 3 people, from the previous question, for example "Headcount fell by 6 after Q4". It's a prompt for the facilitator's reflection, not a statistical test, which would mislead with 10 to 20 people. It reads the log built in Phase 2, so sessions run before that phase have no headcount view.
- **Export.** The CSV gets the same four columns per question.

### Phase 4: look and reuse

- **Templates.** Mark a deck as a team template; "New from template" reuses the existing duplicate path. Ship three starters: check-in, retro, training evaluation.
- **Team defaults.** Default look per team, then one accent colour per team as a CSS variable override, with a contrast check.
- **Text slide.** A heading and a few lines between questions, typed in the editor. No file or image upload, in line with the hard rule in `CLAUDE.md` against features that invite documents.
- **Quiz mode.** A correct answer on choice questions, revealed with the Phase 2 reveal control, and an opt-in leaderboard. The leaderboard is off in anonymous sessions.

### Phase 5: M365 fit

- **Display link.** A results-only page for the room screen or a Teams share, so the presenter's editing view never needs to be projected.
- **Teams tab.** A static tab pointing at the join or display page. It needs an app package and, at work, IT approval.
- **Tenant sign-in.** The tenant allow-list already exists (`MICROSOFT_ALLOWED_TENANTS`). What's left is consent from the work tenant, which is an IT conversation more than a build.

### Phase 6: friends and sign-in

Context: a few friends have asked to use Huddle for their own sessions. Scale is a handful of teams, not a public service. Referral only; no open sign-up. Start once a friend actually wants in, and do a short design pass first.

- **What works today.** The admin creates a team, adds the friend's email as team leader, and they sign in with Google or Microsoft. They see only their own team. Nothing in this phase is needed to onboard a friend who has a Google account.
- **6a. Invite email.** When the admin or a leader adds someone, send them an email saying what Huddle is and where to sign in. Cap invites per team, let leaders revoke an unused invite, and say in the email that sessions must never hold client information.
- **6b. Email one-time-code sign-in.** For people without a Google or Microsoft account. They enter their email, get a short code, and type it in. Reasons for a code rather than a link: work email scanners open links and use them up. Codes are single-use, expire in about 10 minutes, are stored hashed in D1, and are rate-limited per email and per IP. The reply never says whether an email has an account. A person who signs in by Google and by email lands on one account, because accounts already match on email.
- **Sending email.** Needs an email service and a domain Ben owns, with SPF, DKIM and DMARC set up, so messages reach inboxes. Huddle only has `workers.dev` today. Check the email service's free-plan limits and cost before committing.
- **Per-team usage.** All sessions share one 100,000 requests a day limit, and hitting it stops everyone's sessions. Show usage by team on the admin page, and decide at what point to move to the paid Workers plan (about USD 5 a month).
- **Friends' responsibilities.** A friend is a presenter under the same terms, responsible for their own sessions' content. Say so in the invite email, and review `src/pages/Legal.tsx` because Ben is now the operator for other people's participants. Bump `TERMS_VERSION` if the wording changes.
- **Housekeeping.** Remove a person from a team, delete a team and its sessions (exists for the admin), and let someone ask for their account to be deleted.
- **Keep open sign-up easy to add later.** Today `signIn()` in `worker/auth.ts` refuses any email that isn't an existing user (or the admin) with "not-invited". When 6b is built, make "may this email sign in?" one function that every sign-in path (Google, Microsoft, email code) calls, so the rule lives in one place. Do not build a sign-up screen, a settings switch or hidden sign-up code in this phase: unused sign-up code is still attack surface, and the hard parts (abuse protection, per-team limits, terms and privacy review) cost the same later.
- **Out of scope.** Open sign-up, request-access queues and bot protection (Turnstile). Revisit only if sign-ups stop being friends. If it does go wider, the order is: a system-settings table with a "sign-up open" flag, then Turnstile and rate limits on sign-up, then per-team usage limits, then the terms and privacy review (with proper advice), then the sign-up screen.
- **Tests.** An expired or reused code is refused; too many codes for one email are refused; the same email via Google and via code is one user; an uninvited email gets no code and no hint either way; the sign-in rule is called from every sign-in path, so a new path can't skip it.

I've left out PowerPoint import. Slido and Vevox both draw complaints about theirs, and uploading decks would cut across the no-documents rule.

## Guardrails and risks

The build must follow the hard rules already in `CLAUDE.md`. The table lists where these upgrades press on them.

| Risk | Where it bites | What to do |
| --- | --- | --- |
| Free text invites client or personal details | Phase 1 makes open answers more visible, by showing them as options on every phone | Keep the "Keep it general" note on every typed input. Default "hold until approved" to on for any question used as a source. |
| Something inappropriate is frozen into a vote | Snapshot taken before the presenter has curated | Hidden answers never enter a snapshot. "Refresh options" rebuilds after a late hide. |
| Free plan limit (100,000 requests a day) | New message types | Every message already passes through `bump()`. Phase 1 adds about 100 to 200 requests per 30-person session, against 1,500 to 3,000 today. |
| Anonymity promise broken | Per-question settings in Phase 2; leaderboard in Phase 4 | Questions can only add anonymity. Leaderboard off in anonymous sessions. |
| Terms drift | Text answers shown to other participants (Phase 1); names list (Phase 2); read-only link (Phase 3) | Review `src/pages/Legal.tsx` with each phase and bump `TERMS_VERSION` when the wording changes. |
| Regression in live voting | Changes to `respond()` and `state()` | Run `npm run test:e2e` after every change to `worker/` or `shared/`. Existing 34 checks must stay green. |
| Free plan shared across teams | Phase 6 adds other people's sessions to the same 100,000 requests a day | Per-team usage on the admin page. Move to the paid plan before it becomes a problem. |
| Sign-in becomes the weak point | Phase 6 email codes | Single-use, short expiry, hashed, rate-limited, no hint whether an account exists. Security review before launch. |
| Old sessions with new code | Additive column in 1b | Guard the `ALTER`; treat a missing `merged_into` as not merged. |

## Open questions

These change the build, so decide them before handing Phase 1 over. The spec assumes the first answer in each case.

- [x] **Votes per person:** decided: fixed, default 3, with 1, 2, 3 or 5 on offer. Does not scale with the number of options.
- [x] **Can people vote for their own idea?** Decided: a presenter setting on each vote question, default on, as a soft guard. Never applies to ranking or to word-cloud sources. See the Phase 1 section.
- [x] **Ranking length:** decided: full order of up to 8, not "top 3" from a longer list.
- [x] **Text upvotes:** decided: board only. Voting on earlier answers covers open text.
- [x] **Source questions moderated by default:** decided: on. A question used as a source starts with "hold until approved" on; the presenter can switch it off.
- [x] **Word cloud as a source:** decided: keep it. Word clouds count as a source.
- [x] **Who builds it:** decided: Codex implements, Claude manages and reviews each step. Either way, add this doc's Phase 1 section to the repo as `docs/phase-1.md` and point `CLAUDE.md` at it.
