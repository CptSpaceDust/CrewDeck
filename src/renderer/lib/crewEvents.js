import { supabase } from "./supabase";

export function createCrewEventsEngine(client = supabase) {
  async function list({ mine = false, userId, includeCancelled = false } = {}) {
    let query = client
      .from("crew_events")
      .select(
        "*,members:crew_event_members(*,profile:profiles(id,username,avatar,rank)),announcements:crew_event_announcements(*),files:crew_event_files(*)",
      )
      .order("starts_at");
    if (!includeCancelled) query = query.neq("status", "cancelled");
    const { data, error } = await query;
    if (error) throw error;
    return mine
      ? (data || []).filter(
          (event) =>
            event.host_id === userId ||
            event.members?.some((member) => member.user_id === userId),
        )
      : data || [];
  }
  async function create(event, invitedUserIds = []) {
    const { data, error } = await client.rpc("create_crew_event_series", {
      event_data: event,
      invited_users: [...new Set(invitedUserIds.filter(Boolean))],
    });
    if (error) throw error;
    return data || [];
  }
  async function respond(eventId, response) {
    const { data, error } = await client.rpc("respond_to_crew_event", {
      event_key: eventId,
      new_response: response,
    });
    if (error) throw error;
    return data;
  }
  async function checkIn(eventId, status) {
    const { error } = await client.rpc("check_in_crew_event", {
      event_key: eventId,
      new_status: status,
    });
    if (error) throw error;
  }
  async function update(eventId, changes) {
    const allowed = [
      "title",
      "description",
      "banner_path",
      "tags",
      "location_name",
      "join_url",
      "instructions",
      "visibility",
      "selected_group_id",
      "starts_at",
      "duration_minutes",
      "time_zone",
      "capacity",
      "minimum_attendance",
      "auto_waitlist",
      "rsvp_deadline",
      "status",
    ];
    const payload = Object.fromEntries(
      Object.entries(changes).filter(([key]) => allowed.includes(key)),
    );
    const { data, error } = await client
      .from("crew_events")
      .update(payload)
      .eq("id", eventId)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
  async function setRole(eventId, userId, role) {
    const { error } = await client
      .from("crew_event_members")
      .update({ role })
      .eq("event_id", eventId)
      .eq("user_id", userId);
    if (error) throw error;
  }
  async function transferHost(eventId, userId) {
    const { error } = await client.rpc("transfer_crew_event_host", {
      event_key: eventId,
      new_host: userId,
    });
    if (error) throw error;
  }
  async function leave(eventId) {
    const { error } = await client.rpc("leave_crew_event", {
      event_key: eventId,
    });
    if (error) throw error;
  }
  async function cancel(eventId, reason = "") {
    const { error } = await client.rpc("cancel_crew_event", {
      event_key: eventId,
      reason,
    });
    if (error) throw error;
  }
  async function announce(eventId, authorId, body) {
    const { error } = await client
      .from("crew_event_announcements")
      .insert({ event_id: eventId, author_id: authorId, body });
    if (error) throw error;
  }
  async function uploadFile(eventId, userId, file) {
    if (!file || file.size > 10 * 1024 * 1024)
      throw new Error("Event files must be 10 MB or smaller.");
    const safeName = file.name.replace(/[^a-z0-9._-]+/gi, "-");
    const storagePath = `${eventId}/${crypto.randomUUID()}-${safeName}`;
    const { error: uploadError } = await client.storage
      .from("crew-event-files")
      .upload(storagePath, file, { contentType: file.type, upsert: false });
    if (uploadError) throw uploadError;
    const { error } = await client.from("crew_event_files").insert({
      event_id: eventId,
      uploaded_by: userId,
      storage_path: storagePath,
      file_name: file.name,
      mime_type: file.type,
      size_bytes: file.size,
    });
    if (error) {
      await client.storage.from("crew-event-files").remove([storagePath]);
      throw error;
    }
  }
  async function openFile(file) {
    const { data, error } = await client.storage
      .from("crew-event-files")
      .createSignedUrl(file.storage_path, 300);
    if (error) throw error;
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }
  async function deleteFile(file) {
    const { error: storageError } = await client.storage
      .from("crew-event-files")
      .remove([file.storage_path]);
    if (storageError) throw storageError;
    const { error } = await client
      .from("crew_event_files")
      .delete()
      .eq("id", file.id);
    if (error) throw error;
  }
  async function saveNotifications(eventId, userId, settings) {
    const { error } = await client
      .from("crew_event_notification_settings")
      .upsert(
        {
          event_id: eventId,
          user_id: userId,
          ...settings,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "event_id,user_id" },
      );
    if (error) throw error;
  }
  function subscribe(onChange) {
    const channel = client
      .channel(`crew-events-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "crew_events" },
        onChange,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "crew_event_members" },
        onChange,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "crew_event_announcements" },
        onChange,
      )
      .subscribe();
    return () => client.removeChannel(channel);
  }
  return {
    list,
    create,
    respond,
    checkIn,
    update,
    setRole,
    transferHost,
    leave,
    cancel,
    announce,
    uploadFile,
    openFile,
    deleteFile,
    saveNotifications,
    subscribe,
  };
}

export const crewEvents = createCrewEventsEngine();
