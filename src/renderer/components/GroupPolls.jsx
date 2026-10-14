import { useEffect, useState } from "react";
import { BarChart3, Check, Plus, X } from "lucide-react";
import {
  closeGroupPoll,
  createGroupPoll,
  getGroupPolls,
  voteInGroupPoll,
} from "../lib/crewFeatures";
import { supabase } from "../lib/supabase";
import { Field, Modal } from "./ui";

function PollCard({ poll, user, canModerate, onChanged }) {
  const total = poll.options.reduce((sum, option) => sum + option.votes.length, 0);
  const mine = poll.options.find((option) =>
    option.votes.some((vote) => vote.user_id === user.id),
  )?.id;
  const ended = Boolean(poll.closed_at) || (poll.closes_at && new Date(poll.closes_at) <= new Date());
  const [busy, setBusy] = useState(false);
  async function vote(optionId) {
    if (busy || ended) return;
    setBusy(true);
    try {
      await voteInGroupPoll(poll.id, optionId, user.id);
      await onChanged();
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="group-poll-card">
      <header>
        <div><BarChart3 /><strong>{poll.question}</strong></div>
        <small>{ended ? "Closed" : poll.closes_at ? `Ends ${new Date(poll.closes_at).toLocaleString()}` : "Open"}</small>
      </header>
      <div className="group-poll-options">
        {poll.options.map((option) => {
          const count = option.votes.length;
          const percent = total ? Math.round((count / total) * 100) : 0;
          return (
            <button key={option.id} disabled={busy || ended} className={mine === option.id ? "selected" : ""} onClick={() => vote(option.id)}>
              <span className="poll-fill" style={{ width: `${percent}%` }} />
              <span>{mine === option.id && <Check />} {option.label}</span>
              <small>{count} · {percent}%</small>
            </button>
          );
        })}
      </div>
      <footer>
        <span>{total} {total === 1 ? "vote" : "votes"}</span>
        {!ended && (poll.created_by === user.id || canModerate) && (
          <button className="poll-close" onClick={async () => { await closeGroupPoll(poll.id); onChanged(); }}>Close poll</button>
        )}
      </footer>
    </article>
  );
}

export default function GroupPolls({ group, user, role = "member", onNotice }) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [options, setOptions] = useState(["", ""]);
  const [polls, setPolls] = useState([]);
  const load = async () => {
    try { setPolls(await getGroupPolls(group.id)); }
    catch (error) { onNotice?.(error.message); }
  };
  useEffect(() => {
    load();
    const channel = supabase.channel(`desktop-polls-${group.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "group_polls", filter: `group_id=eq.${group.id}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "group_poll_votes" }, load)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [group.id]);
  async function submit(event) {
    event.preventDefault();
    setCreating(true);
    try {
      const form = new FormData(event.currentTarget);
      await createGroupPoll(group.id, user.id, form.get("question"), options, form.get("duration"));
      setOpen(false);
      setOptions(["", ""]);
      await load();
    } catch (error) { onNotice?.(error.message); }
    finally { setCreating(false); }
  }
  return (
    <section className="group-polls-panel">
      <div className="group-polls-heading">
        <div><BarChart3 /><span><strong>Group polls</strong><small>Choose meetup times, games, or worlds together.</small></span></div>
        <button className="button secondary compact-button" onClick={() => setOpen(true)}><Plus /> Create poll</button>
      </div>
      {polls.length ? polls.map((poll) => <PollCard key={poll.id} poll={poll} user={user} canModerate={role !== "member"} onChanged={load} />) : <p className="micro-copy">No polls in this conversation yet.</p>}
      {open && (
        <Modal title="Create a group poll" onClose={() => setOpen(false)}>
          <form className="stack-form poll-create-form" onSubmit={submit}>
            <Field label="Question"><input name="question" minLength="3" maxLength="180" required autoFocus /></Field>
            <div className="poll-option-editor">
              {options.map((value, index) => (
                <div key={index}>
                  <input aria-label={`Choice ${index + 1}`} maxLength="100" required value={value} onChange={(event) => setOptions((rows) => rows.map((row, i) => i === index ? event.target.value : row))} />
                  {options.length > 2 && <button type="button" className="icon-button" onClick={() => setOptions((rows) => rows.filter((_, i) => i !== index))}><X /></button>}
                </div>
              ))}
              {options.length < 10 && <button type="button" className="button ghost" onClick={() => setOptions((rows) => [...rows, ""])}><Plus /> Add choice</button>}
            </div>
            <Field label="Poll duration"><select name="duration" defaultValue="24"><option value="">No automatic close</option><option value="1">1 hour</option><option value="6">6 hours</option><option value="24">1 day</option><option value="72">3 days</option><option value="168">1 week</option></select></Field>
            <div className="modal-actions"><button type="button" className="button ghost" onClick={() => setOpen(false)}>Cancel</button><button className="button primary" disabled={creating}>{creating ? "Creating…" : "Create poll"}</button></div>
          </form>
        </Modal>
      )}
    </section>
  );
}

