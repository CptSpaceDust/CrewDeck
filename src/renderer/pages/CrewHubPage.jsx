import { Heart, Plus, Radar, RefreshCw, Users, UserPlus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  Avatar,
  Empty,
  Field,
  Loading,
  Modal,
  PageHeader,
} from "../components/ui";

export default function CrewHubPage({ user }) {
  const [data, setData] = useState({
    profiles: [],
    friends: [],
    favorites: [],
    lfg: [],
    parties: [],
  });
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState("");
  const [notice, setNotice] = useState("");
  async function load() {
    setLoading(true);
    const [profiles, friends, favorites, lfg, parties] = await Promise.all([
      supabase.from("profiles").select("id,username,avatar,rank,last_seen"),
      supabase
        .from("friendships")
        .select("*")
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`),
      supabase
        .from("favorite_crew")
        .select("favorite_user_id")
        .eq("user_id", user.id),
      supabase
        .from("looking_for_group_posts")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase
        .from("temporary_party_rooms")
        .select("*")
        .order("created_at", { ascending: false }),
    ]);
    const failure = [profiles, friends, favorites, lfg, parties].find(
      (result) => result.error,
    )?.error;
    if (failure) setNotice(failure.message);
    setData({
      profiles: profiles.data || [],
      friends: friends.data || [],
      favorites: favorites.data || [],
      lfg: lfg.data || [],
      parties: parties.data || [],
    });
    setLoading(false);
  }
  useEffect(() => {
    load();
    const channel = supabase
      .channel(`crew-hub-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "friendships" },
        load,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "looking_for_group_posts" },
        load,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "temporary_party_rooms" },
        load,
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [user.id]);
  const profiles = useMemo(
    () => Object.fromEntries(data.profiles.map((item) => [item.id, item])),
    [data.profiles],
  );
  async function submit(event, kind) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result =
      kind === "lfg"
        ? await supabase.from("looking_for_group_posts").insert({
            user_id: user.id,
            title: form.get("title"),
            activity: form.get("activity"),
            details: form.get("details"),
            slots: Number(form.get("slots")),
          })
        : await supabase.from("temporary_party_rooms").insert({
            owner_id: user.id,
            name: form.get("title"),
            activity: form.get("activity"),
          });
    if (result.error) return setNotice(result.error.message);
    setOpen("");
    await load();
  }
  if (loading)
    return (
      <div className="page">
        <Loading />
      </div>
    );
  return (
    <div className="page crew-hub-page">
      <PageHeader
        eyebrow="Social & discovery"
        title="Crew Hub"
        description="Friends, favorite crew, groups looking for players, and temporary party rooms."
        action={
          <button className="icon-button" onClick={load}>
            <RefreshCw />
          </button>
        }
      />
      {notice && <p className="form-message">{notice}</p>}
      <div className="crew-hub-grid">
        <section className="panel crew-hub-section">
          <header>
            <div>
              <Heart />
              <h2>Favorite crew</h2>
            </div>
          </header>
          {data.favorites.length ? (
            data.favorites.map((row) => (
              <article key={row.favorite_user_id}>
                <Avatar profile={profiles[row.favorite_user_id]} />
                <strong>
                  {profiles[row.favorite_user_id]?.username || "Crew member"}
                </strong>
              </article>
            ))
          ) : (
            <Empty
              title="No favorites yet"
              body="Favorite someone from their crew profile."
            />
          )}
        </section>
        <section className="panel crew-hub-section">
          <header>
            <div>
              <UserPlus />
              <h2>Friends</h2>
            </div>
          </header>
          {data.friends.length ? (
            data.friends.map((row) => {
              const other =
                profiles[
                  row.requester_id === user.id
                    ? row.addressee_id
                    : row.requester_id
                ];
              return (
                <article key={`${row.requester_id}-${row.addressee_id}`}>
                  <Avatar profile={other} />
                  <span>
                    <strong>{other?.username || "Crew member"}</strong>
                    <small>{row.status}</small>
                  </span>
                  {row.addressee_id === user.id && row.status === "pending" && (
                    <button
                      onClick={async () => {
                        await supabase
                          .from("friendships")
                          .update({
                            status: "accepted",
                            accepted_at: new Date().toISOString(),
                          })
                          .eq("requester_id", row.requester_id)
                          .eq("addressee_id", user.id);
                        load();
                      }}
                    >
                      Accept
                    </button>
                  )}
                </article>
              );
            })
          ) : (
            <Empty
              title="No crew friends yet"
              body="Send a request from a crew profile."
            />
          )}
        </section>
        <section className="panel crew-hub-section wide">
          <header>
            <div>
              <Radar />
              <h2>Looking for group</h2>
            </div>
            <button className="button secondary" onClick={() => setOpen("lfg")}>
              <Plus /> Post
            </button>
          </header>
          <div className="crew-hub-cards">
            {data.lfg.map((item) => (
              <article key={item.id}>
                <strong>{item.title}</strong>
                <span>
                  {item.activity} · {item.slots} slots
                </span>
                <p>{item.details}</p>
                <small>
                  Posted by {profiles[item.user_id]?.username || "Crew member"}
                </small>
              </article>
            ))}
          </div>
        </section>
        <section className="panel crew-hub-section wide">
          <header>
            <div>
              <Users />
              <h2>Temporary party rooms</h2>
            </div>
            <button
              className="button secondary"
              onClick={() => setOpen("party")}
            >
              <Plus /> Create
            </button>
          </header>
          <div className="crew-hub-cards">
            {data.parties.map((item) => (
              <article key={item.id}>
                <strong>{item.name}</strong>
                <span>{item.activity || "Crew hangout"}</span>
                <small>
                  Closes {new Date(item.expires_at).toLocaleString()}
                </small>
                <button
                  onClick={() =>
                    supabase
                      .from("temporary_party_members")
                      .upsert({ room_id: item.id, user_id: user.id })
                  }
                >
                  Join room
                </button>
              </article>
            ))}
          </div>
        </section>
      </div>
      {open && (
        <Modal
          title={
            open === "lfg" ? "Post looking for group" : "Create temporary party"
          }
          onClose={() => setOpen("")}
        >
          <form
            className="stack-form"
            onSubmit={(event) => submit(event, open)}
          >
            <Field label="Name">
              <input name="title" minLength="3" maxLength="100" required />
            </Field>
            <Field label="Activity">
              <input name="activity" maxLength="100" required />
            </Field>
            {open === "lfg" && (
              <>
                <Field label="Details">
                  <textarea name="details" maxLength="700" />
                </Field>
                <Field label="Available slots">
                  <input
                    name="slots"
                    type="number"
                    min="2"
                    max="25"
                    defaultValue="4"
                  />
                </Field>
              </>
            )}
            <button className="button primary">Save</button>
          </form>
        </Modal>
      )}
    </div>
  );
}
