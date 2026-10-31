import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  HandHelping,
  MessageCircle,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { Empty, Field, Modal, PageHeader } from "../components/ui";

const CATEGORIES = {
  technical: "Technical help",
  event: "Event assistance",
  conflict: "Conflict support",
  accessibility: "Accessibility accommodation",
  onboarding: "Onboarding help",
};
const STATUS = {
  waiting: "Waiting for a helper",
  claimed: "Claimed",
  awaiting_member: "Waiting for your response",
  resolved: "Resolved",
  closed: "Closed",
  withdrawn: "Withdrawn",
  escalated: "Escalated with notice",
};
const fileBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

export default function SupportRequestsPage({ user, profile }) {
  const [requests, setRequests] = useState([]),
    [selected, setSelected] = useState(null),
    [messages, setMessages] = useState([]),
    [attachments, setAttachments] = useState([]),
    [feedback, setFeedback] = useState(null),
    [createOpen, setCreateOpen] = useState(false),
    [escalating, setEscalating] = useState(false),
    [transferOpen, setTransferOpen] = useState(false),
    [transferCandidates, setTransferCandidates] = useState([]),
    [notice, setNotice] = useState(""),
    [helperPermissions, setHelperPermissions] = useState(null);
  async function load() {
    const [{ data, error }, { data: permission }] = await Promise.all([
      supabase
        .from("community_support_requests")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase
        .from("support_helper_permissions")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);
    setRequests(data || []);
    setHelperPermissions(permission || null);
    setNotice(error?.message || "");
    if (selected)
      setSelected((data || []).find((row) => row.id === selected.id) || null);
  }
  async function loadDetails(id) {
    const [
      { data: messageRows },
      { data: attachmentRows },
      { data: feedbackRow },
    ] = await Promise.all([
      supabase
        .from("community_support_messages")
        .select("*")
        .eq("request_id", id)
        .order("created_at"),
      supabase
        .from("community_support_attachments")
        .select("*")
        .eq("request_id", id)
        .order("created_at"),
      supabase
        .from("community_support_feedback")
        .select("*")
        .eq("request_id", id)
        .maybeSingle(),
    ]);
    setMessages(messageRows || []);
    setAttachments(attachmentRows || []);
    setFeedback(feedbackRow || null);
  }
  useEffect(() => {
    load();
    const channel = supabase
      .channel(`support-requests-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "community_support_requests" },
        load,
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "community_support_messages",
        },
        (payload) => {
          if (payload.new.request_id === selected?.id)
            setMessages((rows) => [...rows, payload.new]);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "community_support_attachments",
        },
        (payload) => {
          const requestId = payload.new?.request_id || payload.old?.request_id;
          if (requestId === selected?.id) loadDetails(selected.id);
        },
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [user.id, selected?.id]);
  useEffect(() => {
    if (selected) loadDetails(selected.id);
  }, [selected?.id]);
  const captain = String(profile?.rank).toLowerCase() === "captain";
  const canHelpCategory = (category) =>
    captain || Boolean(helperPermissions?.[category]);
  const isHelper = captain || Boolean(helperPermissions);
  const canHelpSelected =
    selected &&
    selected.requester_id !== user.id &&
    canHelpCategory(selected.category);
  async function create(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const files = [
      ...(event.currentTarget.querySelector('[name="attachments"]')?.files ||
        []),
    ].slice(0, 4);
    const { data, error } = await supabase
      .from("community_support_requests")
      .insert({
        requester_id: user.id,
        category: form.get("category"),
        urgency: form.get("urgency"),
        preferred_contact: form.get("contact"),
        subject: String(form.get("subject")).trim(),
        description: String(form.get("description")).trim(),
      })
      .select()
      .single();
    setNotice(error?.message || "Your private request was submitted.");
    if (!error) {
      for (const file of files) {
        if (file.size > 10485760) continue;
        const upload = await supabase.functions.invoke(
          "support-request-attachment",
          {
            body: {
              requestId: data.id,
              fileName: file.name,
              mimeType: file.type,
              base64: await fileBase64(file),
            },
          },
        );
        if (upload.error)
          setNotice(
            `Request created, but ${file.name} was rejected by attachment scanning.`,
          );
      }
      setCreateOpen(false);
      await supabase
        .from("community_support_audit")
        .insert({ request_id: data.id, actor_id: user.id, action: "created" });
      await load();
      setSelected(data);
    }
  }
  async function transition(status, extra = {}) {
    const next = { status, updated_at: new Date().toISOString(), ...extra };
    if (status === "resolved") next.resolved_at = new Date().toISOString();
    if (["closed", "withdrawn"].includes(status)) {
      next.closed_at = new Date().toISOString();
      next.retention_until = new Date(Date.now() + 30 * 86400000).toISOString();
    }
    const { error } = await supabase
      .from("community_support_requests")
      .update(next)
      .eq("id", selected.id);
    if (!error) {
      await supabase.from("community_support_audit").insert({
        request_id: selected.id,
        actor_id: user.id,
        action: status,
        details: extra,
      });
      await load();
    }
    setNotice(error?.message || `Request marked ${STATUS[status] || status}.`);
  }
  async function send(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget),
      body = String(form.get("body") || "").trim();
    if (!body) return;
    const { error } = await supabase
      .from("community_support_messages")
      .insert({ request_id: selected.id, sender_id: user.id, body });
    if (!error) {
      event.currentTarget.reset();
      if (canHelpSelected && selected.status === "claimed")
        await transition("awaiting_member");
    } else setNotice(error.message);
  }
  async function claim() {
    await transition("claimed", { assigned_helper_id: user.id });
  }
  async function openTransfer() {
    const { data, error } = await supabase.rpc(
      "list_support_transfer_helpers",
      { target_request: selected.id },
    );
    if (error) {
      setNotice(error.message);
      return;
    }
    setTransferCandidates(data || []);
    setTransferOpen(true);
  }
  async function transfer(event) {
    event.preventDefault();
    const targetHelper = String(
      new FormData(event.currentTarget).get("helper") || "",
    );
    if (!targetHelper) return;
    const { error } = await supabase.rpc("transfer_support_request", {
      target_request: selected.id,
      target_helper: targetHelper,
    });
    setNotice(error?.message || "Request transferred privately.");
    if (!error) {
      setTransferOpen(false);
      await load();
    }
  }
  async function openAttachment(attachment) {
    const { data, error } = await supabase.functions.invoke(
      "support-request-attachment",
      {
        body: {
          action: "download",
          requestId: selected.id,
          attachmentId: attachment.id,
        },
      },
    );
    if (error || !data?.url) {
      setNotice(error?.message || "This attachment could not be opened.");
      return;
    }
    window.open(data.url, "_blank", "noopener,noreferrer");
  }
  async function deleteAttachment(attachment) {
    const { error } = await supabase.functions.invoke(
      "support-request-attachment",
      {
        body: {
          action: "delete",
          requestId: selected.id,
          attachmentId: attachment.id,
        },
      },
    );
    setNotice(error?.message || "Attachment removed.");
    if (!error) await loadDetails(selected.id);
  }
  async function submitFeedback(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const { data, error } = await supabase
      .from("community_support_feedback")
      .upsert(
        {
          request_id: selected.id,
          requester_id: user.id,
          rating: Number(form.get("rating")),
          note: String(form.get("note") || "").trim() || null,
        },
        { onConflict: "request_id" },
      )
      .select()
      .single();
    setNotice(error?.message || "Private feedback saved. Thank you.");
    if (!error) setFeedback(data);
  }
  const open = useMemo(
    () => requests.filter((r) => !["closed", "withdrawn"].includes(r.status)),
    [requests],
  );
  return (
    <div className="page support-requests-page">
      <PageHeader
        eyebrow="Private crew support"
        title="Community Support Requests"
        description="Ask permitted helpers for private technical, event, conflict, accessibility, or onboarding support."
        action={
          <div className="button-row">
            <button className="icon-button" onClick={load} aria-label="Refresh">
              <RefreshCw />
            </button>
            <button
              className="button primary"
              onClick={() => setCreateOpen(true)}
            >
              <HandHelping /> New request
            </button>
          </div>
        }
      />
      {notice && (
        <p className="form-message" role="status">
          {notice}
        </p>
      )}
      <div className="support-request-layout">
        <section className="panel support-request-list">
          <h2>{isHelper ? "Permitted helper queue" : "Your requests"}</h2>
          {open.length ? (
            open.map((item) => (
              <button
                className={selected?.id === item.id ? "active" : ""}
                key={item.id}
                onClick={() => setSelected(item)}
              >
                <span>
                  <strong>{item.subject}</strong>
                  <small>
                    {CATEGORIES[item.category]} · {STATUS[item.status]}
                  </small>
                </span>
                <time>{new Date(item.created_at).toLocaleDateString()}</time>
              </button>
            ))
          ) : (
            <Empty
              title="No support requests"
              body="Private requests will appear here."
            />
          )}
        </section>
        <section className="panel support-request-detail">
          {selected ? (
            <>
              <header>
                <span>
                  <small>
                    {CATEGORIES[selected.category]} · {selected.urgency}
                  </small>
                  <h2>{selected.subject}</h2>
                  <p>{selected.description}</p>
                </span>
                <span className={`support-status ${selected.status}`}>
                  {STATUS[selected.status]}
                </span>
              </header>
              <div className="support-request-actions">
                {canHelpSelected && !selected.assigned_helper_id && (
                  <button onClick={claim}>
                    <ShieldCheck /> Claim
                  </button>
                )}
                {canHelpSelected && selected.assigned_helper_id === user.id && (
                  <>
                    <button
                      onClick={() =>
                        transition("waiting", { assigned_helper_id: null })
                      }
                    >
                      Release
                    </button>
                    <button onClick={() => transition("resolved")}>
                      Resolve
                    </button>
                    <button onClick={openTransfer}>Transfer</button>
                    <button onClick={() => setEscalating(true)}>
                      <ArrowUpRight /> Escalate with notice
                    </button>
                  </>
                )}
                {selected.requester_id === user.id &&
                  !["closed", "withdrawn"].includes(selected.status) && (
                    <button
                      className="danger"
                      onClick={() => transition("withdrawn")}
                    >
                      Withdraw request
                    </button>
                  )}
                {selected.requester_id === user.id &&
                  selected.status === "resolved" && (
                    <button onClick={() => transition("closed")}>
                      Close request
                    </button>
                  )}
                {canHelpSelected &&
                  ["resolved", "closed"].includes(selected.status) && (
                    <button onClick={() => transition("claimed")}>
                      Reopen
                    </button>
                  )}
              </div>
              {attachments.length > 0 && (
                <section className="support-attachments">
                  <h3>Private attachments</h3>
                  <div className="support-attachment-list">
                    {attachments.map((attachment) => (
                      <div key={attachment.id}>
                        <button onClick={() => openAttachment(attachment)}>
                          {attachment.file_name}
                        </button>
                        {(attachment.uploader_id === user.id ||
                          selected.assigned_helper_id === user.id) && (
                          <button
                            className="danger"
                            onClick={() => deleteAttachment(attachment)}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}
              <div className="support-thread">
                {messages.map((message) => (
                  <article
                    className={message.sender_id === user.id ? "mine" : ""}
                    key={message.id}
                  >
                    <MessageCircle />
                    <p>{message.body}</p>
                    <time>{new Date(message.created_at).toLocaleString()}</time>
                  </article>
                ))}
              </div>
              {!["closed", "withdrawn"].includes(selected.status) && (
                <form className="support-reply" onSubmit={send}>
                  <textarea
                    name="body"
                    rows="3"
                    maxLength="4000"
                    placeholder="Write a private reply…"
                    required
                  />
                  <button className="button primary">Send reply</button>
                </form>
              )}
              {selected.requester_id === user.id &&
                ["resolved", "closed"].includes(selected.status) && (
                  <form className="support-feedback" onSubmit={submitFeedback}>
                    <h3>Private feedback</h3>
                    <Field label="How helpful was the support?">
                      <select
                        name="rating"
                        defaultValue={String(feedback?.rating || 5)}
                      >
                        <option value="5">5 · Very helpful</option>
                        <option value="4">4 · Helpful</option>
                        <option value="3">3 · Okay</option>
                        <option value="2">2 · Could be better</option>
                        <option value="1">1 · Not helpful</option>
                      </select>
                    </Field>
                    <Field label="Optional note">
                      <textarea
                        name="note"
                        rows="3"
                        maxLength="1000"
                        defaultValue={feedback?.note || ""}
                      />
                    </Field>
                    <button className="button primary">Save feedback</button>
                  </form>
                )}
            </>
          ) : (
            <Empty
              title="Choose a request"
              body="Its private conversation and status history will appear here."
            />
          )}
        </section>
      </div>
      {createOpen && (
        <Modal
          title="Request private community support"
          onClose={() => setCreateOpen(false)}
        >
          <form className="stack-form" onSubmit={create}>
            <Field label="Support category">
              <select name="category">
                {Object.entries(CATEGORIES).map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <div className="form-grid">
              <Field label="Urgency">
                <select name="urgency">
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </Field>
              <Field label="Preferred contact">
                <select name="contact">
                  <option value="crewdeck">CrewDeck</option>
                  <option value="discord">Discord</option>
                  <option value="email">Email</option>
                  <option value="voice">Voice</option>
                </select>
              </Field>
            </div>
            <Field label="Subject">
              <input name="subject" minLength="3" maxLength="120" required />
            </Field>
            <Field label="Private description">
              <textarea
                name="description"
                minLength="10"
                maxLength="5000"
                rows="7"
                required
              />
            </Field>
            <Field
              label="Optional attachments"
              hint="Up to four safe files · 10 MB each"
            >
              <input
                name="attachments"
                type="file"
                multiple
                accept="image/png,image/jpeg,image/webp,application/pdf,text/plain,application/zip"
              />
            </Field>
            <button className="button primary">Submit private request</button>
          </form>
        </Modal>
      )}
      {escalating && selected && (
        <Modal
          title="Escalate with a clear notice"
          onClose={() => setEscalating(false)}
        >
          <form
            className="stack-form"
            onSubmit={(event) => {
              event.preventDefault();
              const reason = String(
                new FormData(event.currentTarget).get("reason") || "",
              ).trim();
              if (reason) {
                transition("escalated", {
                  escalated_to_moderation: true,
                  escalation_reason: reason,
                });
                setEscalating(false);
              }
            }}
          >
            <p>
              The requester will see that this request was escalated. Explain
              why Captain or moderation review is necessary.
            </p>
            <Field label="Escalation reason">
              <textarea
                name="reason"
                minLength="10"
                maxLength="1000"
                rows="5"
                required
              />
            </Field>
            <button className="button primary">
              <ArrowUpRight /> Escalate request
            </button>
          </form>
        </Modal>
      )}
      {transferOpen && selected && (
        <Modal
          title="Transfer private support request"
          onClose={() => setTransferOpen(false)}
        >
          <form className="stack-form" onSubmit={transfer}>
            <p>
              Only helpers permitted for {CATEGORIES[selected.category]} are
              listed. The requester will see that the assigned helper changed.
            </p>
            <Field label="New helper">
              <select name="helper" required defaultValue="">
                <option value="" disabled>
                  Choose a permitted helper
                </option>
                {transferCandidates.map((person) => (
                  <option value={person.user_id} key={person.user_id}>
                    {person.username}
                  </option>
                ))}
              </select>
            </Field>
            {transferCandidates.length ? (
              <button className="button primary">Transfer request</button>
            ) : (
              <p className="form-message">
                No other helpers are permitted for this category.
              </p>
            )}
          </form>
        </Modal>
      )}
    </div>
  );
}
