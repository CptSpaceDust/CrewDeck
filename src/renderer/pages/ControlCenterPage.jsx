import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Copy,
  Link2,
  Radio,
  RefreshCw,
  ShieldAlert,
  Unlink2,
} from "lucide-react";
import { promptInApp, confirmInApp } from "../components/InAppDialog";
import { Loading, Modal, PageHeader } from "../components/ui";
import { supabase } from "../lib/supabase";

const initialControl = () => ({
  intensity: 0,
  duration: 1,
  warningEnabled: false,
  warningDelay: 1,
  synced: false,
  presets: [],
  selectedPreset: "",
});

const initialSafety = () => ({
  max_intensity: 100,
  max_duration: 30,
  high_intensity_threshold: 40,
  cooldown_seconds: 3,
  max_intensity_step: 15,
  hold_milliseconds: 800,
  require_hold_to_shock: true,
});

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function copyControlText(value) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {}
  const field = document.createElement("textarea");
  field.value = value;
  field.readOnly = true;
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.appendChild(field);
  field.select();
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {}
  field.remove();
  return copied;
}

function HoldCommandButton({ holdMs, className = "", disabled, children, onActivate, onRelease }) {
  const timer = useRef(null);
  const activated = useRef(false);
  const [holding, setHolding] = useState(false);
  const stop = () => {
    window.clearTimeout(timer.current);
    setHolding(false);
    if (activated.current) onRelease?.();
    activated.current = false;
  };
  return (
    <button
      className={`${className}${holding ? " holding" : ""}`}
      disabled={disabled}
      style={{ "--hold-ms": `${holdMs}ms` }}
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={(event) => {
        if (disabled) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        setHolding(true);
        timer.current = window.setTimeout(async () => {
          activated.current = true;
          await onActivate?.();
        }, Math.max(0, holdMs));
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onPointerLeave={(event) => {
        if (event.buttons) stop();
      }}
    >
      {children}
    </button>
  );
}

function badgesOf(profile) {
  if (Array.isArray(profile?.badges)) return profile.badges;
  if (typeof profile?.badges !== "string") return [];
  try {
    const parsed = JSON.parse(profile.badges);
    if (Array.isArray(parsed)) return parsed;
  } catch {}
  return profile.badges
    .replace(/[\[\]"]/g, "")
    .split(",")
    .map((badge) => badge.trim())
    .filter(Boolean);
}

function canUseControlCenter(profile) {
  return badgesOf(profile).some(
    (badge) => badge.trim().toLowerCase() === "trusted person",
  );
}

async function functionError(error, fallback) {
  try {
    const body = await error?.context?.json?.();
    return body?.error || error?.message || fallback;
  } catch {
    return error?.message || fallback;
  }
}

function Dial({
  label,
  value,
  min,
  max,
  suffix = "",
  tone = "danger",
  disabled = false,
  onChange,
  onRelease,
}) {
  const percent = max === min ? 0 : (value - min) / (max - min);
  const hue =
    tone === "safe"
      ? 190 - percent * 70
      : tone === "duration"
        ? 190 - percent * 160
        : 190 - percent * 188;
  function update(event) {
    if (disabled) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - (rect.left + rect.width / 2);
    const y = event.clientY - (rect.top + rect.height / 2);
    const pointerAngle = (Math.atan2(y, x) * 180) / Math.PI;
    let angle = (pointerAngle - 135 + 360) % 360;
    if (angle > 270) angle = value >= (min + max) / 2 ? 270 : 0;
    onChange(Math.round(min + (angle / 270) * (max - min)));
  }
  function key(event) {
    if (disabled) return;
    let next = value;
    if (event.key === "ArrowUp" || event.key === "ArrowRight")
      next = Math.min(max, value + 1);
    else if (event.key === "ArrowDown" || event.key === "ArrowLeft")
      next = Math.max(min, value - 1);
    else if (event.key === "Home") next = min;
    else if (event.key === "End") next = max;
    else return;
    event.preventDefault();
    onChange(next);
  }
  return (
    <div className="control-dial-group">
      <span>{label}</span>
      <div
        className={`control-dial${disabled ? " disabled" : ""}`}
        style={{
          "--dial-angle": `${percent * 270}deg`,
          "--dial-color": `hsl(${hue} 88% 62%)`,
        }}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-disabled={disabled}
        onKeyDown={key}
        onPointerDown={(event) => {
          if (disabled) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          update(event);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            update(event);
        }}
        onPointerUp={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
          onRelease?.();
        }}
        onPointerCancel={() => onRelease?.()}
      >
        <div className="control-dial-face">
          <b>
            {value}
            {suffix}
          </b>
        </div>
      </div>
    </div>
  );
}

export default function ControlCenterPage({ user, profile }) {
  const [access, setAccess] = useState("checking");
  const [devices, setDevices] = useState([]);
  const [controls, setControls] = useState({});
  const [safety, setSafety] = useState({});
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [live, setLive] = useState(false);
  const [liveMode, setLiveMode] = useState("vibrate");
  const [pendingWarning, setPendingWarning] = useState(null);
  const [emergencyActive, setEmergencyActive] = useState(false);
  const [shareLink, setShareLink] = useState("");
  const [linkBuilderOpen, setLinkBuilderOpen] = useState(false);
  const [linkCreating, setLinkCreating] = useState(false);
  const [linkSettings, setLinkSettings] = useState({ expiryMinutes: 1440, maxUses: 1, devices: {} });
  const commandGate = useRef(new Map());
  const warningRun = useRef(null);
  const lastLiveCommand = useRef(0);
  const emergencyTimer = useRef(null);
  const liveQueue = useRef({
    pending: new Map(),
    running: false,
    generation: 0,
  });

  const verifyAccess = useCallback(async () => {
    const {
      data: { user: verifiedUser },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !verifiedUser || verifiedUser.id !== user.id) {
      setAccess("denied");
      return false;
    }
    const [{ data: verifiedProfile, error: profileError }, settings] =
      await Promise.all([
        supabase
          .from("profiles")
          .select("badges")
          .eq("id", verifiedUser.id)
          .single(),
        supabase.from("site_settings").select("safe_mode").eq("id", 1).single(),
      ]);
    if (profileError || !canUseControlCenter(verifiedProfile)) {
      setAccess("denied");
      return false;
    }
    if (settings.error || settings.data?.safe_mode) {
      setAccess(settings.data?.safe_mode ? "locked" : "denied");
      return false;
    }
    setAccess("allowed");
    return true;
  }, [user.id]);

  const loadLogs = useCallback(async () => {
    const { data, error } = await supabase
      .from("control_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(10);
    if (!error) setLogs(data || []);
  }, []);

  const loadPresets = useCallback(
    async (nextDevices) => {
      const { data } = await supabase
        .from("shocker_presets")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });
      const rows = data || [];
      setControls((current) => {
        const next = { ...current };
        for (const device of nextDevices)
          next[device.id] = {
            ...initialControl(),
            ...next[device.id],
            presets: rows.filter((preset) => preset.shocker_id === device.id),
          };
        return next;
      });
    },
    [user.id],
  );

  const loadSafety = useCallback(
    async (nextDevices) => {
      const { data } = await supabase
        .from("control_device_safety_limits")
        .select("*")
        .eq("user_id", user.id);
      const rows = data || [];
      setSafety((current) =>
        Object.fromEntries(
          nextDevices.map((device) => [
            device.id,
            {
              ...initialSafety(),
              ...current[device.id],
              ...rows.find((row) => row.shocker_id === device.id),
            },
          ]),
        ),
      );
    },
    [user.id],
  );

  const loadDevices = useCallback(async () => {
    setLoading(true);
    setNotice("");
    try {
      if (!(await verifyAccess())) return;
      const { data, error } =
        await supabase.functions.invoke("openshock-devices");
      if (error)
        throw new Error(await functionError(error, "Unable to load devices."));
      if (data?.error) throw new Error(data.error);
      let nextDevices = data?.devices;
      if (!Array.isArray(nextDevices)) {
        const decoded =
          typeof data?.raw === "string" ? JSON.parse(data.raw) : data;
        nextDevices = decoded?.data?.[0]?.shockers || [];
      }
      setDevices(nextDevices);
      setControls((current) => {
        const next = {};
        for (const device of nextDevices)
          next[device.id] = { ...initialControl(), ...current[device.id] };
        return next;
      });
      await Promise.all([loadPresets(nextDevices), loadSafety(nextDevices), loadLogs()]);
      setNotice(nextDevices.length ? "" : "No connected devices were found.");
    } catch (error) {
      setNotice(error.message || "Unable to load the Control Center.");
    } finally {
      setLoading(false);
    }
  }, [loadLogs, loadPresets, loadSafety, verifyAccess]);

  useEffect(() => {
    loadDevices();
    const safety = supabase
      .channel(`control-center-safety-${user.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "site_settings" },
        verifyAccess,
      )
      .subscribe();
    const logChannel = supabase
      .channel(`control-center-logs-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "control_logs" },
        loadLogs,
      )
      .subscribe();
    return () => {
      warningRun.current = null;
      liveQueue.current.generation += 1;
      liveQueue.current.pending.clear();
      window.clearTimeout(emergencyTimer.current);
      supabase.removeChannel(safety);
      supabase.removeChannel(logChannel);
    };
  }, [loadDevices, loadLogs, user.id, verifyAccess]);

  function updateControl(id, patch, sync = true) {
    setControls((current) => {
      const next = {
        ...current,
        [id]: { ...initialControl(), ...current[id], ...patch },
      };
      if (sync && next[id].synced)
        for (const [targetId, target] of Object.entries(next))
          if (targetId !== id && target.synced)
            next[targetId] = { ...target, ...patch };
      return next;
    });
  }

  function toggleSync(id) {
    setControls((current) => {
      const next = { ...current };
      const enabled = !next[id]?.synced;
      const source = Object.values(next).find((item) => item.synced);
      next[id] = {
        ...initialControl(),
        ...next[id],
        ...(enabled && source
          ? {
              intensity: source.intensity,
              duration: source.duration,
              warningEnabled: source.warningEnabled,
              warningDelay: source.warningDelay,
            }
          : {}),
        synced: enabled,
      };
      return next;
    });
  }

  function syncAll() {
    setControls((current) => {
      const shouldSync = !Object.values(current).some((item) => item.synced);
      const source = Object.values(current)[0] || initialControl();
      return Object.fromEntries(
        Object.entries(current).map(([id, item]) => [
          id,
          {
            ...item,
            ...(shouldSync
              ? {
                  intensity: source.intensity,
                  duration: source.duration,
                  warningEnabled: source.warningEnabled,
                  warningDelay: source.warningDelay,
                }
              : {}),
            synced: shouldSync,
          },
        ]),
      );
    });
  }

  async function logCommand(device, action, intensity, duration) {
    await supabase.from("control_logs").insert({
      user_id: user.id,
      username: profile.username || "Unknown",
      avatar_url: profile.avatar || null,
      shocker_id: device.id,
      shocker_name: device.name || "Unknown Shocker",
      action,
      intensity: Number(intensity),
      duration: Number(duration),
    });
  }

  async function saveSafety(deviceId) {
    if (profile.rank?.trim().toLowerCase() !== "captain")
      throw new Error("Only the Captain can change device safety limits.");
    const values = { ...initialSafety(), ...safety[deviceId] };
    const { error } = await supabase.from("control_device_safety_limits").upsert(
      { user_id: user.id, shocker_id: deviceId, ...values, updated_at: new Date().toISOString() },
      { onConflict: "user_id,shocker_id" },
    );
    if (error) throw error;
    setNotice("Device safety limits saved.");
  }

  function openSafetyLinkBuilder() {
    setShareLink("");
    setLinkSettings({
      expiryMinutes: 1440,
      maxUses: 1,
      devices: Object.fromEntries(devices.map((device) => {
        const limits = safety[device.id] || initialSafety();
        return [device.id, { included: true, max_intensity: limits.max_intensity, max_duration: limits.max_duration, require_hold_to_shock: limits.require_hold_to_shock !== false, hold_milliseconds: limits.hold_milliseconds }];
      })),
    });
    setLinkBuilderOpen(true);
  }

  async function createSafetyLink() {
    const selectedDevices = devices.filter((device) => linkSettings.devices[device.id]?.included);
    if (!selectedDevices.length) throw new Error("Choose at least one device for the link.");
    const tokenBytes = crypto.getRandomValues(new Uint8Array(24));
    const token = [...tokenBytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    const tokenHash = await sha256(token);
    const expiresAt = new Date(Date.now() + Number(linkSettings.expiryMinutes) * 60 * 1000).toISOString();
    const { error } = await supabase.rpc("captain_create_control_access_link", {
      p_token_hash: tokenHash,
      p_expires_at: expiresAt,
      p_max_uses: Number(linkSettings.maxUses),
      p_devices: selectedDevices.map((device) => ({
        shocker_id: device.id,
        shocker_name: device.name || "Control module",
        max_intensity: linkSettings.devices[device.id].max_intensity,
        max_duration: linkSettings.devices[device.id].max_duration,
        require_hold_to_shock: linkSettings.devices[device.id].require_hold_to_shock,
        hold_milliseconds: linkSettings.devices[device.id].hold_milliseconds,
      })),
    });
    if (error) throw error;
    const link = `https://www.cptspacedust.com/control-center.html?control_invite=${token}`;
    setShareLink(link);
    const copied = await copyControlText(link);
    setNotice(copied ? `Guest link copied. It allows ${linkSettings.maxUses} new session${Number(linkSettings.maxUses) === 1 ? "" : "s"}.` : "Guest link created. Use the visible Copy button or select the link manually.");
  }

  async function sendCommand(
    device,
    action,
    intensity,
    duration,
    skipLog = false,
  ) {
    if (access !== "allowed") throw new Error("Control access is unavailable.");
    const fingerprint = `${device.id}:${action}:${Number(intensity)}:${Number(duration)}`;
    const lastSent = commandGate.current.get(fingerprint) || 0;
    if (action !== "stop" && Number(duration) > 0.3 && Date.now() - lastSent < 1200)
      throw new Error("Duplicate command blocked.");
    commandGate.current.set(fingerprint, Date.now());
    const { data, error } = await supabase.functions.invoke(
      "openshock-control",
      {
        body: {
          shocker_id: device.id,
          action,
          intensity: Number(intensity),
          duration: Number(duration),
        },
      },
    );
    if (error)
      throw new Error(await functionError(error, "The command was rejected."));
    if (!data?.success) throw new Error(data?.error || "The command failed.");
    if (!skipLog) await logCommand(device, action, intensity, duration);
  }

  async function stopTargets(id) {
    warningRun.current = null;
    setPendingWarning(null);
    await Promise.allSettled(
      targetDevices(id).map((device) => sendCommand(device, "stop", 0, 0, true)),
    );
  }

  function targetDevices(id) {
    const syncedIds = Object.entries(controls)
      .filter(([, control]) => control.synced)
      .map(([deviceId]) => deviceId);
    const ids = syncedIds.length ? syncedIds : [id];
    return devices.filter((device) => ids.includes(device.id));
  }

  async function runAction(id, action) {
    if (pendingWarning && action === "shock") {
      warningRun.current = null;
      setPendingWarning(null);
      setNotice("The pending shock was cancelled.");
      return;
    }
    const targets = targetDevices(id);
    if (!targets.length || busy) return;
    setBusy(true);
    setNotice("");
    const runId = crypto.randomUUID();
    try {
      for (const device of targets) {
        const control = controls[device.id] || initialControl();
        if (action === "shock" && control.warningEnabled) {
          warningRun.current = runId;
          setPendingWarning(id);
          setNotice(
            `Warning active for ${control.warningDelay} second${control.warningDelay === 1 ? "" : "s"}.`,
          );
          await sendCommand(
            device,
            "vibrate",
            control.intensity,
            control.warningDelay,
          );
          await new Promise((resolve) =>
            window.setTimeout(resolve, control.warningDelay * 1000),
          );
          if (warningRun.current !== runId) return;
        }
        await sendCommand(device, action, control.intensity, control.duration);
      }
      setNotice(
        `${action[0].toUpperCase()}${action.slice(1)} command sent to ${targets.length} device${targets.length === 1 ? "" : "s"}.`,
      );
    } catch (error) {
      setNotice(error.message || "The command could not be completed.");
    } finally {
      warningRun.current = null;
      setPendingWarning(null);
      setBusy(false);
    }
  }

  async function sendLive(id, value) {
    if (!live || value <= 0 || Date.now() - lastLiveCommand.current < 160)
      return;
    lastLiveCommand.current = Date.now();
    const queue = liveQueue.current;
    for (const device of targetDevices(id))
      queue.pending.set(device.id, { device, action: liveMode, value });
    if (queue.running) return;
    queue.running = true;
    const generation = queue.generation;
    try {
      while (queue.pending.size && generation === queue.generation) {
        const batch = [...queue.pending.values()];
        queue.pending.clear();
        await Promise.all(
          batch.map(({ device, action, value: latestValue }) =>
            sendCommand(device, action, latestValue, 0.3, true),
          ),
        );
      }
    } catch (error) {
      queue.pending.clear();
      setNotice(error.message || "Live control was interrupted.");
      setLive(false);
    } finally {
      queue.running = false;
    }
  }

  function stopLive(force = false) {
    if (!live && !force) return;
    liveQueue.current.generation += 1;
    liveQueue.current.pending.clear();
    setControls((current) =>
      Object.fromEntries(
        Object.entries(current).map(([id, item]) => [
          id,
          { ...item, intensity: 0 },
        ]),
      ),
    );
  }

  async function emergencyStop() {
    warningRun.current = null;
    setPendingWarning(null);
    setLive(false);
    liveQueue.current.generation += 1;
    liveQueue.current.pending.clear();
    stopLive(true);
    window.clearTimeout(emergencyTimer.current);
    setEmergencyActive(false);
    window.requestAnimationFrame(() => setEmergencyActive(true));
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("openshock-control", {
        body: { action: "stop_all" },
      });
      if (error || !data?.success) throw new Error(await functionError(error, data?.error || "Emergency stop failed."));
      setNotice(`Emergency stop sent to ${data.stopped} device${data.stopped === 1 ? "" : "s"}.`);
    } catch (error) {
      setNotice(error.message || "Emergency stop failed.");
    } finally {
      setBusy(false);
      emergencyTimer.current = window.setTimeout(
        () => setEmergencyActive(false),
        1400,
      );
    }
  }

  async function savePreset(device) {
    const control = controls[device.id];
    const name = await promptInApp("Name this device preset.", "", {
      title: "Save control preset",
      inputLabel: "Preset name",
      confirmLabel: "Save preset",
      maxLength: 40,
    });
    if (!name) return;
    const { error } = await supabase.from("shocker_presets").insert({
      user_id: user.id,
      shocker_id: device.id,
      preset_name: name,
      intensity: control.intensity,
      duration: control.duration,
      warning_enabled: control.warningEnabled,
      warning_delay: control.warningDelay,
    });
    if (error) setNotice(error.message);
    else {
      setNotice("Preset saved.");
      await loadPresets(devices);
    }
  }

  function loadPreset(device) {
    const control = controls[device.id];
    const preset = control.presets.find(
      (item) => String(item.id) === String(control.selectedPreset),
    );
    if (!preset) return;
    updateControl(device.id, {
      intensity: Number(preset.intensity),
      duration: Number(preset.duration),
      warningEnabled: Boolean(preset.warning_enabled),
      warningDelay: Number(preset.warning_delay),
    });
    setNotice(`Loaded ${preset.preset_name}.`);
  }

  async function deletePreset(device) {
    const control = controls[device.id];
    const preset = control.presets.find(
      (item) => String(item.id) === String(control.selectedPreset),
    );
    if (!preset) return;
    if (
      !(await confirmInApp(`Delete the preset “${preset.preset_name}”?`, {
        title: "Delete preset",
        confirmLabel: "Delete",
      }))
    )
      return;
    const { error } = await supabase
      .from("shocker_presets")
      .delete()
      .eq("id", preset.id)
      .eq("user_id", user.id);
    if (error) setNotice(error.message);
    else {
      setNotice("Preset deleted.");
      await loadPresets(devices);
    }
  }

  async function clearLogs() {
    if (
      !(await confirmInApp("Clear the Control Center command history?", {
        title: "Clear command history",
        confirmLabel: "Clear logs",
      }))
    )
      return;
    const { error } = await supabase
      .from("control_logs")
      .delete()
      .eq("user_id", user.id);
    if (error) setNotice(error.message);
    else {
      setLogs([]);
      setNotice("Command history cleared.");
    }
  }

  if (access === "checking")
    return <Loading label="Verifying control access…" />;
  if (access === "locked")
    return (
      <div className="control-center-access panel">
        <ShieldAlert />
        <span className="eyebrow">Safe Mode active</span>
        <h1>Control Center locked</h1>
        <p>This restricted system is unavailable while Safe Mode is active.</p>
      </div>
    );
  if (access !== "allowed" || !canUseControlCenter(profile))
    return (
      <div className="control-center-access panel">
        <ShieldAlert />
        <span className="eyebrow">Restricted system</span>
        <h1>{access === "locked" ? "Control Center locked" : "Access denied"}</h1>
        <p>{access === "locked" ? "Safe Mode is active. Emergency Stop remains available." : "The Trusted Person badge is required."}</p>
        {access === "locked" && canUseControlCenter(profile) && (
          <button className="button danger control-emergency" onClick={emergencyStop}>
            <AlertTriangle /> Emergency Stop
          </button>
        )}
      </div>
    );

  const anySynced = Object.values(controls).some((control) => control.synced);
  return (
    <div
      className={`page control-center-page${emergencyActive ? " emergency-active" : ""}`}
    >
      <PageHeader
        title="Control Center"
        description="Control my shock devices over the internet! Be careful!!"
      />
      <div className="control-center-notice" role="status">
        {notice || "Control access confirmed."}
      </div>
      <section className="panel control-global-panel">
        <div className="control-global-heading">
          <div>
            <h2>Shock controls</h2>
          </div>
          <button
            className="button secondary"
            onClick={loadDevices}
            disabled={loading || busy}
          >
            <RefreshCw className={loading ? "spin" : ""} />
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
        <div className="control-global-actions">
          <button
            className="button secondary"
            onClick={syncAll}
            disabled={busy}
          >
            {anySynced ? <Unlink2 /> : <Link2 />}
            {anySynced ? "Desync All" : "Sync All"}
          </button>
          <button
            className={`button secondary${live ? " live-active" : ""}`}
            onClick={() => {
              setLive((current) => !current);
              stopLive();
            }}
            disabled={!devices.length || busy}
          >
            <Radio /> Live Control: {live ? "ON" : "OFF"}
          </button>
          <button
            className="button danger control-emergency"
            onClick={emergencyStop}
            disabled={!devices.length}
          >
            <AlertTriangle /> Emergency Stop
          </button>
        </div>
        {live && (
          <div className="control-live-modes" aria-label="Live control mode">
            <button
              className={liveMode === "vibrate" ? "active" : ""}
              onClick={() => setLiveMode("vibrate")}
            >
              Vibrate
            </button>
            <button
              className={liveMode === "shock" ? "active" : ""}
              onClick={() => setLiveMode("shock")}
            >
              Shock
            </button>
          </div>
        )}
        {profile.rank?.trim().toLowerCase() === "captain" && (
          <div className="control-share-access">
            <div>
              <strong>Limited access link</strong>
              <p>Create a one-use, 24-hour link using each device’s limits below.</p>
            </div>
            <button
              className="button secondary"
              onClick={openSafetyLinkBuilder}
              disabled={!devices.length}
            >
              <Link2 /> Generate link
            </button>
            {shareLink && (
              <button className="button ghost" onClick={async () => setNotice(await copyControlText(shareLink) ? "Guest link copied." : "Copy permission was denied. Select the link in the link builder instead.")}>
                <Copy /> Copy again
              </button>
            )}
          </div>
        )}
      </section>
      {linkBuilderOpen && (
        <Modal title="Create a guest Control Center link" onClose={() => setLinkBuilderOpen(false)}>
          <div className="control-link-builder-app">
            <p>Anyone with this link can use only the devices and maximum settings selected below.</p>
            <div className="control-link-builder-summary">
              <label><span>Link expires</span><select value={linkSettings.expiryMinutes} onChange={(event) => setLinkSettings((current) => ({ ...current, expiryMinutes: Number(event.target.value) }))}><option value={15}>15 minutes</option><option value={60}>1 hour</option><option value={1440}>24 hours</option><option value={10080}>7 days</option><option value={43200}>30 days</option></select></label>
              <label><span>Maximum uses</span><input type="number" min="1" max="100" value={linkSettings.maxUses} onChange={(event) => setLinkSettings((current) => ({ ...current, maxUses: Number(event.target.value) }))} /><small>Each new browser session counts as one use.</small></label>
            </div>
            <div className="control-link-builder-devices">
              {devices.map((device) => {
                const item = linkSettings.devices[device.id] || { included: true, ...initialSafety() };
                const update = (patch) => setLinkSettings((current) => ({ ...current, devices: { ...current.devices, [device.id]: { ...item, ...patch } } }));
                return <section key={device.id}><label className="control-link-device-title"><input type="checkbox" checked={item.included} onChange={(event) => update({ included: event.target.checked })} /><strong>{device.name || "Control module"}</strong></label><div><label><span>Max intensity</span><input type="number" min="1" max="100" value={item.max_intensity} onChange={(event) => update({ max_intensity: Number(event.target.value) })} /></label><label><span>Max duration</span><input type="number" min="0.3" max="30" step="0.1" value={item.max_duration} onChange={(event) => update({ max_duration: Number(event.target.value) })} /></label></div><label className="control-link-device-title"><input type="checkbox" checked={item.require_hold_to_shock !== false} onChange={(event) => update({ require_hold_to_shock: event.target.checked })} /><span>Require hold to shock ({item.hold_milliseconds} ms)</span></label></section>;
              })}
            </div>
            {shareLink && <label className="control-link-output"><span>Generated link</span><input readOnly value={shareLink} onFocus={(event) => event.currentTarget.select()} /></label>}
            <div className="modal-actions"><button className="button ghost" onClick={() => setLinkBuilderOpen(false)}>Done</button>{shareLink && <button className="button secondary" onClick={async () => setNotice(await copyControlText(shareLink) ? "Guest link copied." : "Select the generated link and copy it manually.")}><Copy /> Copy link</button>}<button className="button primary" disabled={linkCreating} onClick={async () => { setLinkCreating(true); try { await createSafetyLink(); } catch (error) { setNotice(error.message); } finally { setLinkCreating(false); } }}>{linkCreating ? "Creating…" : "Create link"}</button></div>
          </div>
        </Modal>
      )}
      <div className="control-device-grid">
        {devices.map((device) => {
          const control = controls[device.id] || initialControl();
          const deviceSafety = safety[device.id] || initialSafety();
          return (
            <article
              className={`panel control-device-card${control.synced ? " synced" : ""}`}
              key={device.id}
            >
              <header>
                <div>
                  <h2>{device.name || "Control module"}</h2>
                </div>
                <button
                  className={`control-sync-toggle${control.synced ? " active" : ""}`}
                  onClick={() => toggleSync(device.id)}
                  aria-pressed={control.synced}
                >
                  {control.synced ? <Link2 /> : <Unlink2 />}
                  {control.synced ? "Linked" : "Sync"}
                </button>
              </header>
              <div className="control-dial-panel">
                <Dial
                  label="Intensity"
                  value={control.intensity}
                  min={0}
                  max={deviceSafety.max_intensity}
                  disabled={busy}
                  onChange={(value) => {
                    updateControl(device.id, { intensity: value });
                    sendLive(device.id, value);
                  }}
                  onRelease={stopLive}
                />
                {!live && (
                  <Dial
                    label="Duration"
                    tone="duration"
                    value={control.duration}
                    min={1}
                    max={Math.max(1, Math.floor(deviceSafety.max_duration))}
                    suffix="s"
                    disabled={busy}
                    onChange={(value) =>
                      updateControl(device.id, { duration: value })
                    }
                  />
                )}
              </div>
              {!live && (
                <details className="control-advanced">
                  <summary>Advanced Settings</summary>
                  <div className="control-advanced-grid">
                    <section>
                      <div className="control-setting-heading">
                        <div>
                          <h3>Warnings</h3>
                          <p>Vibrate before a shock command is sent.</p>
                        </div>
                        <label className="control-switch">
                          <input
                            type="checkbox"
                            checked={control.warningEnabled}
                            onChange={(event) =>
                              updateControl(device.id, {
                                warningEnabled: event.target.checked,
                              })
                            }
                          />
                          <span />
                        </label>
                      </div>
                      {control.warningEnabled && (
                        <Dial
                          label="Warning duration"
                          tone="safe"
                          value={control.warningDelay}
                          min={1}
                          max={10}
                          suffix="s"
                          disabled={busy}
                          onChange={(value) =>
                            updateControl(device.id, { warningDelay: value })
                          }
                        />
                      )}
                    </section>
                    <section>
                      <h3>User Presets</h3>
                      <select
                        value={control.selectedPreset}
                        onChange={(event) =>
                          updateControl(
                            device.id,
                            { selectedPreset: event.target.value },
                            false,
                          )
                        }
                      >
                        <option value="">Choose a preset</option>
                        {control.presets.map((preset) => (
                          <option value={preset.id} key={preset.id}>
                            {preset.preset_name}
                          </option>
                        ))}
                      </select>
                      <div className="control-preset-actions">
                        <button
                          onClick={() => loadPreset(device)}
                          disabled={!control.selectedPreset}
                        >
                          Load
                        </button>
                        <button onClick={() => savePreset(device)}>Save</button>
                        <button
                          onClick={() => deletePreset(device)}
                          disabled={!control.selectedPreset}
                        >
                          Delete
                        </button>
                      </div>
                    </section>
                    {profile.rank?.trim().toLowerCase() === "captain" && <section className="control-safety-settings">
                      <header className="control-safety-heading">
                        <div><span>Captain controls</span><h3>Device safety limits</h3><p>Set the maximum command strength and safety behavior for this device.</p></div>
                        <b>Captain only</b>
                      </header>
                      <div className="control-safety-fields">
                        {[
                          ["max_intensity", "Max intensity", 1, 100, 1],
                          ["max_duration", "Max duration (seconds)", 0.3, 30, 0.1],
                          ["high_intensity_threshold", "High-intensity threshold", 1, 100, 1],
                          ["cooldown_seconds", "Cooldown (seconds)", 0, 60, 0.5],
                          ["max_intensity_step", "Maximum increase", 1, 100, 1],
                          ["hold_milliseconds", "Hold time (ms)", 0, 5000, 100],
                        ].map(([key, label, min, max, step]) => (
                          <label key={key}>
                            <span>{label}</span>
                            <input
                              type="number"
                              min={min}
                              max={max}
                              step={step}
                              value={deviceSafety[key]}
                              onChange={(event) =>
                                setSafety((current) => ({
                                  ...current,
                                  [device.id]: { ...deviceSafety, [key]: Number(event.target.value) },
                                }))
                              }
                            />
                          </label>
                        ))}
                      </div>
                      <label className="control-safety-toggle">
                        <input type="checkbox" checked={deviceSafety.require_hold_to_shock !== false} onChange={(event) => setSafety((current) => ({ ...current, [device.id]: { ...deviceSafety, require_hold_to_shock: event.target.checked } }))} />
                        <span aria-hidden="true" />
                        <span><strong>Hold to activate shock</strong><small>Turn this off to send a shock with one click. Release-to-stop only applies while hold mode is on.</small></span>
                      </label>
                      <footer><span>These limits are enforced before a command reaches OpenShock.</span><button onClick={() => saveSafety(device.id).catch((error) => setNotice(error.message))}>Save safety limits</button></footer>
                    </section>}
                  </div>
                </details>
              )}
              {!live && (
                <div className="control-action-row">
                  {control.intensity >= deviceSafety.high_intensity_threshold ? (
                    <HoldCommandButton
                      disabled={busy}
                      holdMs={deviceSafety.hold_milliseconds}
                      onActivate={() => runAction(device.id, "vibrate")}
                      onRelease={() => stopTargets(device.id)}
                    >
                      Hold to vibrate
                    </HoldCommandButton>
                  ) : (
                    <button disabled={busy} onClick={() => runAction(device.id, "vibrate")}>
                      Vibrate
                    </button>
                  )}
                  <button
                    disabled={busy || profile.rank?.toLowerCase() !== "captain"}
                    title={
                      profile.rank?.toLowerCase() === "captain"
                        ? "Beep"
                        : "Only the Captain can use beep"
                    }
                    onClick={() => runAction(device.id, "beep")}
                  >
                    Beep
                  </button>
                  {deviceSafety.require_hold_to_shock !== false ? (
                    <HoldCommandButton className="shock" disabled={busy && pendingWarning !== device.id} holdMs={deviceSafety.hold_milliseconds} onActivate={() => runAction(device.id, "shock")} onRelease={() => stopTargets(device.id)}>
                      {pendingWarning === device.id ? "Cancel Shock" : control.warningEnabled ? "Hold · Warning On" : "Hold to shock"}
                    </HoldCommandButton>
                  ) : (
                    <button className="shock" disabled={busy && pendingWarning !== device.id} onClick={() => runAction(device.id, "shock")}>
                      {pendingWarning === device.id ? "Cancel Shock" : control.warningEnabled ? "Shock · Warning On" : "Shock"}
                    </button>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
      <section className="panel control-log-panel">
        <header>
          <div>
            <span className="eyebrow">Recent activity</span>
            <h2>Command History</h2>
          </div>
          <button
            className="button ghost"
            onClick={clearLogs}
            disabled={!logs.length}
          >
            Clear Logs
          </button>
        </header>
        <div className="control-log-grid">
          {!logs.length && <p>No control commands have been logged.</p>}
          {logs.map((log) => (
            <article key={log.id}>
              <strong>{log.shocker_name || "Control module"}</strong>
              <span>{log.action}</span>
              <p>
                Intensity {log.intensity} · Duration {log.duration}s
              </p>
              <time>{new Date(log.created_at).toLocaleString()}</time>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

export { canUseControlCenter };
