import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { read, captainFunction } from "../lib/captain";
import { CaptainAppeals } from "./ModerationAppeals";
import { Modal, Field } from "./ui";
import CaptainMusic from "./CaptainMusic";
import CaptainMessages from "./CaptainMessages";
import { meetupInstant } from "../lib/time";
import { Megaphone } from "lucide-react";

export const restrictionNames = {
  site: "Site access",
  messaging: "Messaging",
  calls: "Voice calling",
  comments: "Comments",
  idea_likes: "Liking ideas",
  ideas: "Posting ideas",
  collabs: "Collab requests",
  meetups: "Meetup requests",
};

export function CaptainSection({
  id,
  icon,
  title,
  description,
  status,
  tone = "green",
  defaultOpen = false,
  children,
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`captain-management-section${open ? " open" : ""}`}>
      <button
        type="button"
        className="captain-management-header"
        aria-expanded={open}
        aria-controls={`${id}-content`}
        onClick={() => setOpen(!open)}
      >
        <span className="captain-management-title">
          <span className="captain-management-icon" aria-hidden="true">
            {icon}
          </span>
          <span className="captain-management-heading">
            <h2>{title}</h2>
            <p>{description}</p>
          </span>
        </span>
        {status && (
          <span className="captain-management-status">
            <span className={`captain-status-dot ${tone}`} />
            {status}
          </span>
        )}
        <span className="captain-management-chevron" aria-hidden="true">
          ▼
        </span>
      </button>
      <div
        className="captain-management-content"
        id={`${id}-content`}
        hidden={!open}
      >
        <div className="captain-management-inner">{children}</div>
      </div>
    </section>
  );
}

function CaptainReports({ reports = [], user, name, run, setTarget }) {
  return (
    <div className="captain-moderation-action-list captain-reports-list">
      {!reports.length && <p>No member reports have been submitted.</p>}
      {reports.map((report) => (
        <article
          className="captain-moderation-action-card captain-report-card"
          key={report.id}
        >
          <div>
            <strong>{name(report.reported_user_id)}</strong>
            <span className="captain-moderation-action-name">
              Reported by {name(report.reporter_id)} · {report.status}
            </span>
            <p>{report.reason}</p>
            {report.context && <small>{report.context}</small>}
            <small>{new Date(report.created_at).toLocaleString()}</small>
          </div>
          <div className="captain-actions">
            <button onClick={() => setTarget(report.reported_user_id)}>
              Select for moderation
            </button>
            {report.status === "open" && (
              <button
                onClick={() =>
                  run(
                    () =>
                      read(
                        supabase
                          .from("user_reports")
                          .update({
                            status: "reviewed",
                            reviewed_at: new Date().toISOString(),
                            reviewed_by: user.id,
                          })
                          .eq("id", report.id)
                          .select("id")
                          .single(),
                      ),
                    "Report marked reviewed.",
                  )
                }
              >
                Mark reviewed
              </button>
            )}
            {report.status !== "resolved" && (
              <button
                className="approve"
                onClick={() =>
                  run(
                    () =>
                      read(
                        supabase
                          .from("user_reports")
                          .update({
                            status: "resolved",
                            reviewed_at: new Date().toISOString(),
                            reviewed_by: user.id,
                          })
                          .eq("id", report.id)
                          .select("id")
                          .single(),
                      ),
                    "Report resolved.",
                  )
                }
              >
                Resolve
              </button>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}

export default function CaptainControls({
  data,
  user,
  run,
  busy,
  onNotice,
  notice,
  onRefresh,
  refreshing = false,
  refreshVersion = 0,
  communityOperations,
}) {
  const [question, setQuestion] = useState(null);
  const resolver = useRef(null);
  const [target, setTarget] = useState("");
  const [action, setAction] = useState("site");
  const [days, setDays] = useState("1");
  const [bans, setBans] = useState([]);
  const [banError, setBanError] = useState("");
  const person = (id) => data.crew?.find((item) => item.id === id);
  const name = (id) => person(id)?.username || "Former member";
  const pending =
    data.meetups?.filter(
      (item) =>
        item.status === "pending" &&
        (!item.with_user_id ||
          person(item.with_user_id)?.rank?.toLowerCase() === "captain"),
    ) || [];
  const requiresCaptainApproval = (item) =>
    !item.with_user_id ||
    person(item.with_user_id)?.rank?.toLowerCase() === "captain";
  const selectedRestrictions =
    data.restrictions?.filter((item) => item.user_id === target) || [];
  function ask(text, input = true) {
    return new Promise((resolve) => {
      resolver.current = resolve;
      setQuestion({ text, input });
    });
  }
  function answer(value) {
    resolver.current?.(value);
    resolver.current = null;
    setQuestion(null);
  }
  useEffect(() => () => resolver.current?.(null), []);
  async function loadBans() {
    try {
      setBans(
        (await captainFunction("manage-permanent-ban", { action: "list" }))
          .bans || [],
      );
      setBanError("");
    } catch (error) {
      setBanError(error.message);
    }
  }
  useEffect(() => {
    loadBans();
  }, [refreshVersion]);
  async function removeAccount(mode) {
    if (!target || target === user.id) return;
    const username = name(target);
    const warning =
      mode === "delete"
        ? `Delete ${username}'s account and data, including shared direct conversations? This does not block them from signing up again. Type their username to confirm:`
        : `Permanently ban ${username} and delete their account and data, including shared direct conversations? Their email and username will be blocked. Type their username to confirm:`;
    if ((await ask(warning)) !== username) return;
    await run(
      async () => {
        await captainFunction("manage-permanent-ban", {
          action: mode,
          userId: target,
        });
        setTarget("");
        await loadBans();
      },
      mode === "delete"
        ? "Account deleted. This person may sign up again."
        : "Account deleted and identity permanently blocked.",
    );
  }
  async function decideMeetup(item, status) {
    const reason =
      status === "denied"
        ? (await ask("Why are you denying this meetup request?"))?.trim()
        : null;
    if (status === "denied" && !reason) return;
    let emailError;
    await run(
      async () => {
        await read(
          supabase
            .from("meetup_requests")
            .update({ status, ...(reason ? { admin_reason: reason } : {}) })
            .eq("id", item.id)
            .select("id")
            .single(),
        );
        try {
          await captainFunction("send-meetup-email", {
            meetupId: item.id,
            status,
            reason,
          });
        } catch (error) {
          emailError = error.message;
        }
      },
      status === "approved"
        ? "Meetup approved. The user has been notified."
        : "Meetup denied. The user has been notified.",
    );
    if (emailError) onNotice(`Meetup updated, but email failed: ${emailError}`);
  }
  async function changeFriend(task) {
    await run(async () => {
      await task();
      await read(
        supabase
          .from("site_settings")
          .update({ trusted_friends_last_updated: new Date().toISOString() })
          .eq("id", 1)
          .select("id")
          .single(),
      );
    });
  }
  async function addFriend(category) {
    const value = (await ask("Enter your friend's name:"))?.trim();
    if (!value) return;
    await changeFriend(() =>
      read(
        supabase.from("trusted_friends").insert({
          name: value,
          category,
          position:
            Math.max(
              0,
              ...(data.friends || []).map((item) => item.position || 0),
            ) + 1,
        }),
      ),
    );
  }
  async function moveFriend(friend, direction) {
    const siblings = data.friends.filter(
      (item) => item.category === friend.category,
    );
    const neighbor =
      siblings[siblings.findIndex((item) => item.id === friend.id) + direction];
    if (!neighbor) return;
    await changeFriend(async () => {
      await read(
        supabase
          .from("trusted_friends")
          .update({ position: neighbor.position })
          .eq("id", friend.id)
          .select("id")
          .single(),
      );
      await read(
        supabase
          .from("trusted_friends")
          .update({ position: friend.position })
          .eq("id", neighbor.id)
          .select("id")
          .single(),
      );
    });
  }
  async function changeRestriction(remove) {
    if (!target) return;
    await run(
      () =>
        read(
          supabase.rpc("manage_user_restriction", {
            target_user: target,
            restricted_action: action,
            until_at: remove
              ? null
              : new Date(Date.now() + Number(days) * 86400000).toISOString(),
          }),
        ),
      remove ? "Restriction removed." : "Restriction applied.",
    );
  }
  return (
    <div className="captain-page">
      <section className="calendar-container">
        <h1 className="calendar-title">Captain Control Center</h1>
        <p>Manage meetups, community settings, music, and security systems.</p>
        <div className="captain-status" role="status">
          {notice || "Captain access confirmed. Welcome to the control center."}
        </div>
        <button
          type="button"
          className="captain-refresh"
          onClick={onRefresh}
          disabled={busy || refreshing}
          aria-busy={refreshing}
        >
          {refreshing ? "↻ Refreshing…" : "↻ Refresh panel"}
        </button>
      </section>
      <fieldset className="captain-controls" disabled={busy}>
        <CaptainSection
          id="community-operations"
          icon={<Megaphone />}
          title="Community Operations"
          description="Publish announcements, review reports, inspect audit history, and manage maintenance."
          status="Community tools"
          tone="blue"
        >
          {communityOperations}
        </CaptainSection>
        <CaptainSection
          id="meetup-management"
          icon="📅"
          title="Meetup Management"
          description="Manage incoming requests and scheduled events."
          status={
            pending.length ? `${pending.length} Pending` : "No Pending Requests"
          }
          tone={pending.length ? "yellow" : "green"}
          defaultOpen
        >
          {["pending", "approved"].map((status) => (
            <div className="captain-section" key={status}>
              <h2>
                {status === "pending"
                  ? "Pending Meetup Requests"
                  : "Scheduled Meetups"}
              </h2>
              <p>
                {status === "pending"
                  ? "Requests waiting for approval:"
                  : "Approved upcoming meetups:"}
              </p>
              <div className="captain-meetup-grid">
                {!data.meetups?.some((item) => item.status === status) && (
                  <p>
                    {status === "pending"
                      ? "No pending meetup requests 🚀"
                      : "No scheduled meetups yet 🚀"}
                  </p>
                )}
                {data.meetups
                  ?.filter((item) => item.status === status)
                  .map((item) => (
                    <article className="meetup-request-card" key={item.id}>
                      <h3>{name(item.user_id)}</h3>
                      <p>
                        👥 With{" "}
                        {item.with_user_id
                          ? name(item.with_user_id)
                          : "the Captain"}
                      </p>
                      {item.with_user_id && (
                        <p>✉️ Invitation {item.invitee_status || "pending"}</p>
                      )}
                      <p>
                        📅{" "}
                        {meetupInstant(item).toLocaleDateString(undefined, {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                        })}
                      </p>
                      <p>
                        ⏰{" "}
                        {meetupInstant(item).toLocaleTimeString(undefined, {
                          hour: "numeric",
                          minute: "2-digit",
                          timeZoneName: "short",
                        })}
                      </p>
                      <p>⌛ {item.duration} hour(s)</p>
                      <p>💬 {item.message || "No message"}</p>
                      {status === "pending" &&
                        requiresCaptainApproval(item) && (
                          <div className="captain-actions">
                            <button
                              className="approve"
                              disabled={
                                Boolean(item.with_user_id) &&
                                item.invitee_status !== "accepted"
                              }
                              title={
                                item.with_user_id &&
                                item.invitee_status !== "accepted"
                                  ? "Waiting for the invited member to accept"
                                  : "Approve meetup"
                              }
                              onClick={() => decideMeetup(item, "approved")}
                            >
                              ✅ Approve
                            </button>
                            <button
                              className="deny"
                              onClick={() => decideMeetup(item, "denied")}
                            >
                              ❌ Deny
                            </button>
                          </div>
                        )}
                      {status === "pending" &&
                        !requiresCaptainApproval(item) && (
                          <p className="micro-copy">
                            Waiting for the invited crew member. This meetup
                            will confirm automatically when they accept.
                          </p>
                        )}
                    </article>
                  ))}
              </div>
            </div>
          ))}
        </CaptainSection>
        <CaptainSection
          id="community-management"
          icon="👥"
          title="Community Management"
          description="Manage trusted friends and community sections."
          status="Community System"
        >
          <div className="captain-section">
            <h2>Trusted Friends Manager</h2>
            <p>Manage who appears on the Trust In Friends page.</p>
            {[
              ["fully", "Fully Trusted Friends", "Fully Trusted"],
              ["semi", "Semi Trusted Friends", "Semi Trusted"],
              ["irl", "IRL Friends", "IRL Friend"],
            ].map(([category, label, short]) => (
              <div className="trust-editor-category" key={category}>
                <h3>{label}</h3>
                {data.friends
                  ?.filter((item) => item.category === category)
                  .map((friend, index, list) => (
                    <div className="trusted-edit-card" key={friend.id}>
                      <span>
                        #{index + 1} {friend.name}
                      </span>
                      <div className="captain-actions">
                        <button
                          disabled={index === 0}
                          onClick={() => moveFriend(friend, -1)}
                          aria-label={`Move ${friend.name} up`}
                        >
                          ⬆
                        </button>
                        <button
                          disabled={index === list.length - 1}
                          onClick={() => moveFriend(friend, 1)}
                          aria-label={`Move ${friend.name} down`}
                        >
                          ⬇
                        </button>
                        <button
                          aria-label={`Remove ${friend.name}`}
                          onClick={async () => {
                            if (
                              await ask(
                                `Remove ${friend.name} from trusted friends?`,
                                false,
                              )
                            )
                              changeFriend(() =>
                                read(
                                  supabase
                                    .from("trusted_friends")
                                    .delete()
                                    .eq("id", friend.id),
                                ),
                              );
                          }}
                        >
                          ❌
                        </button>
                      </div>
                    </div>
                  ))}
                <button
                  className="captain-button"
                  onClick={() => addFriend(category)}
                >
                  Add {short}
                </button>
              </div>
            ))}
          </div>
        </CaptainSection>
        <CaptainSection
          id="music-management"
          icon="🎵"
          title="Music Management"
          description="Manage artists, songs, and genres shown on the Music page."
          status={`${data.artists?.length || 0} Artists · ${data.songs?.length || 0} Songs · ${data.genres?.length || 0} Genres`}
        >
          <CaptainMusic data={data} run={run} ask={ask} onNotice={onNotice} />
        </CaptainSection>
        <CaptainSection
          id="message-management"
          icon="💬"
          title="Message Management"
          description="Review a conversation when a crew member opens a Discord ticket."
        >
          <CaptainMessages
            refreshVersion={refreshVersion}
            data={data}
            user={user}
            run={run}
            onNotice={onNotice}
          />
        </CaptainSection>
        <CaptainSection
          id="reports-management"
          icon="🚩"
          title="Member Reports"
          description="Review private reports and open the reported member’s moderation controls."
          status={`${data.reports?.filter((item) => item.status === "open").length || 0} Open`}
          tone={
            data.reports?.some((item) => item.status === "open")
              ? "yellow"
              : "green"
          }
        >
          <CaptainReports
            reports={data.reports}
            user={user}
            name={name}
            run={run}
            setTarget={setTarget}
          />
        </CaptainSection>
        <CaptainSection
          id="moderation-management"
          icon="⚖️"
          title="User Moderation"
          description="Review active actions and manage crew access."
        >
          <div className="captain-section">
            <h2>Moderation appeals</h2>
            <p>
              Review the restriction, member explanation, and decision history
              together.
            </p>
            <CaptainAppeals
              appeals={data.appeals || []}
              user={user}
              name={name}
              run={run}
              setTarget={setTarget}
            />
          </div>
          <div className="captain-moderation-form">
            <label>
              User
              <select
                value={target}
                onChange={(event) => setTarget(event.target.value)}
              >
                <option value="">Choose a user</option>
                {data.crew?.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.username}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Action
              <select
                value={action}
                onChange={(event) => setAction(event.target.value)}
              >
                {Object.entries(restrictionNames).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Duration
              <select
                value={days}
                onChange={(event) => setDays(event.target.value)}
              >
                {[
                  [1, "1 day"],
                  [7, "7 days"],
                  [30, "30 days"],
                  [90, "90 days"],
                  [365, "1 year"],
                ].map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <button disabled={!target} onClick={() => changeRestriction(false)}>
              Apply restriction
            </button>
            <button disabled={!target} onClick={() => changeRestriction(true)}>
              Remove restriction
            </button>
            <button
              disabled={!target || target === user.id}
              className="captain-moderation-danger"
              onClick={() => removeAccount("delete")}
            >
              Delete account only
            </button>
            <button
              disabled={!target || target === user.id}
              className="captain-moderation-danger"
              onClick={() => removeAccount("ban")}
            >
              Permanently ban and delete account
            </button>
            <p className="captain-moderation-selected">
              {!target
                ? "Choose a user to review their restrictions."
                : selectedRestrictions.length
                  ? `Selected user: ${selectedRestrictions.map((item) => `${restrictionNames[item.action]} until ${new Date(item.expires_at).toLocaleString()}`).join(" · ")}`
                  : "Selected user has no active restrictions."}
            </p>
          </div>
          <div className="captain-moderation-overview">
            <div className="captain-moderation-overview-heading">
              <h3>
                Active moderation actions{" "}
                <span>({data.restrictions?.length || 0})</span>
              </h3>
              <p>
                Current restrictions across the crew. Expired actions are
                hidden.
              </p>
            </div>
            <div className="captain-moderation-action-list">
              {!data.restrictions?.length && (
                <p>No active restrictions across the crew.</p>
              )}
              {data.restrictions?.map((item) => (
                <article
                  className="captain-moderation-action-card"
                  key={`${item.user_id}:${item.action}`}
                >
                  <div>
                    <strong>{name(item.user_id)}</strong>
                    <span className="captain-moderation-action-name">
                      {restrictionNames[item.action]}
                    </span>
                    <small>
                      Expires {new Date(item.expires_at).toLocaleString()}
                    </small>
                  </div>
                  <button
                    onClick={() => {
                      setTarget(item.user_id);
                      setAction(item.action);
                    }}
                  >
                    Manage
                  </button>
                </article>
              ))}
            </div>
            <div className="captain-moderation-overview-heading captain-moderation-permanent-heading">
              <h3>Permanent bans</h3>
              <p>
                Blocked identities remain here after their accounts are deleted.
              </p>
            </div>
            <div className="captain-moderation-action-list">
              {banError && <p role="alert">{banError}</p>}
              {!banError && !bans.length && <p>No permanent bans.</p>}
              {bans.map((ban) => (
                <article
                  className="captain-moderation-action-card"
                  key={ban.id}
                >
                  <div>
                    <strong>{ban.username}</strong>
                    <small>{ban.email}</small>
                  </div>
                  <button
                    onClick={() =>
                      run(async () => {
                        await captainFunction("manage-permanent-ban", {
                          action: "unban",
                          banId: ban.id,
                        });
                        await loadBans();
                      }, "Identity unblocked. They can create a new account.")
                    }
                  >
                    Unban
                  </button>
                </article>
              ))}
            </div>
          </div>
        </CaptainSection>
        <CaptainSection
          id="security-management"
          icon="🛡️"
          title="Security Protocol"
          description="Manage safety controls and restricted systems."
          status={`Safe Mode ${data.settings?.safe_mode ? "ACTIVE" : "OFF"}`}
          tone={data.settings?.safe_mode ? "red" : "green"}
        >
          <div
            className={`safe-mode-control${data.settings?.safe_mode ? " safe-mode-active" : ""}`}
          >
            <h3>Security Protocol</h3>
            <button
              className={`safe-toggle${data.settings?.safe_mode ? " active" : ""}`}
              disabled={!data.settings}
              aria-pressed={Boolean(data.settings?.safe_mode)}
              onClick={() =>
                run(() =>
                  read(
                    supabase
                      .from("site_settings")
                      .update({
                        safe_mode: !data.settings.safe_mode,
                        updated_at: new Date().toISOString(),
                      })
                      .eq("id", 1)
                      .select("id")
                      .single(),
                  ),
                )
              }
            >
              🛡️ SAFE_MODE: {data.settings?.safe_mode ? "ACTIVE" : "OFF"}
            </button>
            <p>
              {data.settings?.safe_mode
                ? "Restricted systems locked."
                : "All restricted systems available."}
            </p>
          </div>
        </CaptainSection>
      </fieldset>
      {question && (
        <Modal title="Captain confirmation" onClose={() => answer(null)}>
          <form
            className="captain-confirm-form"
            onSubmit={(event) => {
              event.preventDefault();
              answer(
                question.input
                  ? event.currentTarget.elements.answer.value
                  : true,
              );
            }}
          >
            <Field label={question.text}>
              {question.input && (
                <input
                  name="answer"
                  autoFocus
                  required
                  autoComplete="off"
                  onKeyDown={(event) => {
                    if (event.key === "Escape") answer(null);
                  }}
                />
              )}
            </Field>
            <div className="captain-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => answer(null)}
              >
                Cancel
              </button>
              <button autoFocus={!question.input} className="button primary">
                Confirm
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
