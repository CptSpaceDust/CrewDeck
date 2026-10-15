import { useEffect, useState } from "react";
import { BarChart3, Check, Plus, Trash2, X } from "lucide-react";
import {
  closeGroupPoll,
  createGroupPoll,
  deleteClosedGroupPoll,
  getGroupPolls,
  voteInGroupPoll,
} from "../lib/crewFeatures";
import { sendGroupMessage } from "../lib/data";
import { supabase } from "../lib/supabase";
import { confirmInApp } from "./InAppDialog";
import { Field, Modal } from "./ui";

export function PollCard({
  poll,
  user,
  canModerate,
  isOwner,
  onChanged,
  onNotice,
  inline = false,
}) {
  const pollOptions = Array.isArray(poll?.options) ? poll.options : [];
  const total = pollOptions.reduce(
    (sum, option) =>
      sum + (Array.isArray(option?.votes) ? option.votes.length : 0),
    0,
  );
  const mine = pollOptions.find((option) =>
    (option.votes || []).some((vote) => vote.user_id === user.id),
  )?.id;
  const ended =
    Boolean(poll.closed_at) ||
    (poll.closes_at && new Date(poll.closes_at) <= new Date());
  const [busy, setBusy] = useState(false);
  async function remove() {
    const approved = await confirmInApp(
      "This closed poll and all of its votes will be permanently removed.",
      {
        title: "Delete closed poll?",
        confirmLabel: "Delete poll",
        danger: true,
      },
    );
    if (!approved) return;
    setBusy(true);
    try {
      await deleteClosedGroupPoll(poll.id);
      await onChanged();
    } catch (error) {
      onNotice?.(error.message);
    } finally {
      setBusy(false);
    }
  }
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
    <article className={`group-poll-card${inline ? " inline-group-poll" : ""}`}>
      <header>
        <div>
          <BarChart3 />
          <strong>{poll.question}</strong>
        </div>
        <small>
          {ended
            ? "Closed"
            : poll.closes_at
              ? `Ends ${new Date(poll.closes_at).toLocaleString()}`
              : "Open"}
        </small>
      </header>
      <div className="group-poll-options">
        {pollOptions.map((option) => {
          const count = (option.votes || []).length;
          const percent = total ? Math.round((count / total) * 100) : 0;
          return (
            <button
              key={option.id}
              disabled={busy || ended}
              className={mine === option.id ? "selected" : ""}
              onClick={() => vote(option.id)}
            >
              <span className="poll-fill" style={{ width: `${percent}%` }} />
              <span>
                {mine === option.id && <Check />} {option.label}
              </span>
              <small>
                {count} · {percent}%
              </small>
            </button>
          );
        })}
      </div>
      <footer>
        <span>
          {total} {total === 1 ? "vote" : "votes"}
        </span>
        {!ended && (poll.created_by === user.id || canModerate) && (
          <button
            className="poll-close"
            onClick={async () => {
              await closeGroupPoll(poll.id);
              onChanged();
            }}
          >
            Close poll
          </button>
        )}
        {ended && isOwner && (
          <button className="poll-delete" disabled={busy} onClick={remove}>
            <Trash2 /> {busy ? "Deleting…" : "Delete poll"}
          </button>
        )}
      </footer>
    </article>
  );
}

export function InlineGroupPoll({ pollId, groupId, user, role, onNotice }) {
  const [poll, setPoll] = useState(null);
  const [loading, setLoading] = useState(true);
  const load = async () => {
    const rows = await getGroupPolls(groupId);
    setPoll(rows.find((item) => item.id === pollId) || null);
    setLoading(false);
  };
  useEffect(() => {
    load().catch(() => setLoading(false));
    const channel = supabase
      .channel(`inline-poll-${pollId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "group_polls",
          filter: `id=eq.${pollId}`,
        },
        load,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "group_poll_votes",
          filter: `poll_id=eq.${pollId}`,
        },
        load,
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [pollId, groupId]);
  if (loading) return <div className="inline-poll-loading">Loading poll…</div>;
  if (!poll)
    return <div className="inline-poll-removed">This poll was removed.</div>;
  return (
    <PollCard
      poll={poll}
      user={user}
      canModerate={role !== "member"}
      isOwner={role === "owner"}
      onChanged={load}
      onNotice={onNotice}
      inline
    />
  );
}

export default function GroupPolls({
  group,
  user,
  role = "member",
  onNotice,
  open,
  onClose,
}) {
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [options, setOptions] = useState(["", ""]);
  const [polls, setPolls] = useState([]);
  const load = async () => {
    try {
      setPolls(await getGroupPolls(group.id));
    } catch (error) {
      onNotice?.(error.message);
    }
  };
  useEffect(() => {
    load();
    const channel = supabase
      .channel(`desktop-polls-${group.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "group_polls",
          filter: `group_id=eq.${group.id}`,
        },
        load,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "group_poll_votes" },
        load,
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [group.id]);
  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const form = new FormData(event.currentTarget);
      const question = String(form.get("question") || "").trim();
      const pollId = await createGroupPoll(
        group.id,
        user.id,
        question,
        options,
        form.get("duration"),
      );
      await sendGroupMessage(group.id, user.id, `[[crewdeck-poll:${pollId}]]`);
      setCreating(false);
      setOptions(["", ""]);
      await load();
    } catch (error) {
      onNotice?.(error.message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      {open && (
        <Modal
          title={creating ? "Create a group poll" : "Group polls"}
          onClose={() => {
            setCreating(false);
            onClose?.();
          }}
        >
          {!creating ? (
            <section className="group-polls-panel group-polls-modal-panel">
              <div className="group-polls-heading">
                <div>
                  <BarChart3 />
                  <span>
                    <strong>Group decisions</strong>
                    <small>
                      Choose meetup times, games, or worlds together.
                    </small>
                  </span>
                </div>
                <button
                  className="button secondary compact-button"
                  onClick={() => setCreating(true)}
                >
                  <Plus /> Create poll
                </button>
              </div>
              {polls.length ? (
                polls.map((poll) => (
                  <PollCard
                    key={poll.id}
                    poll={poll}
                    user={user}
                    canModerate={role !== "member"}
                    isOwner={role === "owner"}
                    onChanged={load}
                    onNotice={onNotice}
                  />
                ))
              ) : (
                <p className="micro-copy">No polls in this conversation yet.</p>
              )}
            </section>
          ) : (
            <form className="stack-form poll-create-form" onSubmit={submit}>
              <Field label="Question">
                <input
                  name="question"
                  minLength="3"
                  maxLength="180"
                  required
                  autoFocus
                />
              </Field>
              <div className="poll-option-editor">
                {options.map((value, index) => (
                  <div key={index}>
                    <input
                      aria-label={`Choice ${index + 1}`}
                      maxLength="100"
                      required
                      value={value}
                      onChange={(event) =>
                        setOptions((rows) =>
                          rows.map((row, i) =>
                            i === index ? event.target.value : row,
                          ),
                        )
                      }
                    />
                    {options.length > 2 && (
                      <button
                        type="button"
                        className="icon-button"
                        onClick={() =>
                          setOptions((rows) =>
                            rows.filter((_, i) => i !== index),
                          )
                        }
                      >
                        <X />
                      </button>
                    )}
                  </div>
                ))}
                {options.length < 10 && (
                  <button
                    type="button"
                    className="button ghost"
                    onClick={() => setOptions((rows) => [...rows, ""])}
                  >
                    <Plus /> Add choice
                  </button>
                )}
              </div>
              <Field label="Poll duration">
                <select name="duration" defaultValue="24">
                  <option value="">No automatic close</option>
                  <option value="1">1 hour</option>
                  <option value="6">6 hours</option>
                  <option value="24">1 day</option>
                  <option value="72">3 days</option>
                  <option value="168">1 week</option>
                </select>
              </Field>
              <div className="modal-actions">
                <button
                  type="button"
                  className="button ghost"
                  onClick={() => setCreating(false)}
                >
                  Back
                </button>
                <button className="button primary" disabled={saving}>
                  {saving ? "Creating…" : "Create poll"}
                </button>
              </div>
            </form>
          )}
        </Modal>
      )}
    </>
  );
}
