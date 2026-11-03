import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { APP_NAME } from "../config";

const ERRORS: Record<string, string> = {
  "not-invited": "That account hasn't been invited yet. Ask your team leader to add your email address, then sign in with that same address.",
  unverified: "That account's email address couldn't be verified. Try signing in with Google, or with an account your team leader added.",
  failed: "Sign-in didn't complete. Try again.",
};

export default function SignIn() {
  const [params] = useSearchParams();
  const [cfg, setCfg] = useState<{ providers: string[]; devLogin: boolean } | null>(null);
  const [devEmail, setDevEmail] = useState("ben.hafner@gmail.com");
  useEffect(() => void api.config().then(setCfg), []);
  const error = ERRORS[params.get("error") ?? ""];

  return (
    <main className="home">
      <Link to="/" className="brand">{APP_NAME}</Link>
      <h1>Presenter sign in</h1>
      <p className="muted center">Presenter accounts are invite-only. Joining a session doesn't need an account.</p>
      {error && <p className="error center" role="alert">{error}</p>}
      <div className="stack signin">
        {cfg?.providers.includes("google") && <a className="button big" href="/auth/login/google">Continue with Google</a>}
        {cfg?.providers.includes("microsoft") && <a className="button big" href="/auth/login/microsoft">Continue with Microsoft</a>}
        {cfg && !cfg.providers.length && !cfg.devLogin && <p className="muted">Sign-in hasn't been set up yet. See the README.</p>}
        {cfg?.devLogin && (
          <form className="stack dev-login" action="/auth/dev">
            <p className="small muted">Local development sign-in</p>
            <input name="email" value={devEmail} onChange={(e) => setDevEmail(e.target.value)} aria-label="Email" />
            <button>Sign in as this email</button>
          </form>
        )}
      </div>
      <p className="small muted center">
        By signing in you agree to the <Link to="/terms">terms of use</Link> and <Link to="/privacy">privacy notice</Link>.
      </p>
    </main>
  );
}
