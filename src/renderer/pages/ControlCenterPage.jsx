import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import {
  AlertTriangle,
  Activity,
  Bell,
  ChevronRight,
  Clock3,
  Copy,
  Gauge,
  Hand,
  KeyRound,
  Link2,
  PlugZap,
  Radio,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Unlink2,
  UserPlus,
  UserRound,
  UsersRound,
  Zap,
} from "lucide-react";
import { promptInApp, confirmInApp } from "../components/InAppDialog";
import { Loading, Modal, PageHeader } from "../components/ui";
import { supabase } from "../lib/supabase";

const initialControl = () => ({
  shockIntensity: 0,
  shockDuration: 1,
  vibrateIntensity: 0,
  vibrateDuration: 1,
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
  require_hold_to_shock: false,
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

function canUseControlCenter() {
  return true;
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

function ControlRail({ label, value, min = 0, max = 100, step = 1, suffix = "", tone = "cyan", disabled, vertical = false, onChange, icon: Icon = Activity }) {
  const percent = max === min ? 0 : ((Number(value) - min) / (max - min)) * 100;
  return (
    <label className={`control-rail control-rail-${tone}${vertical ? " vertical" : ""}${disabled ? " disabled" : ""}`}>
      <span className="control-rail-heading"><Icon /><b>{label}</b><output>{value}{suffix}</output></span>
      <input
        type="range"
        orient={vertical ? "vertical" : undefined}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        style={{ "--rail-progress": `${percent}%` }}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <span className="control-rail-scale"><small>{min}{suffix}</small><small>{max}{suffix}</small></span>
    </label>
  );
}

function GuestDeviceCard({ device, synced, onSync, onCommand }) {
  const [shockIntensity, setShockIntensity] = useState(
    Math.min(10, Number(device.max_intensity) || 100),
  );
  const [shockDuration, setShockDuration] = useState(
    Math.min(1, Number(device.max_duration) || 30),
  );
  const [vibrateIntensity, setVibrateIntensity] = useState(Math.min(10, Number(device.max_intensity) || 100));
  const [vibrateDuration, setVibrateDuration] = useState(Math.min(1, Number(device.max_duration) || 30));
  const [warningEnabled, setWarningEnabled] = useState(false);
  const [warningDelay, setWarningDelay] = useState(1);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  useEffect(() => {
    setShockIntensity((value) => Math.max(1, Math.min(value, Number(device.max_intensity) || 100)));
    setVibrateIntensity((value) => Math.max(1, Math.min(value, Number(device.max_intensity) || 100)));
    setShockDuration((value) => Math.max(0.3, Math.min(value, Number(device.max_duration) || 30)));
    setVibrateDuration((value) => Math.max(0.3, Math.min(value, Number(device.max_duration) || 30)));
  }, [device.max_duration, device.max_intensity]);
  const run = async (action) => {
    if (busy) return;
    setBusy(true);
    try {
      const intensity = action === "vibrate" ? vibrateIntensity : shockIntensity;
      const duration = action === "vibrate" ? vibrateDuration : shockDuration;
      if (action === "shock" && warningEnabled) {
        await onCommand("warning", intensity, warningDelay);
        await new Promise((resolve) => window.setTimeout(resolve, warningDelay * 1000));
      }
      await onCommand(action, intensity, duration);
      setFeedback(action);
      window.setTimeout(() => setFeedback((current) => current === action ? "" : current), 800);
    } finally {
      setBusy(false);
    }
  };
  return (
    <article className={`panel control-device-card guest-device-card${device.is_paused ? " is-paused" : ""}`}>
      <header>
        <div>
          <button className={`control-sync-toggle${synced ? " active" : ""}`} onClick={onSync} aria-pressed={synced}>{synced ? <Link2 /> : <Unlink2 />}{synced ? "Linked" : "Sync"}</button>
          <h2>{device.shocker_name || "Control module"}</h2>
        </div>
        <b>
          {device.is_paused ? "Paused by owner" : `${device.max_intensity}% · ${device.max_duration}s max`}
        </b>
      </header>
      <div className="guest-control-pair">
        {device.allow_shock === false ? <section className="guest-capability-disabled"><strong>Shock unavailable</strong><small>The owner did not include this control.</small></section> : <section><h3>Shock</h3><ControlRail vertical tone="danger" label="Intensity" value={shockIntensity} min={1} max={device.max_intensity} suffix="%" disabled={busy || device.is_paused} onChange={setShockIntensity} /><ControlRail vertical tone="danger" label="Duration" value={shockDuration} min={0.3} max={device.max_duration} step={0.1} suffix="s" disabled={busy || device.is_paused} onChange={setShockDuration} /></section>}
        {device.allow_vibrate === false ? <section className="guest-capability-disabled"><strong>Vibrate unavailable</strong><small>The owner did not include this control.</small></section> : <section><h3>Vibrate</h3><ControlRail vertical label="Intensity" value={vibrateIntensity} min={1} max={device.max_intensity} suffix="%" disabled={busy || device.is_paused} onChange={setVibrateIntensity} /><ControlRail vertical label="Duration" value={vibrateDuration} min={0.3} max={device.max_duration} step={0.1} suffix="s" disabled={busy || device.is_paused} onChange={setVibrateDuration} /></section>}
      </div>
      <div className="control-action-row">
        {device.allow_vibrate !== false && <button className={feedback === "vibrate" ? "command-confirmed" : ""} disabled={busy || device.is_paused} onClick={() => run("vibrate")}>
          Vibrate
        </button>}
        {device.allow_shock !== false && <button
          className={`danger${feedback === "shock" ? " command-confirmed" : ""}`}
          disabled={busy || device.is_paused}
          onClick={() => run("shock")}
        >Shock</button>}
        {device.allow_beep !== false && <button className={feedback === "beep" ? "command-confirmed" : ""} disabled={busy || device.is_paused} onClick={() => run("beep")}>
          Beep
        </button>}
        {device.allow_warning !== false && <button className={warningEnabled ? "active" : ""} disabled={busy || device.is_paused} onClick={() => setWarningEnabled((current) => !current)}>
          Warning {warningEnabled ? "on" : "off"}
        </button>}
      </div>
      {device.allow_warning !== false && warningEnabled && <label className="guest-warning-delay"><span>Warning vibration</span><input type="range" min="1" max="10" value={warningDelay} onChange={(event) => setWarningDelay(Number(event.target.value))} /><output>{warningDelay}s</output></label>}
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
  const [guestLinkId, setGuestLinkId] = useState("");
  const [guestDevices, setGuestDevices] = useState([]);
  const [guestSynced, setGuestSynced] = useState([]);
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
  const [providerStatus, setProviderStatus] = useState({ paired: null, connections: [], owners: [], trusted_people: [], crew_options: [] });
  const [activeOwner, setActiveOwner] = useState(null);
  const [trustedSelection, setTrustedSelection] = useState("");
  const [commandFeedback, setCommandFeedback] = useState("");
  const [pairOpen, setPairOpen] = useState(false);
  const [pairBusy, setPairBusy] = useState(false);
  const [pairForm, setPairForm] = useState({ provider: "openshock", connectionLabel: "", apiToken: "", username: "" });
  const [shareQr, setShareQr] = useState("");
  const [shareQrOpen, setShareQrOpen] = useState(false);
  const [shareSummary, setShareSummary] = useState(null);
  const [ownerAccessOpen, setOwnerAccessOpen] = useState(null);
  const commandGate = useRef(new Map());
  const warningRun = useRef(null);
  const lastLiveCommand = useRef(0);
  const emergencyTimer = useRef(null);
  const lastToast = useRef({ message: "", time: 0 });
  const liveQueue = useRef({
    pending: new Map(),
    running: false,
    generation: 0,
  });

  useEffect(() => {
    const message = String(notice || "").trim();
    if (!message) return undefined;
    const now = Date.now();
    if (lastToast.current.message === message && now - lastToast.current.time < 3000)
      return undefined;
    lastToast.current = { message, time: now };
    const looksLikeError = /could not|cannot|failed|error|rejected|invalid|expired|unavailable|interrupted|denied/i.test(message);
    window.dispatchEvent(new CustomEvent("crewdeck-toast", {
      detail: {
        title: looksLikeError ? "Control Center needs attention" : "Control Center updated",
        message,
        tone: looksLikeError ? "error" : "success",
      },
    }));
    const timer = window.setTimeout(() => setNotice((current) => current === message ? "" : current), 5200);
    return () => window.clearTimeout(timer);
  }, [notice]);

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
    if (profileError) {
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
          setGuestLinkId(data.link_id || "");
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

  const invokeProvider = useCallback(async (body) => {
    const action = String(body?.action || "request").replace(/[^a-z0-9_-]/gi, "");
    const started = performance.now();
    const { data, error } = await supabase.functions.invoke("control-provider", { body });
    if (error) throw new Error(await functionError(error, "Control provider request failed."));
    if (!data?.success) throw new Error(data?.error || "Control provider request failed.");
    performance.measure(`crewdeck-control-provider:${action}`, { start: started, end: performance.now(), detail: { server: data?.timing_ms || null } });
    return data;
  }, []);

  const loadProviderStatus = useCallback(async () => {
    const data = await invokeProvider({ action: "status" });
    setProviderStatus({
      paired: data.paired || null,
      connections: data.connections || [],
      owners: data.owners || [],
      trusted_people: data.trusted_people || [],
      crew_options: data.crew_options || [],
    });
    return data;
  }, [invokeProvider]);

  const loadOwnerDevices = useCallback(async (owner) => {
    setLoading(true);
    setNotice("");
    try {
      const result = await invokeProvider({ action: "devices", owner_id: owner.user_id });
      const nextDevices = (result.devices || []).map((device) => ({
        id: device.device_id,
        name: device.device_name,
        providerName: device.provider_name || device.device_name,
        provider: device.provider,
        paused: device.is_paused,
      }));
      const { data: presetRows } = await supabase
        .from("shocker_presets")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });
      setDevices(nextDevices);
      setSafety(Object.fromEntries((result.devices || []).map((device) => [device.device_id, { ...initialSafety(), ...(device.safety || {}) }])));
      setControls(Object.fromEntries(nextDevices.map((device) => [device.id, { ...initialControl(), presets: (presetRows || []).filter((preset) => preset.shocker_id === device.id) }])));
      setActiveOwner({ id: owner.user_id, username: owner.profile?.username || "Crew member", provider: owner.provider, trusted: true });
      setNotice(`Controlling ${owner.profile?.username || "this crew member"}’s paired devices.`);
    } catch (error) {
      setNotice(error.message || "Unable to open this Control Center.");
    } finally {
      setLoading(false);
    }
  }, [invokeProvider, user.id]);

  async function pairProvider(event) {
    event.preventDefault();
    setPairBusy(true);
    setNotice("");
    try {
      const result = await invokeProvider({ action: "pair", provider: pairForm.provider, connection_label: pairForm.connectionLabel, api_token: pairForm.apiToken, username: pairForm.username });
      setPairForm({ provider: "openshock", connectionLabel: "", apiToken: "", username: "" });
      setPairOpen(false);
      setNotice(`${result.provider === "pishock" ? "PiShock" : "OpenShock"} paired successfully. ${result.device_count} device${result.device_count === 1 ? "" : "s"} found.`);
      await loadDevices();
    } catch (error) {
      setNotice(error.message || "The provider could not be paired.");
    } finally {
      setPairBusy(false);
    }
  }

  async function changeTrustedPerson(targetUserId, trusted) {
    await invokeProvider({ action: trusted ? "trust" : "untrust", target_user_id: targetUserId });
    await loadProviderStatus();
    setNotice(trusted ? "Trusted device access added." : "Trusted device access removed immediately.");
  }

  async function disconnectProvider(accountId) {
    if (!(await confirmInApp("Disconnect this provider API and remove its saved credential from CrewDeck?", { title: "Disconnect provider", confirmLabel: "Disconnect" }))) return;
    setBusy(true);
    try {
      await invokeProvider({ action: "unpair", account_id: accountId });
      setDevices([]);
      setActiveOwner(null);
      await loadProviderStatus();
      setNotice("Provider API disconnected.");
    } catch (error) {
      setNotice(error.message || "The provider could not be disconnected.");
    } finally {
      setBusy(false);
    }
  }

  const loadLogs = useCallback(async () => {
    const { data, error } = await supabase
      .from("control_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(10);
    if (!error) setLogs(data || []);
  }, []);

  const loadActiveLinks = useCallback(async () => {
    if (providerStatus.paired) {
      const data = await invokeProvider({ action: "shares" });
      setActiveLinks(data.links || []);
      return;
    }
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
  }, [invokeProvider, profile.rank, providerStatus.paired?.user_id, user.id]);

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

  const loadDevices = useCallback(async () => {
    setLoading(true);
    setNotice("");
    try {
      if (!(await verifyAccess())) return;
      const provider = await loadProviderStatus();
      let nextDevices = [];
      if (provider.paired) {
        const result = await invokeProvider({ action: "devices", owner_id: user.id });
        nextDevices = (result.devices || []).map((device) => ({
          id: device.device_id,
          name: device.device_name,
          providerName: device.provider_name || device.device_name,
          provider: device.provider,
          paused: device.is_paused,
        }));
        setSafety(Object.fromEntries((result.devices || []).map((device) => [device.device_id, { ...initialSafety(), ...(device.safety || {}) }])));
        setActiveOwner({ id: user.id, username: profile.username || "You", own: true, provider: provider.paired.provider });
      } else {
        setActiveOwner(null);
        setSafety({});
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
        loadLogs(),
      ]);
      setNotice(nextDevices.length ? "" : "No connected devices were found.");
    } catch (error) {
      setNotice(error.message || "Unable to load the Control Center.");
    } finally {
      setLoading(false);
    }
  }, [invokeProvider, loadLogs, loadPresets, loadProviderStatus, profile.username, user.id, verifyAccess]);

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
    const realtime = guestLinkId
      ? supabase
          .channel(`control-access:${guestLinkId}`)
          .on("broadcast", { event: "changed" }, refreshGuestAccess)
          .subscribe()
      : null;
    const timer = window.setInterval(refreshGuestAccess, 15000);
    refreshGuestAccess();
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      if (realtime) supabase.removeChannel(realtime);
    };
  }, [access, guestLinkId, guestSession]);

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
          : { shocker_id: device.id, shocker_name: device.name || "Control module", max_intensity: defaults.max_intensity, max_duration: defaults.max_duration, require_hold_to_shock: false, hold_milliseconds: defaults.hold_milliseconds, allow_warning: true, allow_beep: true, allow_live: false, allow_vibrate: true, allow_shock: true, included: false }];
      })),
    });
  }

  async function saveActiveLink() {
    if (!editingLink) return;
    const selected = Object.values(editingLink.devices || {}).filter((device) => device.included);
    if (!selected.length) throw new Error("Keep at least one shared device.");
    setActiveLinksBusy(true);
    try {
      const expiresAt = new Date(Date.now() + Number(editingLink.expiryMinutes) * 60000).toISOString();
      const sharedDevices = selected.map((device) => ({
          shocker_id: device.shocker_id,
          shocker_name: device.shocker_name,
          max_intensity: Number(device.max_intensity),
          max_duration: Number(device.max_duration),
          require_hold_to_shock: false,
          hold_milliseconds: Number(device.hold_milliseconds || 800),
          allow_warning: device.allow_warning !== false,
          allow_beep: device.allow_beep !== false,
          allow_live: device.allow_live === true,
          allow_vibrate: device.allow_vibrate !== false,
          allow_shock: device.allow_shock !== false,
        }));
      if (providerStatus.paired) {
        await invokeProvider({ action: "update_share", link_id: editingLink.id, expires_at: expiresAt, max_uses: Number(editingLink.max_uses), devices: sharedDevices });
      } else {
        const { error } = await supabase.rpc("captain_update_control_access_link", {
          p_link_id: editingLink.id,
          p_expires_at: expiresAt,
          p_max_uses: Number(editingLink.max_uses),
          p_devices: sharedDevices,
        });
        if (error) throw error;
      }
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
    if (providerStatus.paired) await invokeProvider({ action: "revoke_share", link_id: linkId });
    else {
      const { error } = await supabase.rpc("captain_revoke_control_access_link", { p_link_id: linkId });
      if (error) throw error;
    }
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
              shockIntensity: source.shockIntensity,
              shockDuration: source.shockDuration,
              vibrateIntensity: source.vibrateIntensity,
              vibrateDuration: source.vibrateDuration,
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
                  shockIntensity: source.shockIntensity,
                  shockDuration: source.shockDuration,
                  vibrateIntensity: source.vibrateIntensity,
                  vibrateDuration: source.vibrateDuration,
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

  async function saveSafety(deviceId) {
    if (activeOwner?.id !== user.id)
      throw new Error("Only the device owner can change these settings.");
    const values = { ...initialSafety(), ...safety[deviceId] };
    const device = devices.find((item) => item.id === deviceId);
    const result = await invokeProvider({
      action: "update_device",
      owner_id: user.id,
      device_id: deviceId,
      custom_name: device?.name === device?.providerName ? "" : device?.name,
      safety: values,
    });
    setSafety((current) => ({ ...current, [deviceId]: { ...values, ...(result.safety || {}) } }));
    setNotice("Device name and safety settings saved.");
  }

  function openSafetyLinkBuilder() {
    setShareLink("");
    setShareCode("");
    setShareQr("");
    setShareQrOpen(false);
    setShareSummary(null);
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
              require_hold_to_shock: false,
              hold_milliseconds: limits.hold_milliseconds,
              allow_warning: true,
              allow_beep: true,
              allow_live: false,
              allow_vibrate: true,
              allow_shock: true,
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
    const sharedDevices = selectedDevices.map((device) => ({
        shocker_id: device.id,
        shocker_name: device.name || "Control module",
        max_intensity: linkSettings.devices[device.id].max_intensity,
        max_duration: linkSettings.devices[device.id].max_duration,
        require_hold_to_shock: false,
        hold_milliseconds: linkSettings.devices[device.id].hold_milliseconds,
        allow_warning: linkSettings.devices[device.id].allow_warning !== false,
        allow_beep: linkSettings.devices[device.id].allow_beep !== false,
        allow_live: linkSettings.devices[device.id].allow_live === true,
        allow_vibrate: linkSettings.devices[device.id].allow_vibrate !== false,
        allow_shock: linkSettings.devices[device.id].allow_shock !== false,
      }));
    if (providerStatus.paired) {
      await invokeProvider({
        action: "create_share",
        token_hash: tokenHash,
        share_code_hash: await sha256(code),
        expires_at: expiresAt,
        max_uses: Number(linkSettings.maxUses),
        devices: sharedDevices,
      });
    } else {
      const { error } = await supabase.rpc("captain_create_control_access_link", {
        p_token_hash: tokenHash,
        p_share_code_hash: await sha256(code),
        p_expires_at: expiresAt,
        p_max_uses: Number(linkSettings.maxUses),
        p_devices: sharedDevices,
      });
      if (error) throw error;
    }
    const link = `https://www.cptspacedust.com/control-center.html?control_invite=${token}`;
    setShareLink(link);
    setShareCode(code);
    setShareQr(await QRCode.toDataURL(link, { width: 420, margin: 3, errorCorrectionLevel: "M", color: { dark: "#031020", light: "#f4fbff" } }));
    setShareSummary({ expiresAt, maxUses: Number(linkSettings.maxUses) });
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
    await invokeProvider({
      action: "control",
      owner_id: activeOwner?.id || user.id,
      device_id: device.id,
      command: action,
      intensity: Number(intensity),
      duration: Number(duration),
      live: liveCommand,
    });
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

  async function toggleDevicePause(device) {
    if (activeOwner?.id !== user.id) return;
    const paused = !device.paused;
    setBusy(true);
    try {
      await invokeProvider({ action: "set_pause", owner_id: user.id, device_id: device.id, paused });
      setDevices((current) => current.map((item) => item.id === device.id ? { ...item, paused } : item));
      setCommandFeedback(`${device.id}:pause`);
      window.setTimeout(() => setCommandFeedback((current) => current === `${device.id}:pause` ? "" : current), 800);
      setNotice(`${device.name || "Device"} is now ${paused ? "paused for you, trusted people, and every live link or code" : "available again"}.`);
    } catch (error) {
      setNotice(error.message || "The device pause could not be changed.");
    } finally {
      setBusy(false);
    }
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
            control.vibrateIntensity,
            control.warningDelay,
          );
          await new Promise((resolve) =>
            window.setTimeout(resolve, control.warningDelay * 1000),
          );
          if (warningRun.current !== runId) return;
        }
        const intensity = action === "vibrate" ? control.vibrateIntensity : control.shockIntensity;
        const duration = action === "vibrate" ? control.vibrateDuration : control.shockDuration;
        await sendCommand(device, action, intensity, duration);
      }
      setCommandFeedback(`${id}:${action}`);
      window.setTimeout(() => setCommandFeedback((current) => current === `${id}:${action}` ? "" : current), 800);
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

  async function sendLive(id, action, value) {
    if (!live || liveMode !== action || value <= 0 || Date.now() - lastLiveCommand.current < 160)
      return;
    lastLiveCommand.current = Date.now();
    const queue = liveQueue.current;
    for (const device of targetDevices(id))
      queue.pending.set(device.id, { device, action, value });
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
          { ...item, shockIntensity: 0, vibrateIntensity: 0 },
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
      const results = await Promise.allSettled(
        devices.map((device) =>
          invokeProvider({
            action: "control",
            owner_id: activeOwner?.id || user.id,
            device_id: device.id,
            command: "stop",
            intensity: 0,
            duration: 0,
          }),
        ),
      );
      const stopped = results.filter((result) => result.status === "fulfilled").length;
      if (!stopped && devices.length) throw results.find((result) => result.status === "rejected")?.reason || new Error("Emergency stop failed.");
      setNotice(
        `Emergency stop sent to ${stopped} device${stopped === 1 ? "" : "s"}.`,
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
      intensity: control.shockIntensity,
      duration: control.shockDuration,
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
      shockIntensity: Number(preset.intensity),
      shockDuration: Number(preset.duration),
      vibrateIntensity: Number(preset.intensity),
      vibrateDuration: Number(preset.duration),
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
        { body: { action: "redeem_code", share_code: code, guest_name: profile.username || "CrewDeck member" } },
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
      setGuestLinkId(data.link_id || "");
      setGuestDevices(data.devices || []);
      setAccess("guest");
      setOwnerAccessOpen(null);
      setNotice("Limited Control Center access confirmed.");
    } catch (error) {
      setNotice(error.message || "This code cannot be used.");
    } finally {
      setCodeBusy(false);
    }
  }

  async function sendGuestCommand(targetDevices, action, intensity = 0, duration = 0) {
    const targets = targetDevices?.length ? targetDevices : [];
    if (!targets.length) throw new Error("Choose at least one shared device.");
    const allowed = targets.every((device) => action === "shock" ? device.allow_shock !== false : action === "vibrate" ? device.allow_vibrate !== false : action === "warning" ? device.allow_warning !== false : action === "beep" ? device.allow_beep !== false : true);
    if (!allowed) throw new Error("One or more linked devices do not allow that control.");
    const limitedIntensity = Math.min(Number(intensity), ...targets.map((device) => Number(device.max_intensity)));
    const limitedDuration = Math.min(Number(duration), ...targets.map((device) => Number(device.max_duration)));
    const started = performance.now();
    const { data, error } = await supabase.functions.invoke(
      "openshock-guest-control",
      {
        body: {
          action,
          session_token: guestSession,
          shocker_ids: targets.map((device) => device.shocker_id),
          intensity: limitedIntensity,
          duration: limitedDuration,
        },
      },
    );
    if (error)
      throw new Error(await functionError(error, "The command was rejected."));
    if (!data?.success) throw new Error(data?.error || "The command failed.");
    performance.measure(`crewdeck-guest-control:${action}`, { start: started, end: performance.now(), detail: { server: data?.timing_ms || null } });
  }

  if (access === "checking")
    return <Loading label="Verifying control access…" />;
  if (access === "guest")
    return (
      <div className="page control-center-page guest-control-page">
        <PageHeader
          title="Limited Control Center"
          description="The device owner selected the devices and limits available in this session."
          action={
            <button
              className="button ghost"
              onClick={() => {
                sessionStorage.removeItem("crewdeck_guest_control_session");
                setGuestSession("");
                setGuestDevices([]);
                setAccess("allowed");
                loadDevices();
              }}
            >
              Leave access session
            </button>
          }
        />
        <div className="control-device-grid guest-control-grid">
          {guestDevices.map((device) => (
            <GuestDeviceCard
              device={device}
              key={device.shocker_id}
              synced={guestSynced.includes(device.shocker_id)}
              onSync={() => setGuestSynced((current) => current.includes(device.shocker_id) ? current.filter((id) => id !== device.shocker_id) : [...current, device.shocker_id])}
              onCommand={async (...args) => {
                try {
                  const linked = guestDevices.filter((item) => guestSynced.includes(item.shocker_id));
                  await sendGuestCommand(linked.length ? linked : [device], ...args);
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
              await sendGuestCommand(guestDevices, "stop_all");
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
  if (access !== "allowed")
    return (
      <div className="control-center-code-shell">
        <section className="control-center-access control-code-card panel">
          <ShieldAlert />
          <span className="eyebrow">Control Center unavailable</span>
          <h1>Sign in again to continue</h1>
          <p>
            CrewDeck could not verify this session. Reopen the app or sign in
            again before pairing or controlling devices.
          </p>
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
      <section className="panel control-owner-hub">
        <header>
          <div>
            <span className="eyebrow">Crew device network</span>
            <h2>Choose a Control Center</h2>
            <p>Open a trusted crew member’s devices or use their temporary link or code.</p>
          </div>
          <button className="button primary" onClick={() => setPairOpen(true)}><PlugZap /> {providerStatus.paired ? "Pair another API" : "Pair API"}</button>
        </header>
        {!!providerStatus.connections.length && <div className="control-provider-connections-app" aria-label="Paired API connections">
          {providerStatus.connections.map((connection) => <article key={connection.id}>
            <span><strong>{connection.connection_label || "Paired API"}</strong><small>{connection.device_count} device{Number(connection.device_count) === 1 ? "" : "s"}</small></span>
            <button className="button ghost" onClick={() => disconnectProvider(connection.id)} disabled={busy}><Unlink2 /> Disconnect API</button>
          </article>)}
        </div>}
        <div className="control-owner-list">
          {providerStatus.paired && (
            <button className={activeOwner?.id === user.id ? "active" : ""} onClick={loadDevices}>
              <span className="control-owner-avatar">{profile?.avatar ? <img src={profile.avatar} alt="" /> : <UserRound />}</span>
              <span><strong>My devices</strong><small>{providerStatus.paired.device_count} paired across {providerStatus.paired.connection_count || 1} connection{Number(providerStatus.paired.connection_count || 1) === 1 ? "" : "s"}</small></span>
              <ChevronRight />
            </button>
          )}
          {providerStatus.owners.map((owner) => (
            <button
              key={owner.user_id}
              className={activeOwner?.id === owner.user_id ? "active" : ""}
              onClick={() => owner.trusted ? loadOwnerDevices(owner) : setOwnerAccessOpen(owner)}
            >
              <span className="control-owner-avatar">{owner.profile?.avatar ? <img src={owner.profile.avatar} alt="" /> : <UserRound />}</span>
              <span><strong>{owner.profile?.username || "Crew member"}</strong><small>{owner.device_count} device{owner.device_count === 1 ? "" : "s"} · {owner.trusted ? "Trusted access" : "Code required"}</small></span>
              {owner.trusted ? <ShieldCheck /> : <KeyRound />}
            </button>
          ))}
          {!providerStatus.paired && !providerStatus.owners.length && (
            <div className="control-owner-empty"><PlugZap /><span><strong>No paired Control Centers yet</strong><small>Pair OpenShock or PiShock to make your devices available here.</small></span></div>
          )}
        </div>
        {providerStatus.paired && (
          <details className="control-trusted-manager">
            <summary><UserPlus /> Trusted people</summary>
            <p>Choose any crew member to give ongoing access without a temporary code. You can remove access at any time.</p>
            <div className="control-trusted-picker">
              <select value={trustedSelection} onChange={(event) => setTrustedSelection(event.target.value)} aria-label="Crew member to trust"><option value="">Choose a crew member…</option>{providerStatus.crew_options.map((person) => <option value={person.id} key={person.id}>{person.username || "Crew member"}</option>)}</select>
              <button disabled={!trustedSelection} onClick={async () => { await changeTrustedPerson(trustedSelection, true); setTrustedSelection(""); }}>Trust person</button>
            </div>
            <div className="control-trusted-list">
              {providerStatus.trusted_people.map((person) => <span key={person.id}>{person.username}<button onClick={() => changeTrustedPerson(person.id, false)}>Remove</button></span>)}
              {!providerStatus.trusted_people.length && <small>No one has permanent access yet.</small>}
            </div>
          </details>
        )}
      </section>
      <section className="panel control-global-panel">
        <div className="control-global-heading">
          <div>
            <h2>Shock controls</h2>
            <p>Devices and access update automatically.</p>
          </div>
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
        {(profile.rank?.trim().toLowerCase() === "captain" || providerStatus.paired) && activeOwner?.id === user.id && (
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
      {pairOpen && (
        <Modal title="Pair a shocker API" className="control-pair-modal" onClose={() => setPairOpen(false)}>
          <form className="control-pair-flow" onSubmit={pairProvider}>
            <div className="control-pair-guide">
              <span><PlugZap /></span>
              <div><strong>Connect OpenShock or PiShock</strong><p>Your API credential is sent directly to CrewDeck’s secure server and stored encrypted. It is never shown again.</p></div>
            </div>
            <ol>
              <li><b>1</b><span>Go to your shocker brand’s API Token page. CrewDeck supports OpenShock and PiShock.</span></li>
              <li><b>2</b><span>Generate a current API credential. For PiShock, create it without API limits—CrewDeck applies the owner’s safety limits on its server.</span></li>
              <li><b>3</b><span>Copy it and keep your own backup somewhere safe.</span></li>
              <li><b>4</b><span>Paste it below and select <strong>Pair devices</strong>.</span></li>
            </ol>
            <label><span>Provider</span><select value={pairForm.provider} onChange={(event) => setPairForm((current) => ({ ...current, provider: event.target.value }))}><option value="openshock">OpenShock</option><option value="pishock">PiShock</option></select></label>
            <label><span>Connection label</span><input value={pairForm.connectionLabel} onChange={(event) => setPairForm((current) => ({ ...current, connectionLabel: event.target.value }))} maxLength={60} placeholder="My devices" /></label>
            <label><span>API token</span><input type="password" value={pairForm.apiToken} onChange={(event) => setPairForm((current) => ({ ...current, apiToken: event.target.value }))} autoComplete="off" required /></label>
            {pairForm.provider === "pishock" && <label><span>PiShock username <small>The exact account username paired with this API key</small></span><input value={pairForm.username} onChange={(event) => setPairForm((current) => ({ ...current, username: event.target.value }))} autoComplete="username" required /></label>}
            <p className="control-pair-detect-note"><Activity /> PiShock keys used with its current API must have been generated after October 15, 2024.</p>
            <div className="modal-actions"><button type="button" className="button ghost" onClick={() => setPairOpen(false)}>Cancel</button><button className="button primary" disabled={pairBusy}>{pairBusy ? "Checking provider…" : "Pair devices"}</button></div>
          </form>
        </Modal>
      )}
      {ownerAccessOpen && (
        <Modal title={`Open ${ownerAccessOpen.profile?.username || "crew member"}’s Control Center`} className="control-owner-access-modal" onClose={() => setOwnerAccessOpen(null)}>
          <form className="control-owner-access-form" onSubmit={redeemAccessCode}>
            <KeyRound />
            <p>Ask this device owner for their current eight-character code. Their selected devices and limits will open after it is accepted.</p>
            <label><span>Access code</span><input value={accessCode} onChange={(event) => setAccessCode(formatAccessCode(event.target.value))} placeholder="ABCD-2345" maxLength={9} autoComplete="one-time-code" required /></label>
            <div className="modal-actions"><button type="button" className="button ghost" onClick={() => setOwnerAccessOpen(null)}>Cancel</button><button className="button primary" disabled={codeBusy}>{codeBusy ? "Checking code…" : "Open Control Center"}</button></div>
          </form>
        </Modal>
      )}
      {linkBuilderOpen && (
        <Modal
          title="Create guest Control Center access"
          className="control-share-builder-modal"
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
                    <fieldset className="control-link-capabilities-app">
                      <legend>Allowed controls</legend>
                      {[
                        ["allow_warning", "Warning"],
                        ["allow_beep", "Beep"],
                        ["allow_live", "Live control"],
                        ["allow_vibrate", "Vibrate"],
                        ["allow_shock", "Shock"],
                      ].map(([field, label]) => <label key={field}><input type="checkbox" checked={item[field] === true} disabled={!item.included} onChange={(event) => update({ [field]: event.target.checked })} /><span aria-hidden="true" /><span>{label}</span></label>)}
                    </fieldset>
                  </section>
                );
              })}
            </div>
            {shareLink && (
              <div className="control-link-output-row"><label className="control-link-output"><span>Generated link</span><input readOnly value={shareLink} onFocus={(event) => event.currentTarget.select()} /></label><button className="button secondary" onClick={async () => setNotice((await copyControlText(shareLink)) ? "Guest link copied." : "Select the generated link and copy it manually.")}><Copy /> Copy link</button></div>
            )}
            {shareCode && (
              <div className="control-link-output-row"><label className="control-link-output control-code-output"><span>Quick access code</span><input readOnly value={shareCode} onFocus={(event) => event.currentTarget.select()} /></label><button className="button secondary" onClick={async () => setNotice((await copyControlText(shareCode)) ? "Quick access code copied." : "Select the generated code and copy it manually.")}><Copy /> Copy code</button></div>
            )}
            {shareQr && <section className="control-share-qr-app control-share-qr-summary"><div><strong>In-person handoff</strong><p>Display a high-contrast QR for the same restricted access. It contains no API credential or raw device identifier.</p><small>Expires {new Date(shareSummary?.expiresAt).toLocaleString()} · {shareSummary?.maxUses} session{shareSummary?.maxUses === 1 ? "" : "s"} maximum</small></div><button className="button secondary" onClick={() => setShareQrOpen(true)}>Show QR code</button></section>}
            <div className="modal-actions">
              <button
                className="button ghost"
                onClick={() => setLinkBuilderOpen(false)}
              >
                {shareLink ? "Done" : "Cancel"}
              </button>
              {!shareLink && <button
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
              </button>}
            </div>
          </div>
        </Modal>
      )}
      {activeLinksOpen && (
        <Modal className="control-live-access-modal" title="Live shared access" onClose={() => { setActiveLinksOpen(false); setEditingLink(null); }}>
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
                      <fieldset className="control-link-capabilities-app"><legend>Allowed controls</legend>{[["allow_warning", "Warning"], ["allow_beep", "Beep"], ["allow_live", "Live control"], ["allow_vibrate", "Vibrate"], ["allow_shock", "Shock"]].map(([field, label]) => <label key={field}><input type="checkbox" disabled={!device.included} checked={device[field] === true} onChange={(event) => update({ [field]: event.target.checked })} /><span aria-hidden="true" /><span>{label}</span></label>)}</fieldset>
                    </article>;
                  })}
                </div>
                <div className="modal-actions"><button className="button ghost" onClick={() => setEditingLink(null)}>Cancel</button><button className="button primary" disabled={activeLinksBusy} onClick={() => saveActiveLink().catch((error) => setNotice(error.message))}>{activeLinksBusy ? "Applying…" : "Apply live changes"}</button></div>
              </section>
            )}
          </div>
        </Modal>
      )}
      {shareQrOpen && shareQr && (
        <Modal className="control-qr-presentation-modal" title="Scan access QR code" onClose={() => setShareQrOpen(false)}>
          <section className="control-share-qr-app control-share-qr-presentation">
            <img src={shareQr} alt="QR code for the restricted guest access link" />
            <div><strong>Ready for in-person handoff</strong><p>Expires {new Date(shareSummary?.expiresAt).toLocaleString()} · {shareSummary?.maxUses} session{shareSummary?.maxUses === 1 ? "" : "s"} maximum</p><p>The QR grants only the selected devices, capabilities, and safety limits.</p><div className="modal-actions"><a className="button secondary" href={shareQr} download="crewdeck-access-qr.png">Save image</a><button className="button secondary" onClick={() => window.print()}>Print</button><button className="button primary" onClick={() => setShareQrOpen(false)}>Done</button></div></div>
          </section>
        </Modal>
      )}
      <div className="control-device-grid">
        {devices.map((device) => {
          const control = controls[device.id] || initialControl();
          const deviceSafety = safety[device.id] || initialSafety();
          return (
            <article
              className={`panel control-device-card${control.synced ? " synced" : ""}${device.paused ? " is-paused" : ""}`}
              key={device.id}
            >
              <header>
                <div>
                  <h2>{device.name || "Control module"}</h2>
                  {device.paused && <span className="control-paused-badge">Paused for everyone</span>}
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
              <div className="control-console">
                <section className="control-console-lane shock-lane">
                  <header><span><Zap /></span><div><small>Shock</small><strong>{control.shockIntensity}%</strong></div></header>
                  <div className="control-vertical-rails"><ControlRail vertical label="Intensity" icon={Gauge} tone="danger" value={control.shockIntensity} min={0} max={deviceSafety.max_intensity} suffix="%" disabled={busy || device.paused} onChange={(value) => { updateControl(device.id, { shockIntensity: value }); sendLive(device.id, "shock", value); }} />
                  {!live && <ControlRail vertical label="Duration" icon={Clock3} tone="danger" value={control.shockDuration} min={1} max={Math.max(1, Math.floor(deviceSafety.max_duration))} suffix="s" disabled={busy || device.paused} onChange={(value) => updateControl(device.id, { shockDuration: value })} />}</div>
                  {!live && <button className={`control-console-operate shock${commandFeedback === `${device.id}:shock` ? " command-confirmed" : ""}`} disabled={device.paused || (busy && pendingWarning !== device.id)} onClick={() => runAction(device.id, "shock")}>{pendingWarning === device.id ? "Cancel shock" : "Shock"}</button>}
                </section>
                <section className="control-console-core">
                  {activeOwner?.id === user.id && <button className={`control-console-stop${device.paused ? " paused" : ""}${commandFeedback === `${device.id}:pause` ? " command-confirmed" : ""}`} onClick={() => toggleDevicePause(device)} disabled={busy}><ShieldAlert /><strong>{device.paused ? "RESUME" : "PAUSE"}</strong><small>{device.paused ? "Allow commands" : "Block all access"}</small></button>}
                  <button
                    className={commandFeedback === `${device.id}:beep` ? "command-confirmed" : ""}
                    onClick={() => runAction(device.id, "beep")}
                    disabled={device.paused || busy}
                  >
                    <Bell /><span>Beep</span>
                  </button>
                  {!live && <button className={control.warningEnabled ? "active" : ""} onClick={() => updateControl(device.id, { warningEnabled: !control.warningEnabled })}><AlertTriangle /><span>{control.warningEnabled ? "Warning on" : "Warning off"}</span></button>}
                  {!live && control.warningEnabled && <label className="control-warning-delay"><span>Warning</span><input type="range" min="1" max="10" value={control.warningDelay} onChange={(event) => updateControl(device.id, { warningDelay: Number(event.target.value) })} /><output>{control.warningDelay}s</output></label>}
                </section>
                <section className="control-console-lane vibrate-lane">
                  <header><span><Hand /></span><div><small>Vibrate</small><strong>{control.vibrateIntensity}%</strong></div></header>
                  <div className="control-vertical-rails"><ControlRail vertical label="Intensity" icon={Gauge} value={control.vibrateIntensity} min={0} max={deviceSafety.max_intensity} suffix="%" disabled={busy || device.paused} onChange={(value) => { updateControl(device.id, { vibrateIntensity: value }); sendLive(device.id, "vibrate", value); }} />
                  {!live && <ControlRail vertical label="Duration" icon={Clock3} value={control.vibrateDuration} min={1} max={Math.max(1, Math.floor(deviceSafety.max_duration))} suffix="s" disabled={busy || device.paused} onChange={(value) => updateControl(device.id, { vibrateDuration: value })} />}</div>
                  {!live && <button className={`control-console-operate${commandFeedback === `${device.id}:vibrate` ? " command-confirmed" : ""}`} disabled={busy || device.paused} onClick={() => runAction(device.id, "vibrate")}>Vibrate</button>}
                </section>
              </div>
              {!live && (
                <details className="control-advanced">
                  <summary>Advanced Settings</summary>
                  <div className="control-advanced-grid">
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
                    {activeOwner?.id === user.id && (
                      <section className="control-safety-settings">
                        <header className="control-safety-heading">
                          <div>
                            <span>Owner tools</span>
                            <h3>Device settings and safety</h3>
                            <p>
                              Rename and configure only the devices you own.
                            </p>
                          </div>
                        </header>
                        <label className="control-device-name-field">
                          <span>Device name</span>
                          <input
                            value={device.name || ""}
                            maxLength="80"
                            onChange={(event) => setDevices((current) => current.map((item) => item.id === device.id ? { ...item, name: event.target.value } : item))}
                          />
                          <small>Leave the provider name unchanged to use “{device.providerName || device.name}”.</small>
                        </label>
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
                        <footer>
                          <span>
                            These limits are enforced before a command reaches
                            the paired provider.
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
            </article>
          );
        })}
      </div>
      {activeOwner?.id === user.id && <section className="panel control-log-panel">
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
      </section>}
    </div>
  );
}

export { canUseControlCenter };
