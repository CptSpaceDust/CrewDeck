import { useEffect, useState } from "react";
import {
  Bell,
  CalendarDays,
  Link2,
  Megaphone,
  RefreshCw,
  Users,
} from "lucide-react";
import { crewEvents } from "../lib/crewEvents";
import { confirmInApp, promptInApp } from "./InAppDialog";

export function CrewEventsPanel({ user, profile }) {
  const [events, setEvents] = useState([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  async function load() {
    setLoading(true);
    try {
      setEvents(await crewEvents.list({ mine: true, userId: user.id }));
      setMessage("");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
    return crewEvents.subscribe(load);
  }, [user.id]);
  async function run(task, success) {
    try {
      await task();
      setMessage(success);
      await load();
    } catch (error) {
      setMessage(error.message);
    }
  }
  async function cancel(event) {
    if (
      !(await confirmInApp(
        "Everyone attending will be notified and the event will remain visible as cancelled.",
        { title: `Cancel ${event.title}?`, confirmLabel: "Cancel event" },
      ))
    )
      return;
    const reason = await promptInApp("Add an optional explanation.", "", {
      title: "Cancellation reason",
      inputLabel: "Reason",
      confirmLabel: "Cancel event",
      maxLength: 500,
    });
    await run(
      () => crewEvents.cancel(event.id, reason || ""),
      "Event cancelled.",
    );
  }
  return (
    <section className="crew-events-panel" id="crew-events-plan-list">
      <header>
        <div>
          <span className="eyebrow">Crew Events</span>
          <h2>Events, invitations, and RSVPs</h2>
        </div>
        <button
          className="icon-button"
          onClick={load}
          aria-label="Refresh Crew Events"
        >
          <RefreshCw className={loading ? "spin" : ""} />
        </button>
      </header>
      {message && <p className="form-message">{message}</p>}
      <div className="crew-event-grid">
        {events.map((event) => (
          <CrewEventCard
            key={event.id}
            event={event}
            user={user}
            profile={profile}
            run={run}
            cancel={cancel}
          />
        ))}
      </div>
      {!loading && !events.length && (
        <p className="micro-copy">No Crew Events yet.</p>
      )}
    </section>
  );
}

function CrewEventCard({ event, user, profile, run, cancel }) {
  const mine = event.members?.find((member) => member.user_id === user.id);
  const canManage =
    profile?.rank === "Captain" || ["host", "cohost"].includes(mine?.role);
  const attending =
    event.members?.filter((member) => member.response === "attending").length ||
    0;
  const waitlisted =
    event.members?.filter((member) => member.response === "waitlisted")
      .length || 0;
  const starts = new Date(event.starts_at);
  const countdown = Math.max(0, starts.getTime() - Date.now());
  const countdownText = countdown
    ? `${Math.floor(countdown / 86400000)}d ${Math.floor((countdown % 86400000) / 3600000)}h`
    : "Started";
  async function announce(e) {
    e.preventDefault();
    const body = new FormData(e.currentTarget).get("announcement");
    await run(
      () => crewEvents.announce(event.id, user.id, body),
      "Announcement posted.",
    );
    e.currentTarget.reset();
  }
  return (
    <article className="panel crew-event-card">
      {event.banner_path && (
        <img className="crew-event-banner" src={event.banner_path} alt="" />
      )}
      <div className="card-meta">
        <span className={`status ${event.status}`}>
          {event.status.replaceAll("_", " ")}
        </span>
        <span>{countdownText}</span>
      </div>
      <h3>{event.title}</h3>
      <p>{event.description || "No description."}</p>
      <div className="crew-event-facts">
        <span>
          <CalendarDays />{" "}
          {starts.toLocaleString([], {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </span>
        <span>
          <Users /> {attending}/{event.capacity} attending
          {waitlisted ? ` · ${waitlisted} waiting` : ""}
        </span>
        {event.location_name && <span>{event.location_name}</span>}
      </div>
      <div className="board-tag-row">
        {event.tags?.map((tag) => (
          <span key={tag}>#{tag}</span>
        ))}
      </div>
      {event.join_url && (
        <a
          className="button secondary"
          href={event.join_url}
          target="_blank"
          rel="noreferrer"
        >
          <Link2 /> Join event
        </a>
      )}
      {event.instructions && (
        <details>
          <summary>Joining instructions</summary>
          <p>{event.instructions}</p>
        </details>
      )}
      {!canManage && event.status === "published" && (
        <div className="button-row">
          {["interested", "maybe", "attending", "declined"].map((response) => (
            <button
              key={response}
              className={`button ${mine?.response === response ? "primary" : "secondary"}`}
              onClick={() =>
                run(
                  () => crewEvents.respond(event.id, response),
                  `RSVP updated to ${response}.`,
                )
              }
            >
              {response}
            </button>
          ))}
        </div>
      )}
      {mine?.response === "attending" && (
        <div className="button-row">
          {["here", "late", "unable"].map((check) => (
            <button
              key={check}
              className="button ghost"
              onClick={() =>
                run(
                  () => crewEvents.checkIn(event.id, check),
                  `Check-in set to ${check}.`,
                )
              }
            >
              {check}
            </button>
          ))}
        </div>
      )}
      {mine && mine.role !== "host" && (
        <button
          className="button danger ghost"
          onClick={() =>
            run(() => crewEvents.leave(event.id), "You left the Crew Event.")
          }
        >
          Leave event
        </button>
      )}
      {!!event.announcements?.length && (
        <div className="crew-event-announcements">
          <strong>
            <Megaphone /> Announcements
          </strong>
          {event.announcements.map((item) => (
            <p key={item.id}>{item.body}</p>
          ))}
        </div>
      )}
      <details className="crew-event-files">
        <summary>Event files ({event.files?.length || 0})</summary>
        <div className="crew-event-file-list">
          {event.files?.map((file) => (
            <div key={file.id}>
              <button
                className="button ghost"
                onClick={() =>
                  run(() => crewEvents.openFile(file), "File opened.")
                }
              >
                {file.file_name}
              </button>
              {canManage && (
                <button
                  className="icon-button danger"
                  aria-label={`Delete ${file.file_name}`}
                  onClick={() =>
                    run(
                      () => crewEvents.deleteFile(file),
                      "Event file deleted.",
                    )
                  }
                >
                  ×
                </button>
              )}
            </div>
          ))}
          {!event.files?.length && (
            <p className="micro-copy">No files shared for this event.</p>
          )}
        </div>
        {canManage && (
          <label className="button secondary crew-event-file-upload">
            Add file
            <input
              type="file"
              hidden
              onChange={(change) => {
                const file = change.target.files?.[0];
                if (file)
                  run(
                    () => crewEvents.uploadFile(event.id, user.id, file),
                    "Event file uploaded.",
                  );
                change.target.value = "";
              }}
            />
          </label>
        )}
      </details>
      <details>
        <summary>Event notification settings</summary>
        <button
          className="button secondary"
          onClick={() =>
            run(
              () =>
                crewEvents.saveNotifications(event.id, user.id, {
                  announcements: true,
                  rsvp_changes: true,
                  reminder_minutes: [1440, 60, 15],
                }),
              "Event reminders enabled.",
            )
          }
        >
          <Bell /> Enable 1 day, 1 hour, and 15 minute reminders
        </button>
      </details>
      {canManage && (
        <details>
          <summary>Host controls</summary>
          {profile?.rank === "Captain" &&
            event.status === "pending_approval" && (
              <button
                className="button primary"
                onClick={() =>
                  run(
                    () => crewEvents.update(event.id, { status: "published" }),
                    "Crew Event approved and published.",
                  )
                }
              >
                Approve crew-wide event
              </button>
            )}
          <form onSubmit={announce}>
            <textarea
              name="announcement"
              required
              maxLength="2000"
              placeholder="Post an event announcement"
            />
            <button className="button secondary">Announce</button>
          </form>
          <div className="button-row">
            {event.members
              ?.filter((member) => member.role === "participant")
              .map((member) => (
                <button
                  key={member.user_id}
                  className="button ghost"
                  onClick={() =>
                    run(
                      () =>
                        crewEvents.setRole(event.id, member.user_id, "cohost"),
                      "Cohost added.",
                    )
                  }
                >
                  Make {member.profile?.username || "member"} cohost
                </button>
              ))}
          </div>
          {mine?.role === "host" && (
            <div className="button-row">
              {event.members
                ?.filter((member) => member.role === "cohost")
                .map((member) => (
                  <button
                    key={member.user_id}
                    className="button secondary"
                    onClick={() =>
                      run(
                        () => crewEvents.transferHost(event.id, member.user_id),
                        "Event ownership transferred.",
                      )
                    }
                  >
                    Transfer to {member.profile?.username}
                  </button>
                ))}
            </div>
          )}
          {mine?.role === "host" && (
            <button className="button danger" onClick={() => cancel(event)}>
              Cancel event
            </button>
          )}
        </details>
      )}
    </article>
  );
}
