import { useEffect, useRef, useState } from "react";
import {
  BellOff,
  CalendarClock,
  History,
  Mic,
  Paperclip,
  Send,
  Square,
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
  getMessageDraftVersions,
  getScheduledConversationMessages,
  saveMessageDraftVersion,
} from "../lib/crewFeatures";

export const activeConversation = { current: null };

export function FormattedMessage({ children }) {
  const source = String(children ?? "");
  const parts = [];
  const pattern = /\*\*([^*\n]+)\*\*|\*([^*\n]+)\*|\|\|([^|\n]+)\|\|/g;
  let cursor = 0;
  for (const match of source.matchAll(pattern)) {
    parts.push(source.slice(cursor, match.index));
    parts.push(
      match[1] !== undefined ? (
        <strong key={match.index}>
          <em>{match[1]}</em>
        </strong>
      ) : match[2] !== undefined ? (
        <em key={match.index}>{match[2]}</em>
      ) : (
        <strong key={match.index}>{match[3]}</strong>
      ),
    );
    cursor = match.index + match[0].length;
  }
  parts.push(source.slice(cursor));
  return <span className="formatted-message">{parts}</span>;
}

export function MessageReplyQuote({
  message,
  messages,
  people,
  className = "message-reply-quote",
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
          <FormattedMessage>{original.content}</FormattedMessage>
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
  blockedUntil = 0,
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
  const [versions, setVersions] = useState([]);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [nativeShareFile, setNativeShareFile] = useState(null);
  const recorderRef = useRef(null);
  const recordingStartedRef = useRef(0);
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
      const bytes = Uint8Array.from(atob(target.base64), (character) => character.charCodeAt(0));
      setNativeShareFile(new File([bytes], target.name || "shared-file", { type:target.mimeType }));
    });
  }, [id]);
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
    const [scheduledRows, versionRows] = await Promise.all([
      getScheduledConversationMessages(user.id, kind, id),
      getMessageDraftVersions(user.id, kind, id),
    ]);
    setScheduled(scheduledRows || []);
    setVersions(versionRows || []);
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
    if (sendingRef.current || !draft.trim() || slowModeSeconds > 0) return;
    sendingRef.current = true;
    setBusy(true);
    try {
      const content = draft.trim();
      if ((await onSend(event, { silent, sendAt, expiresInMinutes: expiresInMinutes ? Number(expiresInMinutes) : null })) !== false) {
        await saveMessageDraftVersion(
          user.id,
          group ? "group" : "dm",
          id,
          content,
        ).catch(() => {});
        setDraft("");
        draftRef.current = "";
        saveDraft(user.id, id, group, "");
        channelRef.current?.(false);
        setSilent(false);
        setSendAt("");
        setExpiresInMinutes("");
        if (toolsOpen) await loadComposerHistory().catch(() => {});
      }
    } finally {
      sendingRef.current = false;
      setBusy(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }
  async function attachFile(file, durationSeconds = null) {
    if (!file || !onSendAttachment) return;
    setBusy(true);
    try {
      await onSendAttachment(file, { silent, durationSeconds });
    } finally {
      setBusy(false);
    }
  }
  async function toggleRecording() {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return;
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
      await attachFile(file, (Date.now() - recordingStartedRef.current) / 1000);
    };
    recorder.start();
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
            draftRef.current = event.target.value;
            saveDraft(user.id, id, group, event.target.value);
            lastInput.current = Date.now();
            channelRef.current?.(Boolean(event.target.value.trim()));
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
        <button
          className="send-button"
          disabled={busy || !draft.trim() || slowModeSeconds > 0}
          aria-label="Send message"
        >
          <Send />
        </button>
      </form>
      <div className="composer-delivery-controls">
        {nativeShareFile && <button type="button" className="native-share-target" disabled={busy} onClick={async () => { await attachFile(nativeShareFile); setNativeShareFile(null); }}><Paperclip /> Send {nativeShareFile.name}</button>}
        <label className="composer-file-button">
          <Paperclip />
          <span>Attach file</span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,audio/*,application/pdf,text/plain"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              attachFile(file);
            }}
          />
        </label>
        <button
          type="button"
          className={recording ? "active" : ""}
          onClick={() => toggleRecording().catch(() => {})}
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
          <select value={expiresInMinutes} onChange={(event) => setExpiresInMinutes(event.target.value)}>
            <option value="">After 5 days</option>
            <option value="15">After 15 minutes</option>
            <option value="60">After 1 hour</option>
            <option value="360">After 6 hours</option>
            <option value="1440">After 1 day</option>
          </select>
        </label>
        <button type="button" onClick={() => setToolsOpen((value) => !value)}>
          <History /> Saved & scheduled
        </button>
      </div>
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
          <div>
            <h4>Recent drafts</h4>
            {versions.length ? (
              versions.map((item) => (
                <button
                  type="button"
                  className="draft-version"
                  key={item.id}
                  onClick={() => {
                    setDraft(item.content);
                    draftRef.current = item.content;
                    saveDraft(user.id, id, group, item.content);
                  }}
                >
                  <span>{item.content}</span>
                  <small>{new Date(item.created_at).toLocaleString()}</small>
                </button>
              ))
            ) : (
              <p>Sent drafts will appear here.</p>
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
