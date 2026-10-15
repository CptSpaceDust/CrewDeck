import { RefreshCw, UserCheck, UserPlus, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { Avatar, Empty, Loading, PageHeader } from "../components/ui";

export default function FriendsPage({ user }) {
  const [profiles, setProfiles] = useState([]);
  const [friendships, setFriendships] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");

  async function load() {
    setLoading(true);
    const [people, connections] = await Promise.all([
      supabase.from("profiles").select("id,username,avatar,rank,last_seen"),
      supabase
        .from("friendships")
        .select("*")
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
        .order("created_at", { ascending: false }),
    ]);
    setProfiles(people.data || []);
    setFriendships(connections.data || []);
    setNotice(people.error?.message || connections.error?.message || "");
    setLoading(false);
  }

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`friends-page-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "friendships" },
        load,
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [user.id]);

  const people = useMemo(
    () => Object.fromEntries(profiles.map((profile) => [profile.id, profile])),
    [profiles],
  );

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
        description="Keep up with accepted friends and respond to new crew requests."
        action={
          <button
            className="icon-button"
            onClick={load}
            title="Refresh friends"
          >
            <RefreshCw />
          </button>
        }
      />
      {notice && <p className="form-message">{notice}</p>}
      <section className="panel friends-roster">
        <header>
          <Users />
          <div>
            <h2>Your crew friends</h2>
            <p>
              {friendships.filter((row) => row.status === "accepted").length}{" "}
              connected
            </p>
          </div>
        </header>
        {friendships.length ? (
          friendships.map((row) => {
            const otherId =
              row.requester_id === user.id
                ? row.addressee_id
                : row.requester_id;
            const person = people[otherId];
            const incoming =
              row.addressee_id === user.id && row.status === "pending";
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
                      : row.status === "accepted"
                        ? "Friend"
                        : "Request pending"}
                  </small>
                </span>
                {incoming ? (
                  <div className="friend-actions">
                    <button
                      className="button primary"
                      onClick={() => update(row, "accepted")}
                    >
                      <UserCheck />
                      Accept
                    </button>
                    <button
                      className="button ghost"
                      onClick={() => update(row, "declined")}
                    >
                      Decline
                    </button>
                  </div>
                ) : (
                  <span className={`friend-status ${row.status}`}>
                    <UserPlus />
                    {row.status}
                  </span>
                )}
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
    </div>
  );
}
