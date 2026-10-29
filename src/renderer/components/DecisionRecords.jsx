import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Edit3, History, Search, Wand2 } from "lucide-react";
import { convertDecision, getGroupDecisions, updateDecision } from "../lib/decisionArchive";
import { Field, Modal } from "./ui";
import { supabase } from "../lib/supabase";
import InternalLinkPreviews from "./InternalLinkPreviews";

export default function DecisionRecords({ groupId, canManage, open, onClose, onNotice, userId, onNavigate }) {
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(null);
  const [converting, setConverting] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = async () => {
    try { setItems(await getGroupDecisions(groupId)); }
    catch (error) { onNotice?.(error.message); }
  };
  useEffect(() => {
    if (!open) return undefined;
    load();
    const channel = supabase.channel(`decision-history-${groupId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "group_decisions", filter: `group_id=eq.${groupId}` }, load)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [open, groupId]);
  const shown = useMemo(() => {
    const value = query.trim().toLowerCase();
    return value ? items.filter((item) => `${item.decision_text} ${item.poll_question} ${item.next_action || ""}`.toLowerCase().includes(value)) : items;
  }, [items, query]);
  if (!open) return null;
  async function submitEdit(event) {
    event.preventDefault(); setBusy(true);
    const data = new FormData(event.currentTarget);
    try {
      await updateDecision(editing.id, { decision: data.get("decision"), nextAction: data.get("nextAction"), actionType: data.get("actionType") || null });
      setEditing(null); await load(); onNotice?.("Decision correction saved with revision history.");
    } catch (error) { onNotice?.(error.message); } finally { setBusy(false); }
  }
  async function submitConversion(event) {
    event.preventDefault(); setBusy(true);
    const data = new FormData(event.currentTarget);
    try {
      await convertDecision(converting.id, { actionType: data.get("actionType"), title: data.get("title"), details: data.get("details") });
      setConverting(null); await load(); onNotice?.("Next action created.");
    } catch (error) { onNotice?.(error.message); } finally { setBusy(false); }
  }
  return <>
    <Modal title="Decision records" onClose={onClose}>
      <section className="decision-records-panel">
        <label className="decision-search"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search decisions, polls, and next actions" /></label>
        {shown.length ? shown.map((item) => <article className="decision-record-card" key={item.id}>
          <header><CheckCircle2 /><div><strong>{item.decision_text}</strong><small>{item.author?.username || "Crew moderator"} · {new Date(item.created_at).toLocaleString()}</small></div></header>
          <blockquote><b>Source poll</b>{item.poll_question}<span>{item.voter_count} voter{item.voter_count === 1 ? "" : "s"}</span></blockquote>
          <div className="decision-results">{(item.poll_snapshot?.options || []).map((option) => <span key={option.id}>{option.label} <b>{option.votes}</b></span>)}</div>
          {item.next_action && <p><b>Next action:</b> {item.next_action}</p>}
          <InternalLinkPreviews content={`${item.decision_text} ${item.next_action||""}`} userId={userId} kind="group" conversationId={groupId} messageId={item.id} onNavigate={onNavigate}/>
          {item.actions?.length > 0 && <div className="decision-action-list">{item.actions.map((action) => <span key={action.id}>{action.action_type.replace("_", " ")} · {action.title}</span>)}</div>}
          <footer><span><History /> Revision {item.revision}</span>{canManage && <><button className="button ghost" onClick={() => setEditing(item)}><Edit3 /> Correct</button>{item.next_action_type && <button className="button secondary" onClick={() => setConverting(item)}><Wand2 /> Create next action</button>}</>}</footer>
        </article>) : <p className="micro-copy">No matching decisions yet. Close a group poll to save its outcome here.</p>}
      </section>
    </Modal>
    {editing && <Modal title="Correct decision" onClose={() => setEditing(null)}><form className="stack-form" onSubmit={submitEdit}><Field label="Decision"><textarea name="decision" defaultValue={editing.decision_text} minLength="3" maxLength="1200" required /></Field><Field label="Optional next action"><textarea name="nextAction" defaultValue={editing.next_action || ""} maxLength="1000" /></Field><Field label="Action type"><select name="actionType" defaultValue={editing.next_action_type || ""}><option value="">No conversion</option><option value="meetup">Meetup</option><option value="event">Event</option><option value="board_post">Board post</option><option value="project_task">Project task</option></select></Field><button className="button primary" disabled={busy}>Save correction</button></form></Modal>}
    {converting && <Modal title="Create next action" onClose={() => setConverting(null)}><form className="stack-form" onSubmit={submitConversion}><Field label="Destination"><select name="actionType" defaultValue={converting.next_action_type} required><option value="meetup">Meetup</option><option value="event">Event</option><option value="board_post">Board post</option><option value="project_task">Project task</option></select></Field><Field label="Title"><input name="title" minLength="3" maxLength="180" defaultValue={converting.next_action || converting.decision_text} required /></Field><Field label="Details"><textarea name="details" defaultValue={`Decision: ${converting.decision_text}`} /></Field><button className="button primary" disabled={busy}>Create action</button></form></Modal>}
  </>;
}
