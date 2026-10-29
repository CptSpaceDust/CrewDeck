import { supabase } from "./supabase";

export const COMMUNITY_BOARD_KINDS = Object.freeze([
  "idea",
  "collaboration",
  "help",
  "bug",
]);
const WRITE_FIELDS = new Set([
  "title",
  "body",
  "status",
  "tags",
  "assigned_to",
  "deadline",
  "related_kind",
  "related_id",
  "preferred_layout",
  "metadata",
  "resolved_at",
  "archived_at",
]);

function requireKind(kind) {
  if (!COMMUNITY_BOARD_KINDS.includes(kind))
    throw new Error("Choose a valid community board.");
  return kind;
}

function cleanTags(tags = []) {
  return [
    ...new Set(
      tags.map((tag) => String(tag).trim().toLowerCase()).filter(Boolean),
    ),
  ].slice(0, 12);
}

function selectWritable(changes) {
  return Object.fromEntries(
    Object.entries(changes || {}).filter(([key]) => WRITE_FIELDS.has(key)),
  );
}

export function createCommunityBoardEngine(client = supabase) {
  async function getWorkflow(kind) {
    requireKind(kind);
    const { data, error } = await client
      .from("community_board_workflows")
      .select("*")
      .eq("board_kind", kind)
      .single();
    if (error) throw error;
    return data;
  }

  async function updateWorkflow(kind, actorId, changes) {
    const payload = {
      ...Object.fromEntries(
        Object.entries(changes || {}).filter(([key]) =>
          [
            "statuses",
            "required_tags",
            "optional_tags",
            "default_layout",
            "transitions",
          ].includes(key),
        ),
      ),
      updated_by: actorId,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await client
      .from("community_board_workflows")
      .update(payload)
      .eq("board_kind", requireKind(kind))
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async function listPosts(
    kind,
    {
      status,
      includeArchived = false,
      resolved,
      tags = [],
      assignedTo,
      limit = 100,
    } = {},
  ) {
    requireKind(kind);
    let query = client
      .from("community_board_posts")
      .select(
        "*,author:profiles!community_board_posts_author_id_fkey(id,username,avatar,rank),assignee:profiles!community_board_posts_assigned_to_fkey(id,username,avatar)",
      )
      .eq("board_kind", kind)
      .order("created_at", { ascending: false })
      .limit(Math.max(1, Math.min(Number(limit) || 100, 250)));
    if (!includeArchived) query = query.is("archived_at", null);
    if (resolved === true) query = query.not("resolved_at", "is", null);
    if (resolved === false) query = query.is("resolved_at", null);
    if (tags.length) query = query.contains("tags", cleanTags(tags));
    if (assignedTo) query = query.eq("assigned_to", assignedTo);
    if (status)
      query = Array.isArray(status)
        ? query.in("status", status)
        : query.eq("status", status);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  async function createPost({
    kind,
    authorId,
    title,
    body,
    tags = [],
    status,
    ...details
  }) {
    const workflow = await getWorkflow(requireKind(kind));
    const normalizedTags = cleanTags(tags);
    const missing = (workflow.required_tags || []).filter(
      (tag) => !normalizedTags.includes(String(tag).toLowerCase()),
    );
    if (missing.length)
      throw new Error(`Add the required tags: ${missing.join(", ")}.`);
    const payload = {
      board_kind: kind,
      author_id: authorId,
      title: String(title || "").trim(),
      body: String(body || "").trim(),
      tags: normalizedTags,
      status: status || workflow.statuses?.[0] || "Open",
      ...selectWritable(details),
    };
    const { data, error } = await client
      .from("community_board_posts")
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async function updatePost(postId, changes) {
    const payload = selectWritable(changes);
    if (payload.tags) payload.tags = cleanTags(payload.tags);
    const { data, error } = await client
      .from("community_board_posts")
      .update(payload)
      .eq("id", postId)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async function deletePost(postId) {
    const { error } = await client
      .from("community_board_posts")
      .delete()
      .eq("id", postId);
    if (error) throw error;
  }

  async function transitionPost(post, nextStatus) {
    const workflow = await getWorkflow(post.board_kind);
    const allowed =
      workflow.transitions?.[post.status] || workflow.statuses || [];
    if (!allowed.includes(nextStatus))
      throw new Error(
        "Choose an available next step from this board's workflow.",
      );
    return updatePost(post.id, { status: nextStatus });
  }

  const resolvePost = (postId, resolved = true) =>
    updatePost(postId, {
      resolved_at: resolved ? new Date().toISOString() : null,
    });
  const archivePost = (postId, archived = true) =>
    updatePost(postId, {
      archived_at: archived ? new Date().toISOString() : null,
    });

  async function setFollowing(postId, userId, following) {
    const query = client.from("community_board_follows");
    const { error } = following
      ? await query.upsert(
          { post_id: postId, user_id: userId },
          { onConflict: "post_id,user_id" },
        )
      : await query.delete().eq("post_id", postId).eq("user_id", userId);
    if (error) throw error;
    return following;
  }

  async function getFollowing(postIds, userId) {
    if (!postIds.length || !userId) return new Set();
    const { data, error } = await client
      .from("community_board_follows")
      .select("post_id")
      .eq("user_id", userId)
      .in("post_id", postIds);
    if (error) throw error;
    return new Set((data || []).map((item) => item.post_id));
  }

  async function getDetails(postIds, userId) {
    if (!postIds.length)
      return {
        following: new Set(),
        assignments: [],
        links: [],
        duplicates: [],
        conversions: [],
      };
    const [following, assignments, links, duplicates, conversions] =
      await Promise.all([
        getFollowing(postIds, userId),
        client
          .from("community_board_assignments")
          .select(
            "*,profile:profiles!community_board_assignments_user_id_fkey(id,username,avatar)",
          )
          .in("post_id", postIds),
        client.from("community_board_links").select("*").in("post_id", postIds),
        client
          .from("community_board_duplicates")
          .select("*")
          .in("duplicate_post_id", postIds),
        client
          .from("community_board_conversions")
          .select("*")
          .in("post_id", postIds),
      ]);
    for (const result of [assignments, links, duplicates, conversions])
      if (result.error) throw result.error;
    return {
      following,
      assignments: assignments.data || [],
      links: links.data || [],
      duplicates: duplicates.data || [],
      conversions: conversions.data || [],
    };
  }

  async function getDiscussion(postIds) {
    if (!postIds.length) return { comments: [], reactions: [], artifacts: [], evidence: [] };
    const [comments, reactions, artifacts, evidence] = await Promise.all([
      client.from("community_board_comments").select("*,author:profiles!community_board_comments_author_id_fkey(id,username,avatar,rank)").in("post_id", postIds).order("created_at"),
      client.from("community_board_reactions").select("*").in("post_id", postIds),
      client.from("community_board_artifacts").select("*").in("post_id", postIds).order("created_at"),
      client.from("community_board_evidence").select("*").in("post_id", postIds).order("created_at"),
    ]);
    for (const result of [comments, reactions, artifacts, evidence]) if (result.error) throw result.error;
    return { comments: comments.data || [], reactions: reactions.data || [], artifacts: artifacts.data || [], evidence: evidence.data || [] };
  }

  async function resolveLink(kind, postId) {
    const { data, error } = await client.rpc("resolve_community_board_link", { p_board_kind: requireKind(kind), p_post_id: postId });
    if (error) throw error;
    return data;
  }

  async function getModerationContext(postId) {
    const { data, error } = await client.rpc("get_community_board_moderation_context", { p_post_id: postId });
    if (error) throw error;
    return data;
  }

  async function setAssignments(postId, userIds, actorId) {
    const ids = [...new Set((userIds || []).filter(Boolean))];
    const removed = await client
      .from("community_board_assignments")
      .delete()
      .eq("post_id", postId);
    if (removed.error) throw removed.error;
    if (ids.length) {
      const added = await client
        .from("community_board_assignments")
        .insert(
          ids.map((user_id) => ({
            post_id: postId,
            user_id,
            assigned_by: actorId,
          })),
        );
      if (added.error) throw added.error;
    }
    return ids;
  }

  async function addLink(postId, linkKind, linkedId, label, actorId) {
    const { data, error } = await client
      .from("community_board_links")
      .upsert(
        {
          post_id: postId,
          link_kind: linkKind,
          linked_id: linkedId,
          label: String(label || "").trim() || null,
          created_by: actorId,
        },
        { onConflict: "post_id,link_kind,linked_id" },
      )
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async function removeLink(linkId) {
    const { error } = await client
      .from("community_board_links")
      .delete()
      .eq("id", linkId);
    if (error) throw error;
  }

  async function findDuplicates(postId) {
    const { data, error } = await client.rpc(
      "find_community_board_duplicates",
      { post_key: postId, result_limit: 6 },
    );
    if (error) throw error;
    return data || [];
  }

  async function markDuplicate(
    duplicatePostId,
    canonicalPostId,
    actorId,
    reason = "",
  ) {
    const { data, error } = await client
      .from("community_board_duplicates")
      .upsert({
        duplicate_post_id: duplicatePostId,
        canonical_post_id: canonicalPostId,
        marked_by: actorId,
        reason: String(reason).trim() || null,
      })
      .select()
      .single();
    if (error) throw error;
    await archivePost(duplicatePostId, true);
    return data;
  }

  async function createConversion(post, targetKind, actorId) {
    const draft = {
      source_post_id: post.id,
      title: post.title,
      description: post.body,
      tags: post.tags || [],
      deadline: post.deadline || null,
    };
    const { data, error } = await client
      .from("community_board_conversions")
      .upsert(
        {
          post_id: post.id,
          target_kind: targetKind,
          draft,
          created_by: actorId,
        },
        { onConflict: "post_id,target_kind" },
      )
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async function getPreference(kind, userId) {
    const { data, error } = await client
      .from("community_board_preferences")
      .select("*")
      .eq("board_kind", requireKind(kind))
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    return (
      data || {
        user_id: userId,
        board_kind: kind,
        layout: "card",
        show_resolved: false,
        show_archived: false,
      }
    );
  }

  async function savePreference(kind, userId, changes) {
    const payload = {
      user_id: userId,
      board_kind: requireKind(kind),
      layout: changes.layout || "card",
      show_resolved: Boolean(changes.show_resolved),
      show_archived: Boolean(changes.show_archived),
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await client
      .from("community_board_preferences")
      .upsert(payload, { onConflict: "user_id,board_kind" })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  function subscribe(kind, onChange) {
    requireKind(kind);
    const channel = client
      .channel(`community-board-${kind}-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "community_board_posts",
          filter: `board_kind=eq.${kind}`,
        },
        onChange,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "community_board_follows" },
        onChange,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "community_board_assignments" },
        onChange,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "community_board_links" },
        onChange,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "community_board_comments" },
        onChange,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "community_board_reactions" },
        onChange,
      )
      .subscribe();
    return () => client.removeChannel(channel);
  }

  return {
    getWorkflow,
    updateWorkflow,
    listPosts,
    createPost,
    updatePost,
    deletePost,
    transitionPost,
    resolvePost,
    archivePost,
    setFollowing,
    getFollowing,
    getDetails,
    getDiscussion,
    resolveLink,
    getModerationContext,
    setAssignments,
    addLink,
    removeLink,
    findDuplicates,
    markDuplicate,
    createConversion,
    getPreference,
    savePreference,
    subscribe,
  };
}

export const communityBoards = createCommunityBoardEngine();
