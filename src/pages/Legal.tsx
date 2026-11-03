import { Link } from "react-router-dom";
import { TERMS_VERSION } from "../../shared/types";
import { APP_NAME, CONTACT_EMAIL, OWNER_NAME } from "../config";

const updated = new Date(TERMS_VERSION).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });

function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="page narrow legal">
      <p><Link to="/" className="brand">{APP_NAME}</Link></p>
      <h1>{title}</h1>
      <p className="muted">Last updated {updated}</p>
      {children}
      <p className="muted small">
        <Link to="/terms">Terms of use</Link> · <Link to="/privacy">Privacy notice</Link>
      </p>
    </main>
  );
}

export function Terms() {
  return (
    <LegalPage title="Terms of use">
      <h2>Who runs {APP_NAME}</h2>
      <p>
        {APP_NAME} is a personal, non-commercial project run by {OWNER_NAME} ("we", "us"). It isn't a product or service of any employer
        or organisation that people using it may work for, and it isn't endorsed by them. Questions: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>

      <h2 id="participants">If you're joining a session</h2>
      <ul>
        <li>You don't need an account. You join with a code and a name you choose, or a random one.</li>
        <li>Your responses are seen by the presenter and may be shown on screen to everyone in the session. Unless the session is set to anonymous, your chosen name may appear next to what you write.</li>
        <li>Don't share anything you wouldn't want shown to the room. Never include client, patient or case information, or personal details about anyone else.</li>
        <li>By joining a session you agree to these terms and the <Link to="/privacy">privacy notice</Link>.</li>
      </ul>

      <h2>If you're a presenter</h2>
      <ul>
        <li>Accounts are by invitation only. The admin appoints team leaders, and team leaders add members to their team.</li>
        <li>You're responsible for the content of your sessions and for how you use the results, including meeting any rules your own workplace has.</li>
        <li>Don't create questions that ask for client, patient or case information, confidential business information, or sensitive personal information (such as health details).</li>
        <li>Tell participants what the session is for and how you'll use their responses. Use anonymous mode or approve-before-showing when topics are sensitive.</li>
        <li>Everyone in your team can see, run, edit and delete your team's sessions and results.</li>
        <li>Keep your sign-in account secure and don't share access.</li>
      </ul>

      <h2>Acceptable use</h2>
      <p>
        Don't use {APP_NAME} to break the law, harass or demean anyone, share offensive or infringing material, collect personal information
        you're not entitled to, or try to disrupt or gain unauthorised access to the service. We may hide content, remove access or delete
        sessions that break these terms.
      </p>

      <h2>Your content</h2>
      <p>
        You and your participants own what you put in. You give us permission to store and display it only to run the service. We don't sell
        it, use it for advertising, or use it to train AI models.
      </p>

      <h2>Availability and liability</h2>
      <p>
        {APP_NAME} is provided free and "as is". We do our best to keep it running and secure but don't guarantee it will always be available,
        error-free, or kept indefinitely. Export reports you need to keep. We may change or stop the service; if we plan to shut it down we'll
        try to give presenters notice so they can export their results. To the extent the law allows, we aren't liable for any loss arising from
        using it. Nothing in these terms limits rights you have under the Australian Consumer Law that can't be excluded.
      </p>

      <h2>Changes</h2>
      <p>
        If we change these terms, presenters will be asked to accept the new version the next time they sign in. Continuing to join sessions
        after a change means you accept it. These terms are governed by the laws of Queensland, Australia.
      </p>
    </LegalPage>
  );
}

export function Privacy() {
  return (
    <LegalPage title="Privacy notice">
      <p>
        {APP_NAME} is designed to hold as little personal information as possible. This notice explains what we keep and why. It's run by{" "}
        {OWNER_NAME}, contact <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>

      <h2>Participants</h2>
      <ul>
        <li><strong>What we keep:</strong> the name you choose, your responses, and a random ID stored in your browser so you can change your vote after a refresh. The ID doesn't identify you.</li>
        <li><strong>What we don't keep:</strong> no account, email address or contact details. The app doesn't store your IP address.</li>
        <li><strong>Who sees it:</strong> the presenter and their team. Responses may be shown on screen to the session. In anonymous sessions your name isn't shown with your responses, but it's still stored with the session.</li>
      </ul>

      <h2>Presenters</h2>
      <ul>
        <li><strong>What we keep:</strong> your email address and name from your Google or Microsoft sign-in, your team memberships, when you last signed in, when you accepted these terms, and the sessions your team creates.</li>
        <li><strong>Why:</strong> to let you sign in, control who can access each team's sessions, and run the service.</li>
        <li><strong>Who sees it:</strong> the admin, and your team leaders and teammates (your name and email).</li>
      </ul>

      <h2>Where it's stored</h2>
      <p>
        {APP_NAME} runs on Cloudflare's global network. Data may be stored and processed outside Australia. Cloudflare processes technical
        request data (such as IP addresses) to deliver and protect the service under its own privacy policy. Sign-in is handled by Google or
        Microsoft under their privacy policies.
      </p>

      <h2>How long we keep it</h2>
      <ul>
        <li>Sessions, responses and participant names: until the team deletes the session, or the admin deletes the team.</li>
        <li>Presenter accounts: until the admin removes them. Sign-in sessions expire after 30 days.</li>
        <li>Anonymous daily usage counts (number of requests per session) are kept to monitor capacity.</li>
      </ul>

      <h2>Your choices</h2>
      <p>
        Participants can ask the presenter to remove a response, or contact us. Presenters can ask the admin to delete their account. We
        don't sell personal information, use it for advertising, or share it except as needed to run the service or where the law requires.
        If you have a concern about how your information is handled, contact us first.
      </p>
    </LegalPage>
  );
}
