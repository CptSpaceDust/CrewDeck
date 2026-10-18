import { supabase } from "./supabase";
import { meetupInstant } from "./time";

function unwrap(result) {
  if (result.error) throw result.error;
  return result.data;
}

export async function getGroupPolls(groupId) {
  const polls = unwrap(
    await supabase
      .from("group_polls")
      .select("id,group_id,created_by,question,closes_at,closed_at,created_at")
      .eq("group_id", groupId)
      .order("created_at", { ascending: false })
      .limit(30),
  );
  if (!polls?.length) return [];
  const ids = polls.map((poll) => poll.id);
  const [optionsResult, votesResult] = await Promise.all([
    supabase
      .from("group_poll_options")
      .select("id,poll_id,label,position")
      .in("poll_id", ids)
      .order("position"),
    supabase
      .from("group_poll_votes")
      .select("poll_id,option_id,user_id")
      .in("poll_id", ids),
  ]);
  const options = unwrap(optionsResult) || [];
  const votes = unwrap(votesResult) || [];
  return polls.map((poll) => ({
    ...poll,
    options: options
      .filter((option) => option.poll_id === poll.id)
      .map((option) => ({
        ...option,
        votes: votes.filter((vote) => vote.option_id === option.id),
      })),
  }));
}

export async function createGroupPoll(
  groupId,
  userId,
  question,
  options,
  hours,
) {
  const clean = options.map((value) => value.trim()).filter(Boolean);
  if (clean.length < 2 || clean.length > 10)
    throw new Error("Add between 2 and 10 choices.");
  return unwrap(
    await supabase.rpc("create_group_poll", {
      group_key: groupId,
      question_text: question.trim(),
      option_labels: clean,
      closes_after_hours: hours ? Number(hours) : null,
    }),
  );
}

export async function voteInGroupPoll(pollId, optionId, userId) {
  return unwrap(
    await supabase
      .from("group_poll_votes")
      .upsert(
        { poll_id: pollId, option_id: optionId, user_id: userId },
        { onConflict: "poll_id,user_id" },
      ),
  );
}

export async function closeGroupPoll(pollId) {
  return unwrap(
    await supabase
      .from("group_polls")
      .update({ closed_at: new Date().toISOString() })
      .eq("id", pollId),
  );
}

export async function deleteClosedGroupPoll(pollId) {
  return unwrap(
    await supabase.rpc("delete_closed_group_poll", { poll_key: pollId }),
  );
}

export async function getConversationFeatures(kind, conversationId, userId) {
  const [preferences, pins, reactions, receipts] = await Promise.all([
    supabase
      .from("conversation_preferences")
      .select("*")
      .eq("user_id", userId)
      .eq("conversation_kind", kind)
      .eq("conversation_id", conversationId)
      .maybeSingle(),
    supabase
      .from("message_pins")
      .select("*")
      .eq("conversation_kind", kind)
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false }),
    supabase
      .from("message_reactions")
      .select("*")
      .eq("conversation_kind", kind)
      .eq("conversation_id", conversationId),
    supabase
      .from("message_read_receipts")
      .select("*")
      .eq("conversation_kind", kind)
      .eq("conversation_id", conversationId),
  ]);
  if (preferences.error) throw preferences.error;
  if (pins.error) throw pins.error;
  if (reactions.error) throw reactions.error;
  if (receipts.error) throw receipts.error;
  return {
    preferences: preferences.data,
    pins: pins.data || [],
    reactions: reactions.data || [],
    receipts: receipts.data || [],
  };
}

export async function saveConversationPreference(
  userId,
  kind,
  conversationId,
  changes,
) {
  return unwrap(
    await supabase
      .from("conversation_preferences")
      .upsert(
        {
          user_id: userId,
          conversation_kind: kind,
          conversation_id: conversationId,
          ...changes,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,conversation_kind,conversation_id" },
      )
      .select()
      .single(),
  );
}

export async function toggleMessageReaction(
  kind,
  conversationId,
  messageId,
  userId,
  emoji,
  active,
) {
  const query = supabase.from("message_reactions");
  return unwrap(
    active
      ? await query
          .delete()
          .eq("conversation_kind", kind)
          .eq("message_id", messageId)
          .eq("user_id", userId)
          .eq("emoji", emoji)
      : await query.insert({
          conversation_kind: kind,
          conversation_id: conversationId,
          message_id: messageId,
          user_id: userId,
          emoji,
        }),
  );
}

export async function pinGroupMessage(conversationId, message, userId) {
  return unwrap(
    await supabase.from("message_pins").insert({
      conversation_kind: "group",
      conversation_id: conversationId,
      message_id: message.id,
      message_excerpt: String(message.content || "").slice(0, 900),
      sender_id: message.sender_id,
      pinned_by: userId,
    }),
  );
}

export async function unpinGroupMessage(pinId) {
  return unwrap(await supabase.from("message_pins").delete().eq("id", pinId));
}

export async function remindAboutMessage(
  userId,
  kind,
  conversationId,
  message,
  remindAt,
) {
  return unwrap(
    await supabase.from("message_reminders").insert({
      user_id: userId,
      conversation_kind: kind,
      conversation_id: conversationId,
      message_id: message.id,
      message_excerpt: String(message.content || "").slice(0, 900),
      remind_at: remindAt,
    }),
  );
}

export async function getMessageReminders(userId, kind, conversationId) {
  return unwrap(
    await supabase
      .from("message_reminders")
      .select("id,message_id,message_excerpt,remind_at,delivered_at,created_at")
      .eq("user_id", userId)
      .eq("conversation_kind", kind)
      .eq("conversation_id", conversationId)
      .order("remind_at", { ascending: true }),
  );
}

export async function deleteMessageReminder(reminderId, userId) {
  return unwrap(
    await supabase
      .from("message_reminders")
      .delete()
      .eq("id", reminderId)
      .eq("user_id", userId),
  );
}

export async function markMessageRead(kind, conversationId, messageId, userId) {
  return unwrap(
    await supabase.from("message_read_receipts").upsert(
      {
        conversation_kind: kind,
        conversation_id: conversationId,
        message_id: messageId,
        user_id: userId,
        read_at: new Date().toISOString(),
      },
      { onConflict: "conversation_kind,message_id,user_id" },
    ),
  );
}

export async function changeGroupRole(groupId, userId, role) {
  return unwrap(
    await supabase.rpc("set_group_member_role", {
      group_key: groupId,
      target_user: userId,
      new_role: role,
    }),
  );
}

export async function getMeetupParticipantSettings(meetupIds = []) {
  if (!meetupIds.length) return [];
  return unwrap(
    await supabase
      .from("meetup_participant_settings")
      .select(
        "meetup_id,user_id,reminder_minutes,check_in_status,checked_in_at",
      )
      .in("meetup_id", meetupIds),
  );
}

export async function saveMeetupParticipantSetting(meetupId, userId, changes) {
  return unwrap(
    await supabase
      .from("meetup_participant_settings")
      .upsert(
        {
          meetup_id: meetupId,
          user_id: userId,
          ...changes,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "meetup_id,user_id" },
      )
      .select()
      .single(),
  );
}

const pad = (value) => String(value).padStart(2, "0");
const icsDate = (date) =>
  `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
const escapeIcs = (value) =>
  String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");

export function meetupCalendarDetails(meetup, otherName = "Crew member") {
  const start = meetupInstant(meetup);
  const end = new Date(
    start.getTime() + Number(meetup.duration || 1) * 3600000,
  );
  const title = `${meetup.meetup_type || "Crew meetup"} with ${otherName}`;
  const details = [
    meetup.message,
    meetup.vrc_username ? `VRChat: ${meetup.vrc_username}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  return { start, end, title, details };
}

export function downloadMeetupIcs(meetup, otherName) {
  const { start, end, title, details } = meetupCalendarDetails(
    meetup,
    otherName,
  );
  const text = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CrewDeck//Meetups//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${meetup.id}@crewdeck`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${escapeIcs(title)}`,
    `DESCRIPTION:${escapeIcs(details)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const url = URL.createObjectURL(new Blob([text], { type: "text/calendar" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `crew-meetup-${meetup.meetup_date}.ics`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function meetupCalendarUrl(provider, meetup, otherName) {
  const { start, end, title, details } = meetupCalendarDetails(
    meetup,
    otherName,
  );
  const dates = `${icsDate(start)}/${icsDate(end)}`;
  if (provider === "google") {
    const query = new URLSearchParams({
      action: "TEMPLATE",
      text: title,
      dates,
      details,
    });
    return `https://calendar.google.com/calendar/render?${query}`;
  }
  const query = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: title,
    startdt: start.toISOString(),
    enddt: end.toISOString(),
    body: details,
  });
  return `https://outlook.live.com/calendar/0/deeplink/compose?${query}`;
}

export async function getMyAppeals(userId) {
  return unwrap(
    await supabase
      .from("moderation_appeals")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
  );
}

export async function submitAppeal(userId, restriction, text) {
  return unwrap(
    await supabase
      .from("moderation_appeals")
      .insert({
        user_id: userId,
        restriction_action: restriction.action,
        restriction_expires_at: restriction.expires_at,
        appeal_text: text.trim(),
      })
      .select()
      .single(),
  );
}

export async function reviewAppeal(id, captainId, status, response) {
  return unwrap(
    await supabase
      .from("moderation_appeals")
      .update({
        status,
        captain_response: response.trim() || null,
        reviewed_by: captainId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single(),
  );
}
