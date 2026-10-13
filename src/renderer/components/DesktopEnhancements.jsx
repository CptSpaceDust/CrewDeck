import { useEffect, useState } from "react";
import { CheckCircle2, CloudOff, Minus, Wrench, X } from "lucide-react";
import { getMeetups } from "../lib/data";
import { getPreferences, isQuietTime } from "../lib/preferences";
import { playNotificationSound } from "../lib/sounds";
import { meetupInstant } from "../lib/time";
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
      const now = Date.now(),
        windowMs = Number(settings.reminderMinutes) * 60000;
      for (const item of rows.filter(
        (row) =>
          (row.user_id === userId || row.with_user_id === userId) &&
          row.status === "approved",
      )) {
        const start = meetupInstant(item).getTime();
        const key = `meetup-reminder:${item.id}:${settings.reminderMinutes}`;
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
                A dedicated VRChat navigation section now keeps the
                badge-protected Control Center easy to find for Trusted People.
              </p>
            </div>
          </article>
          <article className="change-card changed">
            <Wrench />
            <div>
              <strong>Changed</strong>
              <p>
                Community pages follow the new requested order, refresh buttons
                show their loading state, and Control Center dials no longer
                select nearby text while you turn them.
              </p>
            </div>
          </article>
          <article className="change-card removed">
            <Minus />
            <div>
              <strong>Removed</strong>
              <p>
                The connected-device count and the Captain-rank shortcut for
                Control Center access. The Trusted Person badge is now required.
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
