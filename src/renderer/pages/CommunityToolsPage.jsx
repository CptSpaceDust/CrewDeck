import { useEffect, useMemo, useState } from "react";
import {
  Bug,
  CalendarDays,
  CheckCircle2,
  HandHelping,
  RefreshCw,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { communityBoards } from "../lib/communityBoards";
import { Empty, Field, Loading, PageHeader } from "../components/ui";
import { CommunityBoardWorkspace } from "../components/CommunityBoardWorkspace";

function useCommunityRows(kind) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  async function reload() {
    setLoading(true);
    try {
      const data = await communityBoards.listPosts(kind);
      setRows(data);
      setError("");
    } catch (exception) {
      setRows([]);
      setError(exception.message);
    }
    setLoading(false);
  }
  useEffect(() => {
    reload();
    return communityBoards.subscribe(kind, reload);
  }, [kind]);
  return { rows, loading, error, reload };
}

export function HelpRequestsPage({ user, profile }) {
  const { rows, loading, error, reload } = useCommunityRows("help");
  const [message, setMessage] = useState("");
  async function create(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await communityBoards.createPost({
        kind: "help",
        authorId: user.id,
        title: form.get("title"),
        body: form.get("description"),
        status: "Open",
        tags: [form.get("category")],
      });
      setMessage("Help request posted.");
      event.currentTarget.reset();
      await reload();
    } catch (exception) {
      setMessage(exception.message);
    }
  }
  async function update(item, status) {
    const changes =
      status === "Claimed" ? { status, assigned_to: user.id } : { status };
    try {
      await communityBoards.updatePost(item.id, changes);
      setMessage(`Request ${status.toLowerCase()}.`);
      await reload();
    } catch (exception) {
      setMessage(exception.message);
    }
  }
  return (
    <div className="page community-tool-page">
      <PageHeader
        eyebrow="Community support"
        title="Help Request Board"
        description="Ask for specific help, claim a request, and close the loop when the job is done."
        action={
          <button className="button secondary" onClick={reload}>
            <RefreshCw /> Refresh
          </button>
        }
      />
      <form className="panel community-tool-compose" onSubmit={create}>
        <Field label="What do you need help with?">
          <input
            name="title"
            required
            minLength="3"
            maxLength="120"
            placeholder="Can someone test this VRChat world?"
          />
        </Field>
        <Field label="Details">
          <textarea
            name="description"
            required
            minLength="3"
            maxLength="3000"
            rows="4"
          />
        </Field>
        <Field label="Category">
          <select name="category">
            <option value="general">General</option>
            <option value="vrchat">VRChat</option>
            <option value="testing">Testing</option>
            <option value="creative">Creative</option>
            <option value="event">Event</option>
            <option value="technical">Technical</option>
          </select>
        </Field>
        <button className="button primary">Post request</button>
        {message && <p className="form-message">{message}</p>}
      </form>
      <CommunityBoardWorkspace
        kind="help"
        user={user}
        profile={profile}
        onChanged={reload}
      />
      {loading ? (
        <Loading />
      ) : error ? (
        <p className="form-message">{error}</p>
      ) : rows.length ? (
        <div className="community-tool-grid">
          {rows.map((item) => (
            <article className="panel community-tool-card" key={item.id}>
              <span className={`status ${item.status.toLowerCase()}`}>
                {item.status}
              </span>
              <small>{item.tags?.[0] || "general"}</small>
              <h2>{item.title}</h2>
              <p>{item.body}</p>
              <div className="button-row">
                {["Open", "Reopened"].includes(item.status) && (
                  <button
                    className="button secondary"
                    onClick={() => update(item, "Claimed")}
                  >
                    Claim
                  </button>
                )}
                {item.assigned_to === user.id && item.status === "Claimed" && (
                  <button
                    className="button primary"
                    onClick={() => update(item, "Completed")}
                  >
                    <CheckCircle2 /> Complete
                  </button>
                )}
                {item.author_id === user.id && item.status === "Completed" && (
                  <button
                    className="button secondary"
                    onClick={() => update(item, "Reopened")}
                  >
                    Reopen
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title="No open help requests"
          body="Post the first request when you need a hand."
        />
      )}
    </div>
  );
}

export function BugReportsPage({ user, profile }) {
  const { rows, loading, error, reload } = useCommunityRows("bug");
  const [message, setMessage] = useState("");
  const appVersion = window.desktop?.appVersion || "2.0.2";
  async function submit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const screenshot = form.get("screenshot");
    let screenshotPath = null;
    if (screenshot?.size) {
      if (screenshot.size > 10485760) {
        setMessage("Screenshots must be 10 MB or smaller.");
        return;
      }
      const extension =
        screenshot.name.split(".").pop()?.toLowerCase() || "png";
      screenshotPath = `${user.id}/${crypto.randomUUID()}.${extension}`;
      const upload = await supabase.storage
        .from("bug-screenshots")
        .upload(screenshotPath, screenshot, {
          contentType: screenshot.type,
          upsert: false,
        });
      if (upload.error) {
        setMessage(upload.error.message);
        return;
      }
    }
    try {
      await communityBoards.createPost({
        kind: "bug",
        authorId: user.id,
        title: form.get("title"),
        body: form.get("description"),
        status: "Open",
        tags: ["app"],
        metadata: {
          platform: "app",
          page_name: form.get("page_name"),
          screenshot_path: screenshotPath,
          app_version: appVersion,
          operating_system:
            navigator.userAgentData?.platform ||
            navigator.platform ||
            "Windows",
          diagnostics: {
            online: navigator.onLine,
            language: navigator.language,
            viewport: `${innerWidth}x${innerHeight}`,
          },
        },
      });
      setMessage("Bug report sent to the Captain.");
      event.currentTarget.reset();
      await reload();
    } catch (exception) {
      if (screenshotPath)
        await supabase.storage.from("bug-screenshots").remove([screenshotPath]);
      setMessage(exception.message);
    }
  }
  return (
    <div className="page community-tool-page">
      <PageHeader
        eyebrow="CrewDeck quality"
        title="Bug Report Center"
        description="Send useful diagnostics and follow the Captain’s progress from open to fixed."
        action={
          <button className="button secondary" onClick={reload}>
            <RefreshCw /> Refresh
          </button>
        }
      />
      <form className="panel community-tool-compose" onSubmit={submit}>
        <div className="form-grid">
          <Field label="Affected page">
            <input
              name="page_name"
              required
              maxLength="120"
              placeholder="Messages"
            />
          </Field>
          <Field label="Short title">
            <input name="title" required minLength="3" maxLength="160" />
          </Field>
        </div>
        <Field label="What happened?">
          <textarea
            name="description"
            required
            minLength="3"
            maxLength="5000"
            rows="5"
          />
        </Field>
        <Field label="Screenshot (optional, up to 10 MB)">
          <input
            name="screenshot"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
          />
        </Field>
        <p className="micro-copy">
          CrewDeck {appVersion} ·{" "}
          {navigator.userAgentData?.platform || navigator.platform || "Windows"}
        </p>
        <button className="button primary">
          <Bug /> Submit report
        </button>
        {message && <p className="form-message">{message}</p>}
      </form>
      <CommunityBoardWorkspace
        kind="bug"
        user={user}
        profile={profile}
        onChanged={reload}
      />
      {loading ? (
        <Loading />
      ) : error ? (
        <p className="form-message">{error}</p>
      ) : rows.length ? (
        <div className="community-tool-grid">
          {rows.map((item) => (
            <article className="panel community-tool-card" key={item.id}>
              <span className={`status ${item.status.toLowerCase()}`}>
                {item.status}
              </span>
              <small>
                {item.metadata?.platform || "app"} ·{" "}
                {item.metadata?.page_name || "Unknown page"}
              </small>
              <h2>{item.title}</h2>
              <p>{item.body}</p>
              {item.metadata?.captain_note && (
                <blockquote>{item.metadata.captain_note}</blockquote>
              )}
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title="No bug reports"
          body="Everything reported by you will appear here."
        />
      )}
    </div>
  );
}

export function CommunityCalendarPage({ user }) {
  const [data, setData] = useState({
    events: [],
    crewEvents: [],
    meetups: [],
    birthdays: [],
    announcements: [],
  });
  const [filters, setFilters] = useState(
    new Set([
      "meetup",
      "birthday",
      "community",
      "announcement",
      "deadline",
      "maintenance",
    ]),
  );
  const [loading, setLoading] = useState(true);
  async function reload() {
    setLoading(true);
    const [events, crewEvents, meetups, birthdays, announcements] =
      await Promise.all([
        supabase
          .from("community_calendar_events")
          .select("*")
          .order("starts_at"),
        supabase
          .from("crew_events")
          .select("id,title,description,starts_at,join_url,status")
          .eq("status", "published")
          .order("starts_at"),
        supabase
          .from("meetup_requests")
          .select(
            "id,meetup_date,start_time,meetup_type,message,status,user_id",
          )
          .in("status", ["approved", "scheduled", "confirmed"]),
        supabase
          .from("profiles")
          .select("id,username,birthday,show_birthday")
          .eq("show_birthday", true)
          .not("birthday", "is", null),
        supabase
          .from("community_announcements")
          .select("id,title,body,publish_at,expires_at")
          .lte("publish_at", new Date().toISOString()),
      ]);
    setData({
      events: events.data || [],
      crewEvents: crewEvents.data || [],
      meetups: meetups.data || [],
      birthdays: birthdays.data || [],
      announcements: announcements.data || [],
    });
    setLoading(false);
  }
  useEffect(() => {
    reload();
  }, []);
  const entries = useMemo(() => {
    const year = new Date().getFullYear();
    return [
      ...data.meetups.map((item) => ({
        id: `meetup-${item.id}`,
        type: "meetup",
        title: item.meetup_type || "Meetup",
        date: new Date(`${item.meetup_date}T${item.start_time || "12:00"}`),
        detail: item.message,
      })),
      ...data.birthdays.map((item) => {
        const birthday = new Date(item.birthday);
        return {
          id: `birthday-${item.id}`,
          type: "birthday",
          title: `${item.username}'s birthday`,
          date: new Date(year, birthday.getUTCMonth(), birthday.getUTCDate()),
          detail: "Crew birthday",
        };
      }),
      ...data.announcements.map((item) => ({
        id: `announcement-${item.id}`,
        type: "announcement",
        title: item.title,
        date: new Date(item.publish_at),
        detail: item.body,
      })),
      ...data.events.map((item) => ({
        id: `event-${item.id}`,
        type: item.category,
        title: item.title,
        date: new Date(item.starts_at),
        detail: item.description,
        url: item.join_url,
      })),
      ...data.crewEvents.map((item) => ({
        id: `crew-event-${item.id}`,
        type: "community",
        title: item.title,
        date: new Date(item.starts_at),
        detail: item.description,
        url: item.join_url,
      })),
    ]
      .filter((item) => filters.has(item.type))
      .sort((a, b) => a.date - b.date);
  }, [data, filters]);
  function exportIcs() {
    const stamp = (date) =>
      new Date(date)
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}/, "");
    const body = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//CrewDeck//Community Calendar//EN",
      ...entries.flatMap((item) => [
        "BEGIN:VEVENT",
        `UID:${item.id}@crewdeck`,
        `DTSTART:${stamp(item.date)}`,
        `SUMMARY:${item.title.replace(/[,;]/g, " ")}`,
        `DESCRIPTION:${String(item.detail || "")
          .replace(/\n/g, "\\n")
          .replace(/[,;]/g, " ")}`,
        "END:VEVENT",
      ]),
      "END:VCALENDAR",
    ].join("\r\n");
    const url = URL.createObjectURL(
      new Blob([body], { type: "text/calendar" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "crewdeck-community-calendar.ics";
    link.click();
    URL.revokeObjectURL(url);
  }
  const types = [
    ["meetup", "Meetups"],
    ["birthday", "Birthdays"],
    ["announcement", "Announcements"],
    ["community", "Events"],
    ["deadline", "Deadlines"],
    ["maintenance", "Maintenance"],
  ];
  return (
    <div className="page community-tool-page">
      <PageHeader
        eyebrow="Everything in orbit"
        title="Community Calendar"
        description="Meetups, events, birthdays, announcements, deadlines, and maintenance in one filterable view."
        action={
          <div className="button-row">
            <button className="button secondary" onClick={reload}>
              <RefreshCw /> Refresh
            </button>
            <button className="button primary" onClick={exportIcs}>
              <CalendarDays /> Export .ics
            </button>
          </div>
        }
      />
      <div className="panel calendar-filter-bar">
        {types.map(([id, label]) => (
          <button
            className={filters.has(id) ? "active" : ""}
            key={id}
            onClick={() =>
              setFilters((current) => {
                const next = new Set(current);
                next.has(id) ? next.delete(id) : next.add(id);
                return next;
              })
            }
          >
            {label}
          </button>
        ))}
      </div>
      {loading ? (
        <Loading />
      ) : entries.length ? (
        <div className="community-calendar-list">
          {entries.map((item) => (
            <article
              className={`panel community-calendar-entry ${item.type}`}
              key={item.id}
            >
              <time>
                <strong>{item.date.getDate()}</strong>
                <span>
                  {item.date.toLocaleDateString([], { month: "short" })}
                </span>
              </time>
              <div>
                <small>{item.type}</small>
                <h2>{item.title}</h2>
                <p>{item.detail}</p>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title="Nothing matches these filters"
          body="Turn on another category to see more."
        />
      )}
    </div>
  );
}
