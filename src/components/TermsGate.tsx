import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { APP_NAME, OWNER_NAME } from "../config";

export default function TermsGate({ onAccepted }: { onAccepted: () => void }) {
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <main className="page narrow">
      <h1>Before you start</h1>
      <p>{APP_NAME} is a personal project run by {OWNER_NAME}, not a service of your employer. Please read the key points:</p>
      <ul className="points">
        <li>Never enter or ask for client, patient or case information, or anything confidential. Keep content general.</li>
        <li>You're responsible for the sessions you run and for telling participants what you'll do with their responses.</li>
        <li>Sessions and results are kept until your team deletes them. Your team can see your sessions.</li>
        <li>It's free and provided as is, with no guarantee it'll be available. Export anything you need to keep.</li>
      </ul>
      <p>
        Full details are in the <Link to="/terms" target="_blank">terms of use</Link> and <Link to="/privacy" target="_blank">privacy notice</Link>.
      </p>
      <label className="inline agree">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
        I agree to the terms of use and privacy notice
      </label>
      <button className="primary" disabled={!agreed || busy} onClick={() => (setBusy(true), api.acceptTerms().then(onAccepted))}>
        Continue
      </button>
    </main>
  );
}
