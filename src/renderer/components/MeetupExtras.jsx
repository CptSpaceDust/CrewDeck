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

export function MeetupGroupTools({ meetup, userId, profiles = [] }) {
  const [participants, setParticipants] = useState([]);
  const [waitlist, setWaitlist] = useState([]);
  const [open, setOpen] = useState(false);
  const load = useCallback(async () => {
    const [members, waiting] = await Promise.all([
      supabase
        .from("meetup_participants")
        .select("*")
        .eq("meetup_id", meetup.id),
      supabase
        .from("meetup_waitlist")
        .select("*")
        .eq("meetup_id", meetup.id)
        .order("position"),
    ]);
    setParticipants(members.data || []);
    setWaitlist(waiting.data || []);
  }, [meetup.id]);
  useEffect(() => {
    load();
    const channel = supabase
      .channel(`meetup-group-${meetup.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "meetup_participants",
          filter: `meetup_id=eq.${meetup.id}`,
        },
        load,
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [meetup.id, load]);
  const isOrganizer = participants.some(
    (item) => item.user_id === userId && item.role === "organizer",
  );
  const invitedIds = new Set(participants.map((item) => item.user_id));
  const accepted = participants.filter(
    (item) => item.invitation_status === "accepted",
  );
  const invitationLabels = {
    pending: "Awaiting response",
    accepted: "Accepted",
    declined: "Declined",
  };
  const attendanceLabels = {
    pending: "Not checked in",
    attended: "Here",
    late: "Running late",
    cancelled: "Can’t attend",
    missed: "Missed",
  };
  return (
    <details
      className="meetup-group-tools"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        Group meetup · {accepted.length}/{meetup.capacity || 2} attending
      </summary>
      <div className="meetup-participant-list">
        {participants.map((item) => {
          const person = profiles.find((row) => row.id === item.user_id);
          return (
            <span key={item.user_id}>
              <strong>{person?.username || "Crew member"}</strong>
              <small>
                {item.role === "organizer" ? "Organizer" : "Participant"} ·{" "}
                {invitationLabels[item.invitation_status] ||
                  item.invitation_status}{" "}
                · {attendanceLabels[item.attendance_status] || "Not checked in"}
              </small>
            </span>
          );
        })}
      </div>
      {isOrganizer && (
        <div className="meetup-invite-grid">
          {profiles
            .filter((person) => !invitedIds.has(person.id))
            .slice(0, 20)
            .map((person) => (
              <button
                key={person.id}
                disabled={participants.length >= (meetup.capacity || 2)}
                onClick={async () => {
                  await supabase.from("meetup_participants").insert({
                    meetup_id: meetup.id,
                    user_id: person.id,
                    role: "participant",
                    invitation_status: "pending",
                  });
                  load();
                }}
              >
                {person.username}
              </button>
            ))}
        </div>
      )}
      <div className="meetup-timezone-preview">
        <strong>Time zone preview</strong>
        {participants.map((item) => {
          const person = profiles.find((row) => row.id === item.user_id);
          return (
            <span key={item.user_id}>
              {person?.username || "Crew member"}:{" "}
              {meetupInstant(meetup).toLocaleString()}
            </span>
          );
        })}
      </div>
      {waitlist.length > 0 && (
        <small>{waitlist.length} crew member(s) waiting for a place.</small>
      )}
    </details>
  );
}

export function MeetupAttendanceSummary({ meetups, userId }) {
  const completed = (meetups || []).filter(
    (item) =>
      [item.user_id, item.with_user_id].includes(userId) &&
      meetupInstant(item).getTime() < Date.now(),
  );
  if (!completed.length) return null;
  return (
    <section className="panel attendance-summary">
      <strong>Attendance history</strong>
      <span>
        {completed.length} past meetup{completed.length === 1 ? "" : "s"}
      </span>
      <small>
        Your check-ins stay private to you and the meetup organizer.
      </small>
    </section>
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
