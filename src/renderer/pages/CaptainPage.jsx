import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { Loading } from "../components/ui";
import { read, requireCaptain } from "../lib/captain";
import CaptainControls from "../components/CaptainControls";
import "../captain-shared.css";
import "../captain.css";
import "../captain-desktop.css";

export default function CaptainPage({ user, profile }) {
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [notice, setNotice] = useState("");
  const [data, setData] = useState({});
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const refreshingRef = useRef(false);
  const generation = useRef(0);
  const working = useRef(false);
  const load = useCallback(async () => {
    const token = ++generation.current;
    try {
      await requireCaptain();
      if (token !== generation.current) return;
      const queries = {
        crew: supabase
          .from("profiles")
          .select("id,username,avatar,rank")
          .order("username"),
        meetups: supabase
          .from("meetup_requests")
          .select(
            "id,user_id,with_user_id,invitee_status,meetup_date,start_time,time_zone,duration,message,meetup_type,status",
          )
          .in("status", ["pending", "approved"])
          .order("meetup_date"),
        restrictions: supabase
          .from("user_restrictions")
          .select("user_id,action,expires_at")
          .gt("expires_at", new Date().toISOString())
          .order("expires_at"),
        reports: supabase
          .from("user_reports")
          .select(
            "id,reporter_id,reported_user_id,reason,context,status,created_at",
          )
          .order("created_at", { ascending: false })
          .limit(200),
        appeals: supabase
          .from("moderation_appeals")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(200),
        flags: supabase
          .from("message_safety_flags")
          .select(
            "id,message_kind,conversation_id,sender_id,message_content,categories,status,detected_at,message_created_at",
          )
          .order("detected_at", { ascending: false })
          .limit(250),
        direct: supabase
          .from("dm_conversations")
          .select("id,user_one,user_two,updated_at")
          .order("updated_at", { ascending: false })
          .limit(300),
        groups: supabase
          .from("group_conversations")
          .select("id,name,avatar_url,updated_at")
          .order("updated_at", { ascending: false })
          .limit(300),
        settings: supabase
          .from("site_settings")
          .select("safe_mode")
          .eq("id", 1)
          .single(),
        friends: supabase
          .from("trusted_friends")
          .select("id,name,category,position")
          .order("position"),
        artists: supabase
          .from("music_artists")
          .select(
            "id,name,is_favorite,display_order,youtube_channel_id,youtube_url",
          )
          .order("display_order"),
        songs: supabase
          .from("music_songs")
          .select(
            "id,name,artist_id,display_order,youtube_video_id,youtube_url",
          )
          .order("display_order"),
        genres: supabase
          .from("music_genres")
          .select("id,name,display_order")
          .order("display_order"),
      };
      const next = {},
        failures = [];
      await Promise.all(
        Object.entries(queries).map(async ([key, query]) => {
          try {
            next[key] = await read(query);
          } catch (error) {
            failures.push(`${key}: ${error.message}`);
          }
        }),
      );
      if (token !== generation.current) return;
      setData(next);
      setAuthorized(true);
      setRefreshVersion((value) => value + 1);
      if (failures.length) setNotice(failures.join(" · "));
      return failures.length === 0;
    } catch (error) {
      if (token === generation.current) {
        setAuthorized(false);
        setData({});
        setNotice(error.message);
      }
    } finally {
      if (token === generation.current) setLoading(false);
    }
  }, [user.id]);
  async function refresh() {
    if (refreshingRef.current || working.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    setNotice("Refreshing captain panel…");
    try {
      if (await load())
        setNotice(`Panel refreshed at ${new Date().toLocaleTimeString()}.`);
    } finally {
      refreshingRef.current = false;
      setRefreshing(false);
    }
  }
  useEffect(() => {
    load();
    let refreshTimer;
    const schedule = () => {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(load, 400);
    };
    const channel = supabase.channel(`desktop-captain-${user.id}`);
    for (const table of [
      "meetup_requests",
      "user_restrictions",
      "user_reports",
      "moderation_appeals",
      "message_safety_flags",
      "trusted_friends",
      "music_artists",
      "music_songs",
      "music_genres",
      "site_settings",
    ])
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        schedule,
      );
    channel.subscribe();
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 60000);
    return () => {
      generation.current++;
      clearTimeout(refreshTimer);
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [load, user.id]);
  async function run(task, message = "Changes saved.") {
    if (working.current) return false;
    working.current = true;
    setBusy(true);
    setNotice("");
    try {
      await requireCaptain();
      await task();
      setNotice(message);
      await load();
      return true;
    } catch (error) {
      setNotice(error.message);
      if (error.message === "Captain access required.") {
        setAuthorized(false);
        setData({});
      }
      return false;
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  if (profile.rank?.toLowerCase() !== "captain")
    return <div className="page">Captain access required.</div>;
  if (loading)
    return (
      <div className="page">
        <Loading />
      </div>
    );
  if (!authorized)
    return (
      <div className="page">
        <p role="alert">{notice || "Captain access required."}</p>
      </div>
    );
  return (
    <CaptainControls
      data={data}
      user={user}
      run={run}
      busy={busy}
      onNotice={setNotice}
      notice={notice}
      onRefresh={refresh}
      refreshing={refreshing}
      refreshVersion={refreshVersion}
    />
  );
}
