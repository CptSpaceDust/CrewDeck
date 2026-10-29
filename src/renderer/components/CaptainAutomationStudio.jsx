import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Copy,
  Eye,
  History,
  Pause,
  Play,
  RotateCcw,
  ScanSearch,
  WandSparkles,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { Field } from "./ui";

const triggers = [
  ["message_report_count", "Message reaches a report count"],
  ["suspicious_attachment", "Suspicious attachment detected"],
  ["excessive_mentions", "Excessive mentions detected"],
  ["repeated_message_requests", "Repeated message requests"],
  ["rejected_friend_requests", "Several friend requests rejected"],
  ["failed_login_burst", "Failed login burst"],
  ["organizer_missing", "Meetup or event loses organizer"],
  ["group_without_owner", "Group has no owner"],
  ["orphaned_storage_object", "Orphaned storage object"],
];
const actions = [
  ["preserve_evidence", "Preserve evidence"],
  ["hide_content", "Temporarily hide content"],
  ["review_queue", "Add to review queue"],
  ["notify_staff", "Notify permitted staff"],
  ["warning", "Issue a warning"],
  ["restriction", "Apply a restriction"],
  ["repair_task", "Create a repair task"],
];

export default function CaptainAutomationStudio({ user, profiles = [] }) {
  const [rules, setRules] = useState([]);
  const [executions, setExecutions] = useState([]);
  const [queue, setQueue] = useState([]);
  const [repairs, setRepairs] = useState([]);
  const [versions, setVersions] = useState([]);
  const [preview, setPreview] = useState([]);
  const [selectedRule, setSelectedRule] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const [ruleRows, runRows, queueRows, repairRows] = await Promise.all([
      supabase
        .from("captain_automation_rules")
        .select("*")
        .order("updated_at", { ascending: false }),
      supabase
        .from("captain_automation_executions")
        .select("*,captain_automation_rules(name)")
        .order("executed_at", { ascending: false })
        .limit(100),
      supabase
        .from("captain_automation_review_queue")
        .select("*")
        .in("status", ["open", "reviewing"])
        .order("created_at", { ascending: false }),
      supabase
        .from("captain_automation_repair_tasks")
        .select("*")
        .in("status", ["open", "working"])
        .order("created_at", { ascending: false }),
    ]);
    setRules(ruleRows.data || []);
    setExecutions(runRows.data || []);
    setQueue(queueRows.data || []);
    setRepairs(repairRows.data || []);
    setNotice(
      ruleRows.error?.message ||
        runRows.error?.message ||
        queueRows.error?.message ||
        repairRows.error?.message ||
        "",
    );
  }, []);
  useEffect(() => {
    load();
    const channel = supabase.channel(`captain-automation-studio-${user.id}`);
    for (const table of [
      "captain_automation_rules",
      "captain_automation_executions",
      "captain_automation_review_queue",
      "captain_automation_repair_tasks",
    ])
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        load,
      );
    channel.subscribe();
    return () => supabase.removeChannel(channel);
  }, [load, user.id]);
  const names = useMemo(
    () =>
      Object.fromEntries(
        profiles.map((person) => [person.id, person.username]),
      ),
    [profiles],
  );

  async function createRule(event) {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    const form = new FormData(event.currentTarget);
    const selectedActions = form.getAll("actions");
    if (!selectedActions.length) {
      setBusy(false);
      setNotice("Choose at least one action.");
      return;
    }
    const memberFacing = selectedActions.some((item) =>
      ["hide_content", "warning", "restriction"].includes(item),
    );
    const explanation = String(form.get("explanation") || "").trim();
    if (memberFacing && explanation.length < 10) {
      setBusy(false);
      setNotice(
        "Member-facing actions need a clear reason of at least 10 characters.",
      );
      return;
    }
    const row = {
      name: form.get("name"),
      description: form.get("description") || "",
      trigger_type: form.get("trigger_type"),
      conditions: { threshold: Number(form.get("threshold") || 1) },
      actions: selectedActions,
      explanation,
      action_config: {
        hide_minutes: Number(form.get("hide_minutes") || 60),
        restriction_action: form.get("restriction_action") || "messaging",
        restriction_days: Number(form.get("restriction_days") || 1),
      },
      exempt_user_ids: form.getAll("exempt_user_ids"),
      exempt_roles: form
        .getAll("exempt_roles")
        .map((item) => item.toLowerCase()),
      enabled: false,
      test_mode: true,
      max_runs_per_window: Number(form.get("max_runs_per_window") || 20),
      max_runs_per_user: Number(form.get("max_runs_per_user") || 3),
      rate_window_minutes: Number(form.get("rate_window_minutes") || 60),
      created_by: user.id,
      updated_by: user.id,
    };
    const { data, error } = await supabase
      .from("captain_automation_rules")
      .insert(row)
      .select("id")
      .single();
    setBusy(false);
    setNotice(error?.message || "Rule saved in paused test mode.");
    if (!error) {
      event.currentTarget.reset();
      setSelectedRule(data.id);
      await load();
    }
  }
  async function updateRule(rule, changes, message) {
    setBusy(true);
    const { error } = await supabase
      .from("captain_automation_rules")
      .update({ ...changes, updated_by: user.id })
      .eq("id", rule.id);
    setBusy(false);
    setNotice(error?.message || message);
    if (!error) load();
  }
  async function showPreview(rule) {
    setSelectedRule(rule.id);
    setBusy(true);
    const [{ data, error }, history] = await Promise.all([
      supabase.rpc("preview_captain_automation_rule", { rule_key: rule.id }),
      supabase
        .from("captain_automation_rule_versions")
        .select("*")
        .eq("rule_id", rule.id)
        .order("version", { ascending: false }),
    ]);
    setBusy(false);
    setPreview(data || []);
    setVersions(history.data || []);
    setNotice(
      error?.message ||
        `Preview found ${(data || []).length} recent match${data?.length === 1 ? "" : "es"}.`,
    );
  }
  async function duplicate(rule) {
    const { error } = await supabase.rpc("duplicate_captain_automation_rule", {
      rule_key: rule.id,
    });
    setNotice(error?.message || "Rule duplicated in paused test mode.");
    if (!error) load();
  }
  async function scan() {
    setBusy(true);
    const { data, error } = await supabase.rpc(
      "scan_captain_automation_integrity",
    );
    setBusy(false);
    setNotice(
      error?.message ||
        `Integrity scan created ${data || 0} automation event${data === 1 ? "" : "s"}.`,
    );
    if (!error) load();
  }
  async function undo(item) {
    const { data, error } = await supabase.rpc(
      "undo_captain_automation_execution",
      { execution_key: item.id },
    );
    setNotice(
      error?.message ||
        (data
          ? "Reversible automation actions were undone."
          : "This execution has no active reversible actions."),
    );
    if (!error) load();
  }
  async function updateQueueItem(table, id, status) {
    const { error } = await supabase
      .from(table)
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id);
    setNotice(error?.message || "Queue item updated.");
    if (!error) load();
  }
  return (
    <div className="automation-studio">
      <header className="automation-studio-hero">
        <WandSparkles />
        <div>
          <span>CAPTAIN ONLY</span>
          <h2>Automation Studio</h2>
          <p>
            Build explainable moderation and repair rules, preview their reach,
            and test safely before going live.
          </p>
        </div>
        <button className="button secondary" disabled={busy} onClick={scan}>
          <ScanSearch /> Scan integrity
        </button>
      </header>
      {notice && (
        <p className="form-message" role="status">
          {notice}
        </p>
      )}
      <form className="automation-builder panel" onSubmit={createRule}>
        <header>
          <strong>New automation</strong>
          <small>New rules always start paused in test mode.</small>
        </header>
        <div className="automation-flow">
          <section>
            <span>WHEN</span>
            <Field label="Trigger">
              <select name="trigger_type">
                {triggers.map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
          </section>
          <section>
            <span>IF</span>
            <Field label="Threshold">
              <input
                name="threshold"
                type="number"
                min="1"
                max="1000"
                defaultValue="3"
              />
            </Field>
          </section>
          <section>
            <span>THEN</span>
            <div className="automation-actions">
              {actions.map(([value, label]) => (
                <label className="check-field" key={value}>
                  <input name="actions" type="checkbox" value={value} />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </section>
        </div>
        <div className="form-grid">
          <Field label="Rule name">
            <input name="name" required minLength="3" maxLength="120" />
          </Field>
          <Field label="Description">
            <input name="description" maxLength="500" />
          </Field>
        </div>
        <Field
          label="Explainable reason"
          hint="Required for hiding content, warnings, or restrictions"
        >
          <textarea
            name="explanation"
            required
            minLength="3"
            maxLength="1000"
            rows="3"
          />
        </Field>
        <details>
          <summary>Exemptions and action settings</summary>
          <div className="automation-settings-grid">
            <Field label="Exempt members">
              <select name="exempt_user_ids" multiple>
                {profiles.map((person) => (
                  <option value={person.id} key={person.id}>
                    {person.username}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Exempt roles">
              <select name="exempt_roles" multiple>
                <option value="captain">Captain</option>
                <option value="moderator">Moderator</option>
                <option value="trusted person">Trusted Person</option>
              </select>
            </Field>
            <Field label="Hide for minutes">
              <input
                name="hide_minutes"
                type="number"
                min="1"
                max="10080"
                defaultValue="60"
              />
            </Field>
            <Field label="Restriction">
              <select name="restriction_action">
                <option value="messaging">Messaging</option>
                <option value="calls">Calling</option>
                <option value="comments">Comments</option>
                <option value="meetups">Meetups</option>
                <option value="site">Site access</option>
              </select>
            </Field>
            <Field label="Restriction days">
              <input
                name="restriction_days"
                type="number"
                min="1"
                max="365"
                defaultValue="1"
              />
            </Field>
            <Field label="Rule limit">
              <input
                name="max_runs_per_window"
                type="number"
                min="1"
                defaultValue="20"
              />
            </Field>
            <Field label="Per-member limit">
              <input
                name="max_runs_per_user"
                type="number"
                min="1"
                defaultValue="3"
              />
            </Field>
            <Field label="Window minutes">
              <input
                name="rate_window_minutes"
                type="number"
                min="1"
                defaultValue="60"
              />
            </Field>
          </div>
        </details>
        <button className="button primary" disabled={busy}>
          Save paused test rule
        </button>
      </form>
      <section className="automation-rule-list">
        <header>
          <h3>Rules</h3>
          <span>{rules.filter((rule) => rule.enabled).length} active</span>
        </header>
        {rules.map((rule) => (
          <article className="panel" key={rule.id}>
            <div>
              <span
                className={`automation-state ${rule.enabled ? "active" : "paused"}`}
              >
                {rule.enabled
                  ? rule.test_mode
                    ? "TESTING"
                    : "LIVE"
                  : "PAUSED"}
              </span>
              <h3>{rule.name}</h3>
              <p>
                {triggers.find(([key]) => key === rule.trigger_type)?.[1]} ·
                threshold {rule.conditions?.threshold || 1}
              </p>
              <small>
                v{rule.version} · {rule.max_runs_per_user} per member /{" "}
                {rule.rate_window_minutes} min
              </small>
            </div>
            <div className="automation-rule-actions">
              <button
                title="Preview affected records"
                onClick={() => showPreview(rule)}
              >
                <Eye /> Preview
              </button>
              <button
                title={rule.enabled ? "Pause" : "Resume"}
                onClick={() =>
                  updateRule(
                    rule,
                    { enabled: !rule.enabled },
                    rule.enabled
                      ? "Rule paused."
                      : "Rule resumed in its current mode.",
                  )
                }
              >
                {rule.enabled ? <Pause /> : <Play />}
                {rule.enabled ? "Pause" : "Resume"}
              </button>
              <button
                onClick={() =>
                  updateRule(
                    rule,
                    { test_mode: !rule.test_mode },
                    rule.test_mode
                      ? "Rule changed to live mode."
                      : "Rule changed to test mode.",
                  )
                }
              >
                {rule.test_mode ? "Go live" : "Use test mode"}
              </button>
              <button onClick={() => duplicate(rule)}>
                <Copy /> Duplicate
              </button>
            </div>
          </article>
        ))}
      </section>
      {selectedRule && (
        <section className="automation-preview-grid">
          <div className="panel">
            <h3>
              <Eye /> Preview
            </h3>
            {preview.map((item) => (
              <article key={item.event_id}>
                <strong>
                  {names[item.subject_user_id] || item.record_type}
                </strong>
                <small>{new Date(item.occurred_at).toLocaleString()}</small>
                <code>{JSON.stringify(item.payload)}</code>
              </article>
            ))}
            {!preview.length && <p>No recent records match this rule.</p>}
          </div>
          <div className="panel">
            <h3>
              <History /> Version history
            </h3>
            {versions.map((item) => (
              <details key={item.id}>
                <summary>
                  Version {item.version} ·{" "}
                  {new Date(item.created_at).toLocaleString()}
                </summary>
                <pre>{JSON.stringify(item.snapshot, null, 2)}</pre>
              </details>
            ))}
          </div>
        </section>
      )}
      <section className="automation-queue-grid">
        <div className="panel">
          <h3>Captain review queue</h3>
          {queue.map((item) => (
            <article key={item.id}>
              <div>
                <strong>{item.title}</strong>
                <p>{item.reason}</p>
                <small>{names[item.subject_user_id] || "System record"}</small>
              </div>
              <div>
                <button
                  onClick={() =>
                    updateQueueItem(
                      "captain_automation_review_queue",
                      item.id,
                      "reviewing",
                    )
                  }
                >
                  Reviewing
                </button>
                <button
                  onClick={() =>
                    updateQueueItem(
                      "captain_automation_review_queue",
                      item.id,
                      "resolved",
                    )
                  }
                >
                  Resolve
                </button>
              </div>
            </article>
          ))}
          {!queue.length && <p>No automation reviews are waiting.</p>}
        </div>
        <div className="panel">
          <h3>Repair tasks</h3>
          {repairs.map((item) => (
            <article key={item.id}>
              <div>
                <strong>{item.record_type}</strong>
                <p>
                  {item.problem?.storage_path ||
                    item.record_id ||
                    "Mismatched record"}
                </p>
              </div>
              <div>
                <button
                  onClick={() =>
                    updateQueueItem(
                      "captain_automation_repair_tasks",
                      item.id,
                      "working",
                    )
                  }
                >
                  Working
                </button>
                <button
                  onClick={() =>
                    updateQueueItem(
                      "captain_automation_repair_tasks",
                      item.id,
                      "repaired",
                    )
                  }
                >
                  Repaired
                </button>
              </div>
            </article>
          ))}
          {!repairs.length && <p>No repair tasks are waiting.</p>}
        </div>
      </section>
      <section className="automation-history panel">
        <h3>Recent executions</h3>
        {executions.map((item) => (
          <article key={item.id}>
            <div>
              <strong>
                {item.captain_automation_rules?.name || "Automation"}
              </strong>
              <span className={`automation-state ${item.status}`}>
                {item.status}
              </span>
              <small>
                {new Date(item.executed_at).toLocaleString()} ·{" "}
                {names[item.subject_user_id] || item.record_type || "System"}
              </small>
              <p>{item.matched_reason}</p>
            </div>
            {item.status === "executed" && (
              <button onClick={() => undo(item)}>
                <RotateCcw /> Undo reversible actions
              </button>
            )}
          </article>
        ))}
      </section>
    </div>
  );
}
