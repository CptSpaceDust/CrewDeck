import { useMemo, useState } from "react";
import {
  availabilityInstantRange,
  localDateKey,
  localTimeZoneName,
  meetupInstant,
  zonedDateTime,
} from "../lib/time";

const overlaps = (a, b, c, d) => a < d && b > c;
const formatSlot = (minutes) =>
  new Date(
    2000,
    0,
    1,
    Math.floor(minutes / 60),
    minutes % 60,
  ).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

export function AvailabilityOverlap({
  participantIds,
  profiles,
  availability,
  meetups,
  duration,
  minimumAttendance,
  selectedDate,
  onUseTime,
}) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(selectedDate || localDateKey(new Date()));
  const [viewZone, setViewZone] = useState(localTimeZoneName());
  const people = participantIds
    .map((id) => profiles.find((profile) => profile.id === id))
    .filter(Boolean);
  const suggestions = useMemo(() => {
    if (participantIds.length < 2) return [];
    const minimum = Math.max(
      2,
      Math.min(
        participantIds.length,
        Number(minimumAttendance) || participantIds.length,
      ),
    );
    const values = [];
    for (let total = 8 * 60; total + duration * 60 <= 1440; total += 30) {
      const start = zonedDateTime(
        date,
        `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`,
        localTimeZoneName(),
      );
      const end = new Date(start.getTime() + duration * 3600000);
      const available = participantIds.filter(
        (id) =>
          !availability.some((item) => {
            if (item.user_id !== id) return false;
            const [blockStart, blockEnd] = availabilityInstantRange(item);
            return overlaps(start, end, blockStart, blockEnd);
          }) &&
          !meetups.some((item) => {
            if (
              item.status !== "approved" ||
              (item.user_id !== id && item.with_user_id !== id)
            )
              return false;
            const meetupStart = meetupInstant(item);
            return overlaps(
              start,
              end,
              meetupStart,
              new Date(
                meetupStart.getTime() + Number(item.duration || 1) * 3600000,
              ),
            );
          }),
      ).length;
      if (available >= minimum) values.push({ total, available });
    }
    return values
      .sort(
        (a, b) =>
          b.available - a.available ||
          Math.abs(a.total - 1080) - Math.abs(b.total - 1080),
      )
      .slice(0, 4);
  }, [
    participantIds,
    availability,
    meetups,
    duration,
    minimumAttendance,
    date,
  ]);
  if (participantIds.length < 2) return null;
  const best = suggestions[0];
  const slotLabel = (minutes) => {
    const value = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
    try {
      return new Intl.DateTimeFormat([], {
        timeZone: viewZone,
        hour: "numeric",
        minute: "2-digit",
      }).format(zonedDateTime(date, value, localTimeZoneName()));
    } catch {
      return formatSlot(minutes);
    }
  };
  const shiftDate = (amount) => {
    const next = new Date(`${date}T12:00:00`);
    next.setDate(next.getDate() + amount);
    setDate(localDateKey(next));
  };
  const statusAt = (id, hour) => {
    const start = zonedDateTime(
      date,
      `${String(hour).padStart(2, "0")}:00`,
      localTimeZoneName(),
    );
    const end = new Date(start.getTime() + 3600000);
    if (
      availability.some((item) => {
        if (item.user_id !== id) return false;
        const [blockStart, blockEnd] = availabilityInstantRange(item);
        return overlaps(start, end, blockStart, blockEnd);
      })
    )
      return "unavailable";
    if (
      meetups.some((item) => {
        if (
          item.status !== "approved" ||
          (item.user_id !== id && item.with_user_id !== id)
        )
          return false;
        const meetupStart = meetupInstant(item);
        return overlaps(
          start,
          end,
          meetupStart,
          new Date(
            meetupStart.getTime() + Number(item.duration || 1) * 3600000,
          ),
        );
      })
    )
      return "partial";
    return "available";
  };
  return (
    <section className="panel meetup-overlap-view">
      <button
        type="button"
        className="meetup-overlap-summary"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>
          <strong>Compare schedules</strong>
          <small>
            {best
              ? `${best.available} of ${participantIds.length} available around ${slotLabel(best.total)}.`
              : "No shared opening meets the current attendance target."}
          </small>
        </span>
        <span aria-hidden="true">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div>
          <div className="meetup-overlap-toolbar">
            <button
              type="button"
              onClick={() => shiftDate(-1)}
              aria-label="Previous day"
            >
              ‹
            </button>
            <label>
              Date
              <input
                type="date"
                min={localDateKey(new Date())}
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </label>
            <button
              type="button"
              onClick={() => shiftDate(1)}
              aria-label="Next day"
            >
              ›
            </button>
          </div>
          <div className="meetup-overlap-legend" aria-label="Availability key">
            <span className="available">Available</span>
            <span className="partial">Already planned</span>
            <span className="unavailable">Unavailable</span>
            <span className="unknown">Unknown</span>
          </div>
          <div className="meetup-overlap-people">
            {people.map((person) => {
              const zone =
                availability.find((item) => item.user_id === person.id)
                  ?.time_zone ||
                (person.id === participantIds[0] ? localTimeZoneName() : "");
              let local = "Time zone not configured";
              try {
                if (zone)
                  local = `${new Intl.DateTimeFormat([], { timeZone: zone, hour: "numeric", minute: "2-digit" }).format(new Date())} · ${zone}`;
              } catch {
                local = zone;
              }
              return (
                <div className="meetup-overlap-row" key={person.id}>
                  <div className="meetup-overlap-identity">
                    {person.avatar ? (
                      <img src={person.avatar} alt="" />
                    ) : (
                      <span className="meetup-overlap-avatar">
                        {person.username?.[0]}
                      </span>
                    )}
                    <span>
                      <strong>{person.username}</strong>
                      <small>{local}</small>
                    </span>
                    {people.length === 2 && zone && (
                      <button
                        type="button"
                        className="meetup-view-time"
                        onClick={() => setViewZone(zone)}
                      >
                        {viewZone === zone
                          ? "Viewing their time"
                          : "View as their time"}
                      </button>
                    )}
                  </div>
                  <div className="meetup-overlap-timeline">
                    {Array.from({ length: 16 }, (_, index) => index + 8).map(
                      (hour) => {
                        const status = statusAt(person.id, hour);
                        return (
                          <span
                            key={hour}
                            className={status}
                            title={`${formatSlot(hour * 60)} · ${status}`}
                            aria-label={`${formatSlot(hour * 60)} · ${status}`}
                          />
                        );
                      },
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <section className="meetup-overlap-suggestions">
            <h3>Best shared times</h3>
            <div>
              {suggestions.map((slot) => (
                <div className="meetup-overlap-suggestion" key={slot.total}>
                  <span>
                    {slotLabel(slot.total)} · {slot.available}/
                    {participantIds.length} available
                  </span>
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() =>
                      onUseTime(
                        date,
                        `${String(Math.floor(slot.total / 60)).padStart(2, "0")}:${String(slot.total % 60).padStart(2, "0")}`,
                      )
                    }
                  >
                    Use this time
                  </button>
                </div>
              ))}
            </div>
            {!suggestions.length && (
              <p className="micro-copy">
                No shared times match the current minimum attendance.
              </p>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
