import { supabase } from "./supabase";
import {
  localDateKey,
  meetupInstant,
  meetupLocalDateKey,
  zonedDateTime,
} from "./time";

function unwrap(result) {
  if (result.error) throw result.error;
  return result.data;
}

export async function getProfile(userId) {
  return unwrap(
    await supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
  );
}

export async function getProfiles(
  columns = "id,username,avatar,rank,badges,bio,favorite_game,birthday,show_birthday,joined,last_seen,online,support_active",
) {
  return unwrap(
    await supabase
      .from("profiles")
      .select(columns)
      .order("last_seen", { ascending: false }),
  );
}

export async function getIntroductions() {
  const introductions = unwrap(
    await supabase
      .from("community_introductions")
      .select("*")
      .order("created_at", { ascending: false }),
  );
  const ids = [...new Set((introductions || []).map((item) => item.user_id))];
  const profiles = ids.length
    ? unwrap(
        await supabase
          .from("profiles")
          .select("id,username,avatar,rank,badges")
          .in("id", ids),
      )
    : [];
  const byId = Object.fromEntries(
    (profiles || []).map((profile) => [profile.id, profile]),
  );
  return (introductions || []).map((item) => ({
    ...item,
    profile: byId[item.user_id],
  }));
}

export async function saveIntroduction(userId, fields, existingId) {
  const payload = { ...fields, updated_at: new Date().toISOString() };
  if (existingId)
    return unwrap(
      await supabase
        .from("community_introductions")
        .update(payload)
        .eq("id", existingId)
        .eq("user_id", userId)
        .select()
        .single(),
    );
  return unwrap(
    await supabase
      .from("community_introductions")
      .insert({ ...payload, user_id: userId })
      .select()
      .single(),
  );
}

export async function deleteIntroduction(id) {
  return unwrap(
    await supabase.from("community_introductions").delete().eq("id", id),
  );
}

export async function restrictionMessage(userId, action) {
  if (!userId) return null;
  const data = unwrap(
    await supabase
      .from("user_restrictions")
      .select("action,expires_at")
      .eq("user_id", userId)
      .in("action", ["site", action])
      .gt("expires_at", new Date().toISOString())
      .order("expires_at", { ascending: false })
      .limit(1),
  );
  if (!data?.length) return null;
  return `This action is unavailable while your account is restricted, until ${new Date(data[0].expires_at).toLocaleString()}.`;
}

export async function getActiveRestrictions(userId) {
  return unwrap(
    await supabase
      .from("user_restrictions")
      .select("action,expires_at")
      .eq("user_id", userId)
      .gt("expires_at", new Date().toISOString()),
  );
}

export async function updatePresence(userId) {
  return unwrap(
    await supabase
      .from("profiles")
      .update({ online: true, last_seen: new Date().toISOString() })
      .eq("id", userId),
  );
}

export async function getIdeas() {
  const ideas = unwrap(
    await supabase
      .from("ideas")
      .select("*")
      .order("created_at", { ascending: false }),
  );
  const votes = unwrap(
    await supabase.from("idea_votes").select("idea_id,user_id"),
  );
  return (ideas || []).map((idea) => ({
    ...idea,
    votes: (votes || []).filter((vote) => vote.idea_id === idea.id),
  }));
}

export async function createIdea(user, profile, fields) {
  return unwrap(
    await supabase.functions.invoke("create-idea", {
      body: {
        title: fields.title,
        description: fields.description,
        username:
          profile?.username || user.email?.split("@")[0] || "Crew member",
      },
    }),
  );
}

export async function toggleIdeaVote(ideaId, userId, hasVote) {
  if (hasVote)
    return unwrap(
      await supabase
        .from("idea_votes")
        .delete()
        .eq("idea_id", ideaId)
        .eq("user_id", userId),
    );
  return unwrap(
    await supabase
      .from("idea_votes")
      .insert({ idea_id: ideaId, user_id: userId }),
  );
}

export async function getIdeaLimit(userId) {
  const date = new Date().toISOString().split("T")[0];
  const row = unwrap(
    await supabase
      .from("idea_limits")
      .select("count")
      .eq("user_id", userId)
      .eq("date", date)
      .maybeSingle(),
  );
  return Math.max(0, 5 - Number(row?.count || 0));
}

export async function deleteIdea(idea) {
  unwrap(await supabase.from("ideas").delete().eq("id", idea.id));
  const date = new Date().toISOString().split("T")[0];
  const limit = unwrap(
    await supabase
      .from("idea_limits")
      .select("id,count")
      .eq("user_id", idea.user_id)
      .eq("date", date)
      .maybeSingle(),
  );
  if (limit?.count > 0)
    unwrap(
      await supabase
        .from("idea_limits")
        .update({ count: limit.count - 1 })
        .eq("id", limit.id),
    );
}

export async function updateIdeaStatus(id, status) {
  return unwrap(
    await supabase
      .from("ideas")
      .update({ status })
      .eq("id", id)
      .select()
      .single(),
  );
}

export async function getCollabs() {
  const posts = unwrap(
    await supabase
      .from("collab_posts")
      .select("*")
      .order("created_at", { ascending: false }),
  );
  const comments = unwrap(
    await supabase
      .from("collab_comments")
      .select("*")
      .order("created_at", { ascending: true }),
  );
  const ids = [
    ...new Set([
      ...(posts || []).map((item) => item.user_id),
      ...(comments || []).map((item) => item.user_id),
    ]),
  ];
  const profiles = ids.length
    ? unwrap(
        await supabase
          .from("profiles")
          .select("id,username,avatar,rank")
          .in("id", ids),
      )
    : [];
  const byId = Object.fromEntries(
    (profiles || []).map((profile) => [profile.id, profile]),
  );
  return (posts || []).map((item) => ({
    ...item,
    profile: byId[item.user_id],
    comments: (comments || [])
      .filter((comment) => comment.post_id === item.id)
      .map((comment) => ({ ...comment, profile: byId[comment.user_id] })),
  }));
}

export async function createCollab(userId, fields) {
  return unwrap(
    await supabase
      .from("collab_posts")
      .insert({ user_id: userId, ...fields })
      .select()
      .single(),
  );
}

export async function updateCollab(id, userId, fields) {
  return unwrap(
    await supabase
      .from("collab_posts")
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .single(),
  );
}

export async function deleteCollab(id) {
  return unwrap(await supabase.from("collab_posts").delete().eq("id", id));
}

export async function createCollabComment(postId, userId, comment) {
  const row = unwrap(
    await supabase
      .from("collab_comments")
      .insert({ post_id: postId, user_id: userId, comment })
      .select()
      .single(),
  );
  const { error } = await supabase.rpc("create_collab_comment_notification", {
    target_post_id: postId,
  });
  if (error) console.warn("Could not create collaboration notification", error);
  return row;
}

export async function updateCollabComment(id, userId, comment) {
  return unwrap(
    await supabase
      .from("collab_comments")
      .update({ comment, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .single(),
  );
}

export async function deleteCollabComment(id) {
  return unwrap(await supabase.from("collab_comments").delete().eq("id", id));
}

export async function getMeetups() {
  return unwrap(
    await supabase
      .from("meetup_requests")
      .select("*")
      .order("meetup_date", { ascending: true })
      .order("start_time", { ascending: true }),
  );
}

export async function getMeetupAvailability() {
  const earliestRelevantDay = new Date();
  earliestRelevantDay.setDate(earliestRelevantDay.getDate() - 2);
  return unwrap(
    await supabase
      .from("meetup_availability_blocks")
      .select(
        "id,user_id,block_date,all_day,start_time,end_time,time_zone,indefinite",
      )
      .or(
        `indefinite.eq.true,block_date.gte.${localDateKey(earliestRelevantDay)}`,
      )
      .order("block_date")
      .order("start_time"),
  );
}

export async function addMeetupAvailability(userId, fields) {
  return unwrap(
    await supabase
      .from("meetup_availability_blocks")
      .insert({
        user_id: userId,
        block_date: fields.block_date,
        all_day: Boolean(fields.all_day),
        start_time: fields.all_day ? null : fields.start_time,
        end_time: fields.all_day ? null : fields.end_time,
        time_zone: fields.time_zone,
      })
      .select()
      .single(),
  );
}

export async function deleteMeetupAvailability(id, userId) {
  return unwrap(
    await supabase
      .from("meetup_availability_blocks")
      .delete()
      .eq("id", id)
      .eq("user_id", userId),
  );
}

export async function setLongTermMeetupAvailability(userId, enabled, timeZone) {
  const existing = unwrap(
    await supabase
      .from("meetup_availability_blocks")
      .select("id")
      .eq("user_id", userId)
      .eq("indefinite", true)
      .maybeSingle(),
  );
  if (!enabled) {
    if (!existing) return null;
    return unwrap(
      await supabase
        .from("meetup_availability_blocks")
        .delete()
        .eq("id", existing.id)
        .eq("user_id", userId),
    );
  }
  const values = {
    block_date: localDateKey(new Date()),
    all_day: true,
    start_time: null,
    end_time: null,
    time_zone: timeZone,
    indefinite: true,
  };
  if (existing) {
    return unwrap(
      await supabase
        .from("meetup_availability_blocks")
        .update(values)
        .eq("id", existing.id)
        .eq("user_id", userId)
        .select()
        .single(),
    );
  }
  return unwrap(
    await supabase
      .from("meetup_availability_blocks")
      .insert({ user_id: userId, ...values })
      .select()
      .single(),
  );
}

export async function respondToMeetup(meetupId, response) {
  const updated = unwrap(
    await supabase.rpc("respond_to_meetup_invitation", {
      target_meetup_id: meetupId,
      response,
    }),
  );
  const { error } = await supabase.functions.invoke("send-meetup-email", {
    body: { meetupId, status: response },
  });
  return { ...updated, emailSent: !error };
}

export async function createMeetup(userId, fields) {
  if (!fields.meetup_date) throw new Error("Please select an available day.");
  const occupied = unwrap(
    await supabase
      .from("meetup_requests")
      .select(
        "id,user_id,with_user_id,meetup_date,start_time,time_zone,duration",
      )
      .eq("status", "approved")
      .limit(100),
  );
  if (
    (!fields.with_user_id &&
      occupied.some(
        (item) => meetupLocalDateKey(item) === fields.meetup_date,
      )) ||
    occupied.some(
      (item) =>
        meetupLocalDateKey(item) === fields.meetup_date &&
        ([item.user_id, item.with_user_id].includes(userId) ||
          [item.user_id, item.with_user_id].includes(fields.with_user_id)),
    )
  )
    throw new Error(
      fields.with_user_id
        ? "One of you already has an approved meetup that day."
        : "That day is already occupied. Please choose another date.",
    );
  const duplicate = unwrap(
    await supabase
      .from("meetup_requests")
      .select("id,status,meetup_date,start_time,time_zone")
      .eq("user_id", userId)
      .in("status", ["pending", "approved"])
      .limit(100),
  );
  const requestedInstant = zonedDateTime(
    fields.meetup_date,
    fields.start_time,
    fields.time_zone,
  ).getTime();
  if (
    duplicate.some((item) => meetupInstant(item).getTime() === requestedInstant)
  )
    throw new Error("You already requested a meetup at this time.");
  const recurrenceRule = fields.recurrence_rule || "none";
  const recurrenceCount = Math.min(12, Math.max(1, Number(fields.recurrence_count) || 1));
  const seriesId = recurrenceRule === "none" ? null : crypto.randomUUID();
  const addMonths = (key, count) => {
    const [year, month, day] = key.split("-").map(Number);
    const targetMonth = month - 1 + count;
    const lastDay = new Date(year, targetMonth + 1, 0, 12).getDate();
    const date = new Date(year, targetMonth, Math.min(day, lastDay), 12);
    return localDateKey(date);
  };
  const addDays = (key, count) => {
    const [year, month, day] = key.split("-").map(Number);
    const date = new Date(year, month - 1, day + count, 12);
    return localDateKey(date);
  };
  const { recurrence_count: _ignored, ...baseFields } = fields;
  const rows = Array.from({ length: recurrenceCount }, (_, index) => ({
    user_id: userId,
    ...baseFields,
    meetup_date:
      recurrenceRule === "weekly"
        ? addDays(fields.meetup_date, index * 7)
        : recurrenceRule === "monthly"
          ? addMonths(fields.meetup_date, index)
          : fields.meetup_date,
    recurrence_rule: recurrenceRule,
    recurrence_series_id: seriesId,
    recurrence_index: index,
    status: "pending",
  }));
  const createdResult = unwrap(
    await supabase
      .from("meetup_requests")
      .insert(rows.length === 1 ? rows[0] : rows)
      .select(),
  );
  const createdRows = Array.isArray(createdResult)
    ? createdResult
    : [createdResult];
  const created = createdRows[0];
  const { error } = await supabase.functions.invoke("send-meetup-email", {
    body: { meetupId: created.id, status: "pending" },
  });
  return { ...created, emailSent: !error, recurrenceCount: createdRows.length };
}

export async function cancelMeetup(id, userId) {
  return unwrap(
    await supabase
      .from("meetup_requests")
      .delete()
      .eq("id", id)
      .eq("user_id", userId)
      .eq("status", "pending"),
  );
}

export async function createUserReport(
  reporterId,
  reportedUserId,
  reason,
  context = "",
) {
  if (reporterId === reportedUserId)
    throw new Error("You cannot report your own profile.");
  return unwrap(
    await supabase
      .from("user_reports")
      .insert({
        reporter_id: reporterId,
        reported_user_id: reportedUserId,
        reason: String(reason).trim(),
        context: String(context).trim() || null,
      })
      .select("id,status,created_at")
      .single(),
  );
}

export async function updateProfile(userId, fields) {
  return unwrap(
    await supabase
      .from("profiles")
      .update(fields)
      .eq("id", userId)
      .select()
      .single(),
  );
}

export async function uploadAvatar(userId, file) {
  const types = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
  };
  const extension = types[file.type];
  if (!extension || file.size > 5 * 1024 * 1024)
    throw new Error("Choose a PNG, JPG, WebP, or GIF image under 5 MB.");
  const objectPath = `${userId}/${crypto.randomUUID()}.${extension}`;
  unwrap(
    await supabase.storage.from("avatars").upload(objectPath, file, {
      contentType: file.type,
      cacheControl: "3600",
    }),
  );
  const publicUrl = supabase.storage.from("avatars").getPublicUrl(objectPath)
    .data.publicUrl;
  supabase.functions
    .invoke("cleanup-profile-avatars", { body: { action: "drain" } })
    .catch(() => {});
  return publicUrl;
}

export async function getConversations(userId) {
  const conversations = unwrap(
    await supabase
      .from("dm_conversations")
      .select("*")
      .or(`user_one.eq.${userId},user_two.eq.${userId}`)
      .order("updated_at", { ascending: false }),
  );
  const otherIds = [
    ...new Set(
      (conversations || []).map((item) =>
        item.user_one === userId ? item.user_two : item.user_one,
      ),
    ),
  ];
  const people = otherIds.length
    ? unwrap(
        await supabase
          .from("profiles")
          .select("id,username,avatar,rank,last_seen,online")
          .in("id", otherIds),
      )
    : [];
  const byId = Object.fromEntries(
    (people || []).map((profile) => [profile.id, profile]),
  );
  return (conversations || []).map((item) => ({
    ...item,
    person: byId[item.user_one === userId ? item.user_two : item.user_one],
  }));
}

export async function getMessages(conversationId) {
  const fiveDaysAgo = new Date(
    Date.now() - 5 * 24 * 60 * 60 * 1000,
  ).toISOString();
  return unwrap(
    await supabase
      .from("dm_messages")
      .select(
        "id,conversation_id,sender_id,content,created_at,reply_to_id,is_reply",
      )
      .eq("conversation_id", conversationId)
      .gte("created_at", fiveDaysAgo)
      .order("created_at"),
  );
}

export async function sendMessage(
  conversationId,
  userId,
  otherUserId,
  content,
  replyToId = null,
) {
  const message = unwrap(
    await supabase
      .from("dm_messages")
      .insert({
        conversation_id: conversationId,
        sender_id: userId,
        content,
        reply_to_id: replyToId,
      })
      .select()
      .single(),
  );
  const { error } = await supabase.rpc("create_dm_notification", {
    target_user_id: otherUserId,
    target_conversation_id: conversationId,
  });
  if (error)
    console.warn("Could not create direct-message notification", error);
  return message;
}

export async function requestConversation(user, profile, other) {
  const userId = user.id;
  const otherId = other.id;
  const [userOne, userTwo] = [userId, otherId].sort();
  const existing = unwrap(
    await supabase
      .from("dm_conversations")
      .select("id")
      .eq("user_one", userOne)
      .eq("user_two", userTwo)
      .maybeSingle(),
  );
  if (existing) return { conversationId: existing.id };
  if (
    String(profile?.rank || "")
      .trim()
      .toLowerCase() === "captain"
  ) {
    const created = unwrap(
      await supabase
        .from("dm_conversations")
        .insert({ user_one: userOne, user_two: userTwo })
        .select("id")
        .single(),
    );
    return { conversationId: created.id };
  }
  const requests = unwrap(
    await supabase
      .from("dm_requests")
      .select("id,sender_id,recipient_id,status")
      .eq("status", "Pending")
      .or(
        `and(sender_id.eq.${userId},recipient_id.eq.${otherId}),and(sender_id.eq.${otherId},recipient_id.eq.${userId})`,
      ),
  );
  if (requests?.length) {
    if (requests[0].sender_id === otherId) return { pendingIncoming: true };
    return { pendingOutgoing: true };
  }
  unwrap(
    await supabase
      .from("dm_requests")
      .insert({ sender_id: userId, recipient_id: otherId, status: "Pending" }),
  );
  await supabase.rpc("create_notification", {
    target_user_id: otherId,
    notification_type: "message_request",
    notification_title: "New Message Request",
    notification_message: `${profile?.username || "Someone"} wants to start a conversation with you.`,
    notification_link: "Messages.html",
  });
  return { requestSent: true };
}

export async function getMessageRequests(userId) {
  const requests = unwrap(
    await supabase
      .from("dm_requests")
      .select("*")
      .eq("recipient_id", userId)
      .eq("status", "Pending")
      .order("created_at", { ascending: false }),
  );
  const ids = [...new Set((requests || []).map((item) => item.sender_id))];
  const profiles = ids.length
    ? unwrap(
        await supabase
          .from("profiles")
          .select("id,username,avatar,rank,last_seen")
          .in("id", ids),
      )
    : [];
  const byId = Object.fromEntries(profiles.map((item) => [item.id, item]));
  return requests.map((item) => ({ ...item, person: byId[item.sender_id] }));
}

export async function respondToMessageRequest(
  request,
  userId,
  status,
  username,
) {
  const updated = unwrap(
    await supabase
      .from("dm_requests")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", request.id)
      .eq("recipient_id", userId)
      .eq("status", "Pending")
      .select()
      .maybeSingle(),
  );
  if (!updated) return null;
  if (status === "Declined") {
    await supabase.rpc("create_notification", {
      target_user_id: request.sender_id,
      notification_type: "message_request",
      notification_title: "Message Request Declined",
      notification_message: `${username || "A crew member"} declined your message request.`,
      notification_link: "Messages.html",
    });
    return null;
  }
  const [userOne, userTwo] = [userId, request.sender_id].sort();
  let conversation = unwrap(
    await supabase
      .from("dm_conversations")
      .select("id")
      .eq("user_one", userOne)
      .eq("user_two", userTwo)
      .maybeSingle(),
  );
  if (!conversation)
    conversation = unwrap(
      await supabase
        .from("dm_conversations")
        .insert({ user_one: userOne, user_two: userTwo })
        .select("id")
        .single(),
    );
  return conversation.id;
}

export async function editMessage(id, userId, content) {
  return unwrap(
    await supabase.rpc("edit_dm_message", {
      message_key: id,
      new_content: content,
    }),
  );
}

export async function deleteMessage(id, userId) {
  return unwrap(
    await supabase
      .from("dm_messages")
      .delete()
      .eq("id", id)
      .eq("sender_id", userId),
  );
}

export async function getGroupConversations(userId) {
  const memberships = unwrap(
    await supabase
      .from("group_members")
      .select("group_id")
      .eq("user_id", userId),
  );
  const ids = (memberships || []).map((row) => row.group_id);
  if (!ids.length) return [];
  return unwrap(
    await supabase
      .from("group_conversations")
      .select("id,name,avatar_url,owner_id,updated_at")
      .in("id", ids)
      .order("updated_at", { ascending: false }),
  );
}

export async function getGroupDetails(groupId) {
  const group = unwrap(
    await supabase
      .from("group_conversations")
      .select("id,name,avatar_url,owner_id")
      .eq("id", groupId)
      .maybeSingle(),
  );
  if (!group)
    throw new Error("Group unavailable or you are no longer a member.");
  const rows = unwrap(
    await supabase
      .from("group_members")
      .select("user_id,role")
      .eq("group_id", groupId),
  );
  const ids = (rows || []).map((row) => row.user_id);
  const people = ids.length
    ? unwrap(
        await supabase
          .from("profiles")
          .select("id,username,avatar,rank,last_seen")
          .in("id", ids),
      )
    : [];
  const roles = Object.fromEntries((rows || []).map((row) => [row.user_id, row.role || (row.user_id === group.owner_id ? "owner" : "member")]));
  return { ...group, members: (people || []).map((person) => ({ ...person, groupRole: roles[person.id] || "member" })) };
}

export async function getGroupMessages(groupId) {
  return unwrap(
    await supabase
      .from("group_messages")
      .select(
        "id,group_id,sender_id,content,created_at,edited_at,reply_to_id,is_reply",
      )
      .eq("group_id", groupId)
      .order("created_at", { ascending: false })
      .limit(500),
  ).reverse();
}

export async function sendGroupMessage(
  groupId,
  userId,
  content,
  replyToId = null,
) {
  const message = unwrap(
    await supabase
      .from("group_messages")
      .insert({
        group_id: groupId,
        sender_id: userId,
        content,
        reply_to_id: replyToId,
      })
      .select()
      .single(),
  );
  const [{ data: group }, { data: memberships }, { data: sender }] =
    await Promise.all([
      supabase
        .from("group_conversations")
        .select("name")
        .eq("id", groupId)
        .maybeSingle(),
      supabase
        .from("group_members")
        .select("user_id")
        .eq("group_id", groupId)
        .neq("user_id", userId),
      supabase
        .from("profiles")
        .select("username")
        .eq("id", userId)
        .maybeSingle(),
    ]);
  await Promise.allSettled(
    (memberships || []).map(({ user_id: targetUserId }) =>
      supabase.rpc("create_notification", {
        target_user_id: targetUserId,
        notification_type: "message",
        notification_title: `New group message in ${group?.name || "your group"}`,
        notification_message: `${sender?.username || "A member"} sent a message.`,
        notification_link: `Conversation.html?group=${encodeURIComponent(groupId)}`,
      }),
    ),
  );
  return message;
}

export async function editGroupMessage(id, userId, content) {
  return unwrap(
    await supabase
      .from("group_messages")
      .update({ content })
      .eq("id", id)
      .eq("sender_id", userId)
      .select("id,content,edited_at")
      .maybeSingle(),
  );
}

export async function deleteGroupMessage(id, userId) {
  return unwrap(
    await supabase
      .from("group_messages")
      .delete()
      .eq("id", id)
      .eq("sender_id", userId),
  );
}

export async function uploadGroupAvatar(userId, file) {
  const types = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
  };
  const extension = types[file?.type];
  if (!extension || file.size > 5 * 1024 * 1024)
    throw new Error("Choose a PNG, JPG, or WebP picture under 5 MB.");
  const objectPath = `${userId}/${crypto.randomUUID()}.${extension}`;
  unwrap(
    await supabase.storage
      .from("group-avatars")
      .upload(objectPath, file, { contentType: file.type }),
  );
  return supabase.storage.from("group-avatars").getPublicUrl(objectPath).data
    .publicUrl;
}

export async function createGroupConversation(
  userId,
  profile,
  memberIds,
  name,
  file,
) {
  if (memberIds.length < 2 || memberIds.length > 9)
    throw new Error("Choose between 2 and 9 other crew members.");
  const avatarUrl = await uploadGroupAvatar(userId, file);
  const groupId = unwrap(
    await supabase.rpc("create_group_chat", {
      member_ids: memberIds,
      group_name: name.slice(0, 50),
      image_url: avatarUrl,
    }),
  );
  await Promise.allSettled(
    memberIds.map((target) =>
      supabase.rpc("create_notification", {
        target_user_id: target,
        notification_type: "message",
        notification_title: "Added to a group conversation",
        notification_message: `${profile?.username || "A crew member"} added you to ${name}.`,
        notification_link: `Conversation.html?group=${encodeURIComponent(groupId)}`,
      }),
    ),
  );
  return groupId;
}

export async function leaveGroupConversation(groupId, newOwner = null) {
  return unwrap(
    await supabase.rpc("leave_group_chat", {
      group_key: groupId,
      new_owner: newOwner,
    }),
  );
}

export async function renameGroupConversation(groupId, userId, name) {
  const value = String(name || "")
    .trim()
    .slice(0, 50);
  if (!value) throw new Error("Enter a group name.");
  return unwrap(
    await supabase
      .from("group_conversations")
      .update({ name: value })
      .eq("id", groupId)
      .eq("owner_id", userId)
      .select("id,name")
      .maybeSingle(),
  );
}

export async function changeGroupAvatar(groupId, userId, file) {
  const avatarUrl = await uploadGroupAvatar(userId, file);
  return unwrap(
    await supabase
      .from("group_conversations")
      .update({ avatar_url: avatarUrl })
      .eq("id", groupId)
      .eq("owner_id", userId)
      .select("id,avatar_url")
      .maybeSingle(),
  );
}

export async function manageGroupMember(
  groupId,
  targetUserId,
  operation,
  groupName = "the group",
) {
  const result = unwrap(
    await supabase.rpc("moderate_group_member", {
      group_key: groupId,
      target_user: targetUserId,
      operation,
    }),
  );
  if (operation === "invite")
    await supabase.rpc("create_notification", {
      target_user_id: targetUserId,
      notification_type: "message",
      notification_title: "Added to a group conversation",
      notification_message: `You were invited to ${groupName}.`,
      notification_link: `Conversation.html?group=${encodeURIComponent(groupId)}`,
    });
  return result;
}

export async function getNotifications(userId) {
  return unwrap(
    await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(80),
  );
}

export async function markNotificationRead(id, userId) {
  return unwrap(
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", id)
      .eq("user_id", userId),
  );
}

export async function clearNotifications(userId) {
  return unwrap(
    await supabase.from("notifications").delete().eq("user_id", userId),
  );
}

async function functionErrorMessage(error, data, fallback) {
  if (data?.error) return data.error;
  try {
    const body = await error?.context?.json?.();
    if (body?.error) return body.error;
  } catch {}
  return error?.message || fallback;
}

export async function startSupportCheckout(tier, displayName) {
  const { data, error } = await supabase.functions.invoke(
    "create-support-checkout",
    { body: { tier, displayName } },
  );
  if (error) throw error;
  if (!data?.url)
    throw new Error(data?.error || "Checkout did not return a secure link.");
  return data.url;
}

export async function getSupporters() {
  return unwrap(
    await supabase
      .from("supporters")
      .select("username,avatar,support_tier")
      .order("username"),
  );
}

export async function manageSupportSubscription(action, tier) {
  const body =
    action === "cancel" ? { action } : { action: "change_tier", tier };
  const { data, error } = await supabase.functions.invoke(
    "manage-support-subscription",
    { body },
  );
  if (error || data?.error)
    throw new Error(
      await functionErrorMessage(
        error,
        data,
        "The subscription could not be updated.",
      ),
    );
  return data;
}
