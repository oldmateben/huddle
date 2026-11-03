// Presenter sign-in: OpenID Connect with Google and/or Microsoft, invite-only.
// Participants never sign in.
import { isEmail } from "../shared/validate";
import type { Env } from "./env";

const SESSION_COOKIE = "huddle_session";
const STATE_COOKIE = "huddle_oauth";
const SESSION_DAYS = 30;
const MS_CONSUMER_TENANT = "9188040d-6c67-4c5b-b112-36a304b66dad"; // personal Microsoft accounts

export interface User {
  id: string;
  email: string;
  name: string | null;
  is_admin: number;
  terms_version: string | null;
}

interface Provider {
  authorize: string;
  token: string;
  clientId?: string;
  clientSecret?: string;
  /** Returns a verified email + name from the ID token, or null if we shouldn't trust it. */
  identity: (claims: any, env: Env) => { email: string; name: string | null } | null;
}

const providers = (env: Env): Record<string, Provider> => ({
  google: {
    authorize: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    identity: (c) => (c.email_verified === true && isEmail(c.email) ? { email: c.email, name: c.name ?? null } : null),
  },
  microsoft: {
    authorize: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    token: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    clientId: env.MICROSOFT_CLIENT_ID,
    clientSecret: env.MICROSOFT_CLIENT_SECRET,
    // Microsoft's email claim isn't verified for arbitrary tenants, so we only accept
    // personal accounts and tenants you list in MICROSOFT_ALLOWED_TENANTS.
    identity: (c, env) => {
      const allowed = (env.MICROSOFT_ALLOWED_TENANTS ?? MS_CONSUMER_TENANT).split(",").map((s) => s.trim().toLowerCase());
      const email = c.email ?? c.preferred_username;
      return allowed.includes(String(c.tid).toLowerCase()) && isEmail(email) ? { email, name: c.name ?? null } : null;
    },
  },
});

export const enabledProviders = (env: Env) =>
  Object.entries(providers(env))
    .filter(([, p]) => p.clientId && p.clientSecret)
    .map(([name]) => name);

// ---------- helpers ----------

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const random = (n = 32) => b64url(crypto.getRandomValues(new Uint8Array(n)));
async function sha256(s: string) {
  return b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))));
}
function cookie(req: Request, name: string) {
  return req.headers.get("Cookie")?.match(new RegExp(`(?:^|; )${name}=([^;]*)`))?.[1] ?? null;
}
const setCookie = (name: string, value: string, maxAge: number, path = "/") =>
  `${name}=${value}; Path=${path}; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
const redirect = (to: string, ...cookies: string[]) => {
  const h = new Headers({ Location: to });
  cookies.forEach((c) => h.append("Set-Cookie", c));
  return new Response(null, { status: 302, headers: h });
};
const decodeJwt = (jwt: string) =>
  JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0))));

// ---------- sessions ----------

export async function currentUser(req: Request, env: Env): Promise<User | null> {
  const token = cookie(req, SESSION_COOKIE);
  if (!token) return null;
  return env.DB.prepare(
    `SELECT u.id, u.email, u.name, u.is_admin, u.terms_version FROM auth_sessions s
     JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?`,
  )
    .bind(await sha256(token), new Date().toISOString())
    .first<User>();
}

/** Signs in an invited user (or the admin on first visit). */
async function signIn(env: Env, email: string, name: string | null): Promise<Response> {
  const now = new Date().toISOString();
  const isAdmin = email.toLowerCase() === env.ADMIN_EMAIL.toLowerCase();
  let user = await env.DB.prepare(`SELECT id FROM users WHERE email = ?`).bind(email).first<{ id: string }>();
  if (!user && isAdmin) {
    user = { id: crypto.randomUUID() };
    await env.DB.prepare(`INSERT INTO users (id, email, name, is_admin, created_at) VALUES (?, ?, ?, 1, ?)`)
      .bind(user.id, email.toLowerCase(), name, now)
      .run();
  }
  if (!user) return redirect("/signin?error=not-invited");

  const token = random();
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString();
  await env.DB.batch([
    env.DB.prepare(`UPDATE users SET name = COALESCE(?, name), is_admin = ?, last_login_at = ? WHERE id = ?`).bind(name, isAdmin ? 1 : 0, now, user.id),
    env.DB.prepare(`INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)`).bind(await sha256(token), user.id, expires),
    env.DB.prepare(`DELETE FROM auth_sessions WHERE expires_at < ?`).bind(now),
  ]);
  return redirect("/app", setCookie(SESSION_COOKIE, token, SESSION_DAYS * 86_400));
}

// ---------- routes: /auth/* ----------

export async function handleAuth(req: Request, env: Env, url: URL): Promise<Response> {
  const [, , action, name] = url.pathname.split("/"); // /auth/<action>/<provider>

  if (action === "logout") {
    const token = cookie(req, SESSION_COOKIE);
    if (token) await env.DB.prepare(`DELETE FROM auth_sessions WHERE token_hash = ?`).bind(await sha256(token)).run();
    return redirect("/", setCookie(SESSION_COOKIE, "", 0));
  }

  if (action === "dev" && env.DEV_LOGIN === "true" && url.hostname === "localhost") {
    const email = url.searchParams.get("email") ?? "";
    return isEmail(email) ? signIn(env, email, url.searchParams.get("name")) : redirect("/signin?error=failed");
  }

  const p = providers(env)[name];
  if (!p?.clientId || !p.clientSecret) return new Response("Unknown sign-in provider", { status: 404 });
  const redirectUri = `${url.origin}/auth/callback/${name}`;

  if (action === "login") {
    const state = random(16);
    const verifier = random();
    const auth = new URL(p.authorize);
    auth.search = new URLSearchParams({
      client_id: p.clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile",
      state,
      code_challenge: await sha256(verifier),
      code_challenge_method: "S256",
      prompt: "select_account",
    }).toString();
    return redirect(auth.toString(), setCookie(STATE_COOKIE, `${state}.${verifier}`, 600, "/auth"));
  }

  if (action === "callback") {
    const [state, verifier] = (cookie(req, STATE_COOKIE) ?? "").split(".");
    const clear = setCookie(STATE_COOKIE, "", 0, "/auth");
    if (!state || state !== url.searchParams.get("state") || !url.searchParams.get("code")) return redirect("/signin?error=failed", clear);

    const res = await fetch(p.token, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: url.searchParams.get("code")!,
        redirect_uri: redirectUri,
        client_id: p.clientId,
        client_secret: p.clientSecret,
        code_verifier: verifier,
      }),
    });
    if (!res.ok) return redirect("/signin?error=failed", clear);
    // The ID token came straight from the provider over TLS, so its claims can be trusted.
    const claims = decodeJwt(((await res.json()) as { id_token: string }).id_token);
    if (claims.aud !== p.clientId) return redirect("/signin?error=failed", clear);
    const id = p.identity(claims, env);
    if (!id) return redirect("/signin?error=unverified", clear);
    const out = await signIn(env, id.email, id.name);
    out.headers.append("Set-Cookie", clear);
    return out;
  }

  return new Response("Not found", { status: 404 });
}
