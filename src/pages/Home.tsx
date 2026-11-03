import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { APP_NAME } from "../config";

export default function Home() {
  const [code, setCode] = useState("");
  const nav = useNavigate();
  const valid = /^\d{6}$/.test(code);

  return (
    <main className="home">
      <p className="brand">{APP_NAME}</p>
      <h1>Join a session</h1>
      <form onSubmit={(e) => (e.preventDefault(), valid && nav(`/j/${code}`))}>
        <input
          className="code-input"
          inputMode="numeric"
          autoComplete="off"
          placeholder="123456"
          aria-label="6-digit session code"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
        />
        <button className="primary" disabled={!valid}>Join</button>
      </form>
      <p className="muted">No account needed.</p>
      <nav className="home-links">
        <Link to="/signin">Presenter sign in</Link>
        <Link to="/terms">Terms</Link>
        <Link to="/privacy">Privacy</Link>
      </nav>
    </main>
  );
}
