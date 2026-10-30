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
import { supabase } from "../lib/supabase";
import { crewEvents } from "../lib/crewEvents";
import {
  availabilityInstantRange,
  formatMeetupLocal,
  localDayRange,
  localTimeZoneName,
  meetupInstant,
  meetupLocalDateKey,
  zonedDateTime,
} from "../lib/time";
import { confirmInApp, promptInApp } from "../components/InAppDialog";
import { CalendarAutomation } from "../components/CalendarAutomation";
import { CrewEventsPanel } from "../components/CrewEventsPanel";
import { AvailabilityOverlap } from "../components/AvailabilityOverlap";
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
function MeetupTemplateControls({ userId, formRef, onNotice }) {
  const [templates, setTemplates] = useState([]);
  const [selected, setSelected] = useState("");
  async function load() {
    const { data, error } = await supabase
      .from("meetup_templates")
      .select("*")
      .eq("user_id", userId)
      .order("name");
    if (error) throw error;
    setTemplates(data || []);
  }
  useEffect(() => {
    load().catch((error) => onNotice(error.message));
  }, [userId]);
  function apply() {
    const template = templates.find((item) => item.id === selected);
    const form = formRef.current;
    if (!template || !form) return;
    const values = {
      duration: template.duration,
      type: template.meetup_type,
      participants: (template.participant_usernames || []).join(", "),
      location_name: template.location_name,
      join_url: template.join_url,
      join_instructions: template.join_instructions,
      message: template.message,
    };
    for (const [name, value] of Object.entries(values)) {
      const control = form.elements.namedItem(name);
      if (control && value != null) control.value = String(value);
    }
    onNotice(`Loaded “${template.name}”.`);
  }
  async function save() {
    const form = formRef.current;
    if (!form) return;
    const name = await promptInApp(
      "Save the current meetup details for later.",
      "",
      {
        title: "Save meetup template",
        inputLabel: "Template name",
        confirmLabel: "Save template",
      },
    );
    if (!name?.trim()) return;
    const values = new FormData(form);
    const row = {
      user_id: userId,
      name: name.trim(),
      meetup_type: values.get("type") || null,
      duration: Number(values.get("duration") || 1),
      participant_usernames: String(values.get("participants") || "")
        .split(/[\n,]/)
        .map((item) => item.trim().replace(/^@/, ""))
        .filter(Boolean),
      location_name: String(values.get("location_name") || "").trim() || null,
      join_url: String(values.get("join_url") || "").trim() || null,
      join_instructions:
        String(values.get("join_instructions") || "").trim() || null,
      message: String(values.get("message") || "").trim() || null,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase
      .from("meetup_templates")
      .upsert(row, { onConflict: "user_id,name" });
    if (error) return onNotice(error.message);
    onNotice("Meetup template saved.");
    await load();
  }
  async function remove() {
    if (!selected) return;
    const { error } = await supabase
      .from("meetup_templates")
      .delete()
      .eq("id", selected)
      .eq("user_id", userId);
    if (error) return onNotice(error.message);
    setSelected("");
    onNotice("Meetup template deleted.");
    await load();
  }
  return (
    <section className="meetup-template-controls">
      <div>
        <strong>Meetup templates</strong>
        <small>Reuse locations, participants, duration, and notes.</small>
      </div>
      <select
        value={selected}
        onChange={(event) => setSelected(event.target.value)}
      >
        <option value="">Choose a template…</option>
        {templates.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="button secondary"
        disabled={!selected}
        onClick={apply}
      >
        Load
      </button>
      <button type="button" className="button secondary" onClick={save}>
        Save current
      </button>
      <button
        type="button"
        className="button ghost"
        disabled={!selected}
        onClick={remove}
      >
        Delete
      </button>
    </section>
  );
}
function SpaceTimePicker({
  name,
  defaultValue = "18:00",
  availableValues = null,
}) {
  const [initialHours, initialMinutes] = defaultValue.split(":").map(Number);
  const [hour, setHour] = useState(initialHours % 12 || 12);
  const [minute, setMinute] = useState(
    (Math.round(initialMinutes / 5) * 5) % 60,
  );
  const [period, setPeriod] = useState(initialHours >= 12 ? "PM" : "AM");
  const value = `${String((Number(hour) % 12) + (period === "PM" ? 12 : 0)).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  if (Array.isArray(availableValues)) {
    return (
      <select
        name={name}
        className="available-time-select"
        defaultValue={
          availableValues.includes(defaultValue)
            ? defaultValue
            : availableValues[0] || ""
        }
        disabled={!availableValues.length}
      >
        {!availableValues.length && (
          <option value="">No available start times</option>
        )}
        {availableValues.map((slot) => {
          const [slotHour, slotMinute] = slot.split(":").map(Number);
          const label = new Date(
            2000,
            0,
            1,
            slotHour,
            slotMinute,
          ).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
          return (
            <option value={slot} key={slot}>
              {label}
            </option>
          );
        })}
      </select>
    );
  }
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
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
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
      formElement.reset();
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
    <Modal
      title="My availability"
      onClose={onClose}
      className="availability-modal"
    >
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
        {!longTerm && <CalendarAutomation onChanged={onSaved} />}
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
  const crewEventLoader = useLoader(() => crewEvents.list(), []);
  const [currentMonth, setCurrentMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const [selectedPerson, setSelectedPerson] = useState(
    friendPrefill.personId || "",
  );
  const [planningKind, setPlanningKind] = useState(
    friendPrefill.kind === "event" ? "event" : "meetup",
  );
  const [selectedParticipants, setSelectedParticipants] = useState(
    friendPrefill.participantIds || [],
  );
  const [selected, setSelected] = useState(null);
  const [preferredTime, setPreferredTime] = useState("18:00");
  const [showFormHint, setShowFormHint] = useState(false);
  const [availabilityOpen, setAvailabilityOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [recurrence, setRecurrence] = useState("none");
  const [duration, setDuration] = useState(
    Number(friendPrefill.preset?.duration || 1),
  );
  const [minimumAttendance, setMinimumAttendance] = useState("");
  useEffect(() => {
    setDuration((current) =>
      planningKind === "event"
        ? Math.min(10, Math.max(3, Number(current) || 3))
        : Math.min(5, Math.max(1, Number(current) || 1)),
    );
  }, [planningKind]);
  const formHeadingRef = useRef(null);
  const requestFormRef = useRef(null);
  const meetups = Array.isArray(meetupLoader.data) ? meetupLoader.data : [];
  const profiles = Array.isArray(profileLoader.data) ? profileLoader.data : [];
  const availability = Array.isArray(availabilityLoader.data)
    ? availabilityLoader.data
    : [];
  const visibleCrewEvents = Array.isArray(crewEventLoader.data)
    ? crewEventLoader.data
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
  const selectedIds = [
    ...new Set(
      [user.id, selectedPerson, ...selectedParticipants].filter(Boolean),
    ),
  ];
  const approved = meetups.filter((item) => item.status === "approved");
  const selectedBlocks = availability.filter(
    (item) =>
      selected &&
      item.user_id ===
        (selectedPerson || (planningKind === "event" ? user.id : "")) &&
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
  const availableStartTimes =
    selected && (planningKind === "event" || selectedPerson)
      ? Array.from({ length: 96 }, (_, index) => index * 15)
          .filter((startMinutes) => startMinutes + duration * 60 <= 1440)
          .map(
            (startMinutes) =>
              `${String(Math.floor(startMinutes / 60)).padStart(2, "0")}:${String(startMinutes % 60).padStart(2, "0")}`,
          )
          .filter((slot) => {
            const requestedStart = zonedDateTime(
              selected,
              slot,
              localTimeZoneName(),
            );
            const requestedEnd = new Date(
              requestedStart.getTime() + duration * 3600000,
            );
            const availabilityConflict = availability.some((item) => {
              if (!selectedIds.includes(item.user_id)) return false;
              if (item.user_id === user.id && item.indefinite) return false;
              const range = safeAvailabilityRange(item);
              return range
                ? overlaps(requestedStart, requestedEnd, range[0], range[1])
                : false;
            });
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
            return (
              planningKind === "event" ||
              (!availabilityConflict && !meetupConflict)
            );
          })
      : [];
  const loading =
    meetupLoader.loading ||
    membershipLoader.loading ||
    profileLoader.loading ||
    availabilityLoader.loading;
  const allLoading = loading || crewEventLoader.loading;
  const error =
    meetupLoader.error ||
    membershipLoader.error ||
    profileLoader.error ||
    availabilityLoader.error;
  const allError = error || crewEventLoader.error;

  async function reloadAll() {
    await Promise.all([
      meetupLoader.reload(),
      membershipLoader.reload(),
      profileLoader.reload(),
      availabilityLoader.reload(),
      crewEventLoader.reload(),
    ]);
  }

  useEffect(() => {
    setSelected(null);
    setRecurrence("none");
    setShowFormHint(false);
  }, [selectedPerson]);
  useEffect(() => {
    setSelected(null);
    setRecurrence("none");
    setShowFormHint(false);
  }, [planningKind]);
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
    const calendarPerson =
      selectedPerson || (planningKind === "event" ? user.id : "");
    const blocks = availability.filter(
      (item) =>
        item.user_id === calendarPerson && availabilityOverlapsDay(item, key),
    );
    const scheduled =
      approved.some((item) => {
        try {
          return (
            meetupLocalDateKey(item) === key && involves(item, [calendarPerson])
          );
        } catch {
          return false;
        }
      }) ||
      visibleCrewEvents.some(
        (event) => dateKey(new Date(event.starts_at)) === key,
      );
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
      const isEvent = planningKind === "event";
      if (!isEvent && !selectedPerson)
        throw new Error("Choose a crew member first.");
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
      if (overlap && !isEvent)
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
      if (meetupConflict && !isEvent)
        throw new Error(
          "That time overlaps another meetup. Choose a different start time.",
        );
      const blocked = await restrictionMessage(user.id, "meetups");
      if (blocked) throw new Error(blocked);
      const eventFields = {
        with_user_id: selectedPerson || null,
        kind: isEvent ? "event" : "meetup",
        event_title: isEvent
          ? String(form.get("event_title") || "").trim()
          : null,
        event_description: isEvent
          ? String(form.get("event_description") || "").trim() || null
          : null,
        event_visibility: isEvent ? "crew_wide" : "invite_only",
        event_tags: isEvent
          ? String(form.get("event_tags") || "")
              .split(",")
              .map((tag) => tag.trim())
              .filter(Boolean)
              .slice(0, 8)
          : [],
        auto_waitlist: isEvent && form.get("auto_waitlist") === "on",
        rsvp_deadline:
          isEvent && form.get("rsvp_deadline")
            ? new Date(String(form.get("rsvp_deadline"))).toISOString()
            : null,
        capacity: isEvent
          ? Math.min(500, Math.max(2, Number(form.get("capacity") || 10)))
          : undefined,
        meetup_date: selected,
        start_time: form.get("time"),
        time_zone: localTimeZoneName(),
        duration: Number(form.get("duration")),
        message: String(form.get("message") || "").trim(),
        vrc_username: String(form.get("vrc")).trim(),
        meetup_type: form.get("type"),
        additional_participants: String(form.get("participants") || "").trim(),
        location_name: String(form.get("location_name") || "").trim() || null,
        join_url: String(form.get("join_url") || "").trim() || null,
        join_instructions:
          String(form.get("join_instructions") || "").trim() || null,
        time_flexibility: form.get("flexibility"),
        recurrence_rule: form.get("recurrence"),
        recurrence_count: Number(form.get("recurrence_count") || 1),
      };
      if (isEvent) {
        const invitedNames = String(form.get("participants") || "")
          .split(/[\n,]/)
          .map((value) => value.trim().replace(/^@/, "").toLowerCase())
          .filter(Boolean);
        const invitedIds = [
          selectedPerson,
          ...selectedParticipants,
          ...profiles
            .filter((person) =>
              invitedNames.includes(person.username?.toLowerCase()),
            )
            .map((person) => person.id),
        ].filter(Boolean);
        await crewEvents.create(
          {
            title: eventFields.event_title,
            description: eventFields.event_description || "",
            banner_path: String(form.get("event_banner") || "").trim(),
            tags: eventFields.event_tags,
            location_name: eventFields.location_name || "",
            join_url: eventFields.join_url || "",
            instructions: eventFields.join_instructions || "",
            visibility: eventFields.event_visibility,
            selected_group_id: String(form.get("selected_group_id") || ""),
            starts_at: requestedStart.toISOString(),
            duration_minutes: eventFields.duration * 60,
            time_zone: eventFields.time_zone,
            capacity: eventFields.capacity,
            minimum_attendance: String(form.get("minimum_attendance") || ""),
            auto_waitlist: eventFields.auto_waitlist,
            rsvp_deadline: eventFields.rsvp_deadline || "",
            recurrence_rule: eventFields.recurrence_rule,
            recurrence_count: eventFields.recurrence_count,
          },
          invitedIds,
        );
      } else await createMeetup(user.id, eventFields);
      setMessage(
        isEvent
          ? "Crew Event created. Invited members can now respond."
          : captainApprovalRequired
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
        eyebrow={myMeetupsOnly ? "My Plans" : "Meetup calendar"}
        title={
          myMeetupsOnly
            ? "Your meetups, events, and invitations"
            : "Plan time together"
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
      {myMeetupsOnly && (
        <nav className="my-plans-tabs" aria-label="Plan type">
          <button
            className="button secondary"
            onClick={() =>
              document
                .getElementById("private-meetup-plan-list")
                ?.scrollIntoView({ behavior: "smooth" })
            }
          >
            Meetups
          </button>
          <button
            className="button secondary"
            onClick={() =>
              document
                .getElementById("crew-events-plan-list")
                ?.scrollIntoView({ behavior: "smooth" })
            }
          >
            Events
          </button>
        </nav>
      )}
      {myMeetupsOnly && <CrewEventsPanel user={user} profile={profile} />}
      {message && <p className="form-message meetup-message">{message}</p>}
      {allLoading ? (
        <Loading />
      ) : allError ? (
        <ErrorState message={String(allError)} retry={reloadAll} />
      ) : (
        <>
          {!myMeetupsOnly && (
            <>
              <section
                className="meetup-planning-mode"
                aria-labelledby="meetup-planning-mode-title"
              >
                <div>
                  <span className="eyebrow">Planning mode</span>
                  <h2 id="meetup-planning-mode-title">
                    What are you planning?
                  </h2>
                  <p>
                    {planningKind === "event"
                      ? "Create a crew-wide event with a start time, duration, location, and joining details."
                      : "Invite one person to plan private time together."}
                  </p>
                </div>
                <div
                  className="meetup-segmented-control"
                  role="group"
                  aria-label="Planning mode"
                >
                  {[
                    ["meetup", "Private Meetup"],
                    ["event", "Crew Event"],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      className={planningKind === value ? "active" : ""}
                      aria-pressed={planningKind === value}
                      onClick={() => {
                        setPlanningKind(value);
                        setSelected(null);
                        setShowFormHint(false);
                        if (value === "event") {
                          setSelectedPerson("");
                          setSelectedParticipants([]);
                        }
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </section>
              {planningKind !== "event" && (
                <section className="panel meetup-person-picker">
                  <div>
                    <h2>
                      {planningKind === "event"
                        ? "Who should be invited first?"
                        : "Who are you meeting?"}
                    </h2>
                    <p>
                      {planningKind === "event"
                        ? "Choose an optional first invitee. More members can be added in the event details."
                        : "The calendar shows each person’s availability based on how they’ve configured it."}
                    </p>
                  </div>
                  <Field
                    label={
                      planningKind === "event"
                        ? "First invitee · Optional"
                        : "Crew member"
                    }
                  >
                    <select
                      value={selectedPerson}
                      onChange={(event) => {
                        setSelectedPerson(event.target.value);
                        setSelectedParticipants((current) =>
                          current.filter((id) => id !== event.target.value),
                        );
                      }}
                    >
                      <option value="">Choose someone…</option>
                      {people.map((person) => (
                        <option key={person.id} value={person.id}>
                          {person.username} · {person.rank || "Crew"}
                        </option>
                      ))}
                    </select>
                  </Field>
                  {selectedPerson && (
                    <fieldset className="meetup-participant-picker">
                      <legend>More participants · Optional</legend>
                      <p>
                        Select everyone who should be included in schedule
                        comparison.
                      </p>
                      <div>
                        {people
                          .filter((person) => person.id !== selectedPerson)
                          .map((person) => (
                            <label key={person.id}>
                              <input
                                type="checkbox"
                                checked={selectedParticipants.includes(
                                  person.id,
                                )}
                                onChange={(event) =>
                                  setSelectedParticipants((current) =>
                                    event.target.checked
                                      ? [...new Set([...current, person.id])]
                                      : current.filter(
                                          (id) => id !== person.id,
                                        ),
                                  )
                                }
                              />
                              {person.username}
                            </label>
                          ))}
                      </div>
                    </fieldset>
                  )}
                </section>
              )}
              <AvailabilityOverlap
                participantIds={selectedIds}
                profiles={profiles}
                availability={availability}
                meetups={meetups}
                duration={duration}
                minimumAttendance={
                  planningKind === "event"
                    ? minimumAttendance
                    : selectedIds.length
                }
                selectedDate={selected}
                onUseTime={(date, time) => {
                  setSelected(date);
                  setPreferredTime(time);
                  setShowFormHint(true);
                }}
                userId={user.id}
              />
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
                      past ||
                      (planningKind !== "event" && !selectedPerson) ||
                      state === "offline";
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
                        {!past &&
                          (planningKind === "event" || selectedPerson) && (
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
                {!selectedPerson && planningKind !== "event" && (
                  <p className="calendar-prompt">
                    Choose a crew member to open the calendar.
                  </p>
                )}
                {planningKind === "event" && !selectedPerson && (
                  <p className="calendar-prompt">
                    Choose a date to start planning the event.
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
            <section
              className="my-meetups-section"
              id="private-meetup-plan-list"
            >
              <MeetupCountdown
                meetups={myMeetups}
                userId={user.id}
                profiles={profiles}
              />
              <MeetupAttendanceSummary meetups={myMeetups} userId={user.id} />
              <h2 className="section-title">Private Meetups & Invitations</h2>
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
                            {item.kind === "event" ? (
                              item.event_title || "Crew Event"
                            ) : (
                              <>
                                {invited ? "Invitation from" : "Meetup with"}{" "}
                                {personName(profiles, otherId)}
                              </>
                            )}
                          </h3>
                          <p>
                            {item.meetup_type || "VRChat meetup"} ·{" "}
                            {item.kind === "event"
                              ? item.event_description ||
                                item.message ||
                                "No description."
                              : item.message || "No notes."}
                          </p>
                          {item.kind === "event" && (
                            <small>
                              {item.event_visibility?.replaceAll("_", " ")} ·
                              Capacity {item.capacity}
                            </small>
                          )}
                          {item.location_name && (
                            <p className="meetup-location">
                              <strong>Location:</strong> {item.location_name}
                            </p>
                          )}
                          {item.join_url && (
                            <a
                              className="button ghost compact-button"
                              href={item.join_url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Open join link
                            </a>
                          )}
                          {item.join_instructions && (
                            <p className="meetup-join-instructions">
                              {item.join_instructions}
                            </p>
                          )}
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
                          {item.user_id === user.id &&
                            item.status === "pending" && (
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
            <form
              ref={requestFormRef}
              className="panel meetup-request-form"
              onSubmit={submit}
            >
              <div className="meetup-form-heading" ref={formHeadingRef}>
                <span>📅</span>
                <div>
                  <h2>
                    {planningKind === "event"
                      ? "Create a Crew Event"
                      : `Invite ${personName(profiles, selectedPerson)}`}
                  </h2>
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
              {planningKind === "event" && (
                <section className="meetup-event-fields">
                  <h3>Crew Event</h3>
                  <Field label="Event title">
                    <input
                      name="event_title"
                      maxLength="120"
                      placeholder="Friday world hop"
                      required
                    />
                  </Field>
                  <Field label="Description" hint="Optional">
                    <textarea
                      name="event_description"
                      rows="3"
                      maxLength="3000"
                      placeholder="What the crew will be doing"
                    />
                  </Field>
                </section>
              )}
              {planningKind !== "event" && (
                <MeetupTemplateControls
                  userId={user.id}
                  formRef={requestFormRef}
                  onNotice={setMessage}
                />
              )}
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
                    <SpaceTimePicker
                      key={`${selected}-${preferredTime}-${availableStartTimes.join("|")}`}
                      name="time"
                      defaultValue={preferredTime}
                      availableValues={availableStartTimes}
                    />
                  </Field>
                  <Field label="Duration">
                    <select
                      name="duration"
                      value={duration}
                      onChange={(event) =>
                        setDuration(Number(event.target.value))
                      }
                    >
                      {(planningKind === "event"
                        ? [3, 4, 5, 6, 7, 8, 9, 10]
                        : [1, 2, 3, 4, 5]
                      ).map((hours) => (
                        <option key={hours} value={hours}>
                          {hours} {hours === 1 ? "hour" : "hours"}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
              </section>
              {planningKind !== "event" && (
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
              )}
              <section>
                <h3>Details</h3>
                {planningKind !== "event" && (
                  <Field
                    label="Additional participant usernames"
                    hint="Optional"
                  >
                    <textarea
                      name="participants"
                      rows="3"
                      defaultValue={selectedParticipants
                        .map((id) => personName(profiles, id))
                        .join(", ")}
                      key={selectedParticipants.join("|")}
                    />
                  </Field>
                )}
                <div className="form-grid">
                  <Field label="Location or world name" hint="Optional">
                    <input
                      name="location_name"
                      maxLength="160"
                      placeholder="VRChat world, Discord channel, or address"
                    />
                  </Field>
                  <Field label="Join link" hint="Optional">
                    <input
                      name="join_url"
                      type="url"
                      maxLength="1000"
                      placeholder="https://…"
                    />
                  </Field>
                </div>
                <Field label="Joining instructions" hint="Optional">
                  <textarea
                    name="join_instructions"
                    rows="3"
                    maxLength="2000"
                    placeholder="Instance details, access notes, or meeting point"
                  />
                </Field>
                {planningKind !== "event" && (
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
                )}
                <Field label="Message" hint="Optional">
                  <textarea
                    name="message"
                    rows="4"
                    defaultValue={friendPrefill.preset?.message || ""}
                  />
                </Field>
                {planningKind !== "event" && (
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
                )}
              </section>
              <div className="meetup-warning">
                <strong>What happens next</strong>
                <p>
                  {planningKind === "event" ? (
                    "Invited members receive an event invitation. Crew-wide events remain pending until the Captain approves them."
                  ) : (
                    <>
                      {personName(profiles, selectedPerson)} receives an
                      invitation.{" "}
                      {captainApprovalRequired
                        ? "Because this request includes the Captain, they also have the final approval."
                        : "When they accept, the meetup is confirmed automatically."}
                    </>
                  )}
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
                  {busy
                    ? "Saving…"
                    : planningKind === "event"
                      ? "Create Crew Event"
                      : "Send meetup invitation"}
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
