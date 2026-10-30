import {
  CalendarPlus,
  BellRing,
  Clock3,
  Heart,
  MessageCircle,
  NotebookPen,
  Phone,
  RefreshCw,
  Sparkles,
  UserCheck,
  UserPlus,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { requestConversation } from "../lib/data";
import {
  Avatar,
  Empty,
  Field,
  Loading,
  Modal,
  PageHeader,
} from "../components/ui";
import { PulseBadge, setPulseAlert, useVisiblePulses } from "../components/AvailabilityPulse";

const online = (person) =>
  Boolean(
    person?.last_seen &&
      Date.now() - new Date(person.last_seen).getTime() < 120000,
  );
const anniversary = (value) => {
  if (!value) return "Friends recently";
  const since = new Date(value);
  const now = new Date();
  const beforeAnniversary =
    now.getMonth() < since.getMonth() ||
    (now.getMonth() === since.getMonth() && now.getDate() < since.getDate());
  const years = Math.max(
    0,
    now.getFullYear() - since.getFullYear() - Number(beforeAnniversary),
  );
  return years
    ? `${years} year${years === 1 ? "" : "s"} of friendship`
    : `Friends since ${since.toLocaleDateString(undefined, { month: "long", day: "numeric" })}`;
};

export default function FriendsPage({
  user,
  profile,
  onNavigate,
  onViewProfile,
}) {
  const pulses = useVisiblePulses();
  const [profiles, setProfiles] = useState([]);
  const [friendships, setFriendships] = useState([]);
  const [details, setDetails] = useState([]);
  const [settings, setSettings] = useState(null);
  const [recommendations, setRecommendations] = useState([]);
  const [activity, setActivity] = useState([]);
  const [editing, setEditing] = useState(null);
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");

  async function load(silent = false) {
    if (!silent) setLoading(true);
    const [people, connections, metadata, featureSettings] = await Promise.all([
      supabase
        .from("profiles")
        .select(
          "id,username,avatar,rank,badges,favorite_game,last_seen,online",
        ),
      supabase
        .from("friendships")
        .select("*")
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
        .order("created_at", { ascending: false }),
      supabase.from("friend_details").select("*").eq("user_id", user.id),
      supabase
        .from("friend_feature_settings")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);
    const nextSettings = featureSettings.data || {
      user_id: user.id,
      recommendations_enabled: false,
      activity_feed_enabled: false,
      one_click_meetup_enabled: false,
      meetup_preset: {},
      show_badges: true,
      show_interests: true,
      show_favorite_games: true,
    };
    const [suggested, feed] = await Promise.all([
      nextSettings.recommendations_enabled
        ? supabase.rpc("get_onboarding_member_recommendations", {
            result_limit: 12,
          })
        : Promise.resolve({ data: [] }),
      nextSettings.activity_feed_enabled
        ? supabase.rpc("get_friend_activity_feed", { result_limit: 30 })
        : Promise.resolve({ data: [] }),
    ]);
    setProfiles(people.data || []);
    setFriendships(connections.data || []);
    setDetails(metadata.data || []);
    setSettings(nextSettings);
    setRecommendations(suggested.data || []);
    setActivity(feed.data || []);
    setNotice(
      people.error?.message ||
        connections.error?.message ||
        metadata.error?.message ||
        featureSettings.error?.message ||
        suggested.error?.message ||
        feed.error?.message ||
        "",
    );
    if (!silent) setLoading(false);
  }

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`friends-page-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "friendships" },
        () => load(true),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "friend_details",
          filter: `user_id=eq.${user.id}`,
        },
        () => load(true),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles" },
        () => load(true),
      )
      .subscribe();
    const timer = window.setInterval(() => load(true), 60000);
    return () => {
      window.clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, [user.id]);

  const people = useMemo(
    () => Object.fromEntries(profiles.map((item) => [item.id, item])),
    [profiles],
  );
  const detailMap = useMemo(
    () => Object.fromEntries(details.map((item) => [item.friend_id, item])),
    [details],
  );
  const accepted = useMemo(
    () =>
      friendships
        .filter((row) => row.status === "accepted")
        .sort((a, b) => {
          const aId =
            a.requester_id === user.id ? a.addressee_id : a.requester_id;
          const bId =
            b.requester_id === user.id ? b.addressee_id : b.requester_id;
          return (
            Number(online(people[bId])) - Number(online(people[aId])) ||
            Number(detailMap[bId]?.is_close) -
              Number(detailMap[aId]?.is_close) ||
            String(
              detailMap[aId]?.nickname || people[aId]?.username,
            ).localeCompare(
              String(detailMap[bId]?.nickname || people[bId]?.username),
            )
          );
        }),
    [friendships, people, detailMap, user.id],
  );
  const pending = friendships.filter((row) => row.status === "pending");

  async function update(row, status) {
    const result = await supabase
      .from("friendships")
      .update({
        status,
        accepted_at: status === "accepted" ? new Date().toISOString() : null,
      })
      .eq("requester_id", row.requester_id)
      .eq("addressee_id", row.addressee_id);
    setNotice(result.error?.message || "Friend request updated.");
    if (!result.error) await load();
  }
  async function saveDetail(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const { error } = await supabase.from("friend_details").upsert(
      {
        user_id: user.id,
        friend_id: editing.person.id,
        nickname: String(form.get("nickname") || "").trim() || null,
        private_note: String(form.get("note") || "").trim() || null,
        is_close: form.get("close") === "on",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,friend_id" },
    );
    setNotice(error?.message || "Friend details saved privately.");
    if (!error) {
      setEditing(null);
      await load();
    }
  }
  async function openInsights(person) {
    const [shared, highlights] = await Promise.all([
      supabase.rpc("get_friend_insights", { target_friend_id: person.id }),
      supabase.rpc("get_friend_highlights", { target_friend_id: person.id }),
    ]);
    setNotice(shared.error?.message || "");
    if (!shared.error)
      setInsights({
        person,
        ...shared.data,
        highlights: highlights.data || {},
      });
  }
  async function message(person, call = false) {
    try {
      const result = await requestConversation(user, profile, person);
      if (!result.conversationId)
        return setNotice("A message request is already pending.");
      onNavigate?.(
        `Conversation.html?id=${encodeURIComponent(result.conversationId)}${call ? "&start_call=1" : ""}`,
      );
    } catch (error) {
      setNotice(error.message);
    }
  }
  function meetup(person) {
    localStorage.setItem(
      "crewdeck.meetup.prefill",
      JSON.stringify({
        personId: person.id,
        preset: settings?.one_click_meetup_enabled
          ? settings.meetup_preset || {}
          : {},
      }),
    );
    onNavigate?.("MeetupCalendar.html?friend=1");
  }

  if (loading)
    return (
      <div className="page">
        <Loading />
      </div>
    );
  return (
    <div className="page friends-page">
      <PageHeader
        eyebrow="Crew connections"
        title="Friends"
        description="Private nicknames, notes, close friends, shared connections, and quick crew actions."
        action={
          <button
            className="icon-button"
            onClick={() => load()}
            title="Refresh friends"
          >
            <RefreshCw />
          </button>
        }
      />
      {notice && <p className="form-message">{notice}</p>}
      {pending.length > 0 && (
        <section className="panel friend-section">
          <header>
            <UserPlus />
            <div>
              <h2>Friend requests</h2>
              <p>{pending.length} waiting</p>
            </div>
          </header>
          {pending.map((row) => {
            const otherId =
              row.requester_id === user.id
                ? row.addressee_id
                : row.requester_id;
            const person = people[otherId];
            const incoming = row.addressee_id === user.id;
            return (
              <article
                className="friend-row"
                key={`${row.requester_id}-${row.addressee_id}`}
              >
                <Avatar profile={person} />
                <span>
                  <strong>{person?.username || "Crew member"}</strong>
                  <small>
                    {incoming
                      ? "Sent you a friend request"
                      : "Your request is pending"}
                  </small>
                </span>
                {incoming ? (
                  <div className="friend-actions">
                    <button
                      className="button primary"
                      onClick={() => update(row, "accepted")}
                    >
                      <UserCheck /> Accept
                    </button>
                    <button
                      className="button ghost"
                      onClick={() => update(row, "declined")}
                    >
                      Decline
                    </button>
                  </div>
                ) : (
                  <span className="friend-status pending">Pending</span>
                )}
              </article>
            );
          })}
        </section>
      )}
      <section className="panel friend-section friends-roster">
        <header>
          <Users />
          <div>
            <h2>Your crew friends</h2>
            <p>{accepted.length} connected · online friends appear first</p>
          </div>
        </header>
        {accepted.length ? (
          accepted.map((row) => {
            const otherId =
              row.requester_id === user.id
                ? row.addressee_id
                : row.requester_id;
            const person = people[otherId];
            const meta = detailMap[otherId] || {};
            return (
              <article
                className={`friend-card${meta.is_close ? " close-friend" : ""}`}
                key={otherId}
              >
                <button
                  className="friend-identity"
                  onClick={() => onViewProfile?.(person)}
                >
                  <span
                    className={`friend-presence ${online(person) ? "online" : "offline"}`}
                  >
                    <Avatar profile={person} />
                  </span>
                  <span>
                    <strong>
                      {meta.nickname || person?.username || "Crew member"}
                      {meta.is_close && <Heart className="close-heart" />}
                    </strong>
                    {meta.nickname && <small>@{person?.username}</small>}
                    <small>
                      {online(person)
                        ? "Online now"
                        : `Offline · ${anniversary(row.accepted_at)}`}
                    </small>
                  </span>
                </button>
                {meta.private_note && (
                  <p className="friend-private-note">
                    <NotebookPen /> {meta.private_note}
                  </p>
                )}
                <div className="friend-quick-actions">
                  <button onClick={() => message(person)}>
                    <MessageCircle /> Message
                  </button>
                  <button onClick={() => message(person, true)}>
                    <Phone /> Call
                  </button>
                  <button onClick={() => meetup(person)}>
                    <CalendarPlus />{" "}
                    {settings?.one_click_meetup_enabled
                      ? "Plan with preset"
                      : "Invite to meetup"}
                  </button>
                  <button onClick={() => { localStorage.setItem("crewdeck.meetup.prefill", JSON.stringify({ personId: person.id, compare: true })); onNavigate?.("MeetupCalendar.html?compare=1"); }}><Clock3/> Compare availability</button>
                  <button onClick={async()=>{const{error}=await setPulseAlert(user.id,person.id,true);setNotice(error?.message||`You will be notified when ${person.username} becomes available.`);}}><BellRing/> Availability alert</button>
                  <button onClick={() => openInsights(person)}>
                    <Users /> Mutuals
                  </button>
                  <button onClick={() => setEditing({ person, meta })}>
                    <NotebookPen /> Notes & nickname
                  </button>
                </div>
                <PulseBadge pulse={pulses[person.id]} />
              </article>
            );
          })
        ) : (
          <Empty
            title="No friends yet"
            body="Open a crew profile to send your first friend request."
          />
        )}
      </section>
      {settings?.recommendations_enabled && (
        <section className="panel friend-section">
          <header>
            <Sparkles />
            <div>
              <h2>Suggested crew</h2>
              <p>Based on shared interests from members who opted in</p>
            </div>
          </header>
          <div className="friend-suggestion-grid">
            {recommendations.map((person) => (
              <article key={person.id}>
                <Avatar profile={person} />
                <span>
                  <strong>{person.username}</strong>
                  <small>{person.reason}</small>
                </span>
                <button
                  className="button ghost"
                  onClick={() => onViewProfile?.(people[person.id] || person)}
                >
                  View profile
                </button>
              </article>
            ))}
          </div>
          {!recommendations.length && (
            <p className="micro-copy">No new recommendations right now.</p>
          )}
        </section>
      )}
      {settings?.activity_feed_enabled && (
        <section className="panel friend-section">
          <header>
            <Clock3 />
            <div>
              <h2>Friend activity</h2>
              <p>Recent public posts and meetup activity</p>
            </div>
          </header>
          <div className="friend-activity-list">
            {activity.map((item) => (
              <button
                key={`${item.kind}-${item.item_id}`}
                onClick={() => onNavigate?.(item.link)}
              >
                <Avatar profile={item} size={36} />
                <span>
                  <strong>
                    {item.username} · {item.title}
                  </strong>
                  <small>{item.summary}</small>
                  <time>{new Date(item.happened_at).toLocaleString()}</time>
                </span>
              </button>
            ))}
          </div>
          {!activity.length && (
            <p className="micro-copy">No recent friend activity.</p>
          )}
        </section>
      )}
      {editing && (
        <Modal
          title={`Private details for ${editing.person.username}`}
          onClose={() => setEditing(null)}
        >
          <form className="stack-form" onSubmit={saveDetail}>
            <Field label="Private nickname" hint="Only you can see this.">
              <input
                name="nickname"
                maxLength="40"
                defaultValue={editing.meta.nickname || ""}
              />
            </Field>
            <Field
              label="Private notes"
              hint="Save a timezone, VRChat name, favorite game, or anything useful."
            >
              <textarea
                name="note"
                maxLength="700"
                rows="5"
                defaultValue={editing.meta.private_note || ""}
              />
            </Field>
            <label className="check-field">
              <input
                type="checkbox"
                name="close"
                defaultChecked={editing.meta.is_close}
              />
              <span>Close friend · prioritize their notifications</span>
            </label>
            <button className="button primary">Save private details</button>
          </form>
        </Modal>
      )}
      {insights && (
        <Modal
          title={`You and ${insights.person.username}`}
          onClose={() => setInsights(null)}
        >
          <div className="friend-insights">
            <section>
              <h3>Mutual friends</h3>
              {insights.mutual_friends?.length ? (
                insights.mutual_friends.map((item) => (
                  <span key={item.id}>
                    <Avatar profile={item} size={32} />
                    {item.username}
                  </span>
                ))
              ) : (
                <p>No mutual friends yet.</p>
              )}
            </section>
            <section>
              <h3>Mutual groups</h3>
              {insights.mutual_groups?.length ? (
                insights.mutual_groups.map((item) => (
                  <button
                    key={item.id}
                    onClick={() =>
                      onNavigate?.(`Conversation.html?group=${item.id}`)
                    }
                  >
                    {item.name}
                  </button>
                ))
              ) : (
                <p>No shared group conversations.</p>
              )}
            </section>
            <section>
              <h3>Profile highlights</h3>
              {insights.highlights.badges && (
                <p>
                  <strong>Badges:</strong>{" "}
                  {Array.isArray(insights.highlights.badges)
                    ? insights.highlights.badges.join(", ")
                    : insights.highlights.badges}
                </p>
              )}
              {(insights.highlights.games ||
                insights.highlights.favorite_game) && (
                <p>
                  <strong>Favorite games:</strong>{" "}
                  {insights.highlights.games ||
                    insights.highlights.favorite_game}
                </p>
              )}
              {insights.highlights.interests && (
                <p>
                  <strong>Interests:</strong> {insights.highlights.interests}
                </p>
              )}
              {!Object.values(insights.highlights).some(Boolean) && (
                <p>No highlights shared.</p>
              )}
            </section>
          </div>
        </Modal>
      )}
    </div>
  );
}
