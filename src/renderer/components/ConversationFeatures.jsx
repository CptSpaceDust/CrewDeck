import {
  BellRing,
  BellOff,
  Copy,
  Flag,
  Forward,
  Hash,
  Pin,
  SmilePlus,
  Timer,
  Trash2,
  Paperclip,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  deleteMessageReminder,
  getConversationFeatures,
  getMessageReminders,
  pinGroupMessage,
  remindAboutMessage,
  saveConversationPreference,
  toggleMessageReaction,
  unpinGroupMessage,
  getMessageAttachmentUrl,
} from "../lib/crewFeatures";
import { supabase } from "../lib/supabase";
import { confirmInApp, promptInApp } from "./InAppDialog";
import { FormattedMessage } from "./MessageComposer";

const EMOJIS = ["👍", "❤️", "😂", "🎉", "🚀"];
const MORE_EMOJIS = [
  "😀",
  "😄",
  "😂",
  "🥹",
  "😍",
  "🤩",
  "😎",
  "🤔",
  "🫡",
  "😮",
  "😢",
  "😭",
  "😡",
  "👍",
  "👎",
  "👏",
  "🙌",
  "🙏",
  "💪",
  "❤️",
  "🧡",
  "💛",
  "💚",
  "💙",
  "💜",
  "🔥",
  "✨",
  "🎉",
  "🚀",
  "⭐",
  "🌙",
  "🪐",
  "👀",
  "✅",
  "❌",
  "💯",
  "🎮",
  "🎧",
  "🍿",
  "☕",
];

function MessageAttachment({ item, onNotice }) {
  const [url, setUrl] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  useEffect(() => {
    let current = true;
    getMessageAttachmentUrl(item.id)
      .then((value) => current && setUrl(value))
      .catch((error) => onNotice?.(error.message));
    return () => {
      current = false;
    };
  }, [item.id]);
  if (!url)
    return <div className="message-media-loading">Loading attachment…</div>;
  if (item.mime_type?.startsWith("image/")) {
    return (
      <div className="message-media-preview image">
        <img src={url} alt="Shared image" loading="lazy" />
      </div>
    );
  }
  if (item.mime_type?.startsWith("video/")) {
    return (
      <div className="message-media-preview video">
        <video src={url} controls preload="metadata" playsInline />
      </div>
    );
  }
  if (item.mime_type?.startsWith("audio/") || item.duration_seconds) {
    return (
      <div className="message-media-preview audio">
        <audio src={url} controls preload="metadata" />
      </div>
    );
  }
  return (
    <>
      <button
        type="button"
        className="message-file-download"
        onClick={() => setPreviewOpen(true)}
      >
        <Paperclip />
        <span>
          <small>{item.file_name || "Shared document"}</small>
          <strong>Open document</strong>
          <small>{Math.max(1, Math.ceil(item.byte_size / 1024))} KB</small>
        </span>
      </button>
      {previewOpen && (
        <AttachmentPreviewDialog
          preview={{ url, mimeType: item.mime_type }}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </>
  );
}

function AttachmentPreviewDialog({ preview, onClose }) {
  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);
  const mimeType = String(preview?.mimeType || "");
  const title = mimeType.startsWith("image/")
    ? "Image preview"
    : mimeType.startsWith("video/")
      ? "Video preview"
      : mimeType.startsWith("audio/")
        ? "Voice message"
        : mimeType === "text/plain"
          ? "Text document"
          : "Document preview";
  return (
    <div
      className="modal-backdrop attachment-preview-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className="modal attachment-preview-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="modal-header">
          <div>
            <span>SHARED FILE</span>
            <h2>{title}</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Close preview"
            onClick={onClose}
          >
            <X />
          </button>
        </header>
        <div className="attachment-preview-body">
          {mimeType.startsWith("image/") ? (
            <img src={preview.url} alt="Shared image" />
          ) : mimeType.startsWith("video/") ? (
            <video src={preview.url} controls playsInline />
          ) : mimeType.startsWith("audio/") ? (
            <audio src={preview.url} controls />
          ) : (
            <iframe src={preview.url} title="Shared document preview" />
          )}
        </div>
      </section>
    </div>
  );
}

function SharedMediaAttachment({ item, onPreview, onNotice }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let current = true;
    getMessageAttachmentUrl(item.id)
      .then((value) => current && setUrl(value))
      .catch((error) => onNotice?.(error.message));
    return () => {
      current = false;
    };
  }, [item.id, onNotice]);
  if (!url)
    return <div className="conversation-media-card loading">Loading…</div>;
  const mimeType = String(item.mime_type || "");
  if (mimeType.startsWith("image/")) {
    return (
      <article className="conversation-media-card image">
        <img src={url} alt="Shared image" loading="lazy" />
        <span className="conversation-media-type">IMAGE</span>
      </article>
    );
  }
  if (mimeType.startsWith("video/")) {
    return (
      <article className="conversation-media-card video">
        <video src={url} controls preload="metadata" playsInline />
        <span className="conversation-media-type">VIDEO</span>
      </article>
    );
  }
  if (mimeType.startsWith("audio/") || item.duration_seconds) {
    return (
      <article className="conversation-media-card audio">
        <span className="conversation-media-type">VOICE MESSAGE</span>
        <audio src={url} controls preload="metadata" />
      </article>
    );
  }
  return (
    <button
      type="button"
      className="conversation-media-card document"
      onClick={() => onPreview({ url, mimeType })}
    >
      <Paperclip />
      <span className="conversation-media-type">OPEN DOCUMENT</span>
      <small>{Math.max(1, Math.ceil(item.byte_size / 1024))} KB</small>
    </button>
  );
}

function suspiciousLink(url) {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol !== "https:" ||
      /^\d{1,3}(\.\d{1,3}){3}$/.test(parsed.hostname) ||
      parsed.hostname.includes("xn--") ||
      parsed.username ||
      parsed.password ||
      parsed.hostname.split(".").length > 5
    );
  } catch {
    return true;
  }
}

export function useConversationFeatures(kind, conversationId, userId) {
  const [state, setState] = useState({
    preferences: null,
    pins: [],
    reactions: [],
    receipts: [],
    attachments: [],
  });
  const reload = async () =>
    setState(await getConversationFeatures(kind, conversationId, userId));
  useEffect(() => {
    if (!conversationId) return;
    reload().catch(() => {});
    const channel = supabase
      .channel(`features-${kind}-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "message_pins",
          filter: `conversation_id=eq.${conversationId}`,
        },
        reload,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "message_attachments",
          filter: `conversation_id=eq.${conversationId}`,
        },
        reload,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "message_reactions",
          filter: `conversation_id=eq.${conversationId}`,
        },
        reload,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "message_read_receipts",
          filter: `conversation_id=eq.${conversationId}`,
        },
        reload,
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [kind, conversationId, userId]);
  return [state, reload];
}

export function PinnedMessages({ pins, canManage, onChanged }) {
  if (!pins.length) return null;
  return (
    <details className="conversation-pins">
      <summary>
        <Pin /> {pins.length} pinned{" "}
        {pins.length === 1 ? "message" : "messages"}
      </summary>
      <div>
        {pins.map((pin) => (
          <article key={pin.id}>
            <span>{pin.message_excerpt}</span>
            {canManage && (
              <button
                onClick={async () => {
                  await unpinGroupMessage(pin.id);
                  onChanged();
                }}
              >
                Unpin
              </button>
            )}
          </article>
        ))}
      </div>
    </details>
  );
}

export function MessageFeatureBar({
  kind,
  conversationId,
  message,
  userId,
  reactions,
  receipts = [],
  attachments = [],
  mentions = [],
  canPin,
  onChanged,
  onNotice,
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerPosition, setPickerPosition] = useState(null);
  const pickerRef = useRef(null);
  const messageReactions = reactions.filter(
    (item) => item.message_id === message.id,
  );
  const messageAttachments = attachments.filter(
    (item) => item.message_id === message.id,
  );
  const reactionGroups = [
    ...new Set(messageReactions.map((item) => item.emoji)),
  ]
    .map((emoji) => ({
      emoji,
      rows: messageReactions.filter((item) => item.emoji === emoji),
    }))
    .filter(({ emoji }) => emoji);

  useEffect(() => {
    if (!pickerOpen) return;
    const close = (event) => {
      if (!pickerRef.current?.contains(event.target)) setPickerOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setPickerOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [pickerOpen]);

  async function toggleReaction(emoji, button) {
    const active = messageReactions.some(
      (item) => item.emoji === emoji && item.user_id === userId,
    );
    setPickerOpen(false);
    button?.blur();
    try {
      await toggleMessageReaction(
        kind,
        conversationId,
        message.id,
        userId,
        emoji,
        active,
      );
      onChanged();
    } catch (error) {
      onNotice?.(error.message);
    }
  }

  return (
    <>
      {messageAttachments.length > 0 && (
        <div className="message-attachment-list">
          {messageAttachments.map((item) => (
            <MessageAttachment key={item.id} item={item} onNotice={onNotice} />
          ))}
        </div>
      )}
      {reactionGroups.length > 0 && (
        <div
          className="message-reaction-summary"
          aria-label="Message reactions"
        >
          {reactionGroups.map(({ emoji, rows }) => (
            <button
              className={
                rows.some((item) => item.user_id === userId) ? "active" : ""
              }
              key={emoji}
              title={`${rows.length} ${rows.length === 1 ? "reaction" : "reactions"}`}
              onClick={(event) => toggleReaction(emoji, event.currentTarget)}
            >
              <span>{emoji}</span>
              <small>{rows.length}</small>
            </button>
          ))}
        </div>
      )}
      <div className="message-feature-bar">
        <div className="reaction-picker">
          <div className="emoji-picker-wrap" ref={pickerRef}>
            <button
              type="button"
              className={
                pickerOpen
                  ? "active emoji-picker-trigger"
                  : "emoji-picker-trigger"
              }
              title="Choose another reaction"
              aria-label="Choose another reaction"
              aria-expanded={pickerOpen}
              onClick={() => {
                if (pickerOpen) {
                  setPickerOpen(false);
                  return;
                }
                const rect = pickerRef.current?.getBoundingClientRect();
                const width = Math.min(286, window.innerWidth - 24);
                const height = 260;
                const below = window.innerHeight - (rect?.bottom || 0);
                setPickerPosition({
                  position: "fixed",
                  width,
                  maxHeight: height,
                  overflowY: "auto",
                  left: Math.max(
                    12,
                    Math.min(window.innerWidth - width - 12, rect?.left || 12),
                  ),
                  top:
                    below >= height + 20
                      ? (rect?.bottom || 12) + 8
                      : Math.max(12, (rect?.top || height + 20) - height - 8),
                  right: "auto",
                  bottom: "auto",
                  zIndex: 30000,
                });
                setPickerOpen(true);
              }}
            >
              <SmilePlus />
            </button>
            {pickerOpen && (
              <div
                className="emoji-picker-popover"
                style={pickerPosition || undefined}
                role="dialog"
                aria-label="Choose a reaction"
              >
                {MORE_EMOJIS.map((emoji) => (
                  <button
                    type="button"
                    key={emoji}
                    title={`React with ${emoji}`}
                    onClick={(event) =>
                      toggleReaction(emoji, event.currentTarget)
                    }
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>
          {EMOJIS.map((emoji) => {
            const rows = messageReactions.filter(
              (item) => item.emoji === emoji,
            );
            const active = rows.some((item) => item.user_id === userId);
            return (
              <button
                className={active ? "active" : ""}
                key={emoji}
                onClick={(event) => toggleReaction(emoji, event.currentTarget)}
              >
                {emoji}
                {rows.length ? <small>{rows.length}</small> : null}
              </button>
            );
          })}
        </div>
        {canPin && (
          <button
            title="Pin message"
            onClick={async () => {
              try {
                await pinGroupMessage(conversationId, message, userId);
                onChanged();
              } catch (error) {
                onNotice?.(error.message);
              }
            }}
          >
            <Pin />
          </button>
        )}
        <button
          title="Remind me in one hour"
          onClick={async () => {
            await remindAboutMessage(
              userId,
              kind,
              conversationId,
              message,
              new Date(Date.now() + 3600000).toISOString(),
              mentions.filter((mention) => mention.message_id === message.id),
            );
            onNotice?.("Reminder set for one hour from now.");
          }}
        >
          <Timer />
        </button>
        <button
          title="Forward message"
          onClick={async () => {
            const target = await promptInApp(
              "Paste the destination conversation ID. Prefix group conversations with group:",
              "",
              {
                title: "Forward message",
                inputLabel: "Conversation ID",
                confirmLabel: "Forward",
              },
            );
            if (!target) return;
            const groupTarget = target.startsWith("group:");
            const result = await supabase.rpc("forward_crew_message", {
              target_kind: groupTarget ? "group" : "dm",
              target_id: target.replace(/^group:/, "").trim(),
              source_kind: kind,
              source_id: message.id,
            });
            onNotice?.(result.error?.message || "Message forwarded.");
          }}
        >
          <Forward />
        </button>
        <button
          title="Report with evidence"
          onClick={async () => {
            const reason = await promptInApp(
              "Tell the Captain what happened. A protected copy of this message will be saved with the report.",
              "",
              {
                title: "Report message",
                inputLabel: "Reason",
                confirmLabel: "Submit report",
              },
            );
            if (!reason?.trim()) return;
            const result = await supabase
              .from("moderation_evidence_snapshots")
              .insert({
                conversation_kind: kind,
                conversation_id: conversationId,
                reported_user_id: message.sender_id,
                submitted_by: userId,
                message_context: [
                  {
                    id: message.id,
                    sender_id: message.sender_id,
                    content: message.content,
                    created_at: message.created_at,
                    reason: reason.trim(),
                  },
                ],
              });
            onNotice?.(
              result.error?.message ||
                "Report submitted with a protected evidence copy.",
            );
          }}
        >
          <Flag />
        </button>
        {receipts.some(
          (item) => item.message_id === message.id && item.user_id !== userId,
        ) && (
          <small className="message-seen-count">
            Seen by{" "}
            {
              receipts.filter(
                (item) =>
                  item.message_id === message.id && item.user_id !== userId,
              ).length
            }
          </small>
        )}
      </div>
    </>
  );
}

export function ConversationDetails({
  kind,
  conversationId,
  userId,
  onNotice,
  archived = false,
  autoArchiveDays = "",
  onArchiveToggle,
  onAutoArchiveChange,
}) {
  const [reminders, setReminders] = useState([]);
  const [media, setMedia] = useState([]);
  const [links, setLinks] = useState([]);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  async function load() {
    try {
      const [nextReminders, attachmentsResult, messagesResult] =
        await Promise.all([
          getMessageReminders(userId, kind, conversationId),
          supabase
            .from("message_attachments")
            .select("*")
            .eq("conversation_kind", kind)
            .eq("conversation_id", conversationId)
            .order("created_at", { ascending: false }),
          supabase
            .from(kind === "group" ? "group_messages" : "dm_messages")
            .select("id,content,created_at")
            .eq(
              kind === "group" ? "group_id" : "conversation_id",
              conversationId,
            )
            .order("created_at", { ascending: false })
            .limit(250),
        ]);
      setReminders(nextReminders || []);
      setMedia(attachmentsResult.data || []);
      const foundLinks = [];
      for (const message of messagesResult.data || []) {
        for (const match of String(message.content || "").matchAll(
          /https?:\/\/[^\s<]+/gi,
        )) {
          foundLinks.push({
            messageId: message.id,
            url: match[0].replace(/[),.!?]+$/, ""),
            createdAt: message.created_at,
          });
        }
      }
      setLinks(foundLinks.slice(0, 60));
    } catch (error) {
      onNotice?.(error.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, [kind, conversationId, userId]);
  async function copyId() {
    try {
      await navigator.clipboard.writeText(conversationId);
      onNotice?.("Conversation ID copied.");
    } catch {
      onNotice?.(`Conversation ID: ${conversationId}`);
    }
  }
  return (
    <>
      <section className="conversation-details-panel">
        <div className="conversation-id-card">
          <span>
            <Hash />{" "}
            {kind === "group" ? "Group conversation ID" : "Conversation ID"}
          </span>
          <code>{conversationId}</code>
          <button type="button" onClick={copyId}>
            <Copy /> Copy ID
          </button>
        </div>
        {(onArchiveToggle || onAutoArchiveChange) && (
          <section className="conversation-detail-archive">
            <div>
              <strong>Archive settings</strong>
              <small>
                Keep inactive conversations out of your active list without
                deleting them.
              </small>
            </div>
            {onArchiveToggle && (
              <button type="button" onClick={onArchiveToggle}>
                {archived ? "Restore conversation" : "Archive conversation"}
              </button>
            )}
            {onAutoArchiveChange && (
              <label>
                <span>Auto archive</span>
                <select
                  value={autoArchiveDays || ""}
                  onChange={(event) =>
                    onAutoArchiveChange(
                      event.target.value ? Number(event.target.value) : null,
                    )
                  }
                >
                  <option value="">Off</option>
                  <option value="7">7 days</option>
                  <option value="14">14 days</option>
                  <option value="30">30 days</option>
                  <option value="60">60 days</option>
                  <option value="90">90 days</option>
                </select>
              </label>
            )}
          </section>
        )}
        <header>
          <div>
            <Timer />
            <span>
              <strong>Message reminders</strong>
              <small>Remove reminders you no longer need.</small>
            </span>
          </div>
        </header>
        {loading ? (
          <p className="micro-copy">Loading reminders…</p>
        ) : reminders.length ? (
          <div className="message-reminder-list">
            {reminders.map((reminder) => (
              <article key={reminder.id}>
                <div>
                  <strong>
                    <FormattedMessage
                      mentions={reminder.mention_snapshot || []}
                    >
                      {reminder.message_excerpt || "Message reminder"}
                    </FormattedMessage>
                  </strong>
                  <small>
                    {reminder.delivered_at ? "Delivered " : "Due "}
                    {new Date(
                      reminder.delivered_at || reminder.remind_at,
                    ).toLocaleString()}
                  </small>
                </div>
                <button
                  type="button"
                  title="Remove reminder"
                  onClick={async () => {
                    await deleteMessageReminder(reminder.id, userId);
                    await load();
                    onNotice?.("Message reminder removed.");
                  }}
                >
                  <Trash2 /> Remove
                </button>
              </article>
            ))}
          </div>
        ) : (
          <p className="micro-copy">
            No message reminders for this conversation.
          </p>
        )}
        <header className="conversation-media-heading">
          <div>
            <Paperclip />
            <span>
              <strong>Shared media</strong>
              <small>
                Images, files, voice messages, and links from this conversation.
              </small>
            </span>
          </div>
        </header>
        <div className="conversation-media-gallery">
          {media.map((item) => (
            <SharedMediaAttachment
              key={item.id}
              item={item}
              onPreview={setPreview}
              onNotice={onNotice}
            />
          ))}
          {links.map((item) => (
            <button
              type="button"
              key={`${item.messageId}-${item.url}`}
              onClick={async () => {
                if (
                  suspiciousLink(item.url) &&
                  !(await confirmInApp(
                    `This link uses an unusual address:\n${item.url}`,
                    {
                      title: "Open suspicious link?",
                      confirmLabel: "Open link",
                    },
                  ))
                )
                  return;
                window.desktop?.openExternal
                  ? window.desktop.openExternal(item.url)
                  : window.open(item.url, "_blank", "noopener,noreferrer");
              }}
            >
              <span className="conversation-media-type">LINK</span>
              <strong>{new URL(item.url).hostname}</strong>
              <small>{item.url}</small>
            </button>
          ))}
          {!media.length && !links.length && (
            <p className="micro-copy">Nothing has been shared here yet.</p>
          )}
        </div>
      </section>
      {preview && (
        <AttachmentPreviewDialog
          preview={preview}
          onClose={() => setPreview(null)}
        />
      )}
    </>
  );
}

export function ConversationNotificationControl({
  kind,
  conversationId,
  userId,
  preference,
  onChanged,
  expanded = false,
}) {
  const level = preference?.notification_level || "all";
  async function save(changes) {
    await saveConversationPreference(userId, kind, conversationId, changes);
    onChanged();
  }
  return (
    <div
      className={`conversation-preference-controls${expanded ? " expanded" : ""}`}
    >
      <header>
        <span className="conversation-preference-icon">
          {level === "none" ? <BellOff /> : <BellRing />}
        </span>
        <div>
          <strong>Choose your alerts</strong>
          <p>
            These settings only affect this{" "}
            {kind === "group" ? "group" : "conversation"}.
          </p>
        </div>
      </header>
      <fieldset className="notification-level-options">
        <legend>Notify me for</legend>
        {[
          ["all", "All messages", "Get an alert for every new message."],
          [
            "mentions",
            "Mentions only",
            "Alert me when someone uses my name or @everyone.",
          ],
          ["none", "Nothing", "Keep this conversation quiet."],
        ].map(([value, title, detail]) => (
          <label className={level === value ? "active" : ""} key={value}>
            <input
              type="radio"
              name={`notification-level-${kind}-${conversationId}`}
              checked={level === value}
              onChange={() =>
                save({
                  notification_level: value,
                  folder:
                    value === "none" ? "muted" : preference?.folder || "inbox",
                })
              }
            />
            <span>
              <strong>{title}</strong>
              <small>{detail}</small>
            </span>
          </label>
        ))}
      </fieldset>
    </div>
  );
}
