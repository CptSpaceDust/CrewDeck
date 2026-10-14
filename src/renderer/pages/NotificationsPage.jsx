import { Bell, CheckCheck } from "lucide-react";
import { useState } from "react";
import {
  clearNotifications,
  getNotifications,
  markNotificationRead,
} from "../lib/data";
import { useLoader } from "../lib/hooks";
import {
  Empty,
  ErrorState,
  Loading,
  PageHeader,
  formatDate,
} from "../components/ui";
import { confirmInApp } from "../components/InAppDialog";

export default function NotificationsPage({ user, onNavigate }) {
  const [filter, setFilter] = useState("all");
  const { data, loading, error, reload } = useLoader(
    () => getNotifications(user.id),
    [user.id],
  );

  function refreshBadge() {
    window.dispatchEvent(new CustomEvent("notifications-changed"));
  }

  async function open(item) {
    if (!item.is_read) {
      await markNotificationRead(item.id, user.id);
      refreshBadge();
    }
    if (item.link) onNavigate(item.link);
    else reload();
  }

  async function clearAll() {
    const approved = await confirmInApp(
      "This removes every notification from your activity feed.",
      {
        title: "Clear all notifications?",
        confirmLabel: "Clear all",
      },
    );
    if (!approved) return;
    await clearNotifications(user.id);
    await reload();
    refreshBadge();
  }
  const filtered = (data || []).filter((item) => {
    if (filter === "all") return true;
    const type = String(
      item.type || item.notification_type || "",
    ).toLowerCase();
    return filter === "messages"
      ? type.includes("message")
      : filter === "calls"
        ? type.includes("call")
        : filter === "meetups"
          ? type.includes("meetup")
          : filter === "moderation"
            ? /moderation|restriction|warning|appeal/.test(type)
            : true;
  });

  return (
    <div className="page">
      <PageHeader
        eyebrow="Activity"
        title="Notifications"
        description="Messages, meetup updates, ideas, calls, and community activity in one signal feed."
        action={
          data?.length ? (
            <button className="button secondary" onClick={clearAll}>
              <CheckCheck /> Clear All
            </button>
          ) : null
        }
      />
      <div className="notification-filters">
        {["all", "messages", "calls", "meetups", "moderation"].map((value) => (
          <button
            className={filter === value ? "active" : ""}
            onClick={() => setFilter(value)}
            key={value}
          >
            {value}
          </button>
        ))}
      </div>
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorState message={error} retry={reload} />
      ) : data?.length ? (
        <div className="notification-list">
          {filtered.map((item) => (
            <button
              className={
                item.is_read
                  ? "panel notification-row"
                  : "panel notification-row unread"
              }
              onClick={() => open(item)}
              key={item.id}
            >
              <span className="notification-icon">
                {item.is_read ? <CheckCheck /> : <Bell />}
              </span>
              <span>
                <strong>{item.title}</strong>
                <p>{item.message}</p>
                <small>
                  {formatDate(item.created_at, {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </small>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <Empty
          title="All quiet in orbit"
          body="New community activity will appear here."
        />
      )}
    </div>
  );
}
