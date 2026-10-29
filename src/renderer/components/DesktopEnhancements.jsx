import { useEffect, useState } from "react";
import { CheckCircle2, CloudOff, Wrench, X } from "lucide-react";
import { getMeetups } from "../lib/data";
import { getPreferences, isQuietTime } from "../lib/preferences";
import { playNotificationSound } from "../lib/sounds";
import { meetupInstant } from "../lib/time";
import { getMeetupParticipantSettings } from "../lib/crewFeatures";
import BrandMark from "./BrandMark";
import { supabase } from "../lib/supabase";

export function CommunityStatus() {
  const [state, setState] = useState(null);
  const [announcements, setAnnouncements] = useState([]);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const [system, notices] = await Promise.all([
        supabase
          .from("community_system_state")
          .select("*")
          .eq("id", true)
          .maybeSingle(),
        supabase
          .from("community_announcements")
          .select("id,title,body,target,publish_at,expires_at")
          .in("target", ["all", "app"])
          .lte("publish_at", new Date().toISOString())
          .order("publish_at", { ascending: false })
          .limit(3),
      ]);
      if (alive) {
        setState(system.data);
        setAnnouncements(
          (notices.data || []).filter(
            (item) =>
              !item.expires_at || new Date(item.expires_at) > new Date(),
          ),
        );
      }
    };
    load();
    const channel = supabase
      .channel("crewdeck-community-status")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "community_announcements" },
        load,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "community_system_state" },
        load,
      )
      .subscribe();
    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, []);
  if (!state?.maintenance_enabled && !announcements.length) return null;
  return (
    <div className="community-status-stack">
      {state?.maintenance_enabled && (
        <aside className="community-status maintenance">
          <strong>Maintenance mode</strong>
          <span>{state.maintenance_message}</span>
        </aside>
      )}
      {announcements.map((item) => (
        <details className="community-status" key={item.id}>
          <summary>{item.title}</summary>
          <p>{item.body}</p>
        </details>
      ))}
    </div>
  );
}

export function ConnectivityBanner() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const yes = () => setOnline(true),
      no = () => setOnline(false);
    addEventListener("online", yes);
    addEventListener("offline", no);
    return () => {
      removeEventListener("online", yes);
      removeEventListener("offline", no);
    };
  }, []);
  if (online) return null;
  return (
    <div className="offline-banner" role="status">
      <CloudOff /> You’re offline. Drafts are saved and the app will reconnect
      automatically.
    </div>
  );
}

export function useMeetupReminders(userId) {
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    async function check() {
      const settings = getPreferences();
      if (!settings.meetupReminders || isQuietTime(settings)) return;
      const rows = await getMeetups().catch(() => []);
      const mine = rows.filter(
        (row) =>
          (row.user_id === userId || row.with_user_id === userId) &&
          row.status === "approved",
      );
      const participantSettings = await getMeetupParticipantSettings(
        mine.map((item) => item.id),
      ).catch(() => []);
      const now = Date.now();
      for (const item of mine) {
        const custom = participantSettings.find(
          (setting) =>
            setting.meetup_id === item.id && setting.user_id === userId,
        );
        const reminderMinutes = Number(
          custom?.reminder_minutes || settings.reminderMinutes,
        );
        const windowMs = reminderMinutes * 60000;
        let start;
        try {
          start = meetupInstant(item).getTime();
        } catch {
          continue;
        }
        if (!Number.isFinite(start)) continue;
        const key = `meetup-reminder:${item.id}:${reminderMinutes}`;
        if (
          start > now &&
          start - now <= windowMs &&
          !localStorage.getItem(key)
        ) {
          localStorage.setItem(key, "sent");
          playNotificationSound();
          if (settings.desktopNotifications)
            window.desktop.notify(
              "Meetup starting soon",
              `${item.meetup_type || "Your meetup"} starts at ${new Date(start).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`,
              "MeetupCalendar.html",
              {
                hideWhenLocked: settings.hideNotificationContentWhenLocked,
              },
            );
        }
      }
    }
    check();
    const timer = setInterval(() => alive && check(), 60000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [userId]);
}

export function useMessageReminders(userId) {
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    async function check() {
      const now = new Date().toISOString();
      const { data: reminders } = await supabase
        .from("message_reminders")
        .select("id,message_excerpt,conversation_kind,conversation_id")
        .eq("user_id", userId)
        .is("delivered_at", null)
        .lte("remind_at", now)
        .limit(20);
      for (const reminder of reminders || []) {
        if (!alive) return;
        const link =
          reminder.conversation_kind === "group"
            ? `Conversation.html?group=${reminder.conversation_id}`
            : `Conversation.html?id=${reminder.conversation_id}`;
        await supabase.rpc("create_notification", {
          target_user_id: userId,
          notification_type: "message_reminder",
          notification_title: "Message reminder",
          notification_message: reminder.message_excerpt,
          notification_link: link,
        });
        await supabase
          .from("message_reminders")
          .update({ delivered_at: now })
          .eq("id", reminder.id)
          .eq("user_id", userId);
        playNotificationSound();
        window.desktop.notify(
          "Message reminder",
          reminder.message_excerpt,
          link,
        );
      }
    }
    check();
    const timer = setInterval(check, 60000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [userId]);
}

export function InactivityLock({ enabled }) {
  useEffect(() => {
    let timer;
    const reset = () => {
      clearTimeout(timer);
      const minutes = Number(getPreferences().inactivityLockMinutes);
      if (enabled && minutes > 0)
        timer = setTimeout(
          () => window.desktop.appLock.lockNow(),
          minutes * 60000,
        );
    };
    const events = ["pointerdown", "keydown", "wheel", "touchstart"];
    events.forEach((name) => addEventListener(name, reset, { passive: true }));
    addEventListener("desktop-preferences", reset);
    reset();
    return () => {
      clearTimeout(timer);
      events.forEach((name) => removeEventListener(name, reset));
      removeEventListener("desktop-preferences", reset);
    };
  }, [enabled]);
  return null;
}

export function WhatsNew() {
  const [version, setVersion] = useState("");
  useEffect(() => {
    window.desktop.updater.getState().then((state) => {
      const current = state.currentVersion;
      if (
        current &&
        current !== "development" &&
        localStorage.getItem("whats-new-seen") !== current
      )
        setVersion(current);
    });
  }, []);
  if (!version) return null;
  const close = () => {
    localStorage.setItem("whats-new-seen", version);
    setVersion("");
  };
  return (
    <div className="modal-backdrop">
      <section
        className="modal whats-new"
        role="dialog"
        aria-modal="true"
        aria-label="What's changed"
      >
        <div className="modal-header">
          <div>
            <span className="eyebrow">Version {version}</span>
            <h2>What’s Changed</h2>
          </div>
          <button className="icon-button" onClick={close}>
            <X />
          </button>
        </div>
        <div className="whats-new-hero">
          <BrandMark />
          <div>
            <strong>Here’s what changed</strong>
            <p>A quick look at what’s new in this version.</p>
          </div>
        </div>
        <div className="whats-changed-grid">
          <article className="change-card added">
            <CheckCircle2 />
            <div>
              <strong>Added</strong>
              <p>
                Universal Crew Search, the actionable Crew Inbox, live link
                previews, and a configurable VR overlay are ready.
              </p>
            </div>
          </article>
          <article className="change-card changed">
            <Wrench />
            <div>
              <strong>Changed</strong>
              <p>
                Unread totals and reminder emails now follow inbox snooze and
                dismiss choices across CrewDeck.
              </p>
            </div>
          </article>
          <article className="change-card fixed">
            <Wrench />
            <div>
              <strong>Fixed</strong>
              <p>
                Crew Event migration and older meetup backfills now handle
                legacy records safely.
              </p>
            </div>
          </article>
        </div>
        <button className="button primary" onClick={close}>
          Start exploring
        </button>
      </section>
    </div>
  );
}
