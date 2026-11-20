# Huddle — handoff brief for Claude Code

Read README.md first for setup. This file is the working context for continuing the build.

The upgrade plan and phase specs are in docs/upgrade-plan.md. Read it before starting upgrade work; the rules in this file override it.

## What this is
A self-hosted Mentimeter alternative for Ben Hafner (personal project, ben.hafner@gmail.com = admin). Used alongside training sessions, roughly 1–2 sessions a week with 10–20 questions each; also for personal use (e.g. family). Presenters are invite-only and organised into teams (admin → team leaders → members). Participants never sign in: code or QR, then a typed or random name.

## Hard rules
- The app must never be designed to hold client, patient or case information. Keep the "keep it general" notes on free-text inputs. Don't add features that invite sensitive data (free-text fields about people, features that store documents). Never store uploaded documents. A file may be read in the browser to pull out question text; only the text the presenter approves is sent to the server and kept, and the file itself is never uploaded or stored.
- Never commit secrets. Secrets go in `wrangler secret put` (prod) or `.dev.vars` (local, gitignored).
- If you change what data is collected or how it's used, update `src/pages/Legal.tsx` and bump `TERMS_VERSION` in `shared/types.ts`.
- Validate everything server-side (shared/validate.ts). The client is untrusted, including participants' WebSocket messages.
- UI copy: plain, sentence case, says what happens ("Start session", not "Submit"). Errors say what went wrong and how to fix it.

## Architecture in one breath
Single Cloudflare Worker (`worker/index.ts`) serves the Vite-built React app from `dist/` and handles `/api/*` (worker/api.ts) and `/auth/*` (worker/auth.ts, OIDC Google/Microsoft, invite-only, session cookie stored hashed in D1). D1 holds users, teams, memberships, decks, usage_daily. Each deck has a `LiveSession` Durable Object (worker/live.ts) named by its 6-digit code: SQLite tables for kv config/status, participants, responses, upvotes, usage. WebSocket hibernation API, tags "presenter" / "participant". Deck edits are saved to D1 and pushed to the DO via `configure()` RPC. The DO is the source of truth for live status, responses and usage; it writes status back to D1 and flushes usage to D1 on an alarm.

Shared types and validation live in `shared/`, imported by both the worker and the app.

## Commands
- `npm run check`: type-check app and worker
- `npm run build`: type-check and build the app into dist/
- `npx wrangler dev`: local runtime on :8787 (needs `.dev.vars` with DEV_LOGIN=true and `npm run db:migrate:local` once)
- `npm run test:e2e`: 34 end-to-end checks against the running dev server. Run it after any change to worker/ or shared/.
- `npm run deploy`: build and deploy

## Conventions
- Schema changes: add a new numbered file in migrations/, never edit 0001. DO schema changes: use `CREATE TABLE IF NOT EXISTS` / additive `ALTER` in the LiveSession constructor.
- New Durable Object classes need a new `[[migrations]]` tag in wrangler.toml with `new_sqlite_classes` (free plan requires SQLite-backed).
- Themes are CSS variable sets in `src/styles.css` under `[data-theme="…"]`, listed in `THEMES` in shared/types.ts.
- Keep requests low: participants talk over the WebSocket (cheap), presenters get pushed results (outgoing messages are free). Avoid polling.

## Free plan limits to respect
Workers and Durable Objects: 100k requests a day each, resetting at 00:00 UTC. Exceeding them makes operations fail rather than bill. D1 has generous daily read and write limits. The usage tracker exists so Ben can see headroom; keep it accurate if you add new message types (call `this.bump()`).

## Backlog (rough priority, confirm with Ben before big ones)
1. Polish: presenter view of who has joined (names list), participant ability to change name mid-session.
2. Quiz mode: choice questions with a correct answer, reveal button, simple leaderboard (opt-in, names).
3. Ranking question type.
4. Team defaults: default theme and logo per team.
5. Templates: mark a deck as a team template; "new from template".
6. Abuse protection for public join (Cloudflare Turnstile on name step, or a rate limit per IP) if it's ever needed.
7. More looks, possibly custom colours per team.
8. Microsoft sign-in hardening: optional `xms_edov` claim check as an alternative to the tenant allow-list.

## Known gaps
- No automated unit tests; e2e script only.
- Terms and privacy text are a plain-language draft, not legal advice.
- QR codes encode `location.origin`, so present from the deployed URL, not localhost, when real people are joining.
