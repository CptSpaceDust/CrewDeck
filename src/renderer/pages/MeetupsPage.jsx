import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  CalendarOff,
  Check,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import {
  addMeetupAvailability,
  cancelMeetup,
  createMeetup,
  deleteMeetupAvailability,
  getMeetupAvailability,
  getMyMeetupMemberships,
  getMeetups,
  getProfiles,
  leaveMeetup,
  respondToMeetup,
  respondToGroupMeetup,
  restrictionMessage,
  setLongTermMeetupAvailability,
} from "../lib/data";
import { useLoader } from "../lib/hooks";
import {
  availabilityInstantRange,
  formatMeetupLocal,
  localDayRange,
  localTimeZoneName,
  meetupInstant,
  meetupLocalDateKey,
  zonedDateTime,
} from "../lib/time";
import { confirmInApp } from "../components/InAppDialog";
import {
  MeetupCountdown,
  MeetupTools,
  MeetupGroupTools,
  MeetupAttendanceSummary,
  useMeetupSettings,
} from "../components/MeetupExtras";
import {
  Empty,
  ErrorState,
  Field,
  Loading,
  Modal,
  PageHeader,
} from "../components/ui";

const dateKey = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const minutes = (value) => {
  const [hours, mins] = String(value || "0:0")
    .split(":")
    .map(Number);
  return hours * 60 + mins;
};
const personName = (profiles, id) =>
  profiles.find((person) => person.id === id)?.username || "Crew member";
const involves = (item, ids) =>
  ids.some((id) => id && (item.user_id === id || item.with_user_id === id));
const overlaps = (startA, endA, startB, endB) => startA < endB && endA > startB;
function SpaceTimePicker({ name, defaultValue = "18:00" }) {
  const [initialHours, initialMinutes] = defaultValue.split(":").map(Number);
  const [hour, setHour] = useState(initialHours % 12 || 12);
  const [minute, setMinute] = useState(
    (Math.round(initialMinutes / 5) * 5) % 60,
  );
  const [period, setPeriod] = useState(initialHours >= 12 ? "PM" : "AM");
  const value = `${String((Number(hour) % 12) + (period === "PM" ? 12 : 0)).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  return (
    <div className="space-time-picker">
      <select
        aria-label="Hour"
        value={hour}
        onChange={(event) => setHour(event.target.value)}
      >
        {Array.from({ length: 12 }, (_, index) => index + 1).map((value) => (
          <option key={value}>{value}</option>
        ))}
      </select>
      <span>:</span>
      <select
        aria-label="Minute"
        value={minute}
        onChange={(event) => setMinute(event.target.value)}
      >
        {Array.from({ length: 12 }, (_, index) => index * 5).map((value) => (
          <option key={value} value={value}>
            {String(value).padStart(2, "0")}
          </option>
        ))}
      </select>
      <select
        aria-label="AM or PM"
        value={period}
        onChange={(event) => setPeriod(event.target.value)}
      >
        <option>AM</option>
        <option>PM</option>
      </select>
      <input type="hidden" name={name} value={value} />
    </div>
  );
}
const availabilityOverlapsDay = (item, key) => {
  try {
    const [blockStart, blockEnd] = availabilityInstantRange(item);
    const [dayStart, dayEnd] = localDayRange(key);
    return (
      [blockStart, blockEnd, dayStart, dayEnd].every((value) =>
        Number.isFinite(value.getTime()),
      ) && overlaps(blockStart, blockEnd, dayStart, dayEnd)
    );
  } catch {
    return false;
  }
};
const safeAvailabilityRange = (item) => {
  try {
    const range = availabilityInstantRange(item);
    return range.every((value) => Number.isFinite(value.getTime()))
      ? range
      : null;
  } catch {
    return null;
  }
};
const localAvailabilityLabel = (item) => {
  if (item.indefinite) return "Unavailable until you turn this off";
  const range = safeAvailabilityRange(item);
  if (!range) return "Unavailable time";
  const [start, end] = range;
  const sameZone = (item.time_zone || "America/Denver") === localTimeZoneName();
  if (item.all_day && sameZone) return "All day";
  const startLabel = start.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const endLabel = end.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return `${startLabel}–${endLabel}`;
};

function AvailabilityModal({ user, rows = [], onClose, onSaved }) {
  const [allDay, setAllDay] = useState(true);
  const [busy, setBusy] = useState(false);
  const [longTermBusy, setLongTermBusy] = useState(false);
  const [message, setMessage] = useState("");
  const mine = (Array.isArray(rows) ? rows : []).filter(
    (item) => item?.user_id === user.id,
  );
  const longTerm = mine.find((item) => item.indefinite);
  async function toggleLongTerm(event) {
    const enabled = event.target.checked;
    setLongTermBusy(true);
    setMessage("");
    try {
      await setLongTermMeetupAvailability(
        user.id,
        enabled,
        localTimeZoneName(),
      );
      await onSaved();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLongTermBusy(false);
    }
  }
  async function save(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setMessage("");
    try {
      await addMeetupAvailability(user.id, {
        block_date: form.get("date"),
        all_day: allDay,
        start_time: form.get("start"),
        end_time: form.get("end"),
        time_zone: localTimeZoneName(),
      });
      event.currentTarget.reset();
      setAllDay(true);
      await onSaved();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(item) {
    await deleteMeetupAvailability(item.id, user.id);
    await onSaved();
  }
  return (
    <Modal title="My availability" onClose={onClose}>
      <div className="availability-layout">
        <form className="availability-form" onSubmit={save}>
          {!longTerm && (
            <p className="micro-copy">
              Block a whole day or only the hours when you will not be online.
              Everything is entered and shown in your time zone (
              {localTimeZoneName()}). Other crew members see availability in
              their own local time, never the reason.
            </p>
          )}
          <label className="availability-long-toggle">
            <input
              type="checkbox"
              role="switch"
              checked={Boolean(longTerm)}
              disabled={longTermBusy}
              onChange={toggleLongTerm}
            />
            <span>
              <strong>I’m off for a long time</strong>
              <small>
                Makes every upcoming day unavailable to other crew members until
                you turn this off. You can still invite someone else.
              </small>
            </span>
          </label>
          {longTerm ? (
            <p className="availability-long-active">
              Your calendar appears unavailable to other crew members. Turn this
              off to configure individual days again.
            </p>
          ) : (
            <>
              <Field label="Date">
                <input
                  name="date"
                  type="date"
                  min={dateKey(new Date())}
                  required
                />
              </Field>
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={allDay}
                  onChange={(event) => setAllDay(event.target.checked)}
                />
                <span>Unavailable all day</span>
              </label>
              {!allDay && (
                <div className="form-grid">
                  <Field label="Unavailable from">
                    <SpaceTimePicker name="start" defaultValue="18:00" />
                  </Field>
                  <Field label="Until">
                    <SpaceTimePicker name="end" defaultValue="22:00" />
                  </Field>
                </div>
              )}
              <button className="button primary" disabled={busy}>
                {busy ? "Saving…" : "Add off time"}
              </button>
            </>
          )}
          {message && <p className="form-message">{message}</p>}
        </form>
        {!longTerm && (
          <section className="availability-list">
            <h3>Your upcoming off time</h3>
            {!mine.length && (
              <p className="micro-copy">No off days configured.</p>
            )}
            {mine.map((item) => {
              const range = safeAvailabilityRange(item);
              return (
                <article key={item.id}>
                  <div>
                    <strong>
                      {range
                        ? range[0].toLocaleDateString(undefined, {
                            weekday: "short",
                            month: "short",
                            day: "numeric",
                          })
                        : "Saved off time"}
                    </strong>
                    <span>{localAvailabilityLabel(item)}</span>
                  </div>
                  <button
                    type="button"
                    className="icon-button"
                    title="Remove off time"
                    onClick={() => remove(item)}
                  >
                    <Trash2 />
                  </button>
                </article>
              );
            })}
          </section>
        )}
      </div>
    </Modal>
  );
}

export default function MeetupsPage({ user, profile, myMeetupsOnly = false }) {
  const [friendPrefill] = useState(() => {
    try {
      const value = JSON.parse(
        localStorage.getItem("crewdeck.meetup.prefill") || "null",
      );
      localStorage.removeItem("crewdeck.meetup.prefill");
      return value || {};
    } catch {
      return {};
    }
  });
  const meetupLoader = useLoader(getMeetups, []);
  const membershipLoader = useLoader(
    () => getMyMeetupMemberships(user.id),
    [user.id],
  );
  const profileLoader = useLoader(getProfiles, []);
  const availabilityLoader = useLoader(getMeetupAvailability, []);
  const [currentMonth, setCurrentMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const [selectedPerson, setSelectedPerson] = useState(
    friendPrefill.personId || "",
  );
  const [selected, setSelected] = useState(null);
  const [showFormHint, setShowFormHint] = useState(false);
  const [availabilityOpen, setAvailabilityOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [recurrence, setRecurrence] = useState("none");
  const formHeadingRef = useRef(null);
  const meetups = Array.isArray(meetupLoader.data) ? meetupLoader.data : [];
  const profiles = Array.isArray(profileLoader.data) ? profileLoader.data : [];
  const availability = Array.isArray(availabilityLoader.data)
    ? availabilityLoader.data
    : [];
  const memberships = Array.isArray(membershipLoader.data)
    ? membershipLoader.data
    : [];
  const membershipIds = new Set(memberships.map((item) => item.meetup_id));
  const people = profiles.filter((person) => person.id !== user.id);
  const selectedProfile = profiles.find(
    (person) => person.id === selectedPerson,
  );
  const captainApprovalRequired =
    selectedProfile?.rank?.toLowerCase() === "captain";
  const myMeetups = meetups.filter((item) => {
    if (
      item.user_id !== user.id &&
      item.with_user_id !== user.id &&
      !membershipIds.has(item.id)
    )
      return false;
    try {
      return Number.isFinite(meetupInstant(item).getTime());
    } catch {
      return false;
    }
  });
  const [participantSettings, reloadParticipantSettings] =
    useMeetupSettings(myMeetups);
  const selectedIds = [user.id, selectedPerson].filter(Boolean);
  const approved = meetups.filter((item) => item.status === "approved");
  const selectedBlocks = availability.filter(
    (item) =>
      selected &&
      item.user_id === selectedPerson &&
      availabilityOverlapsDay(item, selected),
  );
  const selectedBusyMeetups = approved.filter((item) => {
    try {
      return (
        selected &&
        meetupLocalDateKey(item) === selected &&
        involves(item, selectedIds)
      );
    } catch {
      return false;
    }
  });
  const loading =
    meetupLoader.loading ||
    membershipLoader.loading ||
    profileLoader.loading ||
    availabilityLoader.loading;
  const error =
    meetupLoader.error ||
    membershipLoader.error ||
    profileLoader.error ||
    availabilityLoader.error;

  async function reloadAll() {
    await Promise.all([
      meetupLoader.reload(),
      membershipLoader.reload(),
      profileLoader.reload(),
      availabilityLoader.reload(),
    ]);
  }

  useEffect(() => {
    setSelected(null);
    setRecurrence("none");
    setShowFormHint(false);
  }, [selectedPerson]);
  useEffect(() => {
    if (!selected || loading || !formHeadingRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => entry.isIntersecting && setShowFormHint(false),
      { threshold: 0.5 },
    );
    observer.observe(formHeadingRef.current);
    return () => observer.disconnect();
  }, [selected, loading]);

  const dayState = (key) => {
    const blocks = availability.filter(
      (item) =>
        item.user_id === selectedPerson && availabilityOverlapsDay(item, key),
    );
    const scheduled = approved.some((item) => {
      try {
        return (
          meetupLocalDateKey(item) === key && involves(item, [selectedPerson])
        );
      } catch {
        return false;
      }
    });
    if (blocks.some((item) => item.all_day)) return "offline";
    if (scheduled) return "scheduled";
    if (blocks.length) return "partial";
    return "open";
  };

  async function submit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setMessage("");
    try {
      if (!selectedPerson) throw new Error("Choose a crew member first.");
      if (!selected || dayState(selected) === "offline")
        throw new Error("Please select an open day.");
      const start = minutes(form.get("time"));
      const end = start + Number(form.get("duration")) * 60;
      if (end > 24 * 60)
        throw new Error("Choose a start time that ends before midnight.");
      const requestedStart = zonedDateTime(
        selected,
        form.get("time"),
        localTimeZoneName(),
      );
      const requestedEnd = new Date(
        requestedStart.getTime() +
          Number(form.get("duration")) * 60 * 60 * 1000,
      );
      const overlap = availability.some((item) => {
        if (!selectedIds.includes(item.user_id)) return false;
        if (item.user_id === user.id && item.indefinite) return false;
        const range = safeAvailabilityRange(item);
        if (!range) return false;
        const [blockStart, blockEnd] = range;
        return overlaps(requestedStart, requestedEnd, blockStart, blockEnd);
      });
      if (overlap)
        throw new Error(
          "That time overlaps unavailable hours. Choose another time.",
        );
      const meetupConflict = approved.some((item) => {
        if (!involves(item, selectedIds)) return false;
        const existingStart = meetupInstant(item);
        const existingEnd = new Date(
          existingStart.getTime() + Number(item.duration || 1) * 3600000,
        );
        return overlaps(
          requestedStart,
          requestedEnd,
          existingStart,
          existingEnd,
        );
      });
      if (meetupConflict)
        throw new Error(
          "That time overlaps another meetup. Choose a different start time.",
        );
      const blocked = await restrictionMessage(user.id, "meetups");
      if (blocked) throw new Error(blocked);
      await createMeetup(user.id, {
        with_user_id: selectedPerson,
        meetup_date: selected,
        start_time: form.get("time"),
        time_zone: localTimeZoneName(),
        duration: Number(form.get("duration")),
        message: String(form.get("message") || "").trim(),
        vrc_username: String(form.get("vrc")).trim(),
        meetup_type: form.get("type"),
        additional_participants: String(form.get("participants") || "").trim(),
        time_flexibility: form.get("flexibility"),
        recurrence_rule: form.get("recurrence"),
        recurrence_count: Number(form.get("recurrence_count") || 1),
      });
      setMessage(
        captainApprovalRequired
          ? "Invitation sent. After the Captain accepts, they can give final approval."
          : `Invitation sent. The meetup will be confirmed when ${selectedProfile?.username || "they"} accepts.`,
      );
      setSelected(null);
      setRecurrence("none");
      await reloadAll();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function cancel(item) {
    if (
      !(await confirmInApp("This meetup request will be removed.", {
        title: "Cancel meetup request?",
        confirmLabel: "Cancel request",
      }))
    )
      return;
    await cancelMeetup(item.id, user.id);
    setMessage("Your meetup request was removed.");
    await reloadAll();
  }

  async function backOut(item) {
    if (
      !(await confirmInApp(
        "Everyone in this meetup will be notified. If only one person remains, the meetup will be removed.",
        {
          title: "Back out of this meetup?",
          confirmLabel: "Back out",
        },
      ))
    )
      return;
    setBusy(true);
    try {
      const result = await leaveMeetup(item.id);
      setMessage(
        result?.deleted
          ? "You backed out and the meetup was removed because only one person remained."
          : "You backed out. Everyone else in the meetup was notified.",
      );
      await reloadAll();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function respond(item, response, groupInvitation = false) {
    setBusy(true);
    try {
      const updated = groupInvitation
        ? await respondToGroupMeetup(item.id, response)
        : await respondToMeetup(item.id, response);
      setMessage(
        response === "declined"
          ? "Invitation declined."
          : item.status === "approved" || updated.status === "approved"
            ? "Invitation accepted. Your meetup is confirmed."
            : "Invitation accepted. It is ready for Captain approval.",
      );
      await reloadAll();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  const firstDay = currentMonth.getDay();
  const days = new Date(
    currentMonth.getFullYear(),
    currentMonth.getMonth() + 1,
    0,
  ).getDate();
  const cells = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: days }, (_, index) => index + 1),
  ];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <div className="page meetup-page">
      <PageHeader
        eyebrow={myMeetupsOnly ? "My meetups" : "Meetup calendar"}
        title={
          myMeetupsOnly ? "Your meetups and invitations" : "Plan time together"
        }
        description={
          myMeetupsOnly
            ? "Review meetup invitations, respond to requests, and keep track of confirmed plans."
            : `Choose a crew member, compare availability, and send an invitation. All dates and times are shown in your time zone (${localTimeZoneName()}).`
        }
        action={
          <div className="header-actions">
            {!myMeetupsOnly && (
              <button
                className="button secondary"
                onClick={() => setAvailabilityOpen(true)}
              >
                <CalendarOff /> My availability
              </button>
            )}
            <button
              className="icon-button refresh-button"
              title="Refresh meetups"
              onClick={reloadAll}
              disabled={loading}
              aria-busy={loading}
            >
              <RefreshCw className={loading ? "spin" : ""} />
            </button>
          </div>
        }
      />
      {message && <p className="form-message meetup-message">{message}</p>}
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorState message={String(error)} retry={reloadAll} />
      ) : (
        <>
          {!myMeetupsOnly && (
            <>
              <section className="panel meetup-person-picker">
                <div>
                  <h2>Who are you meeting?</h2>
                  <p>
                    The calendar shows each person’s availability based on how
                    they’ve configured it.
                  </p>
                </div>
                <Field label="Crew member">
                  <select
                    value={selectedPerson}
                    onChange={(event) => setSelectedPerson(event.target.value)}
                  >
                    <option value="">Choose someone…</option>
                    {people.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.username} · {person.rank || "Crew"}
                      </option>
                    ))}
                  </select>
                </Field>
              </section>
              <section className="panel calendar-card">
                <header>
                  <button
                    className="icon-button"
                    onClick={() =>
                      setCurrentMonth(
                        new Date(
                          currentMonth.getFullYear(),
                          currentMonth.getMonth() - 1,
                          1,
                        ),
                      )
                    }
                  >
                    <ChevronLeft />
                  </button>
                  <h2>
                    {currentMonth.toLocaleDateString(undefined, {
                      month: "long",
                      year: "numeric",
                    })}
                  </h2>
                  <button
                    className="icon-button"
                    onClick={() =>
                      setCurrentMonth(
                        new Date(
                          currentMonth.getFullYear(),
                          currentMonth.getMonth() + 1,
                          1,
                        ),
                      )
                    }
                  >
                    <ChevronRight />
                  </button>
                </header>
                <div className="calendar-weekdays">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                    (day) => (
                      <span key={day}>{day}</span>
                    ),
                  )}
                </div>
                <div className="calendar-grid">
                  {cells.map((day, index) => {
                    if (!day)
                      return (
                        <span
                          className="calendar-day empty"
                          key={`empty-${index}`}
                        />
                      );
                    const date = new Date(
                      currentMonth.getFullYear(),
                      currentMonth.getMonth(),
                      day,
                    );
                    const key = dateKey(date);
                    const state = dayState(key);
                    const past = date < today;
                    const disabled =
                      past || !selectedPerson || state === "offline";
                    const labels = {
                      offline: "Offline",
                      partial: "Partly off",
                      scheduled: "Meetup set",
                      open: "Open",
                    };
                    return (
                      <button
                        key={key}
                        disabled={disabled}
                        aria-label={`${key}: ${past ? "Unavailable" : labels[state]}`}
                        className={`calendar-day ${state} ${selected === key ? "selected" : ""}`}
                        onClick={() => {
                          setSelected(key);
                          setShowFormHint(true);
                        }}
                      >
                        <strong>{day}</strong>
                        {!past && selectedPerson && (
                          <span>{labels[state]}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
                <div className="calendar-color-legend">
                  <span className="open">Open</span>
                  <span className="offline">Offline all day</span>
                  <span className="partial">Some hours offline</span>
                  <span className="scheduled">Already has a meetup</span>
                </div>
                {!selectedPerson && (
                  <p className="calendar-prompt">
                    Choose a crew member to open the calendar.
                  </p>
                )}
              </section>
              {selected && showFormHint && (
                <button
                  type="button"
                  className="meetup-form-hint"
                  onClick={() =>
                    formHeadingRef.current?.scrollIntoView({
                      behavior: window.matchMedia(
                        "(prefers-reduced-motion: reduce)",
                      ).matches
                        ? "auto"
                        : "smooth",
                      block: "start",
                    })
                  }
                >
                  <ArrowDown />
                  <span>Scroll down to finish your meetup request</span>
                </button>
              )}
            </>
          )}
          {myMeetupsOnly && (
            <section className="my-meetups-section">
              <MeetupCountdown
                meetups={myMeetups}
                userId={user.id}
                profiles={profiles}
              />
              <MeetupAttendanceSummary meetups={myMeetups} userId={user.id} />
              <h2 className="section-title">My Meetups & Invitations</h2>
              {myMeetups.length ? (
                <div className="timeline">
                  {myMeetups.map((item) => {
                    const membership = memberships.find(
                      (row) => row.meetup_id === item.id,
                    );
                    const invited = item.with_user_id === user.id;
                    const groupInvitation =
                      !invited &&
                      membership?.role !== "organizer" &&
                      membership?.invitation_status === "pending";
                    const otherId = invited ? item.user_id : item.with_user_id;
                    const localStart = meetupInstant(item);
                    return (
                      <article
                        className="panel meetup-card meetup-request-details"
                        key={item.id}
                      >
                        <div className="date-tile">
                          <strong>{localStart.getDate()}</strong>
                          <span>
                            {localStart.toLocaleDateString(undefined, {
                              month: "short",
                            })}
                          </span>
                        </div>
                        <div>
                          <div className="card-meta">
                            <span className={`status ${item.status}`}>
                              {item.status}
                            </span>
                            <span>
                              {localStart.toLocaleTimeString(undefined, {
                                hour: "numeric",
                                minute: "2-digit",
                              })}{" "}
                              · {item.duration}h
                            </span>
                          </div>
                          <h3>
                            {invited ? "Invitation from" : "Meetup with"}{" "}
                            {personName(profiles, otherId)}
                          </h3>
                          <p>
                            {item.meetup_type || "VRChat meetup"} ·{" "}
                            {item.message || "No notes."}
                          </p>
                          <p className="meetup-local-time">
                            {formatMeetupLocal(
                              item.meetup_date,
                              item.start_time,
                              item.time_zone || "America/Denver",
                            )}
                          </p>
                          {item.with_user_id && (
                            <small>Invitation: {item.invitee_status}</small>
                          )}
                          {((invited &&
                            item.status === "pending" &&
                            item.invitee_status === "pending") ||
                            groupInvitation) && (
                            <div className="button-row">
                              <button
                                className="button primary"
                                disabled={busy}
                                onClick={() =>
                                  respond(item, "accepted", groupInvitation)
                                }
                              >
                                <Check /> Accept
                              </button>
                              <button
                                className="button danger"
                                disabled={busy}
                                onClick={() =>
                                  respond(item, "declined", groupInvitation)
                                }
                              >
                                <X /> Decline
                              </button>
                            </div>
                          )}
                          {item.user_id === user.id && item.status === "pending" && (
                            <button
                              className="button danger compact-button"
                              onClick={() => cancel(item)}
                            >
                              Cancel request
                            </button>
                          )}
                          {item.status === "denied" && item.admin_reason && (
                            <p className="meetup-denial">{item.admin_reason}</p>
                          )}
                          {item.status === "approved" && (
                            <>
                              <MeetupTools
                                meetup={item}
                                userId={user.id}
                                otherName={personName(profiles, otherId)}
                                settings={participantSettings}
                                onChanged={reloadParticipantSettings}
                              />
                              <MeetupGroupTools
                                meetup={item}
                                userId={user.id}
                                profiles={profiles}
                              />
                              <button
                                className="button danger compact-button meetup-backout"
                                disabled={busy}
                                onClick={() => backOut(item)}
                              >
                                Back out of meetup
                              </button>
                            </>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <Empty
                  title="No meetups yet"
                  body="Choose a crew member and an open day to send an invitation."
                />
              )}
            </section>
          )}
          {!myMeetupsOnly && selected && (
            <form className="panel meetup-request-form" onSubmit={submit}>
              <div className="meetup-form-heading" ref={formHeadingRef}>
                <span>📅</span>
                <div>
                  <h2>Invite {personName(profiles, selectedPerson)}</h2>
                  <p>
                    {new Date(`${selected}T12:00:00`).toLocaleDateString(
                      undefined,
                      {
                        weekday: "long",
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      },
                    )}
                  </p>
                </div>
              </div>
              {(selectedBlocks.length > 0 ||
                selectedBusyMeetups.length > 0) && (
                <div className="meetup-off-hours">
                  <strong>Times to avoid that day</strong>
                  {selectedBlocks.map((item) => (
                    <span key={item.id}>
                      {personName(profiles, item.user_id)}:{" "}
                      {localAvailabilityLabel(item)}
                    </span>
                  ))}
                  {selectedBusyMeetups.map((item) => {
                    const start = meetupInstant(item);
                    const end = new Date(
                      start.getTime() + Number(item.duration || 1) * 3600000,
                    );
                    return (
                      <span key={`busy-${item.id}`}>
                        Meetup already scheduled:{" "}
                        {start.toLocaleTimeString([], {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                        –
                        {end.toLocaleTimeString([], {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </span>
                    );
                  })}
                </div>
              )}
              <section>
                <h3>Meetup time</h3>
                <div className="form-grid">
                  <Field
                    label="Preferred start time"
                    hint={`Your time · ${localTimeZoneName()}`}
                  >
                    <SpaceTimePicker name="time" defaultValue="18:00" />
                  </Field>
                  <Field label="Duration">
                    <select
                      name="duration"
                      defaultValue={friendPrefill.preset?.duration || "1"}
                    >
                      {[1, 2, 3, 4, 5].map((hours) => (
                        <option key={hours} value={hours}>
                          {hours} {hours === 1 ? "hour" : "hours"}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
              </section>
              <section>
                <h3>VRChat details</h3>
                <div className="form-grid">
                  <Field label="Your VRChat username">
                    <input
                      name="vrc"
                      defaultValue={profile?.vrchat || ""}
                      required
                    />
                  </Field>
                  <Field label="Meetup type">
                    <select
                      name="type"
                      defaultValue={friendPrefill.preset?.meetup_type || ""}
                      required
                    >
                      <option value="" disabled>
                        Choose a meetup type…
                      </option>
                      <option>Gaming</option>
                      <option>World Exploration</option>
                      <option>Hanging Out / Chatting</option>
                      <option>Watching Something</option>
                      <option>Working on a Project</option>
                      <option>Other</option>
                    </select>
                  </Field>
                </div>
              </section>
              <section>
                <h3>Details</h3>
                <Field label="Additional participant usernames" hint="Optional">
                  <textarea name="participants" rows="3" />
                </Field>
                <Field label="Scheduling flexibility">
                  <select
                    name="flexibility"
                    defaultValue={
                      friendPrefill.preset?.time_flexibility || "exact"
                    }
                  >
                    <option value="exact">Exact time only</option>
                    <option value="30">±30 minutes is okay</option>
                    <option value="60">±1 hour is okay</option>
                  </select>
                </Field>
                <Field label="Message" hint="Optional">
                  <textarea
                    name="message"
                    rows="4"
                    defaultValue={friendPrefill.preset?.message || ""}
                  />
                </Field>
                <div className="form-grid">
                  <Field label="Repeat meetup">
                    <select
                      name="recurrence"
                      value={recurrence}
                      onChange={(event) => setRecurrence(event.target.value)}
                    >
                      <option value="none">Does not repeat</option>
                      <option value="weekly">Every week</option>
                      <option value="monthly">Every month</option>
                    </select>
                  </Field>
                  {recurrence !== "none" && (
                    <Field label="Number of meetups">
                      <select name="recurrence_count" defaultValue="4">
                        <option value="4">4 meetups</option>
                        <option value="8">8 meetups</option>
                        <option value="12">12 meetups</option>
                      </select>
                    </Field>
                  )}
                </div>
              </section>
              <div className="meetup-warning">
                <strong>What happens next</strong>
                <p>
                  {personName(profiles, selectedPerson)} receives an invitation.{" "}
                  {captainApprovalRequired
                    ? "Because this request includes the Captain, they also have the final approval."
                    : "When they accept, the meetup is confirmed automatically."}
                </p>
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="button ghost"
                  onClick={() => {
                    setSelected(null);
                    setRecurrence("none");
                  }}
                >
                  Cancel
                </button>
                <button className="button primary" disabled={busy}>
                  {busy ? "Sending…" : "Send meetup invitation"}
                </button>
              </div>
            </form>
          )}
        </>
      )}
      {availabilityOpen && (
        <AvailabilityModal
          user={user}
          rows={availability}
          onClose={() => setAvailabilityOpen(false)}
          onSaved={availabilityLoader.reload}
        />
      )}
    </div>
  );
}
