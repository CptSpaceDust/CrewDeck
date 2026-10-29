import { useEffect, useRef, useState } from "react";
import {
  AtSign,
  BellOff,
  CalendarClock,
  History,
  Mic,
  Paperclip,
  Plus,
  Send,
  Square,
  Timer,
  Trash2,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { shouldSendOnEnter } from "../lib/messageBehavior.mjs";
import {
  getPreferences,
  loadDraft,
  markConversationRead,
  saveDraft,
} from "../lib/preferences";
import {
  cancelScheduledConversationMessage,
  getScheduledConversationMessages,
} from "../lib/crewFeatures";

export const activeConversation = { current: null };

function formattedParts(source, prefix = "format") {
  const parts = [];
  const pattern = /\*\*([^*\n]+)\*\*|\*([^*\n]+)\*|\|\|([^|\n]+)\|\|/g;
  let cursor = 0;
  for (const match of source.matchAll(pattern)) {
    parts.push(source.slice(cursor, match.index));
    parts.push(match[1] !== undefined ? <strong key={`${prefix}-${match.index}`}><em>{match[1]}</em></strong> : match[2] !== undefined ? <em key={`${prefix}-${match.index}`}>{match[2]}</em> : <strong key={`${prefix}-${match.index}`}>{match[3]}</strong>);
    cursor = match.index + match[0].length;
  }
  parts.push(source.slice(cursor));
  return parts;
}

export function FormattedMessage({ children, mentions = [] }) {
  const source = String(children ?? "");
  if (!mentions.length) return <span className="formatted-message">{formattedParts(source)}</span>;
  const tokens = mentions.map((mention) => ({ ...mention, token: mention.mention_kind === "user" ? `@${mention.username_snapshot}` : `@${mention.mention_kind}` })).sort((a, b) => b.token.length - a.token.length);
  const pattern = new RegExp(tokens.map((item) => item.token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "gi");
  const parts = [];
  let cursor = 0;
  for (const match of source.matchAll(pattern)) {
    parts.push(...formattedParts(source.slice(cursor, match.index), `before-${match.index}`));
    const mention = tokens.find((item) => item.token.toLowerCase() === match[0].toLowerCase());
    const label = mention?.mention_kind === "user" ? mention.username_snapshot : mention?.mention_kind;
    parts.push(mention?.account_deleted
      ? <span key={`mention-${match.index}`} className="message-mention deleted" aria-label="Mentioned former member"><AtSign />Former member</span>
      : <a key={`mention-${match.index}`} className="message-mention" href={`Profile.html?id=${encodeURIComponent(mention?.mentioned_user_id || "")}`} aria-label={`Mentioned ${label || "former member"}`}><AtSign />{label}</a>);
    cursor = match.index + match[0].length;
  }
  parts.push(...formattedParts(source.slice(cursor), "after"));
  return <span className="formatted-message">{parts}</span>;
}

export function MessageReplyQuote({
  message,
  messages,
  people,
  className = "message-reply-quote",
  mentions = [],
}) {
  if (!message.is_reply && !message.reply_to_id) return null;
  const original = messages.find((item) => item.id === message.reply_to_id);
  const author =
    original && people.find((person) => person.id === original.sender_id);
  return (
    <blockquote className={className}>
      <strong>
        {original
          ? `Replying to ${author?.username || "Former member"}`
          : "Original message unavailable"}
      </strong>
      <span>
        {original ? (
          <FormattedMessage mentions={mentions.filter((mention) => mention.message_id === original.id)}>{original.content}</FormattedMessage>
        ) : (
          "Deleted or expired"
        )}
      </span>
    </blockquote>
  );
}

export function MessageNotices() {
  return (
    <aside className="message-notices">
      <p>
        <strong>Message Retention</strong> Messages are automatically deleted
        after 5 days due to storage limits. This applies to all conversations.
      </p>
      <p>
        <strong>Auto deleted messages cannot be recovered</strong> After the
        retention period, the Captain cannot restore deleted messages.
      </p>
    </aside>
  );
}

export default function MessageComposer({
  id,
  group = false,
  user,
  people,
  placeholder,
  onSend,
  onSendAttachment,
  onNotice,
  blockedUntil = 0,
  canBroadcast = false,
}) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [enterToSend, setEnterToSend] = useState(
    getPreferences().enterToSend !== false,
  );
  const [typers, setTypers] = useState({});
  const [clock, setClock] = useState(Date.now());
  const [silent, setSilent] = useState(false);
  const [sendAt, setSendAt] = useState("");
  const [expiresInMinutes, setExpiresInMinutes] = useState("");
  const [scheduled, setScheduled] = useState([]);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [nativeShareFile, setNativeShareFile] = useState(null);
  const [pendingAttachments, setPendingAttachments] = useState([]);
  const [selectedMentions, setSelectedMentions] = useState([]);
  const [mentionQuery, setMentionQuery] = useState(null);
  const [broadcastKind, setBroadcastKind] = useState(null);
  const recorderRef = useRef(null);
  const recordingStartedRef = useRef(0);
  const pendingAttachmentsRef = useRef([]);
  const channelRef = useRef(null);
  const inputRef = useRef(null);
  const sendingRef = useRef(false);
  const lastInput = useRef(0);
  const draftRef = useRef("");
  useEffect(() => {
    const sync = (event) =>
      setEnterToSend((event.detail || getPreferences()).enterToSend !== false);
    window.addEventListener("desktop-preferences", sync);
    return () => window.removeEventListener("desktop-preferences", sync);
  }, []);
  useEffect(() => {
    window.desktop?.shareTarget?.get?.().then((target) => {
      if (!target?.base64 || !target?.mimeType) return;
      const bytes = Uint8Array.from(atob(target.base64), (character) =>
        character.charCodeAt(0),
      );
      setNativeShareFile(
        new File([bytes], target.name || "shared-file", {
          type: target.mimeType,
        }),
      );
    });
  }, [id]);
  useEffect(() => {
    setPendingAttachments((current) => {
      current.forEach((item) => URL.revokeObjectURL(item.previewUrl));
      return [];
    });
  }, [id, group]);
  useEffect(() => {
    pendingAttachmentsRef.current = pendingAttachments;
  }, [pendingAttachments]);
  useEffect(
    () => () => {
      pendingAttachmentsRef.current.forEach((item) =>
        URL.revokeObjectURL(item.previewUrl),
      );
    },
    [],
  );
  useEffect(() => {
    let alive = true,
      ready = false;
    const context = { id, group };
    activeConversation.current = context;
    const savedDraft = loadDraft(user.id, id, group);
    setDraft(savedDraft);
    draftRef.current = savedDraft;
    markConversationRead(id, group);
    setTypers({});
    setSelectedMentions([]);
    setMentionQuery(null);
    setBroadcastKind(null);
    const channel = supabase.channel(
      group ? `group-chat-${id}` : `conversation-${id}`,
      { config: { private: true } },
    );
    channel.on("broadcast", { event: "typing" }, ({ payload }) => {
      const sender = group ? payload?.userId : payload?.user_id;
      if (!alive || !sender || sender === user.id) return;
      setTypers((previous) => ({
        ...previous,
        [sender]: payload.typing ? Date.now() + 3000 : 0,
      }));
    });
    let lastSent = 0,
      wasTyping = false;
    const sendTyping = (typing) => {
      if (
        !ready ||
        (typing && wasTyping && Date.now() - lastSent < 700) ||
        (!typing && !wasTyping)
      )
        return;
      lastSent = Date.now();
      wasTyping = typing;
      channel
        .send({
          type: "broadcast",
          event: "typing",
          payload: group
            ? { userId: user.id, typing }
            : { user_id: user.id, typing },
        })
        .catch(() => {});
    };
    channelRef.current = sendTyping;
    supabase.realtime
      .setAuth()
      .then(() => {
        if (alive)
          channel.subscribe((status) => {
            ready = status === "SUBSCRIBED";
          });
      })
      .catch(() => {});
    const timer = setInterval(() => {
      sendTyping(
        Boolean(draftRef.current.trim()) &&
          Date.now() - lastInput.current < 2500,
      );
      setTypers((previous) =>
        Object.fromEntries(
          Object.entries(previous).filter(([, expiry]) => expiry > Date.now()),
        ),
      );
    }, 1000);
    return () => {
      sendTyping(false);
      alive = false;
      clearInterval(timer);
      channelRef.current = null;
      if (activeConversation.current === context)
        activeConversation.current = null;
      supabase.removeChannel(channel);
    };
  }, [id, group, user.id]);
  async function loadComposerHistory() {
    const kind = group ? "group" : "dm";
    const scheduledRows = await getScheduledConversationMessages(
      user.id,
      kind,
      id,
    );
    setScheduled(scheduledRows || []);
  }
  useEffect(() => {
    if (!toolsOpen) return;
    loadComposerHistory().catch(() => {});
  }, [toolsOpen, id, group, user.id]);
  useEffect(() => {
    setClock(Date.now());
    if (blockedUntil <= Date.now()) return undefined;
    const timer = window.setInterval(() => {
      const now = Date.now();
      setClock(now);
      if (now >= blockedUntil) window.clearInterval(timer);
    }, 250);
    return () => window.clearInterval(timer);
  }, [blockedUntil]);
  useEffect(() => {
    const markReadWhenVisible = () => {
      if (!document.hidden && document.hasFocus())
        markConversationRead(id, group);
    };
    window.addEventListener("focus", markReadWhenVisible);
    document.addEventListener("visibilitychange", markReadWhenVisible);
    return () => {
      window.removeEventListener("focus", markReadWhenVisible);
      document.removeEventListener("visibilitychange", markReadWhenVisible);
    };
  }, [id, group]);
  const names = Object.keys(typers)
    .filter(
      (key) =>
        typers[key] > Date.now() && people.some((person) => person.id === key),
    )
    .map(
      (key) =>
        people.find((person) => person.id === key)?.username || "Someone",
    );
  const slowModeSeconds = Math.max(
    0,
    Math.ceil((Number(blockedUntil) - clock) / 1000),
  );
  async function submit(event) {
    event.preventDefault();
    if (
      sendingRef.current ||
      (!draft.trim() && !pendingAttachments.length) ||
      slowModeSeconds > 0
    )
      return;
    if (pendingAttachments.length && sendAt) {
      onNotice?.(
        "Attachments cannot be scheduled. Clear the schedule or send the attachment now.",
      );
      return;
    }
    sendingRef.current = true;
    setBusy(true);
    try {
      const content = draft.trim();
      const sent = pendingAttachments.length
        ? await onSendAttachment?.(
            pendingAttachments.map(
              ({ file, durationSeconds, id: uploadId }) => ({
                file,
                durationSeconds,
                uploadId,
              }),
            ),
            {
              silent,
              content,
              mentionIds: selectedMentions.map((item) => item.id),
              broadcastKind,
              expiresInMinutes: expiresInMinutes
                ? Number(expiresInMinutes)
                : null,
              onProgress: (uploadId, progress, uploading = true) =>
                setPendingAttachments((current) =>
                  current.map((item) =>
                    item.id === uploadId
                      ? { ...item, uploading, progress }
                      : item,
                  ),
                ),
            },
          )
        : await onSend(event, {
            silent,
            sendAt,
            mentionIds: selectedMentions.map((item) => item.id),
            broadcastKind,
            expiresInMinutes: expiresInMinutes
              ? Number(expiresInMinutes)
              : null,
          });
      if (sent !== false) {
        setDraft("");
        draftRef.current = "";
        saveDraft(user.id, id, group, "");
        setPendingAttachments((current) => {
          current.forEach((item) => URL.revokeObjectURL(item.previewUrl));
          return [];
        });
        channelRef.current?.(false);
        setSilent(false);
        setSendAt("");
        setExpiresInMinutes("");
        setSelectedMentions([]);
        setBroadcastKind(null);
        setMentionQuery(null);
        if (toolsOpen) await loadComposerHistory().catch(() => {});
      }
    } finally {
      sendingRef.current = false;
      setBusy(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }
  function queueAttachment(file, durationSeconds = null) {
    if (!file || !onSendAttachment) return;
    if (file.size > 10 * 1024 * 1024) {
      onNotice?.("Choose a file that is 10 MB or smaller.");
      return;
    }
    setPendingAttachments((current) => {
      if (current.length >= 10) {
        onNotice?.("You can attach up to 10 files to one message.");
        return current;
      }
      return [
        ...current,
        {
          id: crypto.randomUUID(),
          file,
          durationSeconds,
          previewUrl: URL.createObjectURL(file),
          progress: 0,
          uploading: false,
        },
      ];
    });
    setDeliveryOpen(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  }
  async function toggleRecording() {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      onNotice?.("Voice recording is unavailable on this device.");
      return;
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    const chunks = [];
    const recorder = new MediaRecorder(stream, {
      mimeType: MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "",
    });
    recorderRef.current = recorder;
    recordingStartedRef.current = Date.now();
    setRecording(true);
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    recorder.onstop = async () => {
      stream.getTracks().forEach((track) => track.stop());
      setRecording(false);
      recorderRef.current = null;
      const blob = new Blob(chunks, {
        type: recorder.mimeType || "audio/webm",
      });
      const file = new File([blob], `voice-message-${Date.now()}.webm`, {
        type: blob.type,
      });
      queueAttachment(file, (Date.now() - recordingStartedRef.current) / 1000);
    };
    recorder.start();
  }
  const mentionSuggestions = mentionQuery === null ? [] : [
    ...(canBroadcast ? [{ id: "everyone", username: "everyone", broadcast: true }, { id: "here", username: "here", broadcast: true }] : []),
    ...people.filter((person) => person.id !== user.id),
  ].filter((person) => person.username?.toLowerCase().startsWith(mentionQuery.toLowerCase())).slice(0, 8);
  function chooseMention(person) {
    const textarea = inputRef.current;
    const cursor = textarea?.selectionStart ?? draft.length;
    const before = draft.slice(0, cursor).replace(/@[a-zA-Z0-9_]*$/, `@${person.username} `);
    const next = before + draft.slice(cursor);
    setDraft(next); draftRef.current = next; saveDraft(user.id, id, group, next);
    if (person.broadcast) setBroadcastKind(person.id);
    else setSelectedMentions((current) => current.some((item) => item.id === person.id) ? current : [...current, person]);
    setMentionQuery(null);
    requestAnimationFrame(() => { textarea?.focus(); textarea?.setSelectionRange(before.length, before.length); });
  }
  return (
    <>
      <div className="desktop-typing" role="status" aria-live="polite">
        {slowModeSeconds > 0
          ? `Slow mode · send again in ${slowModeSeconds}s`
          : names.length > 1
            ? "Many people typing…"
            : names.length
              ? `${names[0]} is typing…`
              : ""}
      </div>
      <form className="composer" onSubmit={submit}>
        {(selectedMentions.length > 0 || broadcastKind) && <div className="composer-mention-chips" aria-label="Mentions in this message">{broadcastKind && <button type="button" onClick={() => setBroadcastKind(null)} aria-label={`Remove ${broadcastKind} mention`}><AtSign />{broadcastKind} · {people.filter((person) => person.id !== user.id).length} eligible ×</button>}{selectedMentions.map((person) => <button type="button" key={person.id} onClick={() => setSelectedMentions((current) => current.filter((item) => item.id !== person.id))} aria-label={`Remove mention for ${person.username}`}><AtSign />{person.username} ×</button>)}</div>}
        {pendingAttachments.length > 0 && (
          <div
            className="pending-message-attachments"
            aria-label="Attachments waiting to send"
          >
            {pendingAttachments.map((pendingAttachment) => (
              <div
                className="pending-message-attachment"
                key={pendingAttachment.id}
              >
                <div className="pending-message-attachment-preview">
                  {pendingAttachment.file.type.startsWith("image/") ? (
                    <img
                      src={pendingAttachment.previewUrl}
                      alt="Attachment preview"
                    />
                  ) : pendingAttachment.file.type.startsWith("video/") ? (
                    <video
                      src={pendingAttachment.previewUrl}
                      muted
                      playsInline
                    />
                  ) : pendingAttachment.file.type.startsWith("audio/") ? (
                    <Mic />
                  ) : (
                    <Paperclip />
                  )}
                </div>
                <span>
                  <strong>
                    {pendingAttachment.durationSeconds
                      ? "Voice message ready"
                      : "Attachment ready"}
                  </strong>
                  <small>{pendingAttachment.file.name}</small>
                  {pendingAttachment.uploading && (
                    <>
                      <progress
                        max="100"
                        value={pendingAttachment.progress}
                        aria-label={`Upload progress for ${pendingAttachment.file.name}`}
                      />
                      <small className="message-upload-progress-label">
                        {Math.round(pendingAttachment.progress)}%
                      </small>
                    </>
                  )}
                </span>
                <button
                  type="button"
                  disabled={busy}
                  aria-label={`Remove ${pendingAttachment.file.name}`}
                  title="Remove attachment"
                  onClick={() =>
                    setPendingAttachments((current) => {
                      const match = current.find(
                        (item) => item.id === pendingAttachment.id,
                      );
                      if (match) URL.revokeObjectURL(match.previewUrl);
                      return current.filter(
                        (item) => item.id !== pendingAttachment.id,
                      );
                    })
                  }
                >
                  <Trash2 />
                </button>
              </div>
            ))}
            {pendingAttachments.some((item) => item.uploading) && (
              <div
                className="message-upload-total"
                role="status"
                aria-live="polite"
              >
                <span>
                  Uploading {pendingAttachments.length} attachment
                  {pendingAttachments.length === 1 ? "" : "s"}
                </span>
                <progress
                  max="100"
                  value={
                    pendingAttachments.reduce(
                      (sum, item) => sum + item.progress,
                      0,
                    ) / pendingAttachments.length
                  }
                />
              </div>
            )}
          </div>
        )}
        <button
          type="button"
          className={`composer-tools-toggle${deliveryOpen ? " active" : ""}`}
          aria-label="Message tools"
          aria-expanded={deliveryOpen}
          onClick={() => setDeliveryOpen((value) => !value)}
        >
          <Plus />
        </button>
        <textarea
          ref={inputRef}
          name="message"
          rows="1"
          maxLength="900"
          value={draft}
          disabled={busy}
          placeholder={placeholder}
          onChange={(event) => {
            setDraft(event.target.value);
            const nextValue = event.target.value.toLowerCase();
            setSelectedMentions((current) =>
              current.filter((person) =>
                nextValue.includes(`@${person.username}`.toLowerCase()),
              ),
            );
            if (
              broadcastKind &&
              !nextValue.includes(`@${broadcastKind}`.toLowerCase())
            )
              setBroadcastKind(null);
            draftRef.current = event.target.value;
            saveDraft(user.id, id, group, event.target.value);
            lastInput.current = Date.now();
            channelRef.current?.(Boolean(event.target.value.trim()));
            const cursor = event.target.selectionStart;
            const match = event.target.value.slice(0, cursor).match(/@([a-zA-Z0-9_]*)$/);
            setMentionQuery(match ? match[1] : null);
          }}
          onBlur={() => {
            lastInput.current = 0;
            channelRef.current?.(false);
          }}
          onKeyDown={(event) => {
            const send = enterToSend
              ? shouldSendOnEnter(event.nativeEvent)
              : event.key === "Enter" &&
                event.ctrlKey &&
                !event.nativeEvent.isComposing;
            if (send) {
              event.preventDefault();
              event.currentTarget.form.requestSubmit();
            }
          }}
        />
        {mentionSuggestions.length > 0 && <div className="mention-suggestion-menu" role="listbox" aria-label="Mention a conversation member">{mentionSuggestions.map((person) => <button type="button" role="option" key={person.id} onMouseDown={(event) => event.preventDefault()} onClick={() => chooseMention(person)} aria-label={person.broadcast ? `Mention ${person.username}; ${people.filter((item) => item.id !== user.id).length} eligible recipients` : `Mention ${person.username}`}><AtSign /><span><strong>@{person.username}</strong><small>{person.broadcast ? `${people.filter((item) => item.id !== user.id).length} eligible recipients` : "Mention this member"}</small></span></button>)}</div>}
        <button
          className="send-button"
          disabled={
            busy ||
            (!draft.trim() && !pendingAttachments.length) ||
            slowModeSeconds > 0
          }
          aria-label="Send message"
        >
          <Send />
        </button>
        {deliveryOpen && (
          <div
            className="composer-delivery-controls"
            role="group"
            aria-label="Message tools"
          >
            {nativeShareFile && (
              <button
                type="button"
                className="native-share-target"
                disabled={busy}
                onClick={async () => {
                  queueAttachment(nativeShareFile);
                  setNativeShareFile(null);
                }}
              >
                <Paperclip /> Send {nativeShareFile.name}
              </button>
            )}
            <label className="composer-file-button">
              <Paperclip />
              <span>Attach file</span>
              <input
                type="file"
                multiple
                accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/quicktime,audio/*,application/pdf,text/plain"
                disabled={busy}
                onChange={(event) => {
                  const files = [...(event.target.files || [])];
                  event.target.value = "";
                  files.forEach((file) => queueAttachment(file));
                }}
              />
            </label>
            <button
              type="button"
              className={recording ? "active" : ""}
              onClick={() =>
                toggleRecording().catch((error) =>
                  onNotice?.(error.message || "Unable to start recording."),
                )
              }
            >
              {recording ? <Square /> : <Mic />}
              {recording ? "Stop recording" : "Voice message"}
            </button>
            <button
              type="button"
              className={silent ? "active" : ""}
              aria-pressed={silent}
              onClick={() => setSilent((value) => !value)}
            >
              <BellOff /> {silent ? "Sending silently" : "Send silently"}
            </button>
            <label>
              <CalendarClock />
              <span>Schedule</span>
              <input
                type="datetime-local"
                value={sendAt}
                min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
                onChange={(event) => setSendAt(event.target.value)}
              />
            </label>
            <label>
              <Timer />
              <span>Expires</span>
              <select
                value={expiresInMinutes}
                onChange={(event) => setExpiresInMinutes(event.target.value)}
              >
                <option value="">After 5 days</option>
                <option value="15">After 15 minutes</option>
                <option value="60">After 1 hour</option>
                <option value="360">After 6 hours</option>
                <option value="1440">After 1 day</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() => {
                setToolsOpen((value) => !value);
                setDeliveryOpen(false);
              }}
            >
              <History /> Scheduled messages
            </button>
          </div>
        )}
      </form>
      {toolsOpen && (
        <section className="composer-history-panel">
          <div>
            <h4>Scheduled messages</h4>
            {scheduled.length ? (
              scheduled.map((item) => (
                <article key={item.id}>
                  <span>
                    <strong>{item.content}</strong>
                    <small>{new Date(item.send_at).toLocaleString()}</small>
                  </span>
                  <button
                    type="button"
                    title="Cancel scheduled message"
                    onClick={async () => {
                      await cancelScheduledConversationMessage(
                        item.id,
                        user.id,
                      );
                      await loadComposerHistory();
                    }}
                  >
                    <Trash2 />
                  </button>
                </article>
              ))
            ) : (
              <p>No scheduled messages.</p>
            )}
          </div>
        </section>
      )}
      <details className="message-format-help">
        <summary>Message formatting · {draft.length} / 900</summary>
        <p>
          <code>*italic*</code> · <code>||bold||</code> ·{" "}
          <code>**bold italic**</code>
        </p>
        <p>
          {enterToSend
            ? "Enter to send · Shift+Enter for a new line"
            : "Ctrl+Enter to send · Enter for a new line"}
        </p>
      </details>
    </>
  );
}
