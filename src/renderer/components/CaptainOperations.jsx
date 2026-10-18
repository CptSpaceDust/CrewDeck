import { useEffect, useState } from "react";
import { Flag, Megaphone, ShieldCheck, Wrench } from "lucide-react";
import { supabase } from "../lib/supabase";
import { Field } from "./ui";

export default function CaptainOperations({ user, embedded = false }) {
  const [state, setState] = useState(null);
  const [audit, setAudit] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [evidence, setEvidence] = useState([]);
  const [selectedEvidence, setSelectedEvidence] = useState([]);
  const [notice, setNotice] = useState("");
  async function load() {
    const [system, history, crew, reports] = await Promise.all([
      supabase
        .from("community_system_state")
        .select("*")
        .eq("id", true)
        .single(),
      supabase
        .from("captain_audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(30),
      supabase.from("profiles").select("id,username").order("username"),
      supabase
        .from("moderation_evidence_snapshots")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    setState(system.data);
    setAudit(history.data || []);
    setProfiles(crew.data || []);
    setEvidence(reports.data || []);
  }
  useEffect(() => {
    load();
  }, []);
  async function announce(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = await supabase.from("community_announcements").insert({
      title: form.get("title"),
      body: form.get("body"),
      target: form.get("target"),
      publish_at: form.get("publish_at")
        ? new Date(form.get("publish_at")).toISOString()
        : new Date().toISOString(),
      created_by: user.id,
    });
    setNotice(result.error?.message || "Announcement saved.");
    if (!result.error) event.currentTarget.reset();
  }
  async function maintenance() {
    const result = await supabase
      .from("community_system_state")
      .update({
        maintenance_enabled: !state.maintenance_enabled,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", true)
      .select()
      .single();
    if (result.data) setState(result.data);
    setNotice(result.error?.message || "Maintenance status updated.");
  }
  async function moderate(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const type = form.get("record_type");
    const payload =
      type === "warning"
        ? {
            user_id: form.get("user_id"),
            issued_by: user.id,
            rule_reference: form.get("label"),
            reason: form.get("text"),
          }
        : {
            user_id: form.get("user_id"),
            captain_id: user.id,
            label: form.get("label"),
            note: form.get("text"),
          };
    const result = await supabase
      .from(type === "warning" ? "moderation_warnings" : "moderation_notes")
      .insert(payload);
    setNotice(
      result.error?.message ||
        `${type === "warning" ? "Warning" : "Note"} saved.`,
    );
    if (!result.error) event.currentTarget.reset();
  }
  async function reviewSelected(status) {
    if (!selectedEvidence.length) return;
    const result = await supabase
      .from("moderation_evidence_snapshots")
      .update({ status, reviewed_at: new Date().toISOString() })
      .in("id", selectedEvidence);
    setNotice(
      result.error?.message || `${selectedEvidence.length} reports updated.`,
    );
    if (!result.error) {
      setSelectedEvidence([]);
      load();
    }
  }
  const profileNames = Object.fromEntries(
    profiles.map((person) => [person.id, person.username]),
  );
  return (
    <section className="captain-operations">
      {!embedded && (
        <header>
          <span>Community operations</span>
          <h2>Announcements, staff history & maintenance</h2>
        </header>
      )}
      <div className="captain-operations-grid">
        <form className="panel stack-form" onSubmit={announce}>
          <Megaphone />
          <h3>Announcement composer</h3>
          <Field label="Title">
            <input name="title" maxLength="120" required />
          </Field>
          <Field label="Message">
            <textarea name="body" maxLength="4000" rows="5" required />
          </Field>
          <Field label="Audience">
            <select name="target">
              <option value="all">Website and app</option>
              <option value="website">Website</option>
              <option value="app">CrewDeck</option>
              <option value="groups">Groups</option>
            </select>
          </Field>
          <Field label="Publish later">
            <input name="publish_at" type="datetime-local" />
          </Field>
          <button className="button primary">Save announcement</button>
        </form>
        <div className="panel captain-system-card">
          <Wrench />
          <h3>Maintenance mode</h3>
          <p>{state?.maintenance_message || "CrewDeck maintenance banner"}</p>
          <button
            className={
              state?.maintenance_enabled ? "button danger" : "button secondary"
            }
            onClick={maintenance}
          >
            {state?.maintenance_enabled
              ? "End maintenance"
              : "Start maintenance"}
          </button>
          <hr />
          <ShieldCheck />
          <h3>Audit history</h3>
          <div className="captain-audit-scroll">
            {audit.map((item) => (
              <p key={item.id}>
                <strong>{item.action}</strong>
                <small>{new Date(item.created_at).toLocaleString()}</small>
              </p>
            ))}
          </div>
          <hr />
          <ShieldCheck />
          <h3>Member notes & warnings</h3>
          <form className="stack-form" onSubmit={moderate}>
            <Field label="Member">
              <select name="user_id" required>
                <option value="">Choose a member</option>
                {profiles.map((person) => (
                  <option value={person.id} key={person.id}>
                    {person.username}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Record type">
              <select name="record_type">
                <option value="note">Private Captain note</option>
                <option value="warning">Warning visible to member</option>
              </select>
            </Field>
            <Field label="Label or rule">
              <input name="label" required maxLength="120" />
            </Field>
            <Field label="Details">
              <textarea name="text" required maxLength="2000" rows="4" />
            </Field>
            <button className="button secondary">Save record</button>
          </form>
        </div>
      </div>
      <section className="panel captain-evidence-panel">
        <header>
          <div>
            <span className="captain-evidence-icon">
              <Flag />
            </span>
            <span>
              <small>EVIDENCE REVIEW</small>
              <h3>Evidence inbox</h3>
              <p>
                Preserved message context for fast, consistent moderation
                decisions.
              </p>
            </span>
          </div>
          <div className="captain-evidence-actions">
            <button
              className="button secondary"
              disabled={!selectedEvidence.length}
              onClick={() => reviewSelected("reviewed")}
            >
              Mark reviewed
            </button>
            <button
              className="button secondary"
              disabled={!selectedEvidence.length}
              onClick={() => reviewSelected("dismissed")}
            >
              Dismiss
            </button>
          </div>
        </header>
        <div className="captain-evidence-list">
          {evidence.length ? (
            evidence.map((report) => {
              const context = Array.isArray(report.message_context)
                ? report.message_context[0]
                : null;
              return (
                <label
                  key={report.id}
                  className={
                    selectedEvidence.includes(report.id) ? "selected" : ""
                  }
                >
                  <input
                    type="checkbox"
                    checked={selectedEvidence.includes(report.id)}
                    onChange={(event) =>
                      setSelectedEvidence((current) =>
                        event.target.checked
                          ? [...current, report.id]
                          : current.filter((id) => id !== report.id),
                      )
                    }
                  />
                  <span className="captain-evidence-content">
                    <span className="captain-evidence-title">
                      <strong>
                        {profileNames[report.reported_user_id] || "Crew member"}
                      </strong>
                      <b>{report.status}</b>
                    </span>
                    <small>
                      {report.conversation_kind.toUpperCase()} ·{" "}
                      {new Date(report.created_at).toLocaleString()}
                    </small>
                    <blockquote>
                      {context?.content || "Evidence snapshot"}
                    </blockquote>
                    {context?.reason && (
                      <p>
                        <strong>Reason:</strong> {context.reason}
                      </p>
                    )}
                    <code title="Conversation ID">
                      {report.conversation_id}
                    </code>
                  </span>
                </label>
              );
            })
          ) : (
            <p>No reports are waiting for review.</p>
          )}
        </div>
      </section>
      {notice && <p className="form-message">{notice}</p>}
    </section>
  );
}
