import { useEffect, useMemo, useState } from "react";
import { BellRing, Clock3, Radio, X } from "lucide-react";
import { supabase } from "../lib/supabase";
import { Field, Modal } from "./ui";

export const PULSE_LABELS = {
  free_now: "Free now",
  free_later: "Free later",
  looking_to_play: "Looking to play",
  available_to_help: "Available to help",
  busy: "Busy",
  do_not_disturb: "Do not disturb",
};

export function PulseBadge({ pulse, compact = false }) {
  if (!pulse || Date.parse(pulse.expires_at) <= Date.now()) return null;
  return (
    <span
      className={`pulse-badge ${pulse.status}${compact ? " compact" : ""}`}
      title={pulse.note || PULSE_LABELS[pulse.status]}
    >
      <Radio />
      <strong>{PULSE_LABELS[pulse.status] || "Available"}</strong>
      {!compact && pulse.note && <small>{pulse.note}</small>}
    </span>
  );
}

export function AvailabilityPulseEditor({ user, onChanged }) {
  const [pulse, setPulse] = useState(null),
    [open, setOpen] = useState(false),
    [notice, setNotice] = useState("");
  async function load() {
    const { data } = await supabase
      .from("availability_pulses")
      .select("*")
      .eq("user_id", user.id)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    setPulse(data || null);
  }
  useEffect(() => {
    load();
    const channel = supabase
      .channel(`my-pulse-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "availability_pulses",
          filter: `user_id=eq.${user.id}`,
        },
        () => load(),
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [user.id]);
  async function save(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const preset = String(form.get("expires"));
    const expiresAt =
      preset === "custom"
        ? new Date(String(form.get("custom_expiry"))).toISOString()
        : new Date(Date.now() + Number(preset) * 60000).toISOString();
    const row = {
      user_id: user.id,
      status: form.get("status"),
      note: String(form.get("note") || "").trim() || null,
      audience: form.get("audience"),
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("availability_pulses").upsert(row);
    setNotice(error?.message || "Availability pulse is live.");
    if (!error) {
      setOpen(false);
      await load();
      onChanged?.();
    }
  }
  async function end() {
    const { error } = await supabase
      .from("availability_pulses")
      .delete()
      .eq("user_id", user.id);
    setNotice(error?.message || "Availability pulse ended.");
    if (!error) {
      setPulse(null);
      onChanged?.();
    }
  }
  return (
    <section className="panel availability-pulse-editor">
      <div>
        <span className="section-kicker">Availability Pulse</span>
        <h2>What are you up for?</h2>
        <p>
          Share a temporary activity status without changing your online
          presence.
        </p>
      </div>
      {pulse ? (
        <div className="pulse-current">
          <PulseBadge pulse={pulse} />
          <span>
            <Clock3 /> Ends {new Date(pulse.expires_at).toLocaleString()}
          </span>
          <button className="button ghost" onClick={() => setOpen(true)}>
            Replace
          </button>
          <button className="icon-button" onClick={end} aria-label="End pulse">
            <X />
          </button>
        </div>
      ) : (
        <button className="button primary" onClick={() => setOpen(true)}>
          Set availability
        </button>
      )}
      {notice && (
        <p className="micro-copy" role="status">
          {notice}
        </p>
      )}
      {open && (
        <Modal title="Set your availability" onClose={() => setOpen(false)}>
          <form className="stack-form" onSubmit={save}>
            <Field label="Status">
              <select name="status" defaultValue={pulse?.status || "free_now"}>
                {Object.entries(PULSE_LABELS).map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Short activity note" hint="Optional · 160 characters">
              <input
                name="note"
                maxLength="160"
                defaultValue={pulse?.note || ""}
                placeholder="World hopping in VRChat"
              />
            </Field>
            <Field label="Who can see this?">
              <select
                name="audience"
                defaultValue={pulse?.audience || "friends"}
              >
                <option value="everyone">Everyone</option>
                <option value="friends">Friends</option>
                <option value="close_friends">Close friends</option>
                <option value="selected_groups">Selected groups</option>
                <option value="only_me">Only me</option>
              </select>
            </Field>
            <Field label="Expires">
              <select name="expires" defaultValue="60">
                <option value="30">In 30 minutes</option>
                <option value="60">In 1 hour</option>
                <option value="180">In 3 hours</option>
                <option value="480">In 8 hours</option>
                <option value="1440">Tomorrow</option>
                <option value="custom">Custom time below</option>
              </select>
            </Field>
            <Field label="Custom expiration">
              <input
                name="custom_expiry"
                type="datetime-local"
                min={new Date(Date.now() + 300000).toISOString().slice(0, 16)}
              />
            </Field>
            <button className="button primary">
              <BellRing /> Publish pulse
            </button>
          </form>
        </Modal>
      )}
    </section>
  );
}

export function useVisiblePulses() {
  const [pulses, setPulses] = useState([]);
  useEffect(() => {
    let active = true;
    const load = () =>
      supabase
        .from("availability_pulses")
        .select("*")
        .gt("expires_at", new Date().toISOString())
        .then(({ data }) => active && setPulses(data || []));
    load();
    const channel = supabase
      .channel("visible-availability-pulses")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "availability_pulses" },
        load,
      )
      .subscribe();
    const timer = setInterval(load, 60000);
    return () => {
      active = false;
      clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, []);
  return useMemo(
    () => Object.fromEntries(pulses.map((item) => [item.user_id, item])),
    [pulses],
  );
}

export async function setPulseAlert(subscriberId, subjectId, enabled = true) {
  return supabase
    .from("availability_pulse_alerts")
    .upsert(
      { subscriber_id: subscriberId, subject_id: subjectId, enabled },
      { onConflict: "subscriber_id,subject_id" },
    );
}
