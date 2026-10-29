import { supabase } from "./supabase";

function unwrap(result) { if (result.error) throw result.error; return result.data; }

export async function getReadPosition(kind, conversationId, userId) {
  return unwrap(await supabase.from("conversation_read_positions").select("*").eq("user_id", userId).eq("conversation_kind", kind).eq("conversation_id", conversationId).maybeSingle());
}

export async function setReadPosition(kind, conversationId, messageId, markUnread = false) {
  return unwrap(await supabase.rpc("set_conversation_read_position", { kind_value: kind, conversation_key: conversationId, message_key: messageId, mark_unread_value: markUnread }));
}

export async function getMessageMentions(kind, conversationId, messageIds = []) {
  if (!messageIds.length) return [];
  return unwrap(await supabase.from("message_mentions").select("*").eq("conversation_kind", kind).eq("conversation_id", conversationId).in("message_id", messageIds)) || [];
}

export async function registerMessageMentions(kind, conversationId, messageId, mentionIds = [], broadcastKind = null) {
  if (!mentionIds.length && !broadcastKind) return 0;
  return unwrap(await supabase.rpc("register_message_mentions", { kind_value: kind, conversation_key: conversationId, message_key: messageId, mentioned_users: mentionIds, broadcast_kind: broadcastKind || null }));
}

export async function touchConversationView(kind, conversationId, active = true) {
  return unwrap(await supabase.rpc("touch_conversation_view", { kind_value: kind, conversation_key: conversationId, active_value: active }));
}
