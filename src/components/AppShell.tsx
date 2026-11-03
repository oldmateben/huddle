import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import type { Me } from "../../shared/types";
import { api, ApiError } from "../api";
import { APP_NAME } from "../config";
import TermsGate from "./TermsGate";

interface Ctx {
  me: Me;
  reload: () => void;
  setChrome: (show: boolean) => void;
}
const MeContext = createContext<Ctx>(null!);
export const useMe = () => useContext(MeContext);

/** Signed-in area: loads the presenter, enforces the terms, renders the top bar. */
export default function AppShell() {
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState("");
  const [chrome, setChrome] = useState(true);
  const nav = useNavigate();
  const teamId = useLocation().pathname.match(/^\/app\/t\/([^/]+)/)?.[1];

  const reload = useCallback(() => {
    api
      .me()
      .then(setMe)
      .catch((e) => (e instanceof ApiError && e.status === 401 ? nav("/signin") : setError(e.message)));
  }, [nav]);
  useEffect(reload, [reload]);

  if (error) return <main className="page"><p className="error">{error}</p></main>;
  if (!me) return <main className="page"><p className="muted">Loading…</p></main>;
  if (me.needsTerms) return <TermsGate onAccepted={reload} />;

  const current = me.teams.find((t) => t.id === teamId);
  return (
    <MeContext.Provider value={{ me, reload, setChrome }}>
      {chrome && (
        <header className="appbar no-print">
          <Link to="/app" className="brand">{APP_NAME}</Link>
          {me.teams.length > 1 && (
            <select aria-label="Team" value={current?.id ?? ""} onChange={(e) => nav(`/app/t/${e.target.value}`)}>
              {!current && <option value="">Choose a team</option>}
              {me.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
          <span className="spacer" />
          {me.user.isAdmin && <NavLink to="/app/admin">Admin</NavLink>}
          <span className="muted small hide-narrow">{me.user.email}</span>
          <a href="/auth/logout">Sign out</a>
        </header>
      )}
      <Outlet />
    </MeContext.Provider>
  );
}
