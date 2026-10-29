import { useEffect, useMemo, useRef, useState } from "react";
import { AtSign, CornerUpLeft, MailOpen, MoveDown } from "lucide-react";
import { supabase } from "../lib/supabase";
import { getMessageMentions, getReadPosition, setReadPosition, touchConversationView } from "../lib/messageNavigation";

function scrollToMessage(id) {
  const target = document.querySelector(`[data-nav-message="${CSS.escape(id)}"]`);
  target?.scrollIntoView({ behavior: "smooth", block: "center" });
  target?.classList.add("message-jump-highlight");
  setTimeout(() => target?.classList.remove("message-jump-highlight"), 1800);
}

export function useUnreadNavigation({ kind, conversationId, messages, userId }) {
  const [anchor, setAnchor] = useState(null);
  const [mentions, setMentions] = useState([]);
  const [mentionCursor, setMentionCursor] = useState(-1);
  const [replyCursor, setReplyCursor] = useState(-1);
  const initialized = useRef(false);
  useEffect(() => {
    let live = true; initialized.current = false; setAnchor(null); setMentions([]);
    if (!conversationId) return undefined;
    Promise.all([getReadPosition(kind, conversationId, userId), getMessageMentions(kind, conversationId, messages.map((item) => item.id))]).then(([position, rows]) => {
      if (!live) return;
      setAnchor(position || { last_read_message_id: null, last_read_created_at: null });
      setMentions(rows); initialized.current = true;
    }).catch(() => { if (live) { setAnchor({}); initialized.current = true; } });
    const heartbeat = () => { if (!document.hidden && document.hasFocus()) touchConversationView(kind, conversationId, true).catch(() => {}); };
    heartbeat(); const timer = setInterval(heartbeat, 25000);
    return () => { live = false; clearInterval(timer); touchConversationView(kind, conversationId, false).catch(() => {}); };
  }, [kind, conversationId, userId]);
  useEffect(() => {
    if (!conversationId || !messages.length) return;
    getMessageMentions(kind, conversationId, messages.map((item) => item.id)).then(setMentions).catch(() => {});
  }, [kind, conversationId, messages.length]);
  useEffect(() => {
    if (!conversationId) return undefined;
    const channel = supabase
      .channel(`message-mentions-${kind}-${conversationId}-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "message_mentions",
          filter: `conversation_id=eq.${conversationId}`,
        },
        () =>
          getMessageMentions(
            kind,
            conversationId,
            messages.map((item) => item.id),
          )
            .then(setMentions)
            .catch(() => {}),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversation_read_positions",
          filter: `user_id=eq.${userId}`,
        },
        ({ new: next }) => {
          if (
            next?.conversation_kind === kind &&
            next?.conversation_id === conversationId
          )
            setAnchor(next);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [kind, conversationId, userId, messages]);
  const firstUnreadIndex = useMemo(() => {
    if (!anchor || !messages.length) return -1;
    if (anchor.unread_from_message_id) {
      const exact = messages.findIndex((item) => item.id === anchor.unread_from_message_id);
      if (exact >= 0) return exact;
      if (anchor.unread_from_created_at) return messages.findIndex((item) => new Date(item.created_at) >= new Date(anchor.unread_from_created_at));
    }
    if (anchor.last_read_message_id) {
      const exact = messages.findIndex((item) => item.id === anchor.last_read_message_id);
      if (exact >= 0) return exact + 1 < messages.length ? exact + 1 : -1;
    }
    if (anchor.last_read_created_at) return messages.findIndex((item) => new Date(item.created_at) > new Date(anchor.last_read_created_at));
    return messages.findIndex((item) => item.sender_id !== userId);
  }, [anchor, messages, userId]);
  const firstUnreadId = firstUnreadIndex >= 0 ? messages[firstUnreadIndex]?.id : null;
  const unreadCount = firstUnreadIndex >= 0 ? messages.slice(firstUnreadIndex).filter((item) => item.sender_id !== userId).length : 0;
  const mentionIds = firstUnreadIndex < 0 ? [] : mentions.filter((item) => messages.findIndex((message) => message.id === item.message_id) >= firstUnreadIndex && item.mentioned_user_id === userId).map((item) => item.message_id);
  const replyIds = firstUnreadIndex < 0 ? [] : messages.filter((item, index) => index >= firstUnreadIndex && item.reply_to_id && messages.find((source) => source.id === item.reply_to_id)?.sender_id === userId).map((item) => item.id);
  async function markUnread(message) { await setReadPosition(kind, conversationId, message.id, true); setAnchor((current) => ({ ...(current || {}), unread_from_message_id: message.id, unread_from_created_at: message.created_at })); }
  async function markCurrentRead() { const last = messages.at(-1); if (!last || !initialized.current) return; await setReadPosition(kind, conversationId, last.id, false); }
  function cycle(ids, cursor, setCursor) { if (!ids.length) return; const next = (cursor + 1) % ids.length; setCursor(next); scrollToMessage(ids[next]); }
  return { firstUnreadId, unreadCount, mentions, markUnread, markCurrentRead, jumpFirst: () => firstUnreadId && scrollToMessage(firstUnreadId), jumpMention: () => cycle(mentionIds, mentionCursor, setMentionCursor), jumpReply: () => cycle(replyIds, replyCursor, setReplyCursor), mentionCount: mentionIds.length, replyCount: replyIds.length };
}

export function UnreadDivider() { return <div className="unread-message-divider" role="separator"><span>New messages</span></div>; }

export function UnreadNavigator({ navigation }) {
  if (!navigation.unreadCount && !navigation.mentionCount && !navigation.replyCount) return null;
  return <nav className="unread-floating-nav" aria-label="Unread message navigation">
    {navigation.unreadCount > 0 && <button onClick={navigation.jumpFirst}><MoveDown /> {navigation.unreadCount} new</button>}
    {navigation.mentionCount > 0 && <button onClick={navigation.jumpMention}><AtSign /> Mentions {navigation.mentionCount}</button>}
    {navigation.replyCount > 0 && <button onClick={navigation.jumpReply}><CornerUpLeft /> Replies {navigation.replyCount}</button>}
    <button onClick={() => navigation.markCurrentRead()}><MailOpen /> Mark read</button>
  </nav>;
}
