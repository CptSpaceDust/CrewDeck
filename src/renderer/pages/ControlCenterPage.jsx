import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Clock3,
  Copy,
  Gauge,
  Link2,
  Radio,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Unlink2,
  UsersRound,
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

function HoldCommandButton({
  holdMs,
  className = "",
  disabled,
  children,
  onActivate,
  onRelease,
}) {
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
        timer.current = window.setTimeout(
          async () => {
            activated.current = true;
            await onActivate?.();
          },
          Math.max(0, holdMs),
        );
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

function formatAccessCode(value) {
  const code = String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
  return code.length > 4 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
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

function GuestDeviceCard({ device, onCommand }) {
  const [intensity, setIntensity] = useState(
    Math.min(10, Number(device.max_intensity) || 100),
  );
  const [duration, setDuration] = useState(
    Math.min(1, Number(device.max_duration) || 30),
  );
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setIntensity((value) => Math.max(1, Math.min(value, Number(device.max_intensity) || 100)));
    setDuration((value) => Math.max(0.3, Math.min(value, Number(device.max_duration) || 30)));
  }, [device.max_duration, device.max_intensity]);
  const run = async (action) => {
    if (busy) return;
    setBusy(true);
    try {
      await onCommand(action, intensity, duration);
    } finally {
      setBusy(false);
    }
  };
  return (
    <article className="panel control-device-card guest-device-card">
      <header>
        <div>
          <span className="eyebrow">Shared device</span>
          <h2>{device.shocker_name || "Control module"}</h2>
        </div>
        <b>
          {device.max_intensity}% · {device.max_duration}s max
        </b>
      </header>
      <label className="guest-control-slider">
        <span>
          Intensity <output>{intensity}%</output>
        </span>
        <input
          type="range"
          min="1"
          max={device.max_intensity}
          value={intensity}
          onChange={(event) => setIntensity(Number(event.target.value))}
        />
      </label>
      <label className="guest-control-slider">
        <span>
          Duration <output>{duration}s</output>
        </span>
        <input
          type="range"
          min="0.3"
          max={device.max_duration}
          step="0.1"
          value={duration}
          onChange={(event) => setDuration(Number(event.target.value))}
        />
      </label>
      <div className="control-action-row">
        <button disabled={busy} onClick={() => run("vibrate")}>
          Vibrate
        </button>
        {device.require_hold_to_shock === false ? (
          <button
            className="danger"
            disabled={busy}
            onClick={() => run("shock")}
          >
            Shock
          </button>
        ) : (
          <HoldCommandButton
            className="danger"
            disabled={busy}
            holdMs={device.hold_milliseconds || 800}
            onActivate={() => run("shock")}
            onRelease={() => onCommand("stop", 0, 0)}
          >
            Hold to shock
          </HoldCommandButton>
        )}
        <button disabled={busy} onClick={() => run("stop")}>
          Stop
        </button>
      </div>
    </article>
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
  const [shareCode, setShareCode] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [guestSession, setGuestSession] = useState("");
  const [guestDevices, setGuestDevices] = useState([]);
  const [codeBusy, setCodeBusy] = useState(false);
  const [linkBuilderOpen, setLinkBuilderOpen] = useState(false);
  const [activeLinksOpen, setActiveLinksOpen] = useState(false);
  const [activeLinks, setActiveLinks] = useState([]);
  const [editingLink, setEditingLink] = useState(null);
  const [activeLinksBusy, setActiveLinksBusy] = useState(false);
  const [linkCreating, setLinkCreating] = useState(false);
  const [linkSettings, setLinkSettings] = useState({
    expiryMinutes: 1440,
    maxUses: 1,
    devices: {},
  });
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
      const storedGuest = sessionStorage.getItem(
        "crewdeck_guest_control_session",
      );
      if (storedGuest) {
        const { data } = await supabase.functions.invoke(
          "openshock-guest-control",
          {
            body: { action: "session", session_token: storedGuest },
          },
        );
        if (data?.success) {
          setGuestSession(storedGuest);
          setGuestDevices(data.devices || []);
          setAccess("guest");
          return false;
        }
        sessionStorage.removeItem("crewdeck_guest_control_session");
      }
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

  const loadActiveLinks = useCallback(async () => {
    if (String(profile.rank || "").trim().toLowerCase() !== "captain") return;
    const { data, error } = await supabase
      .from("control_access_links")
      .select("id,expires_at,max_uses,use_count,created_at,updated_at,control_access_link_devices(*)")
      .eq("created_by", user.id)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });
    if (error) throw error;
    setActiveLinks(data || []);
  }, [profile.rank, user.id]);

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
      await Promise.all([
        loadPresets(nextDevices),
        loadSafety(nextDevices),
        loadLogs(),
      ]);
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
    const accessChannel = supabase
      .channel(`control-access-live-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "control_access_links" }, loadActiveLinks)
      .on("postgres_changes", { event: "*", schema: "public", table: "control_access_link_devices" }, loadActiveLinks)
      .subscribe();
    loadActiveLinks().catch(() => {});
    return () => {
      warningRun.current = null;
      liveQueue.current.generation += 1;
      liveQueue.current.pending.clear();
      window.clearTimeout(emergencyTimer.current);
      supabase.removeChannel(safety);
      supabase.removeChannel(logChannel);
      supabase.removeChannel(accessChannel);
    };
  }, [loadActiveLinks, loadDevices, loadLogs, user.id, verifyAccess]);

  useEffect(() => {
    if (access !== "guest" || !guestSession) return undefined;
    let cancelled = false;
    const refreshGuestAccess = async () => {
      const { data, error } = await supabase.functions.invoke("openshock-guest-control", {
        body: { action: "session", session_token: guestSession },
      });
      if (cancelled) return;
      if (error || !data?.success) {
        sessionStorage.removeItem("crewdeck_guest_control_session");
        setGuestSession("");
        setGuestDevices([]);
        setAccess("denied");
        setNotice("This shared access ended or expired.");
        return;
      }
      setGuestDevices(data.devices || []);
    };
    const timer = window.setInterval(refreshGuestAccess, 1800);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [access, guestSession]);

  function editActiveLink(link) {
    const remainingMinutes = Math.max(1, Math.round((new Date(link.expires_at).getTime() - Date.now()) / 60000));
    const shared = new Map((link.control_access_link_devices || []).map((device) => [device.shocker_id, device]));
    setEditingLink({
      ...link,
      expiryMinutes: remainingMinutes,
      devices: Object.fromEntries(devices.map((device) => {
        const existing = shared.get(device.id);
        const defaults = safety[device.id] || initialSafety();
        return [device.id, existing
          ? { ...existing, included: true }
          : { shocker_id: device.id, shocker_name: device.name || "Control module", max_intensity: defaults.max_intensity, max_duration: defaults.max_duration, require_hold_to_shock: defaults.require_hold_to_shock !== false, hold_milliseconds: defaults.hold_milliseconds, included: false }];
      })),
    });
  }

  async function saveActiveLink() {
    if (!editingLink) return;
    const selected = Object.values(editingLink.devices || {}).filter((device) => device.included);
    if (!selected.length) throw new Error("Keep at least one shared device.");
    setActiveLinksBusy(true);
    try {
      const { error } = await supabase.rpc("captain_update_control_access_link", {
        p_link_id: editingLink.id,
        p_expires_at: new Date(Date.now() + Number(editingLink.expiryMinutes) * 60000).toISOString(),
        p_max_uses: Number(editingLink.max_uses),
        p_devices: selected.map((device) => ({
          shocker_id: device.shocker_id,
          shocker_name: device.shocker_name,
          max_intensity: Number(device.max_intensity),
          max_duration: Number(device.max_duration),
          require_hold_to_shock: device.require_hold_to_shock !== false,
          hold_milliseconds: Number(device.hold_milliseconds || 800),
        })),
      });
      if (error) throw error;
      await Promise.allSettled(devices.map((device) => sendCommand(device, "stop", 0, 0, true)));
      setNotice("Live guest limits updated and active commands stopped.");
      setEditingLink(null);
      await loadActiveLinks();
    } finally {
      setActiveLinksBusy(false);
    }
  }

  async function revokeActiveLink(linkId) {
    if (!(await confirmInApp("End this shared Control Center access now?", { title: "End shared access", confirmLabel: "End access" }))) return;
    const { error } = await supabase.rpc("captain_revoke_control_access_link", { p_link_id: linkId });
    if (error) throw error;
    await Promise.allSettled(devices.map((device) => sendCommand(device, "stop", 0, 0, true)));
    setNotice("Shared access ended immediately.");
    await loadActiveLinks();
  }

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
    const { error } = await supabase
      .from("control_device_safety_limits")
      .upsert(
        {
          user_id: user.id,
          shocker_id: deviceId,
          ...values,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,shocker_id" },
      );
    if (error) throw error;
    setNotice("Device safety limits saved.");
  }

  function openSafetyLinkBuilder() {
    setShareLink("");
    setShareCode("");
    setLinkSettings({
      expiryMinutes: 1440,
      maxUses: 1,
      devices: Object.fromEntries(
        devices.map((device) => {
          const limits = safety[device.id] || initialSafety();
          return [
            device.id,
            {
              included: true,
              max_intensity: limits.max_intensity,
              max_duration: limits.max_duration,
              require_hold_to_shock: limits.require_hold_to_shock !== false,
              hold_milliseconds: limits.hold_milliseconds,
            },
          ];
        }),
      ),
    });
    setLinkBuilderOpen(true);
  }

  async function createSafetyLink() {
    const selectedDevices = devices.filter(
      (device) => linkSettings.devices[device.id]?.included,
    );
    if (!selectedDevices.length)
      throw new Error("Choose at least one device for the link.");
    const tokenBytes = crypto.getRandomValues(new Uint8Array(24));
    const token = [...tokenBytes]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    const tokenHash = await sha256(token);
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const codeBytes = crypto.getRandomValues(new Uint8Array(8));
    const code = [...codeBytes]
      .map((byte) => alphabet[byte % alphabet.length])
      .join("");
    const expiresAt = new Date(
      Date.now() + Number(linkSettings.expiryMinutes) * 60 * 1000,
    ).toISOString();
    const { error } = await supabase.rpc("captain_create_control_access_link", {
      p_token_hash: tokenHash,
      p_share_code_hash: await sha256(code),
      p_expires_at: expiresAt,
      p_max_uses: Number(linkSettings.maxUses),
      p_devices: selectedDevices.map((device) => ({
        shocker_id: device.id,
        shocker_name: device.name || "Control module",
        max_intensity: linkSettings.devices[device.id].max_intensity,
        max_duration: linkSettings.devices[device.id].max_duration,
        require_hold_to_shock:
          linkSettings.devices[device.id].require_hold_to_shock,
        hold_milliseconds: linkSettings.devices[device.id].hold_milliseconds,
      })),
    });
    if (error) throw error;
    const link = `https://www.cptspacedust.com/control-center.html?control_invite=${token}`;
    setShareLink(link);
    setShareCode(code);
    const copied = await copyControlText(link);
    setNotice(
      copied
        ? `Guest link copied. It allows ${linkSettings.maxUses} new session${Number(linkSettings.maxUses) === 1 ? "" : "s"}.`
        : "Guest link created. Use the visible Copy button or select the link manually.",
    );
  }

  async function sendCommand(
    device,
    action,
    intensity,
    duration,
    skipLog = false,
    liveCommand = false,
  ) {
    if (access !== "allowed") throw new Error("Control access is unavailable.");
    const fingerprint = `${device.id}:${action}:${Number(intensity)}:${Number(duration)}`;
    const lastSent = commandGate.current.get(fingerprint) || 0;
    if (
      action !== "stop" &&
      Number(duration) > 0.3 &&
      Date.now() - lastSent < 1200
    )
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
          live: liveCommand,
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
      targetDevices(id).map((device) =>
        sendCommand(device, "stop", 0, 0, true),
      ),
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
            sendCommand(device, action, latestValue, 0.3, true, true),
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
      const { data, error } = await supabase.functions.invoke(
        "openshock-control",
        {
          body: { action: "stop_all" },
        },
      );
      if (error || !data?.success)
        throw new Error(
          await functionError(error, data?.error || "Emergency stop failed."),
        );
      setNotice(
        `Emergency stop sent to ${data.stopped} device${data.stopped === 1 ? "" : "s"}.`,
      );
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

  async function redeemAccessCode(event) {
    event.preventDefault();
    const code = accessCode.replace(/[^A-Z0-9]/gi, "").toUpperCase();
    if (code.length !== 8) {
      setNotice("Enter the complete eight-character access code.");
      return;
    }
    setCodeBusy(true);
    setNotice("");
    try {
      const { data, error } = await supabase.functions.invoke(
        "openshock-guest-control",
        { body: { action: "redeem_code", share_code: code } },
      );
      if (error)
        throw new Error(
          await functionError(error, "The code could not be checked."),
        );
      if (!data?.success || !data?.session_token)
        throw new Error(data?.error || "This code cannot be used.");
      sessionStorage.setItem(
        "crewdeck_guest_control_session",
        data.session_token,
      );
      setGuestSession(data.session_token);
      setGuestDevices(data.devices || []);
      setAccess("guest");
      setNotice("Limited Control Center access confirmed.");
    } catch (error) {
      setNotice(error.message || "This code cannot be used.");
    } finally {
      setCodeBusy(false);
    }
  }

  async function sendGuestCommand(device, action, intensity = 0, duration = 0) {
    const { data, error } = await supabase.functions.invoke(
      "openshock-guest-control",
      {
        body: {
          action,
          session_token: guestSession,
          shocker_id: device?.shocker_id,
          intensity: Number(intensity),
          duration: Number(duration),
        },
      },
    );
    if (error)
      throw new Error(await functionError(error, "The command was rejected."));
    if (!data?.success) throw new Error(data?.error || "The command failed.");
  }

  if (access === "checking")
    return <Loading label="Verifying control access…" />;
  if (access === "guest")
    return (
      <div className="page control-center-page guest-control-page">
        <PageHeader
          title="Limited Control Center"
          description="The Captain selected the devices and limits available in this session."
          action={
            <button
              className="button ghost"
              onClick={() => {
                sessionStorage.removeItem("crewdeck_guest_control_session");
                setGuestSession("");
                setGuestDevices([]);
                setAccess("denied");
              }}
            >
              Leave access session
            </button>
          }
        />
        {notice && (
          <div className="control-center-notice" role="status">
            {notice}
          </div>
        )}
        <div className="control-device-grid guest-control-grid">
          {guestDevices.map((device) => (
            <GuestDeviceCard
              device={device}
              key={device.shocker_id}
              onCommand={async (...args) => {
                try {
                  await sendGuestCommand(device, ...args);
                  setNotice("Command sent.");
                } catch (error) {
                  setNotice(error.message);
                }
              }}
            />
          ))}
        </div>
        <button
          className="button danger control-emergency guest-emergency"
          onClick={async () => {
            try {
              await sendGuestCommand(null, "stop_all");
              setNotice("Emergency stop sent to every shared device.");
            } catch (error) {
              setNotice(error.message);
            }
          }}
        >
          <AlertTriangle /> Emergency Stop
        </button>
      </div>
    );
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
      <div className="control-center-code-shell">
        <section className="control-center-access control-code-card panel">
          <span className="control-code-mark">#</span>
          <span className="eyebrow">Limited access</span>
          <h1>Enter a Control Center code</h1>
          <p>
            Use the eight-character code shared by the Captain. Only the
            selected devices and limits will become available.
          </p>
          <form onSubmit={redeemAccessCode}>
            <label htmlFor="control-access-code">Access code</label>
            <input
              id="control-access-code"
              value={accessCode}
              onChange={(event) =>
                setAccessCode(formatAccessCode(event.target.value))
              }
              placeholder="ABCD-2345"
              maxLength={9}
              autoComplete="one-time-code"
              required
            />
            <small>Letters and numbers only. Dashes are optional.</small>
            <button className="button primary" disabled={codeBusy}>
              {codeBusy ? "Checking code…" : "Open Control Center"}
            </button>
          </form>
          {notice && (
            <div className="control-code-status" role="status">
              {notice}
            </div>
          )}
        </section>
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
              <strong>Limited guest access</strong>
              <p>
                Choose the devices, limits, expiration, and number of guest
                sessions.
              </p>
            </div>
            <button
              className="button secondary"
              onClick={openSafetyLinkBuilder}
              disabled={!devices.length}
            >
              <Link2 /> Generate access
            </button>
            <button
              className="button secondary"
              onClick={async () => {
                await loadActiveLinks();
                setActiveLinksOpen(true);
              }}
            >
              <SlidersHorizontal /> Manage active access
            </button>
            {shareLink && (
              <button
                className="button ghost"
                onClick={async () =>
                  setNotice(
                    (await copyControlText(shareLink))
                      ? "Guest link copied."
                      : "Copy permission was denied. Select the link in the link builder instead.",
                  )
                }
              >
                <Copy /> Copy again
              </button>
            )}
          </div>
        )}
      </section>
      {linkBuilderOpen && (
        <Modal
          title="Create guest Control Center access"
          onClose={() => setLinkBuilderOpen(false)}
        >
          <div className="control-link-builder-app">
            <div className="control-link-builder-intro">
              <span>
                <ShieldCheck />
              </span>
              <div>
                <strong>Guest access</strong>
                <p>
                  Anyone with the link or quick code can use only the devices
                  and maximum settings selected below.
                </p>
              </div>
            </div>
            <div className="control-link-builder-summary">
              <label>
                <span className="control-link-field-title">
                  <Clock3 /> Link expires
                </span>
                <select
                  value={linkSettings.expiryMinutes}
                  onChange={(event) =>
                    setLinkSettings((current) => ({
                      ...current,
                      expiryMinutes: Number(event.target.value),
                    }))
                  }
                >
                  <option value={15}>15 minutes</option>
                  <option value={60}>1 hour</option>
                  <option value={1440}>24 hours</option>
                  <option value={10080}>7 days</option>
                  <option value={43200}>30 days</option>
                </select>
              </label>
              <label>
                <span className="control-link-field-title">
                  <UsersRound /> Maximum uses
                </span>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={linkSettings.maxUses}
                  onChange={(event) =>
                    setLinkSettings((current) => ({
                      ...current,
                      maxUses: Number(event.target.value),
                    }))
                  }
                />
                <small>Each new browser session counts as one use.</small>
              </label>
            </div>
            <div className="control-link-builder-devices">
              {devices.map((device) => {
                const item = linkSettings.devices[device.id] || {
                  included: true,
                  ...initialSafety(),
                };
                const update = (patch) =>
                  setLinkSettings((current) => ({
                    ...current,
                    devices: {
                      ...current.devices,
                      [device.id]: { ...item, ...patch },
                    },
                  }));
                return (
                  <section
                    className={item.included ? "included" : "excluded"}
                    key={device.id}
                  >
                    <header className="control-link-device-header">
                      <label className="control-link-check">
                        <input
                          type="checkbox"
                          checked={item.included}
                          onChange={(event) =>
                            update({ included: event.target.checked })
                          }
                        />
                        <span aria-hidden="true" />
                        <strong>{device.name || "Control module"}</strong>
                      </label>
                      <b>{item.included ? "Included" : "Not shared"}</b>
                    </header>
                    <div className="control-link-device-limits">
                      <label>
                        <span className="control-link-field-title">
                          <Gauge /> Max intensity
                        </span>
                        <input
                          type="number"
                          min="1"
                          max="100"
                          value={item.max_intensity}
                          disabled={!item.included}
                          onChange={(event) =>
                            update({
                              max_intensity: Number(event.target.value),
                            })
                          }
                        />
                        <small>Up to 100%</small>
                      </label>
                      <label>
                        <span className="control-link-field-title">
                          <Clock3 /> Max duration
                        </span>
                        <input
                          type="number"
                          min="0.3"
                          max="30"
                          step="0.1"
                          value={item.max_duration}
                          disabled={!item.included}
                          onChange={(event) =>
                            update({ max_duration: Number(event.target.value) })
                          }
                        />
                        <small>Up to 30 seconds</small>
                      </label>
                    </div>
                    <label className="control-link-hold-toggle">
                      <input
                        type="checkbox"
                        checked={item.require_hold_to_shock !== false}
                        disabled={!item.included}
                        onChange={(event) =>
                          update({
                            require_hold_to_shock: event.target.checked,
                          })
                        }
                      />
                      <span aria-hidden="true" />
                      <span>
                        <strong>Require hold to shock</strong>
                        <small>{item.hold_milliseconds} ms safety hold</small>
                      </span>
                    </label>
                  </section>
                );
              })}
            </div>
            {shareLink && (
              <label className="control-link-output">
                <span>Generated link</span>
                <input
                  readOnly
                  value={shareLink}
                  onFocus={(event) => event.currentTarget.select()}
                />
              </label>
            )}
            {shareCode && (
              <label className="control-link-output control-code-output">
                <span>Quick access code</span>
                <input
                  readOnly
                  value={shareCode}
                  onFocus={(event) => event.currentTarget.select()}
                />
              </label>
            )}
            <div className="modal-actions">
              <button
                className="button ghost"
                onClick={() => setLinkBuilderOpen(false)}
              >
                Done
              </button>
              {shareLink && (
                <button
                  className="button secondary"
                  onClick={async () =>
                    setNotice(
                      (await copyControlText(shareLink))
                        ? "Guest link copied."
                        : "Select the generated link and copy it manually.",
                    )
                  }
                >
                  <Copy /> Copy link
                </button>
              )}
              {shareCode && (
                <button
                  className="button secondary"
                  onClick={async () =>
                    setNotice(
                      (await copyControlText(shareCode))
                        ? "Quick access code copied."
                        : "Select the generated code and copy it manually.",
                    )
                  }
                >
                  <Copy /> Copy code
                </button>
              )}
              <button
                className="button primary"
                disabled={linkCreating}
                onClick={async () => {
                  setLinkCreating(true);
                  try {
                    await createSafetyLink();
                  } catch (error) {
                    setNotice(error.message);
                  } finally {
                    setLinkCreating(false);
                  }
                }}
              >
                {linkCreating ? "Creating…" : "Create link"}
              </button>
            </div>
          </div>
        </Modal>
      )}
      {activeLinksOpen && (
        <Modal title="Live shared access" onClose={() => { setActiveLinksOpen(false); setEditingLink(null); }}>
          <div className="control-active-access-manager">
            <div className="control-active-access-intro">
              <ShieldCheck />
              <div>
                <strong>Changes apply while guests are using Control Center</strong>
                <p>Updated limits appear automatically. Saving or ending access also stops active device commands.</p>
              </div>
            </div>
            {!activeLinks.length ? (
              <p className="control-active-empty">No live links or codes are active.</p>
            ) : (
              <div className="control-active-access-list">
                {activeLinks.map((link) => (
                  <article key={link.id} className={editingLink?.id === link.id ? "editing" : ""}>
                    <header>
                      <div>
                        <span className="eyebrow">Live access</span>
                        <strong>Access {link.id.slice(0, 8).toUpperCase()}</strong>
                        <small>{link.use_count} of {link.max_uses} sessions used · expires {new Date(link.expires_at).toLocaleString()}</small>
                      </div>
                      <div className="control-active-card-actions">
                        <button className="button secondary" onClick={() => editActiveLink(link)}><SlidersHorizontal /> Edit</button>
                        <button className="button danger" onClick={() => revokeActiveLink(link.id).catch((error) => setNotice(error.message))}><Trash2 /> End</button>
                      </div>
                    </header>
                    <div className="control-active-device-chips">
                      {(link.control_access_link_devices || []).map((device) => <span key={device.shocker_id}>{device.shocker_name || "Device"} · {device.max_intensity}% · {device.max_duration}s</span>)}
                    </div>
                  </article>
                ))}
              </div>
            )}
            {editingLink && (
              <section className="control-active-editor">
                <h3>Edit live limits</h3>
                <div className="control-link-builder-summary">
                  <label><span>Access remains active for</span><select value={editingLink.expiryMinutes} onChange={(event) => setEditingLink((current) => ({ ...current, expiryMinutes: Number(event.target.value) }))}><option value="15">15 minutes</option><option value="60">1 hour</option><option value="1440">24 hours</option><option value="10080">7 days</option><option value="43200">30 days</option></select></label>
                  <label><span>Maximum sessions</span><input type="number" min={Math.max(1, editingLink.use_count)} max="100" value={editingLink.max_uses} onChange={(event) => setEditingLink((current) => ({ ...current, max_uses: Number(event.target.value) }))} /></label>
                </div>
                <div className="control-active-editor-devices">
                  {Object.values(editingLink.devices || {}).map((device) => {
                    const update = (patch) => setEditingLink((current) => ({ ...current, devices: { ...current.devices, [device.shocker_id]: { ...device, ...patch } } }));
                    return <article key={device.shocker_id}>
                      <label className="control-link-check"><input type="checkbox" checked={device.included} onChange={(event) => update({ included: event.target.checked })} /><span aria-hidden="true" /><strong>{device.shocker_name || "Device"}</strong></label>
                      <div className="control-link-device-limits">
                        <label><span>Max intensity</span><input type="number" min="1" max="100" disabled={!device.included} value={device.max_intensity} onChange={(event) => update({ max_intensity: Number(event.target.value) })} /></label>
                        <label><span>Max duration</span><input type="number" min="0.3" max="30" step="0.1" disabled={!device.included} value={device.max_duration} onChange={(event) => update({ max_duration: Number(event.target.value) })} /></label>
                      </div>
                      <label className="control-link-hold-toggle"><input type="checkbox" disabled={!device.included} checked={device.require_hold_to_shock !== false} onChange={(event) => update({ require_hold_to_shock: event.target.checked })} /><span aria-hidden="true" /><span><strong>Require hold to shock</strong><small>{device.hold_milliseconds || 800} ms safety hold</small></span></label>
                    </article>;
                  })}
                </div>
                <div className="modal-actions"><button className="button ghost" onClick={() => setEditingLink(null)}>Cancel</button><button className="button primary" disabled={activeLinksBusy} onClick={() => saveActiveLink().catch((error) => setNotice(error.message))}>{activeLinksBusy ? "Applying…" : "Apply live changes"}</button></div>
              </section>
            )}
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
                  onRelease={() => {
                    stopLive();
                    stopTargets(device.id);
                  }}
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
                    {profile.rank?.trim().toLowerCase() === "captain" && (
                      <section className="control-safety-settings">
                        <header className="control-safety-heading">
                          <div>
                            <span>Captain controls</span>
                            <h3>Device safety limits</h3>
                            <p>
                              Set the maximum command strength and safety
                              behavior for this device.
                            </p>
                          </div>
                        </header>
                        <div className="control-safety-fields">
                          {[
                            ["max_intensity", "Max intensity", 1, 100, 1],
                            [
                              "max_duration",
                              "Max duration (seconds)",
                              0.3,
                              30,
                              0.1,
                            ],
                            [
                              "high_intensity_threshold",
                              "High-intensity threshold",
                              1,
                              100,
                              1,
                            ],
                            [
                              "cooldown_seconds",
                              "Cooldown (seconds)",
                              0,
                              60,
                              0.5,
                            ],
                            [
                              "hold_milliseconds",
                              "Hold time (ms)",
                              0,
                              5000,
                              100,
                            ],
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
                                    [device.id]: {
                                      ...deviceSafety,
                                      [key]: Number(event.target.value),
                                    },
                                  }))
                                }
                              />
                            </label>
                          ))}
                        </div>
                        <label className="control-safety-toggle">
                          <input
                            type="checkbox"
                            checked={
                              deviceSafety.require_hold_to_shock !== false
                            }
                            onChange={(event) =>
                              setSafety((current) => ({
                                ...current,
                                [device.id]: {
                                  ...deviceSafety,
                                  require_hold_to_shock: event.target.checked,
                                },
                              }))
                            }
                          />
                          <span aria-hidden="true" />
                          <span>
                            <strong>Hold to activate shock</strong>
                            <small>
                              Turn this off to send a shock with one click.
                              Release-to-stop only applies while hold mode is
                              on.
                            </small>
                          </span>
                        </label>
                        <footer>
                          <span>
                            These limits are enforced before a command reaches
                            OpenShock.
                          </span>
                          <button
                            onClick={() =>
                              saveSafety(device.id).catch((error) =>
                                setNotice(error.message),
                              )
                            }
                          >
                            Save safety limits
                          </button>
                        </footer>
                      </section>
                    )}
                  </div>
                </details>
              )}
              {!live && (
                <div className="control-action-row">
                  {control.intensity >=
                  deviceSafety.high_intensity_threshold ? (
                    <HoldCommandButton
                      disabled={busy}
                      holdMs={deviceSafety.hold_milliseconds}
                      onActivate={() => runAction(device.id, "vibrate")}
                      onRelease={() => stopTargets(device.id)}
                    >
                      Hold to vibrate
                    </HoldCommandButton>
                  ) : (
                    <button
                      disabled={busy}
                      onClick={() => runAction(device.id, "vibrate")}
                    >
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
                    <HoldCommandButton
                      className="shock"
                      disabled={busy && pendingWarning !== device.id}
                      holdMs={deviceSafety.hold_milliseconds}
                      onActivate={() => runAction(device.id, "shock")}
                      onRelease={() => stopTargets(device.id)}
                    >
                      {pendingWarning === device.id
                        ? "Cancel Shock"
                        : control.warningEnabled
                          ? "Hold · Warning On"
                          : "Hold to shock"}
                    </HoldCommandButton>
                  ) : (
                    <button
                      className="shock"
                      disabled={busy && pendingWarning !== device.id}
                      onClick={() => runAction(device.id, "shock")}
                    >
                      {pendingWarning === device.id
                        ? "Cancel Shock"
                        : control.warningEnabled
                          ? "Shock · Warning On"
                          : "Shock"}
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
