import { useMemo, useState } from "react";
import {
  Cake,
  CalendarDays,
  Check,
  Heart,
  MessageCircle,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  Users,
  Vote,
} from "lucide-react";
import {
  cancelMeetup,
  createCollab,
  createCollabComment,
  createIdea,
  createMeetup,
  deleteCollab,
  deleteCollabComment,
  deleteIdea,
  deleteIntroduction,
  getCollabs,
  getIdeaLimit,
  getIdeas,
  getIntroductions,
  getMeetups,
  getProfiles,
  getSupporters,
  manageSupportSubscription,
  restrictionMessage,
  saveIntroduction,
  startSupportCheckout,
  toggleIdeaVote,
  updateCollab,
  updateCollabComment,
  updateIdeaStatus,
  updateProfile,
  uploadAvatar,
} from "../lib/data";
import { useLoader } from "../lib/hooks";
import {
  Avatar,
  Empty,
  ErrorState,
  Field,
  Loading,
  Modal,
  PageHeader,
  formatDate,
} from "../components/ui";
import { confirmInApp, promptInApp } from "../components/InAppDialog";

const captain = (profile) =>
  String(profile?.rank || "")
    .trim()
    .toLowerCase() === "captain";

function SubmitModal({ kind, onClose, onSaved, user, profile, initial }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const blocked = await restrictionMessage(
        user.id,
        { idea: "ideas", collab: "collabs", meetup: "meetups" }[kind],
      );
      if (blocked) throw new Error(blocked);
      if (kind === "idea")
        await createIdea(user, profile, {
          title: String(form.get("title")).trim(),
          description: String(form.get("description")).trim(),
        });
      if (kind === "collab") {
        const fields = {
          title: String(form.get("title")).trim(),
          description: String(form.get("description")).trim(),
          category: form.get("category"),
          looking_for: String(form.get("looking_for")).trim(),
          status: form.get("status"),
        };
        if (initial) await updateCollab(initial.id, user.id, fields);
        else await createCollab(user.id, fields);
      }
      if (kind === "meetup")
        await createMeetup(user.id, {
          meetup_date: form.get("date"),
          start_time: form.get("time"),
          duration: Number(form.get("duration")),
          message: String(form.get("message")).trim(),
          vrc_username: String(form.get("vrc")).trim(),
          meetup_type: form.get("type"),
          additional_participants: String(form.get("participants")).trim(),
          time_flexibility: form.get("flexibility"),
        });
      await onSaved();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={
        kind === "idea"
          ? "Share an idea"
          : kind === "meetup"
            ? "Request a meetup"
            : initial
              ? "Edit collaboration"
              : "Create a collaboration"
      }
      onClose={onClose}
    >
      <form className="stack-form" onSubmit={submit}>
        {kind !== "meetup" && (
          <Field label="Title">
            <input
              name="title"
              maxLength={kind === "collab" ? 100 : 120}
              defaultValue={initial?.title}
              required
            />
          </Field>
        )}
        {kind === "collab" && (
          <div className="form-grid">
            <Field label="Category">
              <select
                name="category"
                defaultValue={initial?.category || "Art & Design"}
              >
                <option>Art & Design</option>
                <option>Gaming</option>
                <option>Development</option>
                <option>Events</option>
                <option>Music</option>
                <option>Other</option>
              </select>
            </Field>
            <Field label="Status">
              <select name="status" defaultValue={initial?.status || "Open"}>
                <option>Open</option>
                <option>In Progress</option>
                <option>Filled</option>
              </select>
            </Field>
            <Field label="Looking for">
              <input
                name="looking_for"
                maxLength="500"
                defaultValue={initial?.looking_for}
              />
            </Field>
          </div>
        )}
        {kind === "meetup" && (
          <>
            <div className="form-grid">
              <Field label="Date">
                <input
                  name="date"
                  type="date"
                  min={new Date().toISOString().split("T")[0]}
                  required
                />
              </Field>
              <Field label="Start time">
                <input name="time" type="time" required />
              </Field>
              <Field label="Duration">
                <select name="duration" defaultValue="60">
                  <option value="30">30 minutes</option>
                  <option value="60">1 hour</option>
                  <option value="90">90 minutes</option>
                  <option value="120">2 hours</option>
                </select>
              </Field>
              <Field label="Meetup type">
                <select name="type">
                  <option>VRChat</option>
                  <option>Game Night</option>
                  <option>Hangout</option>
                  <option>Creative Session</option>
                  <option>Other</option>
                </select>
              </Field>
              <Field label="VRChat username">
                <input name="vrc" />
              </Field>
              <Field label="Time flexibility">
                <select name="flexibility">
                  <option>Exact</option>
                  <option>Somewhat Flexible</option>
                  <option>Very Flexible</option>
                </select>
              </Field>
            </div>
            <Field label="Additional participants">
              <textarea name="participants" rows="2" />
            </Field>
          </>
        )}
        <Field label={kind === "meetup" ? "Message" : "Description"}>
          <textarea
            name={kind === "meetup" ? "message" : "description"}
            rows="5"
            maxLength={kind === "collab" ? 3000 : 1800}
            defaultValue={initial?.description}
            required
          />
        </Field>
        {error && <p className="form-message">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="button ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? "Sending…" : initial ? "Save changes" : "Publish"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function IntroductionsPage({ user, profile }) {
  const { data, loading, error, reload } = useLoader(getIntroductions, []);
  const [editing, setEditing] = useState(false);
  const [sort, setSort] = useState("newest");
  const [message, setMessage] = useState("");
  const mine = data?.find((x) => x.user_id === user.id);
  const items = useMemo(
    () =>
      [...(data || [])].sort((a, b) =>
        sort === "oldest"
          ? new Date(a.created_at) - new Date(b.created_at)
          : sort === "name"
            ? String(a.profile?.username).localeCompare(
                String(b.profile?.username),
              )
            : new Date(b.created_at) - new Date(a.created_at),
      ),
    [data, sort],
  );
  async function save(e) {
    e.preventDefault();
    const blocked = await restrictionMessage(user.id, "comments");
    if (blocked) return setMessage(blocked);
    const f = new FormData(e.currentTarget);
    try {
      await saveIntroduction(
        user.id,
        {
          introduction: String(f.get("introduction")).trim(),
          games: String(f.get("games")).trim(),
          interests: String(f.get("interests")).trim(),
          working_on: String(f.get("working_on")).trim(),
          fun_fact: String(f.get("fun_fact")).trim(),
        },
        mine?.id,
      );
      setEditing(false);
      reload();
    } catch (x) {
      setMessage(x.message);
    }
  }
  async function remove(item) {
    const approved = await confirmInApp(
      "Your introduction and its profile details will be removed from the board.",
      { title: "Delete this introduction?", confirmLabel: "Delete" },
    );
    if (!approved) return;
    try {
      await deleteIntroduction(item.id);
      reload();
    } catch (x) {
      setMessage(x.message);
    }
  }
  return (
    <div className="page">
      <PageHeader
        eyebrow="Community"
        title="Crew introductions"
        description="Meet the people behind the usernames and find your next shared interest."
        action={
          <div className="header-actions">
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="name">Name</option>
            </select>
            <button
              className="icon-button refresh-button"
              onClick={reload}
              disabled={loading}
              aria-busy={loading}
              title="Refresh introductions"
            >
              <RefreshCw className={loading ? "spin" : ""} />
            </button>
            <button className="button primary" onClick={() => setEditing(true)}>
              <Plus />
              {mine ? "Edit yours" : "Introduce yourself"}
            </button>
          </div>
        }
      />
      {message && <p className="form-message">{message}</p>}
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorState message={error} retry={reload} />
      ) : (
        <div className="card-grid introductions-grid">
          {items.map((item) => (
            <article className="panel intro-card" key={item.id}>
              <div className="card-person">
                <Avatar profile={item.profile} />
                <div>
                  <h3>{item.profile?.username || "Crew member"}</h3>
                  <span className="rank">{item.profile?.rank || "Crew"}</span>
                </div>
              </div>
              <p className="card-copy">{item.introduction}</p>
              <div className="tag-row">
                {item.games && <span>🎮 {item.games}</span>}
                {item.interests && <span>✨ {item.interests}</span>}
              </div>
              {item.working_on && (
                <p className="micro-copy">
                  <strong>Working on:</strong> {item.working_on}
                </p>
              )}
              {item.fun_fact && (
                <p className="micro-copy">
                  <strong>Fun fact:</strong> {item.fun_fact}
                </p>
              )}
              {(item.user_id === user.id || captain(profile)) && (
                <button
                  className="button danger compact-button"
                  onClick={() => remove(item)}
                >
                  <Trash2 />
                  Delete
                </button>
              )}
            </article>
          ))}
        </div>
      )}
      {editing && (
        <Modal title="Your introduction" onClose={() => setEditing(false)}>
          <form className="stack-form" onSubmit={save}>
            <Field label="About you">
              <textarea
                name="introduction"
                rows="5"
                maxLength="1000"
                defaultValue={mine?.introduction}
                required
              />
            </Field>
            <Field label="Games">
              <input name="games" maxLength="500" defaultValue={mine?.games} />
            </Field>
            <Field label="Interests">
              <input
                name="interests"
                maxLength="500"
                defaultValue={mine?.interests}
              />
            </Field>
            <Field label="What are you working on?">
              <input
                name="working_on"
                maxLength="500"
                defaultValue={mine?.working_on}
              />
            </Field>
            <Field label="Fun fact">
              <input
                name="fun_fact"
                maxLength="500"
                defaultValue={mine?.fun_fact}
              />
            </Field>
            <button className="button primary">Save introduction</button>
          </form>
        </Modal>
      )}
    </div>
  );
}

export function IdeasPage({ user, profile }) {
  const { data, loading, error, reload } = useLoader(getIdeas, []);
  const { data: remaining, reload: reloadLimit } = useLoader(
    () => getIdeaLimit(user.id),
    [user.id],
  );
  const [open, setOpen] = useState(false);
  const [sort, setSort] = useState("latest");
  const [message, setMessage] = useState("");
  const items = useMemo(() => {
    let rows = [...(data || [])];
    if (sort === "working")
      rows = rows.filter((x) => x.status === "Working On");
    if (sort === "completed")
      rows = rows.filter((x) => x.status === "Completed");
    if (sort === "votes") rows.sort((a, b) => b.votes.length - a.votes.length);
    return rows;
  }, [data, sort]);
  async function vote(item) {
    const blocked = await restrictionMessage(user.id, "idea_likes");
    if (blocked) return setMessage(blocked);
    try {
      await toggleIdeaVote(
        item.id,
        user.id,
        item.votes.some((v) => v.user_id === user.id),
      );
      reload();
    } catch (x) {
      setMessage(x.message);
    }
  }
  async function remove(item) {
    const approved = await confirmInApp(
      "This idea and its votes will be permanently removed.",
      { title: "Delete this idea?", confirmLabel: "Delete idea" },
    );
    if (!approved) return;
    try {
      await deleteIdea(item);
      reload();
      reloadLimit();
    } catch (x) {
      setMessage(x.message);
    }
  }
  async function status(item, value) {
    try {
      await updateIdeaStatus(item.id, value);
      reload();
    } catch (x) {
      setMessage(x.message);
    }
  }
  return (
    <div className="page">
      <PageHeader
        eyebrow="Ideas board"
        title="Shape what comes next"
        description={`${remaining ?? 5} / 5 posts remaining today.`}
        action={
          <div className="header-actions">
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="latest">Latest</option>
              <option value="votes">Most votes</option>
              <option value="working">Working On</option>
              <option value="completed">Completed</option>
            </select>
            <button
              className="icon-button refresh-button"
              onClick={async () => {
                await reload();
                await reloadLimit();
              }}
              disabled={loading}
              aria-busy={loading}
              title="Refresh ideas"
            >
              <RefreshCw className={loading ? "spin" : ""} />
            </button>
            <button className="button primary" onClick={() => setOpen(true)}>
              <Plus />
              New idea
            </button>
          </div>
        }
      />
      {message && <p className="form-message">{message}</p>}
      <section
        className="panel ideas-guide"
        aria-label="How the ideas board works"
      >
        <div>
          <strong>1. Share</strong>
          <span>Explain the problem and the change you want.</span>
        </div>
        <div>
          <strong>2. Vote</strong>
          <span>Vote for ideas you would actually use.</span>
        </div>
        <div>
          <strong>3. Follow</strong>
          <span>Status labels show what is being reviewed or built.</span>
        </div>
        <div className="ideas-status-key">
          <span>Pending</span>
          <span>Considering</span>
          <span>Working On</span>
          <span>Completed</span>
        </div>
      </section>
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorState message={error} retry={reload} />
      ) : (
        <div className="feed">
          {!items.length && (
            <Empty
              title="No ideas match this view"
              body="Try another filter or share the first idea here."
            />
          )}
          {items.map((item) => {
            const voted = item.votes.some((v) => v.user_id === user.id);
            const author = item.username || "Crew member";
            const statusClass = String(item.status)
              .toLowerCase()
              .replaceAll(" ", "-");
            return (
              <article
                className={`panel idea-card idea-card-${statusClass}`}
                key={item.id}
              >
                <div className="idea-vote-rail">
                  <button
                    className={voted ? "vote active" : "vote"}
                    onClick={() => vote(item)}
                    aria-pressed={voted}
                    aria-label={`${voted ? "Remove your vote from" : "Vote for"} ${item.title}`}
                  >
                    <Vote />
                    <strong>{item.votes.length}</strong>
                    <span>{item.votes.length === 1 ? "vote" : "votes"}</span>
                  </button>
                </div>
                <div className="idea-card-content">
                  <div className="idea-card-topline">
                    {captain(profile) ? (
                      <select
                        className="idea-status-select"
                        value={item.status}
                        onChange={(e) => status(item, e.target.value)}
                        aria-label={`Status for ${item.title}`}
                      >
                        <option>Pending</option>
                        <option>Considering</option>
                        <option>Working On</option>
                        <option>Completed</option>
                        <option>Declined</option>
                      </select>
                    ) : (
                      <span className={`status ${statusClass}`}>
                        {item.status}
                      </span>
                    )}
                    <time dateTime={item.created_at}>
                      {formatDate(item.created_at)}
                    </time>
                  </div>
                  <h2>{item.title}</h2>
                  <div className="idea-description">
                    <p>{item.description}</p>
                  </div>
                  <div className="idea-card-footer">
                    <div className="idea-author">
                      <span className="idea-author-avatar" aria-hidden="true">
                        {author.slice(0, 1).toUpperCase()}
                      </span>
                      <span>
                        <small>Proposed by</small>
                        <strong>{author}</strong>
                      </span>
                    </div>
                    {(item.user_id === user.id || captain(profile)) && (
                      <button
                        className="button danger compact-button idea-delete-button"
                        onClick={() => remove(item)}
                      >
                        <Trash2 />
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
      {open && (
        <SubmitModal
          kind="idea"
          user={user}
          profile={profile}
          onClose={() => setOpen(false)}
          onSaved={async () => {
            await reload();
            await reloadLimit();
          }}
        />
      )}
    </div>
  );
}

function Comments({ item, user, profile, reload, setMessage }) {
  const [open, setOpen] = useState(false);
  async function add(e) {
    e.preventDefault();
    const input = e.currentTarget.elements.comment;
    const value = input.value.trim();
    if (!value) return;
    const blocked = await restrictionMessage(user.id, "comments");
    if (blocked) return setMessage(blocked);
    try {
      await createCollabComment(item.id, user.id, value);
      input.value = "";
      reload();
    } catch (x) {
      setMessage(x.message);
    }
  }
  async function edit(comment) {
    const value = await promptInApp(
      "Update the comment below.",
      comment.comment,
      {
        title: "Edit your comment",
        inputLabel: "Comment",
        confirmLabel: "Save changes",
        maxLength: 1000,
      },
    );
    if (!value || value.length > 1000) return;
    try {
      await updateCollabComment(comment.id, user.id, value);
      reload();
    } catch (x) {
      setMessage(x.message);
    }
  }
  async function remove(comment) {
    const approved = await confirmInApp(
      "This comment will be permanently removed from the collaboration.",
      { title: "Delete this comment?", confirmLabel: "Delete comment" },
    );
    if (!approved) return;
    try {
      await deleteCollabComment(comment.id);
      reload();
    } catch (x) {
      setMessage(x.message);
    }
  }
  return (
    <section className="collab-comments">
      <button className="button ghost" onClick={() => setOpen((v) => !v)}>
        {item.comments.length
          ? `${item.comments.length} comment${item.comments.length === 1 ? "" : "s"}`
          : "Be interested"}
      </button>
      {open && (
        <div className="comment-list">
          {item.comments.map((comment) => (
            <div className="comment" key={comment.id}>
              <Avatar profile={comment.profile} size={30} />
              <div>
                <strong>{comment.profile?.username || "Crew member"}</strong>
                <p>{comment.comment}</p>
                <small>
                  {formatDate(comment.created_at)}
                  {comment.updated_at !== comment.created_at ? " · Edited" : ""}
                </small>
                {(comment.user_id === user.id || captain(profile)) && (
                  <div className="comment-actions">
                    {comment.user_id === user.id && (
                      <button onClick={() => edit(comment)}>Edit</button>
                    )}
                    <button onClick={() => remove(comment)}>Delete</button>
                  </div>
                )}
              </div>
            </div>
          ))}
          <form className="composer compact-composer" onSubmit={add}>
            <textarea name="comment" maxLength="1000" rows="2" />
            <button className="send-button">Post</button>
          </form>
        </div>
      )}
    </section>
  );
}
export function CollabsPage({ user, profile }) {
  const { data, loading, error, reload } = useLoader(getCollabs, []);
  const [modal, setModal] = useState(null);
  const [message, setMessage] = useState("");
  async function remove(item) {
    const approved = await confirmInApp(
      `“${item.title}” and its comments will be permanently removed.`,
      { title: "Delete this collaboration?", confirmLabel: "Delete post" },
    );
    if (!approved) return;
    try {
      await deleteCollab(item.id);
      reload();
    } catch (x) {
      setMessage(x.message);
    }
  }
  return (
    <div className="page">
      <PageHeader
        eyebrow="Collab board"
        title="Build something together"
        description="Find the missing skill, teammate, or creative spark for your next project."
        action={
          <div className="header-actions">
            <button
              className="icon-button refresh-button"
              onClick={reload}
              disabled={loading}
              aria-busy={loading}
              title="Refresh collaborations"
            >
              <RefreshCw className={loading ? "spin" : ""} />
            </button>
            <button className="button primary" onClick={() => setModal({})}>
              <Plus />
              Post collaboration
            </button>
          </div>
        }
      />
      {message && <p className="form-message">{message}</p>}
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorState message={error} retry={reload} />
      ) : (
        <div className="card-grid">
          {data?.map((item) => (
            <article className="panel collab-card" key={item.id}>
              <div className="card-meta">
                <span className="status open">{item.status}</span>
                <span>{item.category}</span>
              </div>
              <h2>{item.title}</h2>
              <p>{item.description}</p>
              {item.looking_for && (
                <div className="looking-for">
                  <Users />
                  <span>
                    <small>Looking for</small>
                    <strong>{item.looking_for}</strong>
                  </span>
                </div>
              )}
              <div className="card-person compact">
                <Avatar profile={item.profile} size={34} />
                <span>{item.profile?.username || "Crew member"}</span>
              </div>
              {(item.user_id === user.id || captain(profile)) && (
                <div className="button-row">
                  {item.user_id === user.id && (
                    <button
                      className="button secondary"
                      onClick={() => setModal(item)}
                    >
                      Edit
                    </button>
                  )}
                  <button
                    className="button danger"
                    onClick={() => remove(item)}
                  >
                    Delete
                  </button>
                </div>
              )}
              <Comments
                item={item}
                user={user}
                profile={profile}
                reload={reload}
                setMessage={setMessage}
              />
            </article>
          ))}
        </div>
      )}
      {modal && (
        <SubmitModal
          kind="collab"
          initial={modal.id ? modal : null}
          user={user}
          profile={profile}
          onClose={() => setModal(null)}
          onSaved={reload}
        />
      )}
    </div>
  );
}

export function CrewPage({ onMessage }) {
  const { data, loading, error, reload } = useLoader(() => getProfiles(), []);
  const [q, setQ] = useState("");
  const rows = useMemo(
    () =>
      (data || []).filter((p) =>
        `${p.username || ""} ${p.rank || ""}`
          .toLowerCase()
          .includes(q.toLowerCase()),
      ),
    [data, q],
  );
  return (
    <div className="page">
      <PageHeader
        eyebrow="Crew directory"
        title="Everyone in orbit"
        description="Browse community members, see who is around, and start a conversation."
        action={
          <div className="search-box">
            <Search />
            <input
              placeholder="Search by name or rank"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
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
            const online =
              person.last_seen &&
              Date.now() - new Date(person.last_seen).getTime() < 120000;
            let badges = Array.isArray(person.badges) ? person.badges : [];
            if (person.support_active && !badges.includes("Supporter"))
              badges = [...badges, "Supporter"];
            return (
              <article className="panel crew-card" key={person.id}>
                <div className={`presence ${online ? "online" : ""}`} />
                <Avatar profile={person} size={72} />
                <h3>{person.username}</h3>
                <span className="rank">{person.rank || "Crew"}</span>
                <small>
                  {online
                    ? "Online"
                    : person.last_seen
                      ? `Last seen ${new Date(person.last_seen).toLocaleString()}`
                      : "Offline"}
                </small>
                <div className="tag-row">
                  {badges.map((b) => (
                    <span key={b}>{b}</span>
                  ))}
                </div>
                <button
                  className="button secondary"
                  onClick={() => onMessage(person)}
                >
                  <MessageCircle />
                  Message
                </button>
              </article>
            );
          })}
        </div>
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
      />
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorState message={error} retry={reload} />
      ) : items.length ? (
        <div className="birthday-list">
          {items.map((person, i) =>
            person.hidden ? (
              <article
                className="panel birthday-card opted-out"
                key={person.id || i}
              >
                <div>
                  <h3>Birthday Hidden</h3>
                  <p>User opted out of showing their birthday.</p>
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
      "Respect every person",
      "Treat the humans behind each avatar with patience, dignity, and care.",
    ],
    [
      "Consent comes first",
      "Ask before involving others, sharing content, or crossing personal boundaries.",
    ],
    [
      "Keep the community safe",
      "No harassment, hate, threats, doxxing, scams, or deliberately harmful behavior.",
    ],
    [
      "Protect private conversations",
      "Messages and personal details stay private unless everyone involved agrees otherwise.",
    ],
    [
      "Build in good faith",
      "Ideas, collaborations, and meetups should be honest, constructive, and community-minded.",
    ],
    [
      "Ask for help early",
      "If something feels wrong, contact the Captain rather than escalating it yourself.",
    ],
  ];
  return (
    <div className="page">
      <PageHeader
        eyebrow="Community guidelines"
        title="A kind, safe orbit"
        description="Respect boundaries, protect each other, and leave the community better than you found it."
      />
      <div className="guideline-hero panel">
        <Sparkles />
        <div>
          <h2>We make this space together</h2>
          <p>Every member shapes the tone of the community.</p>
        </div>
      </div>
      <div className="guidelines-grid">
        {sections.map(([title, body], i) => (
          <article className="panel guideline" key={title}>
            <span>{String(i + 1).padStart(2, "0")}</span>
            <h3>{title}</h3>
            <p>{body}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

export function MeetupsPage({ user, profile }) {
  const { data, loading, error, reload } = useLoader(getMeetups, []);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const mine = (data || []).filter((m) => m.user_id === user.id);
  const approved = (data || []).filter((m) => m.status === "approved");
  async function remove(item) {
    const approved = await confirmInApp(
      "This meetup request will be removed from the calendar.",
      { title: "Cancel meetup request?", confirmLabel: "Cancel request" },
    );
    if (!approved) return;
    try {
      await cancelMeetup(item.id, user.id);
      reload();
    } catch (x) {
      setMessage(x.message);
    }
  }
  const card = (item) => (
    <article className="panel meetup-card" key={item.id}>
      <div className="date-tile">
        <strong>{new Date(item.meetup_date + "T00:00:00").getDate()}</strong>
        <span>
          {new Intl.DateTimeFormat(undefined, { month: "short" }).format(
            new Date(item.meetup_date + "T00:00:00"),
          )}
        </span>
      </div>
      <div>
        <div className="card-meta">
          <span className={`status ${item.status}`}>{item.status}</span>
          <span>
            {item.start_time} · {item.duration} min
          </span>
        </div>
        <h3>{item.meetup_type}</h3>
        <p>{item.message}</p>
        <small>
          {item.vrc_username && `VRChat: ${item.vrc_username}`}
          {item.time_flexibility && ` · ${item.time_flexibility}`}
        </small>
        {item.status === "pending" && item.user_id === user.id && (
          <button
            className="button danger compact-button"
            onClick={() => remove(item)}
          >
            Cancel request
          </button>
        )}
      </div>
    </article>
  );
  return (
    <div className="page">
      <PageHeader
        eyebrow="Meetup calendar"
        title="Plan time together"
        description="Request VRChat hangouts and keep your upcoming community plans in one place."
        action={
          <button className="button primary" onClick={() => setOpen(true)}>
            <CalendarDays />
            Request meetup
          </button>
        }
      />
      {message && <p className="form-message">{message}</p>}
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorState message={error} retry={reload} />
      ) : (
        <>
          <h2 className="section-title">Your requests</h2>
          {mine.length ? (
            <div className="timeline">{mine.map(card)}</div>
          ) : (
            <Empty
              title="No meetup requests"
              body="Choose a date and send the Captain a meetup request."
            />
          )}
          <h2 className="section-title">Approved community meetups</h2>
          {approved.length ? (
            <div className="timeline">{approved.map(card)}</div>
          ) : (
            <p className="micro-copy">No approved meetups scheduled.</p>
          )}
        </>
      )}
      {open && (
        <SubmitModal
          kind="meetup"
          user={user}
          profile={profile}
          onClose={() => setOpen(false)}
          onSaved={reload}
        />
      )}
    </div>
  );
}

export function SupportPage({ profile, onUpdated }) {
  const { data, loading, reload } = useLoader(getSupporters, []);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const current = profile.support_active
    ? String(profile.support_tier || "").toLowerCase()
    : null;
  const tiers = [
    {
      id: "cadet",
      name: "Cadet",
      price: "$2.99",
      features: ["Community hosting and services", "Routine maintenance costs"],
    },
    {
      id: "crewmate",
      name: "Crewmate",
      price: "$5.99",
      features: ["App and website improvements", "Community tools and events"],
    },
    {
      id: "officer",
      name: "Officer",
      price: "$9.99",
      features: ["Larger future projects", "Extra room for community growth"],
    },
  ];
  async function act(tier) {
    setBusy(tier);
    try {
      if (!current)
        window.desktop.openExternal(
          await startSupportCheckout(tier, profile.username),
        );
      else if (current !== tier) {
        await manageSupportSubscription("change_tier", tier);
        onUpdated({ ...profile, support_active: true, support_tier: tier });
        setMessage(`Your support tier is now ${tier}.`);
        setTimeout(reload, 1200);
      }
    } catch (x) {
      setMessage(x.message);
    } finally {
      setBusy("");
    }
  }
  async function cancel() {
    const approved = await confirmInApp(
      "Your monthly support will end immediately.",
      {
        title: "Cancel your support subscription?",
        confirmLabel: "Cancel support",
      },
    );
    if (!approved) return;
    setBusy("cancel");
    try {
      await manageSupportSubscription("cancel");
      onUpdated({ ...profile, support_active: false, support_tier: null });
      setMessage("Your support subscription has been canceled.");
      setTimeout(reload, 1200);
    } catch (x) {
      setMessage(x.message);
    } finally {
      setBusy("");
    }
  }
  return (
    <div className="page">
      <PageHeader
        eyebrow="Support the Captain"
        title="Help keep the community running"
        description={
          current
            ? `Your current support tier is ${current}.`
            : "Optional monthly support helps keep the community moving."
        }
      />
      {message && <p className="form-message">{message}</p>}
      <div className="tier-grid">
        {tiers.map((tier, i) => (
          <article
            className={`panel tier-card ${i === 1 ? "featured" : ""} ${current === tier.id ? "is-current" : ""}`}
            key={tier.id}
          >
            {i === 1 && <span className="recommended">Most popular</span>}
            <Heart />
            <h2>{tier.name}</h2>
            <div className="price">
              {tier.price}
              <small>/ month</small>
            </div>
            <h3 className="support-impact-title">What this helps cover</h3>
            <ul>
              {tier.features.map((f) => (
                <li key={f}>
                  <Check />
                  {f}
                </li>
              ))}
            </ul>
            <button
              className="button primary wide"
              disabled={busy || current === tier.id}
              onClick={() => act(tier.id)}
            >
              {busy === tier.id
                ? "Working…"
                : current === tier.id
                  ? "Current tier"
                  : current
                    ? "Change tier"
                    : `Support as ${tier.name}`}
            </button>
            {current === tier.id && (
              <button
                className="button danger wide"
                disabled={busy}
                onClick={cancel}
              >
                Cancel support
              </button>
            )}
          </article>
        ))}
      </div>
      <section className="supporters">
        <h2>Current supporters</h2>
        {loading ? (
          <Loading />
        ) : (
          <div className="supporter-row">
            {data?.map((p) => (
              <div className="supporter-chip" key={p.username}>
                <Avatar profile={p} size={34} />
                <span>
                  {p.username}
                  <small>{p.support_tier}</small>
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export function ProfilePage({ user, profile, onUpdated }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      let avatar = profile.avatar;
      const file = f.get("avatar");
      if (file?.size) avatar = await uploadAvatar(user.id, file);
      const next = await updateProfile(user.id, {
        username: String(f.get("username")).trim(),
        favorite_game: f.get("favorite_game"),
        birthday: f.get("birthday") || null,
        show_age: f.get("show_age") === "on",
        show_birthday: f.get("show_birthday") === "on",
        theme: f.get("theme") || "default",
        discord: f.get("discord"),
        youtube: f.get("youtube"),
        twitch: f.get("twitch"),
        vrchat: f.get("vrchat"),
        steam: f.get("steam"),
        bio: f.get("bio"),
        avatar,
      });
      onUpdated(next);
      setMessage("Profile saved.");
    } catch (x) {
      setMessage(x.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page">
      <PageHeader
        eyebrow="Your profile"
        title="Your crew identity"
        description="Control how you appear throughout the community."
      />
      <form className="panel profile-form" onSubmit={save}>
        <div className="profile-preview">
          <Avatar profile={profile} size={96} />
          <div>
            <h2>{profile.username}</h2>
            <span className="rank">{profile.rank || "Crew"}</span>
          </div>
        </div>
        <div className="form-grid">
          <Field label="Username">
            <input
              name="username"
              maxLength="24"
              defaultValue={profile.username}
              required
            />
          </Field>
          <Field label="Favorite game">
            <input name="favorite_game" defaultValue={profile.favorite_game} />
          </Field>
          <Field label="Birthday">
            <input
              name="birthday"
              type="date"
              defaultValue={profile.birthday || ""}
            />
          </Field>
          <Field label="Profile theme">
            <select name="theme" defaultValue={profile.theme || "default"}>
              <option value="default">Space Default</option>
              <option value="captain">Captain Blue</option>
              <option value="nebula">Nebula Glow</option>
              <option value="galaxy">Galaxy Core</option>
              <option value="fire">Solar Flare</option>
              <option value="ice">Frozen Planet</option>
              <option value="alien">Alien World</option>
              <option value="void">Void Protocol</option>
              <option value="retro">Retro NASA</option>
            </select>
          </Field>
          <Field label="Avatar" hint="PNG, JPG, WebP, or GIF under 5 MB">
            <input
              name="avatar"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
            />
          </Field>
          <Field label="Discord">
            <input name="discord" defaultValue={profile.discord} />
          </Field>
          <Field label="VRChat">
            <input name="vrchat" defaultValue={profile.vrchat} />
          </Field>
          <Field label="Steam">
            <input name="steam" defaultValue={profile.steam} />
          </Field>
          <Field label="YouTube">
            <input name="youtube" defaultValue={profile.youtube} />
          </Field>
          <Field label="Twitch">
            <input name="twitch" defaultValue={profile.twitch} />
          </Field>
        </div>
        <Field label="Bio">
          <textarea name="bio" rows="5" defaultValue={profile.bio} />
        </Field>
        <label className="check-field">
          <input
            name="show_age"
            type="checkbox"
            defaultChecked={profile.show_age}
          />
          <span>Show my age on my profile</span>
        </label>
        <label className="check-field">
          <input
            name="show_birthday"
            type="checkbox"
            defaultChecked={profile.show_birthday}
          />
          <span>Show my birthday to the community</span>
        </label>
        <div className="button-row">
          <button className="button primary" disabled={busy}>
            {busy ? "Saving…" : "Save profile"}
          </button>
          {message && <span className="form-message inline">{message}</span>}
        </div>
      </form>
    </div>
  );
}
