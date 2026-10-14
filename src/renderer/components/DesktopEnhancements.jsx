import { useEffect, useState } from "react";
import { CheckCircle2, CloudOff, Minus, Wrench, X } from "lucide-react";
import { getMeetups } from "../lib/data";
import { getPreferences, isQuietTime } from "../lib/preferences";
import { playNotificationSound } from "../lib/sounds";
import { meetupInstant } from "../lib/time";
import { getMeetupParticipantSettings } from "../lib/crewFeatures";
import BrandMark from "./BrandMark";

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
          (setting) => setting.meetup_id === item.id && setting.user_id === userId,
        );
        const reminderMinutes = Number(
          custom?.reminder_minutes || settings.reminderMinutes,
        );
        const windowMs = reminderMinutes * 60000;
        const start = meetupInstant(item).getTime();
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
                Page recovery keeps a broken screen from turning the whole app
                blank, and message views now include reliable refresh controls.
              </p>
            </div>
          </article>
          <article className="change-card changed">
            <Wrench />
            <div>
              <strong>Changed</strong>
              <p>
                Messages appear immediately after sending. Group polls, roles,
                and management now live in one cleaner options menu. Settings,
                Meetup Calendar, Control Center, and startup visuals are also
                more reliable and organized.
              </p>
            </div>
          </article>
          <article className="change-card removed">
            <Minus />
            <div>
              <strong>Removed</strong>
              <p>
                Removed the unused message search boxes and repeated connected
                device labels from Control Center.
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
