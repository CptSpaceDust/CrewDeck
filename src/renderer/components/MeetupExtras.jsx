import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarPlus, Clock3, Download } from "lucide-react";
import {
  downloadMeetupIcs,
  getMeetupParticipantSettings,
  meetupCalendarUrl,
  saveMeetupParticipantSetting,
} from "../lib/crewFeatures";
import { meetupInstant } from "../lib/time";
import { supabase } from "../lib/supabase";

export function MeetupCountdown({ meetups, userId, profiles = [] }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const next = useMemo(
    () =>
      (Array.isArray(meetups) ? meetups : [])
        .map((item) => {
          try {
            const instant = meetupInstant(item);
            return Number.isFinite(instant.getTime())
              ? { item, instant }
              : null;
          } catch {
            return null;
          }
        })
        .filter(
          (entry) =>
            entry &&
            entry.item.status === "approved" &&
            [entry.item.user_id, entry.item.with_user_id].includes(userId) &&
            entry.instant.getTime() > now,
        )
        .sort((a, b) => a.instant - b.instant)[0],
    [meetups, userId, now],
  );
  if (!next) return null;
  const distance = next.instant.getTime() - now;
  const days = Math.floor(distance / 86400000);
  const hours = Math.floor((distance % 86400000) / 3600000);
  const mins = Math.floor((distance % 3600000) / 60000);
  const secs = Math.floor((distance % 60000) / 1000);
  const other = (Array.isArray(profiles) ? profiles : []).find(
    (person) =>
      person.id ===
      (next.item.user_id === userId
        ? next.item.with_user_id
        : next.item.user_id),
  );
  return (
    <section className="panel meetup-countdown">
      <Clock3 />
      <div>
        <span>Next meetup with {other?.username || "your crew member"}</span>
        <strong>
          {days ? `${days}d ` : ""}
          {String(hours).padStart(2, "0")}:{String(mins).padStart(2, "0")}:
          {String(secs).padStart(2, "0")}
        </strong>
        <small>{next.instant.toLocaleString()}</small>
      </div>
    </section>
  );
}

export function MeetupTools({
  meetup,
  userId,
  otherName,
  settings,
  onChanged,
}) {
  const safeSettings = Array.isArray(settings) ? settings : [];
  const mine = safeSettings.find(
    (item) => item.meetup_id === meetup.id && item.user_id === userId,
  );
  const otherId =
    meetup.user_id === userId ? meetup.with_user_id : meetup.user_id;
  const other = safeSettings.find(
    (item) => item.meetup_id === meetup.id && item.user_id === otherId,
  );
  const checkInLabels = {
    pending: "Not checked in",
    arrived: "Here",
    late: "Running late",
    unable: "Can’t attend",
  };
  const [busy, setBusy] = useState(false);
  const save = async (changes) => {
    setBusy(true);
    try {
      await saveMeetupParticipantSetting(meetup.id, userId, {
        reminder_minutes: mine?.reminder_minutes || 60,
        check_in_status: mine?.check_in_status || "pending",
        ...changes,
      });
      await onChanged();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="meetup-extra-tools">
      <label>
        Reminder
        <select
          disabled={busy}
          value={mine?.reminder_minutes || 60}
          onChange={(event) =>
            save({ reminder_minutes: Number(event.target.value) })
          }
        >
          <option value="15">15 minutes before</option>
          <option value="60">1 hour before</option>
          <option value="1440">1 day before</option>
        </select>
      </label>
      <label>
        Check in
        <select
          disabled={busy || meetup.status !== "approved"}
          value={mine?.check_in_status || "pending"}
          onChange={(event) =>
            save({
              check_in_status: event.target.value,
              checked_in_at: new Date().toISOString(),
            })
          }
        >
          <option value="pending">Not checked in</option>
          <option value="arrived">I’m here</option>
          <option value="late">Running late</option>
          <option value="unable">Can’t attend</option>
        </select>
      </label>
      <span
        className={`meetup-checkin-peer ${other?.check_in_status || "pending"}`}
      >
        {otherName}: {checkInLabels[other?.check_in_status || "pending"]}
      </span>
      <details className="meetup-export">
        <summary>
          <CalendarPlus /> Add to calendar
        </summary>
        <div>
          <a
            href={meetupCalendarUrl("google", meetup, otherName)}
            target="_blank"
            rel="noreferrer"
          >
            Google Calendar
          </a>
          <a
            href={meetupCalendarUrl("outlook", meetup, otherName)}
            target="_blank"
            rel="noreferrer"
          >
            Outlook
          </a>
          <button
            type="button"
            onClick={() => downloadMeetupIcs(meetup, otherName)}
          >
            <Download /> .ics file
          </button>
        </div>
      </details>
    </div>
  );
}

export function useMeetupSettings(meetups) {
  const [settings, setSettings] = useState([]);
  const ids = (Array.isArray(meetups) ? meetups : []).map((item) => item.id);
  const key = ids.join(",");
  const load = useCallback(
    async () =>
      setSettings(await getMeetupParticipantSettings(ids).catch(() => [])),
    [key],
  );
  useEffect(() => {
    load();
    const channel = supabase
      .channel(`meetup-checkins-${key || "empty"}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "meetup_participant_settings" },
        load,
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [load, key]);
  return [settings, load];
}
