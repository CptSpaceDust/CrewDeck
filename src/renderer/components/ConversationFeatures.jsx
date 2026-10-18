import {
  BellRing,
  BellOff,
  Flag,
  Forward,
  Pin,
  SmilePlus,
  Timer,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  getConversationFeatures,
  pinGroupMessage,
  remindAboutMessage,
  saveConversationPreference,
  toggleMessageReaction,
  unpinGroupMessage,
} from "../lib/crewFeatures";
import { supabase } from "../lib/supabase";
import { promptInApp } from "./InAppDialog";

const EMOJIS = ["👍", "❤️", "😂", "🎉", "🚀"];

export function useConversationFeatures(kind, conversationId, userId) {
  const [state, setState] = useState({
    preferences: null,
    pins: [],
    reactions: [],
    receipts: [],
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
  canPin,
  onChanged,
  onNotice,
}) {
  return (
    <div className="message-feature-bar">
      <div className="reaction-picker">
        <SmilePlus />
        {EMOJIS.map((emoji) => {
          const rows = reactions.filter(
            (item) => item.message_id === message.id && item.emoji === emoji,
          );
          const active = rows.some((item) => item.user_id === userId);
          return (
            <button
              className={active ? "active" : ""}
              key={emoji}
              onClick={async () => {
                await toggleMessageReaction(
                  kind,
                  conversationId,
                  message.id,
                  userId,
                  emoji,
                  active,
                );
                onChanged();
              }}
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
      <div className="conversation-preference-selects">
        <label>
          <span>Organize in folder</span>
          <select
            aria-label="Conversation folder"
            title="Conversation folder"
            value={preference?.folder || "inbox"}
            onChange={(event) => save({ folder: event.target.value })}
          >
            <option value="inbox">Inbox</option>
            <option value="friends">Friends</option>
            <option value="meetups">Meetups</option>
            <option value="important">Important</option>
            <option value="muted">Muted</option>
          </select>
        </label>
        <label>
          <span>Alert sound</span>
          <select
            aria-label="Conversation sound"
            title="Conversation sound"
            value={preference?.sound_key || "default"}
            onChange={(event) => save({ sound_key: event.target.value })}
          >
            <option value="default">Default sound</option>
            <option value="soft">Soft sound</option>
            <option value="bright">Bright sound</option>
            <option value="silent">Silent</option>
          </select>
        </label>
      </div>
    </div>
  );
}
