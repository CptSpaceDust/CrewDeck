import { useEffect, useState } from "react";
import {
  BookOpen,
  Flag,
  HeartHandshake,
  ListChecks,
  Megaphone,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { communityBoards } from "../lib/communityBoards";
import { Field } from "./ui";

export default function CaptainOperations({ user, embedded = false }) {
  const [state, setState] = useState(null);
  const [audit, setAudit] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [evidence, setEvidence] = useState([]);
  const [selectedEvidence, setSelectedEvidence] = useState([]);
  const [notice, setNotice] = useState("");
  const [cases, setCases] = useState([]);
  const [workflows, setWorkflows] = useState([]);
  const [welfare, setWelfare] = useState([]);
  const [guidelines, setGuidelines] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [bugReports, setBugReports] = useState([]);
  const [helpRequests, setHelpRequests] = useState([]);
  const [calendarEvents, setCalendarEvents] = useState([]);
  async function load() {
    const [
      system,
      history,
      crew,
      reports,
      caseRows,
      workflowRows,
      welfareRows,
      guidelineRows,
      announcementRows,
      bugRows,
      helpRows,
      calendarRows,
    ] = await Promise.all([
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
      supabase
        .from("moderation_cases")
        .select("*")
        .order("updated_at", { ascending: false }),
      supabase
        .from("moderation_workflows")
        .select("*")
        .eq("active", true)
        .order("name"),
      supabase
        .from("member_welfare_requests")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase
        .from("guideline_versions")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase
        .from("community_announcements")
        .select("*")
        .order("publish_at", { ascending: false }),
      communityBoards
        .listPosts("bug", { includeArchived: true, limit: 50 })
        .then((data) => ({ data })),
      communityBoards
        .listPosts("help", { includeArchived: true, limit: 50 })
        .then((data) => ({ data })),
      supabase
        .from("community_calendar_events")
        .select("*")
        .order("starts_at", { ascending: false })
        .limit(50),
    ]);
    setState(system.data);
    setAudit(history.data || []);
    setProfiles(crew.data || []);
    setEvidence(reports.data || []);
    setCases(caseRows.data || []);
    setWorkflows(workflowRows.data || []);
    setWelfare(welfareRows.data || []);
    setGuidelines(guidelineRows.data || []);
    setAnnouncements(announcementRows.data || []);
    setBugReports(bugRows.data || []);
    setHelpRequests(helpRows.data || []);
    setCalendarEvents(calendarRows.data || []);
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
    if (!result.error) {
      event.currentTarget.reset();
      load();
    }
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
  async function createCalendarEvent(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = await supabase
      .from("community_calendar_events")
      .insert({
        created_by: user.id,
        title: form.get("title"),
        description: form.get("description") || null,
        category: form.get("category"),
        starts_at: new Date(form.get("starts_at")).toISOString(),
        ends_at: form.get("ends_at")
          ? new Date(form.get("ends_at")).toISOString()
          : null,
        location: form.get("location") || null,
        join_url: form.get("join_url") || null,
      });
    setNotice(result.error?.message || "Community calendar event saved.");
    if (!result.error) {
      event.currentTarget.reset();
      load();
    }
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
  async function createWorkflow(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const steps = String(form.get("steps") || "")
      .split("\n")
      .map((step) => step.trim())
      .filter(Boolean);
    const result = await supabase.from("moderation_workflows").insert({
      name: form.get("name"),
      description: form.get("description"),
      steps,
      created_by: user.id,
    });
    setNotice(result.error?.message || "Moderation workflow saved.");
    if (!result.error) {
      event.currentTarget.reset();
      load();
    }
  }
  async function createCase(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = await supabase.from("moderation_cases").insert({
      subject_user_id: form.get("subject_user_id") || null,
      workflow_id: form.get("workflow_id") || null,
      guideline_version_id: form.get("guideline_version_id") || null,
      assigned_to: user.id,
      title: form.get("title"),
      summary: form.get("summary"),
      priority: form.get("priority"),
      created_by: user.id,
    });
    setNotice(result.error?.message || "Moderation case opened.");
    if (!result.error) {
      event.currentTarget.reset();
      load();
    }
  }
  async function updateCase(id, status) {
    const result = await supabase
      .from("moderation_cases")
      .update({
        status,
        updated_at: new Date().toISOString(),
        ...(status === "resolved"
          ? { resolved_at: new Date().toISOString() }
          : {}),
      })
      .eq("id", id);
    setNotice(result.error?.message || "Case updated.");
    if (!result.error) load();
  }
  async function updateWelfare(id, status) {
    const result = await supabase
      .from("member_welfare_requests")
      .update({
        status,
        reviewed_by: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    setNotice(result.error?.message || "Welfare request updated.");
    if (!result.error) load();
  }
  async function openBugScreenshot(path) {
    const { data, error } = await supabase.storage
      .from("bug-screenshots")
      .createSignedUrl(path, 120);
    if (error || !data?.signedUrl) {
      setNotice(error?.message || "Screenshot could not be opened.");
      return;
    }
    window.desktop?.openExternal?.(data.signedUrl);
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
        <section className="panel captain-announcement-library">
          <Megaphone />
          <h3>Active & scheduled announcements</h3>
          <p>
            Review exactly what members will see and remove outdated notices.
          </p>
          <div>
            {announcements.map((item) => (
              <article key={item.id}>
                <span>
                  <strong>{item.title}</strong>
                  <small>
                    {item.target} · {new Date(item.publish_at).toLocaleString()}
                  </small>
                  <p>{item.body}</p>
                </span>
                <button
                  className="button danger"
                  type="button"
                  onClick={async () => {
                    const { error } = await supabase
                      .from("community_announcements")
                      .delete()
                      .eq("id", item.id);
                    setNotice(error?.message || "Announcement removed.");
                    if (!error) load();
                  }}
                >
                  Delete
                </button>
              </article>
            ))}
            {!announcements.length && (
              <p className="micro-copy">
                No announcements are active or scheduled.
              </p>
            )}
          </div>
        </section>
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
      <section className="panel captain-community-queue">
        <header>
          <div>
            <Flag />
            <span>
              <strong>Community queue</strong>
              <small>
                Bug reports and help requests in one operational view.
              </small>
            </span>
          </div>
          <button className="button secondary" onClick={load}>
            Refresh queue
          </button>
        </header>
        <div className="captain-community-queue-grid">
          <div>
            <h3>Bug reports</h3>
            {bugReports.map((item) => (
              <article key={item.id}>
                <span>
                  <strong>{item.title}</strong>
                  <small>
                    {item.metadata?.platform || "app"} ·{" "}
                    {item.metadata?.page_name || "Unknown page"} · {item.status}
                  </small>
                </span>
                {item.metadata?.screenshot_path && (
                  <button
                    className="button ghost"
                    type="button"
                    onClick={() =>
                      openBugScreenshot(item.metadata.screenshot_path)
                    }
                  >
                    Screenshot
                  </button>
                )}
                <select
                  value={item.status}
                  onChange={async (event) => {
                    await communityBoards.updatePost(item.id, {
                      status: event.target.value,
                    });
                    load();
                  }}
                >
                  <option>Open</option>
                  <option>Investigating</option>
                  <option>Fixing</option>
                  <option>Testing</option>
                  <option>Fixed</option>
                  <option>Closed</option>
                </select>
              </article>
            ))}
          </div>
          <div>
            <h3>Help requests</h3>
            {helpRequests.map((item) => (
              <article key={item.id}>
                <span>
                  <strong>{item.title}</strong>
                  <small>
                    {item.tags?.[0] || "general"} · {item.status}
                  </small>
                </span>
                <select
                  value={item.status}
                  onChange={async (event) => {
                    await communityBoards.updatePost(item.id, {
                      status: event.target.value,
                    });
                    load();
                  }}
                >
                  <option>Open</option>
                  <option>Claimed</option>
                  <option>In progress</option>
                  <option>Completed</option>
                  <option>Reopened</option>
                  <option>Closed</option>
                </select>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className="panel captain-calendar-manager">
        <header>
          <div>
            <Megaphone />
            <span>
              <strong>Community calendar</strong>
              <small>
                Publish events, deadlines, and maintenance periods to the shared
                calendar.
              </small>
            </span>
          </div>
        </header>
        <div className="captain-community-queue-grid">
          <form className="stack-form" onSubmit={createCalendarEvent}>
            <Field label="Title">
              <input name="title" minLength="2" maxLength="160" required />
            </Field>
            <div className="form-grid">
              <Field label="Category">
                <select name="category">
                  <option value="community">Community event</option>
                  <option value="deadline">Project deadline</option>
                  <option value="maintenance">Maintenance</option>
                </select>
              </Field>
              <Field label="Starts">
                <input name="starts_at" type="datetime-local" required />
              </Field>
              <Field label="Ends (optional)">
                <input name="ends_at" type="datetime-local" />
              </Field>
              <Field label="Location">
                <input name="location" maxLength="300" />
              </Field>
            </div>
            <Field label="Join link">
              <input name="join_url" type="url" />
            </Field>
            <Field label="Details">
              <textarea name="description" rows="3" maxLength="3000" />
            </Field>
            <button className="button primary">Add to calendar</button>
          </form>
          <div className="captain-event-list">
            {calendarEvents.map((item) => (
              <article key={item.id}>
                <span>
                  <strong>{item.title}</strong>
                  <small>
                    {item.category} ·{" "}
                    {new Date(item.starts_at).toLocaleString()}
                  </small>
                </span>
                <button
                  className="button danger"
                  type="button"
                  onClick={async () => {
                    const { error } = await supabase
                      .from("community_calendar_events")
                      .delete()
                      .eq("id", item.id);
                    setNotice(error?.message || "Calendar event removed.");
                    if (!error) load();
                  }}
                >
                  Delete
                </button>
              </article>
            ))}
            {!calendarEvents.length && (
              <p className="micro-copy">
                No Captain-created calendar events yet.
              </p>
            )}
          </div>
        </div>
      </section>
      <div className="captain-operations-grid captain-case-grid">
        <form className="panel stack-form" onSubmit={createCase}>
          <ListChecks />
          <h3>Open moderation case</h3>
          <Field label="Case title">
            <input name="title" maxLength="160" required />
          </Field>
          <Field label="Member">
            <select name="subject_user_id">
              <option value="">No member selected</option>
              {profiles.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.username}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Workflow">
            <select name="workflow_id">
              <option value="">No workflow</option>
              {workflows.map((workflow) => (
                <option key={workflow.id} value={workflow.id}>
                  {workflow.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Rules version">
            <select name="guideline_version_id">
              <option value="">Current rules</option>
              {guidelines.map((version) => (
                <option key={version.id} value={version.id}>
                  {version.version_label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Priority">
            <select name="priority">
              <option value="normal">Normal</option>
              <option value="low">Low</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </Field>
          <Field label="Summary">
            <textarea name="summary" rows="4" maxLength="3000" />
          </Field>
          <button className="button primary">Open case</button>
        </form>
        <form className="panel stack-form" onSubmit={createWorkflow}>
          <BookOpen />
          <h3>Moderation workflow</h3>
          <Field label="Name">
            <input name="name" maxLength="100" required />
          </Field>
          <Field label="Description">
            <textarea name="description" rows="3" maxLength="500" />
          </Field>
          <Field label="Steps · one per line">
            <textarea name="steps" rows="7" required />
          </Field>
          <button className="button secondary">Save workflow</button>
        </form>
      </div>
      <section className="panel captain-case-board">
        <header>
          <ListChecks />
          <div>
            <small>CAPTAIN ONLY</small>
            <h3>Active moderation cases</h3>
            <p>
              Cases connect evidence, reports, rules, and decisions without
              exposing private records to Trusted People.
            </p>
          </div>
        </header>
        <div className="captain-moderation-action-list">
          {cases
            .filter((item) => !["resolved", "dismissed"].includes(item.status))
            .map((item) => (
              <article className="captain-moderation-action-card" key={item.id}>
                <div>
                  <strong>{item.title}</strong>
                  <span>
                    {profileNames[item.subject_user_id] || "General case"} ·{" "}
                    {item.priority} · {item.status}
                  </span>
                  <p>{item.summary || "No summary added."}</p>
                </div>
                <div className="captain-actions">
                  <button onClick={() => updateCase(item.id, "reviewing")}>
                    Reviewing
                  </button>
                  <button
                    className="approve"
                    onClick={() => updateCase(item.id, "resolved")}
                  >
                    Resolve
                  </button>
                  <button onClick={() => updateCase(item.id, "dismissed")}>
                    Dismiss
                  </button>
                </div>
              </article>
            ))}
          {!cases.some(
            (item) => !["resolved", "dismissed"].includes(item.status),
          ) && <p>No active moderation cases.</p>}
        </div>
      </section>
      <section className="panel captain-welfare-board">
        <header>
          <HeartHandshake />
          <div>
            <small>PRIVATE SUPPORT</small>
            <h3>Member welfare queue</h3>
            <p>
              Voluntary support requests stay separate from moderation reports.
            </p>
          </div>
        </header>
        <div className="captain-moderation-action-list">
          {welfare
            .filter((item) => item.status !== "closed")
            .map((item) => (
              <article className="captain-moderation-action-card" key={item.id}>
                <div>
                  <strong>{item.subject}</strong>
                  <span>
                    {profileNames[item.user_id] || "Crew member"} ·{" "}
                    {item.status}
                  </span>
                  <p>{item.message}</p>
                </div>
                <div className="captain-actions">
                  <button onClick={() => updateWelfare(item.id, "reviewing")}>
                    Reviewing
                  </button>
                  <button
                    className="approve"
                    onClick={() => updateWelfare(item.id, "closed")}
                  >
                    Close
                  </button>
                </div>
              </article>
            ))}
          {!welfare.some((item) => item.status !== "closed") && (
            <p>No welfare requests are waiting.</p>
          )}
        </div>
      </section>
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
