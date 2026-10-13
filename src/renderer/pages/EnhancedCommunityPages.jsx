import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowDown,
  Cake,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Flag,
  RefreshCw,
  UserRound,
} from "lucide-react";
import {
  Avatar,
  Empty,
  ErrorState,
  Field,
  Loading,
  Modal,
  PageHeader,
} from "../components/ui";
import { confirmInApp } from "../components/InAppDialog";
import {
  cancelMeetup,
  createUserReport,
  createMeetup,
  getMeetups,
  getProfile,
  getProfiles,
  restrictionMessage,
} from "../lib/data";
import { useLoader } from "../lib/hooks";
import { formatMeetupLocal, localTimeZoneName } from "../lib/time";

const isOnline = (person) =>
  Boolean(
    person?.last_seen &&
      Date.now() - new Date(person.last_seen).getTime() < 120000,
  );

export function CrewPage({ onViewProfile }) {
  const { data, loading, error, reload } = useLoader(() => getProfiles(), []);
  const [query, setQuery] = useState("");
  const rows = useMemo(
    () =>
      (data || []).filter((person) =>
        `${person.username || ""} ${person.rank || ""}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [data, query],
  );
  return (
    <div className="page">
      <PageHeader
        eyebrow="Crew directory"
        title="Everyone in orbit"
        description="Browse community members and open their full crew profile."
        action={
          <div className="directory-actions">
            <div className="search-box">
              <UserRound />
              <input
                placeholder="Search by name or rank"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <button
              className="icon-button refresh-button"
              title="Refresh crew"
              onClick={reload}
              disabled={loading}
              aria-busy={loading}
            >
              <RefreshCw className={loading ? "spin" : ""} />
            </button>
          </div>
        }
      />
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorState message={error} retry={reload} />
      ) : (
        <div className="crew-grid">
          {rows.map((person) => {
            const online = isOnline(person);
            let badges = Array.isArray(person.badges) ? person.badges : [];
            if (person.support_active && !badges.includes("Supporter"))
              badges = [...badges, "Supporter"];
            return (
              <article className="panel crew-card" key={person.id}>
                <div className="crew-avatar-stack">
                  <div
                    className={`crew-status ${online ? "online" : "offline"}`}
                  >
                    <span />
                    {online ? "Online" : "Offline"}
                  </div>
                  <Avatar profile={person} size={72} />
                </div>
                <h3>{person.username}</h3>
                <span className="rank">{person.rank || "Crew"}</span>
                {!online && (
                  <small>
                    {person.last_seen
                      ? `Last seen: ${new Date(person.last_seen).toLocaleString()}`
                      : "Last seen: Unknown"}
                  </small>
                )}
                <div className="tag-row">
                  {badges.map((badge) => (
                    <span key={badge}>{badge}</span>
                  ))}
                </div>
                <button
                  className="button secondary"
                  onClick={() => onViewProfile(person)}
                >
                  <UserRound />
                  View Profile
                </button>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function CrewProfilePage({ person, user, onBack }) {
  const [reporting, setReporting] = useState(false);
  const [reportMessage, setReportMessage] = useState("");
  const {
    data: profile,
    loading,
    error,
    reload,
  } = useLoader(
    () => (person?.id ? getProfile(person.id) : Promise.resolve(null)),
    [person?.id],
  );
  if (loading)
    return (
      <div className="page">
        <Loading />
      </div>
    );
  if (error || !profile)
    return (
      <div className="page">
        <ErrorState
          message={error || "This profile is unavailable."}
          retry={reload}
        />
      </div>
    );
  const online = isOnline(profile);
  const socials = [
    ["Discord", profile.discord],
    ["VRChat", profile.vrchat],
    ["Steam", profile.steam],
    ["YouTube", profile.youtube],
    ["Twitch", profile.twitch],
  ].filter(([, value]) => value);
  return (
    <div className="page">
      <PageHeader
        eyebrow="Crew profile"
        title={profile.username || "Crew member"}
        description="Community profile and connection details."
        action={
          <button className="button secondary" onClick={onBack}>
            <ArrowLeft />
            Back to directory
          </button>
        }
      />
      <section className="panel crew-profile">
        <div className="crew-profile-hero">
          <Avatar profile={profile} size={112} />
          <div>
            <span
              className={`profile-presence ${online ? "online" : "offline"}`}
            >
              <i />
              {online ? "Online" : "Offline"}
            </span>
            <h2>{profile.username}</h2>
            <span className="rank">{profile.rank || "Crew Member"}</span>
            <div className="tag-row">
              {(Array.isArray(profile.badges) ? profile.badges : []).map(
                (badge) => (
                  <span key={badge}>{badge}</span>
                ),
              )}
            </div>
          </div>
        </div>
        <div className="profile-facts">
          <div>
            <small>Favorite game</small>
            <strong>{profile.favorite_game || "Not Set"}</strong>
          </div>
          <div>
            <small>Joined</small>
            <strong>{profile.joined || "Unknown"}</strong>
          </div>
          <div>
            <small>Status</small>
            <strong>
              {online
                ? "Online"
                : profile.last_seen
                  ? `Last seen ${new Date(profile.last_seen).toLocaleString()}`
                  : "Offline"}
            </strong>
          </div>
        </div>
        <div className="profile-bio">
          <h3>Bio</h3>
          <p>{profile.bio || "No bio yet"}</p>
        </div>
        {socials.length > 0 && (
          <div className="profile-socials">
            {socials.map(([label, value]) => (
              <span key={label}>
                <small>{label}</small>
                <strong>{value}</strong>
                <ExternalLink />
              </span>
            ))}
          </div>
        )}
        {user?.id !== profile.id && (
          <div className="profile-safety-actions">
            <button className="button ghost" onClick={() => setReporting(true)}>
              <Flag /> Report a concern
            </button>
            {reportMessage && (
              <span className="form-message inline">{reportMessage}</span>
            )}
          </div>
        )}
      </section>
      {reporting && (
        <Modal
          title={`Report ${profile.username}`}
          onClose={() => setReporting(false)}
        >
          <form
            className="stack-form"
            onSubmit={async (event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              try {
                await createUserReport(
                  user.id,
                  profile.id,
                  form.get("reason"),
                  form.get("context"),
                );
                setReportMessage(
                  "Your report was sent privately to the Captain.",
                );
                setReporting(false);
              } catch (error) {
                setReportMessage(error.message);
              }
            }}
          >
            <p className="modal-copy">
              Reports are private. Describe the concern clearly so the Captain
              can review it fairly.
            </p>
            <Field label="What happened?">
              <textarea
                name="reason"
                rows="5"
                minLength="10"
                maxLength="1000"
                required
              />
            </Field>
            <Field label="Helpful context" hint="Optional">
              <textarea name="context" rows="3" maxLength="1000" />
            </Field>
            <button className="button danger">
              <Flag /> Send private report
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}

function birthday(profile) {
  const match = /^\d{4}-(\d{2})-(\d{2})/.exec(profile.birthday || "");
  if (!profile.show_birthday || !match)
    return { ...profile, hidden: true, days: Infinity };
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  let next = new Date(
    now.getFullYear(),
    Number(match[1]) - 1,
    Number(match[2]),
  );
  if (next < now) next.setFullYear(next.getFullYear() + 1);
  return { ...profile, next, days: Math.round((next - now) / 86400000) };
}
export function BirthdaysPage() {
  const { data, loading, error, reload } = useLoader(
    () => getProfiles("id,username,avatar,birthday,show_birthday"),
    [],
  );
  const items = (data || [])
    .map(birthday)
    .sort((a, b) => Number(a.hidden) - Number(b.hidden) || a.days - b.days);
  return (
    <div className="page">
      <PageHeader
        eyebrow="Celebrations"
        title="Member birthdays"
        description="Never miss a chance to celebrate someone in the crew."
        action={
          <button
            className="icon-button refresh-button"
            title="Refresh birthdays"
            onClick={reload}
            disabled={loading}
            aria-busy={loading}
          >
            <RefreshCw className={loading ? "spin" : ""} />
          </button>
        }
      />
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorState message={error} retry={reload} />
      ) : items.length ? (
        <div className="birthday-list">
          {items.map((person, index) =>
            person.hidden ? (
              <article
                className="panel birthday-card opted-out"
                key={person.id || index}
              >
                <div className="birthday-icon muted">
                  <Cake />
                </div>
                <div className="birthday-hidden-copy">
                  <h3>Birthday Hidden</h3>
                  <p>This member opted out of showing their birthday.</p>
                </div>
              </article>
            ) : (
              <article
                className={`panel birthday-card ${person.days === 0 ? "today" : ""}`}
                key={person.id}
              >
                <div className="birthday-icon">
                  <Cake />
                </div>
                <Avatar profile={person} />
                <div>
                  <h3>{person.username}</h3>
                  <p>
                    {new Intl.DateTimeFormat(undefined, {
                      month: "long",
                      day: "numeric",
                    }).format(person.next)}{" "}
                    ·{" "}
                    {person.days === 0
                      ? "🎉 Today!"
                      : person.days === 1
                        ? "Tomorrow"
                        : `In ${person.days} days`}
                  </p>
                </div>
              </article>
            ),
          )}
        </div>
      ) : (
        <Empty
          title="No birthdays added yet"
          body="Birthdays appear here without the birth year."
        />
      )}
    </div>
  );
}

export function GuidelinesPage() {
  const sections = [
    [
      "Be respectful",
      "Treat people kindly. Harassment, hate speech, bullying, threats, and deliberately making others uncomfortable are not allowed.",
    ],
    [
      "Respect privacy and boundaries",
      "Do not share someone’s personal information, messages, images, or other details without permission. Respect “no,” silence, and personal boundaries.",
    ],
    [
      "Keep contact wanted",
      "Use messages thoughtfully. If someone declines or does not respond, do not pressure or repeatedly contact them.",
    ],
    [
      "Collaborate fairly",
      "Give credit for other people’s work. Be clear about expectations, deadlines, and compensation before starting a project together.",
    ],
    [
      "Report problems",
      "If someone makes you feel unsafe or breaks these guidelines, contact the Captain privately. Content or access may be removed when needed to protect the community.",
    ],
  ];
  return (
    <div className="page guidelines-exact">
      <PageHeader
        eyebrow="Community guidelines"
        title="Community Guidelines"
        description="Help keep this community welcoming, respectful, and comfortable for everyone."
      />
      <div className="guidelines-exact-list">
        {sections.map(([title, body]) => (
          <article className="panel guideline-exact" key={title}>
            <h2>{title}</h2>
            <p>{body}</p>
          </article>
        ))}
      </div>
      <aside className="panel guidelines-summary">
        <p>
          <strong>Short version:</strong> Be kind, respect privacy and
          boundaries, and help make this a space people want to return to.
        </p>
      </aside>
    </div>
  );
}

const dateKey = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
export function MeetupsPage({ user, profile }) {
  const { data, loading, error, reload } = useLoader(getMeetups, []);
  const [currentMonth, setCurrentMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const [selected, setSelected] = useState(null);
  const [showFormHint, setShowFormHint] = useState(false);
  const formHeadingRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const approved = (data || []).filter((item) => item.status === "approved");
  useEffect(() => {
    if (!selected || loading || !formHeadingRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setShowFormHint(false);
      },
      { threshold: 0.5 },
    );
    observer.observe(formHeadingRef.current);
    return () => observer.disconnect();
  }, [selected, loading]);
  useEffect(() => {
    if (
      selected &&
      data?.some(
        (item) => item.status === "approved" && item.meetup_date === selected,
      )
    ) {
      setSelected(null);
      setShowFormHint(false);
      setMessage("That day is now occupied. Please choose another date.");
    }
  }, [data, selected]);
  const mine = (data || []).filter((item) => item.user_id === user.id);
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
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      if (!selected || approved.some((item) => item.meetup_date === selected))
        throw new Error("Please select an available day.");
      const blocked = await restrictionMessage(user.id, "meetups");
      if (blocked) throw new Error(blocked);
      const result = await createMeetup(user.id, {
        meetup_date: selected,
        start_time: form.get("time"),
        duration: Number(form.get("duration")),
        message: String(form.get("message") || "").trim(),
        vrc_username: String(form.get("vrc")).trim(),
        meetup_type: form.get("type"),
        additional_participants: String(form.get("participants") || "").trim(),
        time_flexibility: form.get("flexibility"),
      });
      setMessage(
        result.emailSent
          ? "Your meetup request was sent to the Captain."
          : "Your meetup request was submitted.",
      );
      setSelected(null);
      await reload();
    } catch (exception) {
      setMessage(exception.message);
    } finally {
      setBusy(false);
    }
  }
  async function cancel(item) {
    const approved = await confirmInApp(
      "This meetup request will be removed from the calendar.",
      { title: "Cancel meetup request?", confirmLabel: "Cancel request" },
    );
    if (!approved) return;
    try {
      await cancelMeetup(item.id, user.id);
      setMessage("Your meetup request was removed.");
      await reload();
    } catch (exception) {
      setMessage(exception.message);
    }
  }
  return (
    <div className="page meetup-page">
      <PageHeader
        eyebrow="Meetup calendar"
        title="Plan time together"
        description={`Requests use Mountain Time. Approved meetup times are also shown in your local zone (${localTimeZoneName()}).`}
        action={
          <button
            className="icon-button refresh-button"
            title="Refresh meetups"
            onClick={reload}
          >
            <RefreshCw />
          </button>
        }
      />
      {message && <p className="form-message meetup-message">{message}</p>}
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorState message={error} retry={reload} />
      ) : (
        <>
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
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                <span key={day}>{day}</span>
              ))}
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
                const meetup = approved.find(
                  (item) => item.meetup_date === key,
                );
                const past = date < today;
                return (
                  <button
                    key={key}
                    disabled={past || Boolean(meetup)}
                    aria-label={`${key}${meetup ? ": Occupied" : past ? ": Unavailable" : ": Available"}`}
                    title={
                      meetup
                        ? `Occupied — ${meetup.meetup_type || "VRChat meetup"}`
                        : ""
                    }
                    className={`calendar-day ${meetup ? "scheduled" : ""} ${selected === key ? "selected" : ""}`}
                    onClick={() => {
                      if (!meetup && !past) {
                        setSelected(key);
                        setShowFormHint(true);
                      }
                    }}
                  >
                    <strong>{day}</strong>
                    {meetup && <span>Occupied</span>}
                  </button>
                );
              })}
            </div>
            <p className="calendar-legend">
              Occupied days already have an approved meetup and cannot be
              selected.
            </p>
          </section>
          {selected && showFormHint && (
            <button
              type="button"
              className="meetup-form-hint"
              onClick={() => {
                formHeadingRef.current?.scrollIntoView({
                  behavior: window.matchMedia(
                    "(prefers-reduced-motion: reduce)",
                  ).matches
                    ? "auto"
                    : "smooth",
                  block: "start",
                });
              }}
            >
              <ArrowDown />
              <span>Scroll down to finish your meetup request</span>
            </button>
          )}
          <section className="my-meetups-section">
            <h2 className="section-title">My Meetup Requests</h2>
            {mine.length ? (
              <div className="timeline">
                {mine.map((item) => (
                  <article
                    className="panel meetup-card meetup-request-details"
                    key={item.id}
                  >
                    <div className="date-tile">
                      <strong>
                        {new Date(`${item.meetup_date}T12:00:00`).getDate()}
                      </strong>
                      <span>
                        {new Date(
                          `${item.meetup_date}T12:00:00`,
                        ).toLocaleDateString(undefined, { month: "short" })}
                      </span>
                    </div>
                    <div>
                      <div className="card-meta">
                        <span className={`status ${item.status}`}>
                          {item.status}
                        </span>
                        <span>
                          {item.start_time} · {item.duration}{" "}
                          {Number(item.duration) === 1 ? "hour" : "hours"}
                        </span>
                      </div>
                      {item.start_time && (
                        <p className="meetup-local-time">
                          Your time:{" "}
                          {formatMeetupLocal(item.meetup_date, item.start_time)}
                        </p>
                      )}
                      <h3>{item.meetup_type || "VRChat meetup"}</h3>
                      <p>{item.message || "No additional notes."}</p>
                      <small>
                        VRChat: {item.vrc_username || "Not provided"} ·{" "}
                        {item.time_flexibility || "Exact time only"}
                      </small>
                      {item.additional_participants && (
                        <p className="micro-copy">
                          <strong>Additional participants:</strong>{" "}
                          {item.additional_participants}
                        </p>
                      )}
                      {item.status === "denied" && item.admin_reason && (
                        <p className="meetup-denial">
                          <strong>Captain's reason:</strong> {item.admin_reason}
                        </p>
                      )}
                      {item.status === "pending" && (
                        <button
                          className="button danger compact-button"
                          onClick={() => cancel(item)}
                        >
                          Cancel Request
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <Empty
                title="No meetup requests found"
                body="Choose an available day on the calendar to request one."
              />
            )}
          </section>
          {selected && (
            <form className="panel meetup-request-form" onSubmit={submit}>
              <div className="meetup-form-heading" ref={formHeadingRef}>
                <span>🚀</span>
                <div>
                  <h2>Request Meetup</h2>
                  <p>
                    {new Date(`${selected}T12:00:00`).toLocaleDateString(
                      undefined,
                      {
                        weekday: "long",
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      },
                    )}
                  </p>
                </div>
              </div>
              <section>
                <h3>🕐 Meetup Time</h3>
                <div className="form-grid">
                  <Field label="Preferred Start Time">
                    <input
                      name="time"
                      type="time"
                      min="08:00"
                      max="23:00"
                      required
                    />
                  </Field>
                  <Field label="Duration">
                    <select name="duration" defaultValue="1">
                      <option value="1">1 Hour</option>
                      <option value="2">2 Hours</option>
                      <option value="3">3 Hours</option>
                      <option value="4">4 Hours</option>
                      <option value="5">5 Hours</option>
                    </select>
                  </Field>
                </div>
              </section>
              <section>
                <h3>🥽 VRChat Information</h3>
                <div className="form-grid">
                  <Field label="VRChat Username" hint="Required">
                    <input
                      name="vrc"
                      defaultValue={profile?.vrchat || ""}
                      placeholder="Your VRChat username"
                      required
                    />
                  </Field>
                  <Field label="Meetup Type">
                    <select name="type" defaultValue="" required>
                      <option value="" disabled>
                        Select a meetup type...
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
                <h3>👥 Additional Participants</h3>
                <Field
                  label="Other Participants"
                  hint="Optional — one VRChat username per line"
                >
                  <textarea
                    name="participants"
                    rows="4"
                    placeholder={
                      "VRC Username: ExampleUser1\nVRC Username: ExampleUser2"
                    }
                  />
                </Field>
              </section>
              <section>
                <h3>⏳ Time Flexibility</h3>
                <Field label="Scheduling Flexibility">
                  <select name="flexibility" defaultValue="exact">
                    <option value="exact">Exact time only</option>
                    <option value="30">±30 minutes is okay</option>
                    <option value="60">±1 hour is okay</option>
                  </select>
                </Field>
              </section>
              <section>
                <h3>💬 Message / Notes</h3>
                <Field label="Additional Information" hint="Optional">
                  <textarea
                    name="message"
                    rows="5"
                    placeholder="Anything else you want the Captain to know?"
                  />
                </Field>
              </section>
              <div className="meetup-warning">
                <strong>Before submitting</strong>
                <p>
                  Meetups are for VRChat only. Make sure everyone listed knows
                  they are included. Submitting a request does not guarantee
                  approval.
                </p>
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="button ghost"
                  onClick={() => setSelected(null)}
                >
                  Cancel
                </button>
                <button className="button primary" disabled={busy}>
                  {busy ? "Submitting…" : "Submit Meetup Request"}
                </button>
              </div>
            </form>
          )}
        </>
      )}
    </div>
  );
}
