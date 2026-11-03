# Huddle

Live polls, word clouds, open questions and retro boards to run alongside training sessions and presentations. Presenters sign in and build a session; participants join on their phone with a 6-digit code or QR, pick a name (or a random one), and everything updates live on screen. Results are saved so teams can come back to them, and export to PDF or CSV.

A personal project by Ben Hafner, hosted on Cloudflare's free plan.

## How it works

| Who | What they do |
| --- | --- |
| **Admin** (`ADMIN_EMAIL`) | Creates teams, appoints team leaders, removes people, watches usage |
| **Team leader** | Adds and removes members of their team, plus everything a member can do |
| **Member** | Creates, edits, runs, duplicates and deletes the team's sessions; sees results |
| **Participant** | No account. Joins with the code, picks a name, answers |

Question types: multiple choice, rating scale (1–5 or 1–10), word cloud, open text, retro board with upvotes. Per session you can pick a look (Ink, Sticky note, Forest, Night), turn on anonymous mode, and require approval before text or notes appear on screen.

## Architecture

```
src/        React app (Vite) — join screen, presenter app, terms
worker/     Cloudflare Worker — API, sign-in, and the LiveSession Durable Object
shared/     Types and validation used by both
migrations/ D1 schema
```

- **One Worker** serves the built React app as static assets and runs `/api/*` and `/auth/*`.
- **D1** (SQLite) holds presenter accounts, teams, memberships, decks (sessions) and daily usage.
- **One Durable Object per session**, named by its code, holds live state, every response and the open WebSockets. Votes go over the socket, and results are pushed to the presenter instantly.
- **Sign-in** is OpenID Connect with Google and/or Microsoft, invite-only. An email must be added to a team before it can sign in. The admin email can always sign in.
- **Usage tracker:** each session counts its own requests (joins, votes, updates) and flushes daily totals to D1. The results page shows a session's usage; the admin page shows daily totals against the free allowance.

## Run locally

Needs Node 20+.

```bash
npm install
cp .dev.vars.example .dev.vars        # enables the local-only dev sign-in
npm run db:migrate:local
npm run build
npx wrangler dev                      # http://localhost:8787
```

Sign in at http://localhost:8787/signin with the dev form (any email; `ben.hafner@gmail.com` is the admin). Join from another tab or a phone on the same network. While changing the UI, `npm run dev` rebuilds the app on save.

With `wrangler dev` running, `npm run test:e2e` runs 34 end-to-end checks covering sign-in, roles, terms, live voting, moderation, anonymity, usage and deletion.

## Deploy

1. **Cloudflare account.** Sign up free with `ben.hafner@gmail.com`, then `npx wrangler login`.
2. **Database.** `npx wrangler d1 create huddle`, paste the `database_id` into `wrangler.toml`, then `npm run db:migrate`.
3. **Deploy.** `npm run deploy`. Note the URL, e.g. `https://huddle.<your-subdomain>.workers.dev`.
4. **Google sign-in.** In Google Cloud Console, open *APIs & Services*:
   - Configure the OAuth consent screen as *External*, with only the default scopes (openid, email, profile), then publish it. Basic scopes don't need Google verification.
   - Create an *OAuth client ID* of type *Web application*, with redirect URIs `https://<your-url>/auth/callback/google` and `http://localhost:8787/auth/callback/google`.
   - Run `npx wrangler secret put GOOGLE_CLIENT_ID` and then `npx wrangler secret put GOOGLE_CLIENT_SECRET`.
5. **Sign in** at `/signin` with `ben.hafner@gmail.com`, accept the terms, go to *Admin*, and create a team with your work email as team leader.
6. **Optional: auto-deploy from GitHub.** In the Cloudflare dashboard, open the Worker, then *Settings*, then *Builds*, and connect the repo. Set the build command to `npm run build`.

### Microsoft sign-in (optional)

Microsoft sign-in is useful if colleagues would rather sign in with a work Microsoft account. Create an app registration that supports *accounts in any organizational directory and personal Microsoft accounts*. Give it a Web redirect URI of `https://<your-url>/auth/callback/microsoft`, and create a client secret. Then set the `MICROSOFT_CLIENT_ID` and `MICROSOFT_CLIENT_SECRET` secrets.

Microsoft's email claim isn't verified for arbitrary organisations, so only tenants listed in `MICROSOFT_ALLOWED_TENANTS` are trusted. Add your work tenant ID there; personal Microsoft accounts are included by default.

Many organisations block users from consenting to third-party apps. If that happens, people can create a free Google account using their existing work email address ("Use your existing email" on Google's sign-up page) and sign in with Google instead.

## Free plan headroom

A 30-person session with 20 questions uses roughly 1,500–3,000 requests. The free plan allows 100,000 a day, resetting at midnight UTC (10am in Queensland). If a limit is hit, further requests fail until the reset, so watch the admin usage chart. The $5/month Workers Paid plan removes the concern.

## Terms and privacy

`/terms` and `/privacy` are plain-language drafts written for a small personal, non-commercial project. Presenters must accept them on first sign-in. Participants agree by joining, and the join screen links to them.

When you change the terms, bump `TERMS_VERSION` in `shared/types.ts`, and every presenter will be asked to accept again. These drafts aren't legal advice. If usage grows well beyond friends, family and colleagues, get them reviewed.
