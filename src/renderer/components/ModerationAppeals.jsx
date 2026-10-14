import { useEffect, useState } from "react";
import { Gavel, Send } from "lucide-react";
import { getActiveRestrictions } from "../lib/data";
import { getMyAppeals, reviewAppeal, submitAppeal } from "../lib/crewFeatures";
import { confirmInApp, promptInApp } from "./InAppDialog";
import { Field } from "./ui";

const labels = {
  messaging: "Messaging",
  comments: "Posting comments",
  idea_likes: "Liking ideas",
  ideas: "Posting ideas",
  collabs: "Posting collab requests",
  meetups: "Submitting meetup requests",
  calls: "Voice calling",
  site: "Site access",
};

export function MyModerationAppeals({ user }) {
  const [restrictions, setRestrictions] = useState([]);
  const [appeals, setAppeals] = useState([]);
  const [selected, setSelected] = useState("");
  const [message, setMessage] = useState("");
  const load = async () => {
    const [active, mine] = await Promise.all([
      getActiveRestrictions(user.id),
      getMyAppeals(user.id),
    ]);
    setRestrictions(active);
    setAppeals(mine);
  };
  useEffect(() => { load().catch((error) => setMessage(error.message)); }, [user.id]);
  const available = restrictions.filter((restriction) =>
    !appeals.some((appeal) =>
      appeal.restriction_action === restriction.action &&
      appeal.restriction_expires_at === restriction.expires_at,
    ),
  );
  async function send(event) {
    event.preventDefault();
    const restriction = available.find((item) => `${item.action}:${item.expires_at}` === selected);
    if (!restriction) return setMessage("Choose an active restriction.");
    try {
      const text = new FormData(event.currentTarget).get("appeal");
      await submitAppeal(user.id, restriction, text);
      event.currentTarget.reset();
      setSelected("");
      setMessage("Your appeal was sent to the Captain.");
      await load();
    } catch (error) { setMessage(error.message); }
  }
  return (
    <section className="panel settings-panel settings-panel-wide moderation-appeals-panel">
      <div className="section-icon"><Gavel /></div>
      <h2>Moderation appeals</h2>
      <p>You may submit one appeal for each active restriction. The restriction stays active until the Captain reviews it.</p>
      {available.length > 0 && (
        <form className="stack-form" onSubmit={send}>
          <Field label="Restriction">
            <select value={selected} onChange={(event) => setSelected(event.target.value)} required>
              <option value="">Choose a restriction…</option>
              {available.map((item) => <option key={`${item.action}:${item.expires_at}`} value={`${item.action}:${item.expires_at}`}>{labels[item.action] || item.action} · until {new Date(item.expires_at).toLocaleString()}</option>)}
            </select>
          </Field>
          <Field label="Why should this restriction be reconsidered?">
            <textarea name="appeal" minLength="20" maxLength="2000" rows="5" required />
          </Field>
          <button className="button primary"><Send /> Submit appeal</button>
        </form>
      )}
      {!restrictions.length && <p className="micro-copy">You have no active restrictions.</p>}
      <div className="appeal-history">
        {appeals.map((appeal) => <article key={appeal.id}><strong>{labels[appeal.restriction_action] || appeal.restriction_action}</strong><span className={`status ${appeal.status}`}>{appeal.status}</span><p>{appeal.appeal_text}</p>{appeal.captain_response && <small>Captain response: {appeal.captain_response}</small>}</article>)}
      </div>
      {message && <p className="form-message">{message}</p>}
    </section>
  );
}

export function CaptainAppeals({ appeals = [], user, name, run, setTarget }) {
  async function decide(appeal, status) {
    const response = await promptInApp("Write a short response for this appeal.", "", { title: status === "approved" ? "Approve appeal" : "Deny appeal", inputLabel: "Captain response", confirmLabel: status === "approved" ? "Approve" : "Deny" });
    if (response === null) return;
    if (!(await confirmInApp(`This appeal will be marked ${status}.`, { title: "Finish appeal review?", confirmLabel: "Save decision", danger: status === "denied" }))) return;
    await run(() => reviewAppeal(appeal.id, user.id, status, response), `Appeal ${status}.`);
  }
  return (
    <div className="captain-moderation-action-list captain-appeals-list">
      {!appeals.length && <p>No moderation appeals.</p>}
      {appeals.map((appeal) => (
        <article className="captain-moderation-action-card" key={appeal.id}>
          <div><strong>{name(appeal.user_id)}</strong><span className="captain-moderation-action-name">{labels[appeal.restriction_action] || appeal.restriction_action} · {appeal.status}</span><p>{appeal.appeal_text}</p><small>Restriction applied {appeal.restriction_created_at ? new Date(appeal.restriction_created_at).toLocaleString() : "before this appeal"} · expires {new Date(appeal.restriction_expires_at).toLocaleString()}</small>{appeal.evidence?.length > 0 && <details className="appeal-evidence"><summary>Review saved evidence ({appeal.evidence.length})</summary>{appeal.evidence.map((item, index) => <blockquote key={`${appeal.id}-${index}`}><strong>{(item.categories || []).join(", ") || "Flagged message"}</strong><p>{item.message_content}</p><small>{item.message_kind} conversation · {item.conversation_id}</small></blockquote>)}</details>}{appeal.captain_response && <small>Response: {appeal.captain_response}</small>}</div>
          <div className="captain-actions">
            <button onClick={() => setTarget(appeal.user_id)}>Open moderation</button>
            {appeal.status === "pending" && <><button className="approve" onClick={() => decide(appeal, "approved")}>Approve</button><button className="deny" onClick={() => decide(appeal, "denied")}>Deny</button></>}
          </div>
        </article>
      ))}
    </div>
  );
}
