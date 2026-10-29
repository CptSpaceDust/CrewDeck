import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  Bell,
  CheckCircle2,
  Columns3,
  GalleryHorizontal,
  Link2,
  List,
  RefreshCw,
  Users,
} from "lucide-react";
import { communityBoards } from "../lib/communityBoards";
import { supabase } from "../lib/supabase";

const LABELS = {
  idea: "Ideas",
  collaboration: "Collaborations",
  help: "Help requests",
  bug: "Bug reports",
};

export function CommunityBoardWorkspace({ kind, user, profile, onChanged }) {
  const [workflow, setWorkflow] = useState(null);
  const [posts, setPosts] = useState([]);
  const [details, setDetails] = useState({
    following: new Set(),
    assignments: [],
    links: [],
    duplicates: [],
    conversions: [],
  });
  const [profiles, setProfiles] = useState([]);
  const [preference, setPreference] = useState({
    layout: "card",
    show_resolved: false,
    show_archived: false,
  });
  const [status, setStatus] = useState("all");
  const [tag, setTag] = useState("all");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);

  const isCaptain = profile?.rank === "Captain";
  async function load() {
    setLoading(true);
    try {
      const [nextWorkflow, nextPreference, nextPosts, crew] = await Promise.all(
        [
          communityBoards.getWorkflow(kind),
          communityBoards.getPreference(kind, user.id),
          communityBoards.listPosts(kind, {
            includeArchived: true,
            limit: 250,
          }),
          supabase
            .from("profiles")
            .select("id,username,avatar,rank")
            .order("username"),
        ],
      );
      if (crew.error) throw crew.error;
      setWorkflow(nextWorkflow);
      setPreference(nextPreference);
      setPosts(nextPosts);
      setProfiles(crew.data || []);
      setDetails(
        await communityBoards.getDetails(
          nextPosts.map((item) => item.id),
          user.id,
        ),
      );
    } catch (error) {
      setNotice(error.message || "The board controls could not be loaded.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
    return communityBoards.subscribe(kind, load);
  }, [kind, user.id]);

  const tags = useMemo(
    () => [...new Set(posts.flatMap((item) => item.tags || []))].sort(),
    [posts],
  );
  const visible = posts.filter((item) => {
    if (!preference.show_archived && item.archived_at) return false;
    if (!preference.show_resolved && item.resolved_at) return false;
    if (status !== "all" && item.status !== status) return false;
    return tag === "all" || item.tags?.includes(tag);
  });
  async function savePreference(changes) {
    const next = { ...preference, ...changes };
    setPreference(next);
    try {
      await communityBoards.savePreference(kind, user.id, next);
    } catch (error) {
      setNotice(error.message);
    }
  }
  async function mutate(task, message) {
    try {
      await task();
      setNotice(message);
      await load();
      await onChanged?.();
    } catch (error) {
      setNotice(error.message || "The board could not be updated.");
    }
  }

  return (
    <section
      className="panel board-workspace"
      aria-label={`${LABELS[kind]} board tools`}
    >
      <header className="board-workspace-header">
        <div>
          <span className="eyebrow">Shared board tools</span>
          <h2>Organize {LABELS[kind].toLowerCase()}</h2>
        </div>
        <button
          className="icon-button"
          onClick={load}
          aria-label="Refresh board tools"
        >
          <RefreshCw className={loading ? "spin" : ""} />
        </button>
      </header>
      <div className="board-workspace-controls">
        <label>
          Status
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="all">All statuses</option>
            {(workflow?.statuses || []).map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          Tag
          <select value={tag} onChange={(event) => setTag(event.target.value)}>
            <option value="all">All tags</option>
            {tags.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <div className="board-layout-picker" aria-label="Board layout">
          {[
            ["list", List],
            ["card", Columns3],
            ["gallery", GalleryHorizontal],
          ].map(([value, Icon]) => (
            <button
              key={value}
              className={preference.layout === value ? "active" : ""}
              onClick={() => savePreference({ layout: value })}
              aria-pressed={preference.layout === value}
              title={`${value} layout`}
            >
              <Icon />
            </button>
          ))}
        </div>
        <label className="check-field">
          <input
            type="checkbox"
            checked={preference.show_resolved}
            onChange={(event) =>
              savePreference({ show_resolved: event.target.checked })
            }
          />
          <span>Resolved</span>
        </label>
        <label className="check-field">
          <input
            type="checkbox"
            checked={preference.show_archived}
            onChange={(event) =>
              savePreference({ show_archived: event.target.checked })
            }
          />
          <span>Archived</span>
        </label>
      </div>
      {notice && <p className="form-message">{notice}</p>}
      {isCaptain && (
        <WorkflowEditor
          workflow={workflow}
          kind={kind}
          userId={user.id}
          mutate={mutate}
        />
      )}
      <div className={`board-workspace-posts layout-${preference.layout}`}>
        {visible.map((post) => (
          <BoardWorkspacePost
            key={post.id}
            post={post}
            workflow={workflow}
            user={user}
            isCaptain={isCaptain}
            profiles={profiles}
            details={details}
            mutate={mutate}
          />
        ))}
        {!loading && !visible.length && (
          <p className="micro-copy">No posts match these board filters.</p>
        )}
      </div>
    </section>
  );
}

function WorkflowEditor({ workflow, kind, userId, mutate }) {
  if (!workflow) return null;
  async function save(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const statuses = String(form.get("statuses") || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const required_tags = String(form.get("required") || "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    const optional_tags = String(form.get("optional") || "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    await mutate(async () => {
      let transitions;
      try {
        transitions = JSON.parse(form.get("transitions") || "{}");
      } catch {
        throw new Error("Transitions must be valid JSON.");
      }
      return communityBoards.updateWorkflow(kind, userId, {
        statuses,
        required_tags,
        optional_tags,
        transitions,
      });
    }, "Board workflow updated.");
  }
  return (
    <details className="board-workflow-editor">
      <summary>Captain workflow editor</summary>
      <form onSubmit={save}>
        <label>
          Status columns
          <input
            name="statuses"
            defaultValue={(workflow.statuses || []).join(", ")}
          />
        </label>
        <label>
          Required tags
          <input
            name="required"
            defaultValue={(workflow.required_tags || []).join(", ")}
          />
        </label>
        <label>
          Optional tags
          <input
            name="optional"
            defaultValue={(workflow.optional_tags || []).join(", ")}
          />
        </label>
        <label>
          Allowed transitions (JSON)
          <textarea
            name="transitions"
            rows="6"
            defaultValue={JSON.stringify(workflow.transitions || {}, null, 2)}
          />
        </label>
        <button className="button secondary">Save workflow</button>
      </form>
    </details>
  );
}

function BoardWorkspacePost({
  post,
  workflow,
  user,
  isCaptain,
  profiles,
  details,
  mutate,
}) {
  const [duplicateMatches, setDuplicateMatches] = useState([]);
  const following = details.following.has(post.id);
  const assigned = details.assignments.filter(
    (item) => item.post_id === post.id,
  );
  const links = details.links.filter((item) => item.post_id === post.id);
  const conversionKinds = new Set(
    details.conversions
      .filter((item) => item.post_id === post.id)
      .map((item) => item.target_kind),
  );
  const canManage = isCaptain || post.author_id === user.id;
  const transitions = workflow?.transitions?.[post.status] || [];
  async function updateTags(event) {
    event.preventDefault();
    const tags = String(
      new FormData(event.currentTarget).get("tags") || "",
    ).split(",");
    await mutate(
      () => communityBoards.updatePost(post.id, { tags }),
      "Tags updated.",
    );
  }
  async function assign(event) {
    event.preventDefault();
    const ids = [...new FormData(event.currentTarget).getAll("assignees")];
    await mutate(
      () => communityBoards.setAssignments(post.id, ids, user.id),
      "Assignments updated.",
    );
  }
  async function link(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await mutate(
      () =>
        communityBoards.addLink(
          post.id,
          form.get("kind"),
          form.get("id"),
          form.get("label"),
          user.id,
        ),
      "Related item linked.",
    );
    event.currentTarget.reset();
  }
  async function duplicates() {
    const choices = await communityBoards.findDuplicates(post.id);
    setDuplicateMatches(choices);
    if (!choices.length)
      return mutate(async () => {}, "No likely duplicates found.");
  }
  return (
    <article
      className={`board-workspace-post${post.archived_at ? " archived" : ""}`}
    >
      <div className="board-workspace-post-top">
        <span className="status">{post.status}</span>
        <small>
          {post.deadline
            ? `Due ${new Date(post.deadline).toLocaleDateString()}`
            : "No deadline"}
        </small>
      </div>
      <h3>{post.title}</h3>
      <p>{post.body}</p>
      <div className="board-tag-row">
        {post.tags?.map((value) => (
          <span key={value}>#{value}</span>
        ))}
      </div>
      {!!assigned.length && (
        <p className="board-assignees">
          <Users />{" "}
          {assigned
            .map((item) => item.profile?.username || "Crew member")
            .join(", ")}
        </p>
      )}
      {!!links.length && (
        <div className="board-tag-row">
          {links.map((item) => (
            <span key={item.id}>
              <Link2 /> {item.label || item.link_kind}
            </span>
          ))}
        </div>
      )}
      <div className="button-row board-quick-actions">
        <button
          className="button ghost"
          onClick={() =>
            mutate(
              () => communityBoards.setFollowing(post.id, user.id, !following),
              following ? "Post unfollowed." : "Post followed.",
            )
          }
        >
          <Bell /> {following ? "Following" : "Follow"}
        </button>
        {canManage && (
          <button
            className="button ghost"
            onClick={() =>
              mutate(
                () => communityBoards.resolvePost(post.id, !post.resolved_at),
                post.resolved_at ? "Post reopened." : "Post resolved.",
              )
            }
          >
            <CheckCircle2 /> {post.resolved_at ? "Reopen" : "Resolve"}
          </button>
        )}
        {canManage && (
          <button
            className="button ghost"
            onClick={() =>
              mutate(
                () => communityBoards.archivePost(post.id, !post.archived_at),
                post.archived_at ? "Post restored." : "Post archived.",
              )
            }
          >
            <Archive /> {post.archived_at ? "Restore" : "Archive"}
          </button>
        )}
      </div>
      {canManage && (
        <details className="board-manage">
          <summary>Manage post</summary>
          <div className="board-manage-grid">
            <label>
              Next status
              <select
                defaultValue=""
                onChange={(event) =>
                  event.target.value &&
                  mutate(
                    () =>
                      communityBoards.transitionPost(post, event.target.value),
                    `Moved to ${event.target.value}.`,
                  )
                }
              >
                <option value="">Choose…</option>
                {transitions.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label>
              Deadline
              <input
                type="datetime-local"
                defaultValue={post.deadline?.slice(0, 16) || ""}
                onChange={(event) =>
                  mutate(
                    () =>
                      communityBoards.updatePost(post.id, {
                        deadline: event.target.value
                          ? new Date(event.target.value).toISOString()
                          : null,
                      }),
                    "Deadline updated.",
                  )
                }
              />
            </label>
          </div>
          <form onSubmit={updateTags}>
            <label>
              Tags
              <input
                name="tags"
                defaultValue={post.tags?.join(", ") || ""}
                placeholder={(workflow?.optional_tags || []).join(", ")}
              />
            </label>
            <button className="button secondary">Save tags</button>
          </form>
          <form onSubmit={assign}>
            <fieldset>
              <legend>Assigned members</legend>
              <div className="board-member-picker">
                {profiles.map((person) => (
                  <label className="check-field" key={person.id}>
                    <input
                      type="checkbox"
                      name="assignees"
                      value={person.id}
                      defaultChecked={assigned.some(
                        (item) => item.user_id === person.id,
                      )}
                    />
                    <span>{person.username}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <button className="button secondary">Save assignments</button>
          </form>
          <form className="board-link-form" onSubmit={link}>
            <select name="kind">
              <option value="meetup">Meetup</option>
              <option value="event">Event</option>
              <option value="group">Group conversation</option>
              <option value="space">Crew Space</option>
            </select>
            <input
              name="id"
              required
              pattern="[0-9a-fA-F-]{36}"
              placeholder="Related item ID"
            />
            <input name="label" maxLength="120" placeholder="Label" />
            <button className="button secondary">Link</button>
          </form>
          <div className="button-row">
            <button className="button secondary" onClick={duplicates}>
              Find duplicates
            </button>
            {["poll", "meetup", "event", "space"].map((target) => (
              <button
                key={target}
                className="button secondary"
                disabled={conversionKinds.has(target)}
                onClick={() =>
                  mutate(
                    () =>
                      communityBoards.createConversion(post, target, user.id),
                    `${target[0].toUpperCase() + target.slice(1)} draft created.`,
                  )
                }
              >
                {conversionKinds.has(target)
                  ? `${target} draft saved`
                  : `Convert to ${target}`}
              </button>
            ))}
          </div>
          {!!duplicateMatches.length && (
            <div className="board-duplicate-results">
              <strong>Possible duplicates</strong>
              {duplicateMatches.map((candidate) => (
                <div key={candidate.id}>
                  <span>
                    {candidate.title} · {Math.round(candidate.similarity * 100)}
                    %
                  </span>
                  {isCaptain && (
                    <button
                      className="button danger"
                      onClick={() =>
                        mutate(
                          () =>
                            communityBoards.markDuplicate(
                              post.id,
                              candidate.id,
                              user.id,
                            ),
                          "Duplicate merged into the canonical post.",
                        )
                      }
                    >
                      Merge here
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </details>
      )}
    </article>
  );
}
