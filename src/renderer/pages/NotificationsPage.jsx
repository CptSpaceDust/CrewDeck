import {
  Bell,
  Bookmark,
  CheckCheck,
  Clock3,
  ExternalLink,
  Inbox,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  bulkInbox,
  getCrewInbox,
  performInboxAction,
  saveInboxState,
} from "../lib/crewInbox";
import { clearNotifications, markNotificationRead } from "../lib/data";
import { supabase } from "../lib/supabase";
import {
  Empty,
  ErrorState,
  Loading,
  PageHeader,
  formatDate,
} from "../components/ui";

const sections = [
  "all",
  "messages",
  "calls",
  "meetups",
  "community",
  "friends",
  "moderation",
  "saved",
];

export default function NotificationsPage({ user, onNavigate }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState(new Set());

  async function load() {
    try {
      setError("");
      setItems(await getCrewInbox(user.id));
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`crew-inbox-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        load,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "crew_inbox_state",
          filter: `user_id=eq.${user.id}`,
        },
        load,
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [user.id]);

  const shown = useMemo(
    () =>
      items.filter((item) =>
        filter === "all"
          ? true
          : filter === "saved"
            ? item.inbox_state?.saved_for_later
            : item.category === filter,
      ),
    [items, filter],
  );
  const toggle = (id) =>
    setSelected((current) => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  async function apply(action) {
    await bulkInbox(user.id, [...selected], action);
    setSelected(new Set());
    await load();
    window.dispatchEvent(new CustomEvent("notifications-changed"));
  }
  async function open(item) {
    if (!item.is_read) await markNotificationRead(item.id, user.id);
    if (item.link) onNavigate(item.link);
    await load();
  }
  async function inline(item, action) {
    try {
      await performInboxAction(item, action, user.id);
      window.dispatchEvent(
        new CustomEvent("crewdeck-toast", {
          detail: { title: "Crew Inbox", message: "Action completed." },
        }),
      );
      await load();
    } catch (nextError) {
      window.dispatchEvent(
        new CustomEvent("crewdeck-toast", {
          detail: {
            title: "Crew Inbox",
            message: nextError.message,
            tone: "error",
          },
        }),
      );
    }
  }

  return (
    <div className="page crew-inbox-page">
      <PageHeader
        eyebrow="Action center"
        title="Crew Inbox"
        description="Messages, calls, meetups, community activity, friends, and moderation in one place."
        action={
          selected.size ? (
            <div className="inbox-bulk-actions">
              <button
                className="button secondary"
                onClick={() => apply("read")}
              >
                <CheckCheck />
                Mark read
              </button>
              <button
                className="button secondary"
                onClick={() => apply("save")}
              >
                <Bookmark />
                Save for later
              </button>
              <button
                className="button danger"
                onClick={() => apply("dismiss")}
              >
                <Trash2 />
                Dismiss
              </button>
            </div>
          ) : null
        }
      />
      <section className="inbox-toolbar panel">
        <nav className="notification-filters" aria-label="Inbox sections">
          {sections.map((value) => (
            <button
              type="button"
              className={filter === value ? "active" : ""}
              onClick={() => setFilter(value)}
              key={value}
            >
              {value}
            </button>
          ))}
        </nav>
        <button
          className="button ghost inbox-clear-all"
          type="button"
          disabled={!items.length}
          onClick={async () => {
            try {
              await clearNotifications(user.id);
              setSelected(new Set());
              await load();
              window.dispatchEvent(new CustomEvent("notifications-changed"));
            } catch (nextError) {
              setError(nextError.message);
            }
          }}
        >
          <Trash2 />
          Clear All
        </button>
      </section>
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorState message={error} retry={load} />
      ) : shown.length ? (
        <div className="notification-list crew-inbox-list">
          {shown.map((item) => {
            const actions = item.action_data || {};
            return (
              <article
                className={`panel notification-row${item.is_read ? "" : " unread"}${item.priority > 0 ? " priority" : ""}`}
                key={item.id}
              >
                <label className="inbox-select">
                  <input
                    type="checkbox"
                    checked={selected.has(item.id)}
                    onChange={() => toggle(item.id)}
                  />
                  <span aria-hidden="true" />
                  <span className="sr-only">Select {item.title}</span>
                </label>
                <span className="notification-icon">
                  {item.is_read ? <CheckCheck /> : <Bell />}
                </span>
                <div className="inbox-copy">
                  <div className="inbox-card-heading">
                    <span className="inbox-category">{item.category}</span>
                    <time>
                      {formatDate(item.created_at, {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </time>
                  </div>
                  <strong>{item.title}</strong>
                  <p>{item.message}</p>
                  <div className="inbox-inline-actions">
                    {actions.meetup_id && (
                      <>
                        <button
                          onClick={() =>
                            inline(
                              {
                                ...item,
                                action_data: {
                                  ...actions,
                                  response: "accepted",
                                },
                              },
                              "meetup",
                            )
                          }
                        >
                          Accept meetup
                        </button>
                        <button
                          onClick={() =>
                            inline(
                              {
                                ...item,
                                action_data: {
                                  ...actions,
                                  response: "declined",
                                },
                              },
                              "meetup",
                            )
                          }
                        >
                          Decline
                        </button>
                      </>
                    )}
                    {actions.event_id && (
                      <button onClick={() => inline(item, "event")}>
                        RSVP {actions.response || "attending"}
                      </button>
                    )}
                    {actions.requester_id && (
                      <>
                        <button
                          onClick={() =>
                            inline(
                              {
                                ...item,
                                action_data: {
                                  ...actions,
                                  response: "accepted",
                                },
                              },
                              "friend",
                            )
                          }
                        >
                          Accept friend
                        </button>
                        <button
                          onClick={() =>
                            inline(
                              {
                                ...item,
                                action_data: {
                                  ...actions,
                                  response: "declined",
                                },
                              },
                              "friend",
                            )
                          }
                        >
                          Decline
                        </button>
                      </>
                    )}
                    {actions.poll_id && actions.option_id && (
                      <button onClick={() => inline(item, "poll")}>Vote</button>
                    )}
                    {item.category === "calls" && item.link && (
                      <button onClick={() => open(item)}>Join call</button>
                    )}
                    <button onClick={() => open(item)}>
                      <ExternalLink />
                      Open
                    </button>
                    <button
                      onClick={async () => {
                        await saveInboxState(user.id, item.id, {
                          saved_for_later: !item.inbox_state?.saved_for_later,
                        });
                        await load();
                      }}
                    >
                      <Bookmark />
                      {item.inbox_state?.saved_for_later ? "Unsave" : "Later"}
                    </button>
                    <button
                      onClick={async () => {
                        await saveInboxState(user.id, item.id, {
                          snoozed_until: new Date(
                            Date.now() + 3600000,
                          ).toISOString(),
                        });
                        await load();
                      }}
                    >
                      <Clock3 />1 hour
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <Empty
          title="Inbox clear"
          body="Nothing in this section needs your attention."
          icon={Inbox}
        />
      )}
    </div>
  );
}
