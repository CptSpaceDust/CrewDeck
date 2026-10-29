import { useEffect } from "react";
import { supabase } from "./supabase";
import { playNotificationSound } from "./sounds";
import { activeConversation } from "../components/MessageComposer";
import { shouldAlertForMessage } from "./messageBehavior.mjs";
import { claimConversationAlert } from "./alertDelivery.mjs";
import {
  getPreferences,
  isMuted,
  isQuietTime,
  markConversationUnread,
} from "./preferences";

export function useMessageAlerts(userId) {
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    const seen = new Set();
    async function receive(message, group) {
      if (!message?.id || message.sender_id === userId || seen.has(message.id))
        return;
      seen.add(message.id);
      if (seen.size > 500) seen.delete(seen.values().next().value);
      const id = group ? message.group_id : message.conversation_id;
      // Captain policies can read other conversations: only alert actual members.
      const { data, error } = group
        ? await supabase
            .from("group_members")
            .select("user_id")
            .eq("group_id", id)
            .eq("user_id", userId)
            .maybeSingle()
        : await supabase
            .from("dm_conversations")
            .select("user_one,user_two")
            .eq("id", id)
            .maybeSingle();
      if (
        error ||
        !data ||
        (!group && data.user_one !== userId && data.user_two !== userId)
      )
        return;
      if (!alive) return;
      const current = activeConversation.current;
      if (
        !shouldAlertForMessage(
          current,
          id,
          group,
          document.hasFocus(),
          document.visibilityState === "visible",
        )
      )
        return;
      markConversationUnread(id, group);
      const settings = getPreferences();
      if (!settings.desktopNotifications || !settings.messageNotifications)
        return;
      if (isMuted(id, group, settings) || isQuietTime(settings)) return;
      const { data: sender } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", message.sender_id)
        .maybeSingle();
      if (!alive) return;
      if (
        !shouldAlertForMessage(
          activeConversation.current,
          id,
          group,
          document.hasFocus(),
          document.visibilityState === "visible",
        )
      )
        return;
      if (!claimConversationAlert(id, group)) return;
      playNotificationSound();
      await window.desktop.notify(
        sender?.username || "New message",
        message.content || "You have a new message.",
        `Conversation.html?${group ? "group" : "id"}=${encodeURIComponent(id)}`,
        {
          hideWhenLocked: settings.hideNotificationContentWhenLocked,
        },
      );
    }
    const channel = supabase
      .channel(`desktop-message-alerts-${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "dm_messages" },
        ({ new: message }) => {
          receive(message, false).catch(() => {});
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "group_messages" },
        ({ new: message }) => {
          receive(message, true).catch(() => {});
        },
      )
      .subscribe();
    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, [userId]);
}
