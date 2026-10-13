import {
  Cake,
  CalendarCheck,
  CalendarDays,
  Gauge,
  Lightbulb,
  LockKeyhole,
  LogOut,
  ScrollText,
  Settings,
  Sparkles,
  UserRound,
  Users,
} from "lucide-react";
import { Avatar } from "./ui";
import BrandMark from "./BrandMark";

function controlCenterAccess(profile) {
  let badges = profile?.badges;
  if (!Array.isArray(badges) && typeof badges === "string") {
    try {
      badges = JSON.parse(badges);
    } catch {
      badges = badges
        .replace(/[\[\]"]/g, "")
        .split(",")
        .map((badge) => badge.trim());
    }
  }
  return (
    Array.isArray(badges) &&
    badges.some(
      (badge) => String(badge).trim().toLowerCase() === "trusted person",
    )
  );
}

const groups = [
  {
    label: "Community",
    items: [
      ["guidelines", "Guidelines", ScrollText],
      ["crew", "Crew Directory", UserRound],
      ["introductions", "Introductions", Sparkles],
      ["collabs", "Collab Board", Users],
      ["ideas", "Ideas Board", Lightbulb],
      ["birthdays", "Birthdays", Cake],
    ],
  },
  {
    label: "Connect",
    items: [
      ["meetups", "Meetup Calendar", CalendarDays],
      ["my-meetups", "My Meetups", CalendarCheck],
    ],
  },
];

export default function Sidebar({ page, setPage, profile, onLogout, unread }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <BrandMark className="sidebar-brand-mark" />
        <strong>CrewDeck</strong>
      </div>
      <nav>
        {profile?.rank?.toLowerCase() === "captain" && (
          <button
            className={page === "captain" ? "nav-item active" : "nav-item"}
            onClick={() => setPage("captain")}
          >
            <LockKeyhole />
            <span>Captain Panel</span>
          </button>
        )}
        {groups.map((group) => (
          <section className="nav-group" key={group.label}>
            <span>{group.label}</span>
            {group.items.map(([id, label, Icon]) => (
              <button
                className={page === id ? "nav-item active" : "nav-item"}
                onClick={() => setPage(id)}
                key={id}
              >
                <Icon />
                <span>{label}</span>
                {id === "notifications" && unread > 0 && (
                  <b>{unread > 99 ? "99+" : unread}</b>
                )}
              </button>
            ))}
          </section>
        ))}
        {controlCenterAccess(profile) && (
          <section className="nav-group">
            <span>VRChat</span>
            <button
              className={
                page === "control-center" ? "nav-item active" : "nav-item"
              }
              onClick={() => setPage("control-center")}
            >
              <Gauge />
              <span>Control Center</span>
            </button>
          </section>
        )}
      </nav>
      <div className="sidebar-footer">
        <button
          className={
            page === "profile" ? "profile-chip active" : "profile-chip"
          }
          onClick={() => setPage("profile")}
        >
          <Avatar profile={profile} size={40} />
          <span>
            <strong>{profile?.username || "Crew member"}</strong>
            <small>{profile?.rank || "Crew"}</small>
          </span>
        </button>
        <div className="footer-actions">
          <button
            onClick={() => setPage("settings")}
            title="App settings"
            aria-label="App settings"
            className={page === "settings" ? "active" : ""}
          >
            <Settings />
          </button>
          <button onClick={onLogout} title="Sign out" aria-label="Sign out">
            <LogOut />
          </button>
        </div>
      </div>
    </aside>
  );
}
