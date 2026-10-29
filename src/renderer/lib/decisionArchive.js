import { supabase } from "./supabase";

function unwrap(result) {
  if (result.error) throw result.error;
  return result.data;
}

export async function savePollDecision(pollId, values) {
  return unwrap(await supabase.rpc("save_group_poll_decision", {
    poll_key: pollId,
    decision_value: values.decision,
    next_action_value: values.nextAction || null,
    action_type_value: values.actionType || null,
  }));
}

export async function getGroupDecisions(groupId) {
  const decisions = unwrap(await supabase.from("group_decisions")
    .select("*,author:profiles!group_decisions_created_by_fkey(username,avatar),editor:profiles!group_decisions_updated_by_fkey(username)")
    .eq("group_id", groupId).order("created_at", { ascending: false })) || [];
  if (!decisions.length) return [];
  const ids = decisions.map((item) => item.id);
  const [actions, revisions] = await Promise.all([
    supabase.from("group_decision_actions").select("*").in("decision_id", ids).order("created_at"),
    supabase.from("group_decision_revisions").select("decision_id,revision,changed_at,changed_by").in("decision_id", ids).order("revision", { ascending: false }),
  ]);
  if (actions.error) throw actions.error;
  if (revisions.error) throw revisions.error;
  return decisions.map((decision) => ({
    ...decision,
    actions: (actions.data || []).filter((item) => item.decision_id === decision.id),
    revisions: (revisions.data || []).filter((item) => item.decision_id === decision.id),
  }));
}

export async function updateDecision(id, values) {
  return unwrap(await supabase.rpc("update_group_decision", {
    decision_key: id,
    decision_value: values.decision,
    next_action_value: values.nextAction || null,
    action_type_value: values.actionType || null,
  }));
}

export async function convertDecision(id, values) {
  return unwrap(await supabase.rpc("convert_group_decision", {
    decision_key: id,
    action_type_value: values.actionType,
    action_title: values.title,
    action_details: values.details || null,
  }));
}

export async function getConversationArchives(userId) {
  await supabase.rpc("refresh_my_conversation_archives");
  const rows = unwrap(await supabase.from("conversation_archives").select("*").eq("user_id", userId)) || [];
  localStorage.setItem("cptspacedust.desktop.archived-conversations.v1", JSON.stringify(rows.filter((item) => item.archived_at).map((item) => `${item.conversation_kind}:${item.conversation_id}`)));
  window.dispatchEvent(new CustomEvent("message-reads"));
  return rows;
}

export async function setConversationArchive(kind, conversationId, archived, autoDays = null) {
  const result = unwrap(await supabase.rpc("set_conversation_archive", {
    kind_value: kind,
    conversation_key: conversationId,
    archive_value: archived,
    auto_days_value: autoDays || null,
  }));
  const key = `${kind}:${conversationId}`;
  const existing = new Set(JSON.parse(localStorage.getItem("cptspacedust.desktop.archived-conversations.v1") || "[]"));
  archived ? existing.add(key) : existing.delete(key);
  localStorage.setItem("cptspacedust.desktop.archived-conversations.v1", JSON.stringify([...existing]));
  window.dispatchEvent(new CustomEvent("message-reads"));
  return result;
}
