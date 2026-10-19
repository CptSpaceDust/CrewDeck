import { useEffect, useRef, useState } from "react";
import {
  Bell,
  Download,
  LockKeyhole,
  Mic2,
  MonitorSpeaker,
  Power,
  RefreshCw,
  SlidersHorizontal,
  UserPlus,
  Volume2,
} from "lucide-react";
import { Field, PageHeader } from "./ui";
import { UpdateVisual } from "./UpdateVisual";
import {
  defaultPreferences,
  getPreferences,
  updatePreferences,
} from "../lib/preferences";
import { playNotificationSound } from "../lib/sounds";
import { MyModerationAppeals } from "./ModerationAppeals";
import { supabase } from "../lib/supabase";

function AudioDevices({ preferences, preference }) {
  const [inputs, setInputs] = useState([]);
  const [outputs, setOutputs] = useState([]);
  const [message, setMessage] = useState("");
  const [testing, setTesting] = useState(false);
  const [level, setLevel] = useState(0);
  const streamRef = useRef(null);

  async function refresh(requestAccess = false) {
    try {
      if (requestAccess) {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        stream.getTracks().forEach((track) => track.stop());
      }
      const devices = await navigator.mediaDevices.enumerateDevices();
      const nextInputs = devices.filter(
        (device) => device.kind === "audioinput",
      );
      const nextOutputs = devices.filter(
        (device) => device.kind === "audiooutput",
      );
      setInputs(nextInputs);
      setOutputs(nextOutputs);
      setMessage("Audio devices refreshed.");
    } catch (error) {
      setMessage(error?.message || "Audio devices could not be opened.");
    }
  }

  useEffect(() => {
    refresh();
    const changed = () => refresh();
    navigator.mediaDevices?.addEventListener?.("devicechange", changed);
    return () => {
      navigator.mediaDevices?.removeEventListener?.("devicechange", changed);
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  async function testMicrophone() {
    if (testing) return;
    setTesting(true);
    setLevel(0);
    let context;
    let frame;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: preferences.audioInputDeviceId
            ? { exact: preferences.audioInputDeviceId }
            : undefined,
          noiseSuppression: preferences.noiseSuppression !== false,
          echoCancellation: preferences.echoCancellation !== false,
          autoGainControl: preferences.autoGainControl !== false,
        },
      });
      streamRef.current = stream;
      context = new AudioContext();
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      context.createMediaStreamSource(stream).connect(analyser);
      const values = new Uint8Array(analyser.frequencyBinCount);
      const started = performance.now();
      const sample = () => {
        analyser.getByteFrequencyData(values);
        const average =
          values.reduce((sum, value) => sum + value, 0) / values.length;
        setLevel(Math.min(100, Math.round(average * 1.7)));
        if (performance.now() - started < 4000)
          frame = requestAnimationFrame(sample);
        else finish();
      };
      const finish = () => {
        cancelAnimationFrame(frame);
        stream.getTracks().forEach((track) => track.stop());
        context.close();
        streamRef.current = null;
        setTesting(false);
        setLevel(0);
        setMessage("Microphone test complete.");
      };
      sample();
    } catch (error) {
      context?.close();
      setTesting(false);
      setMessage(error?.message || "The microphone test could not start.");
    }
  }

  return (
    <section className="panel settings-panel settings-panel-wide">
      <div className="section-icon">
        <MonitorSpeaker />
      </div>
      <h2>Calls & audio</h2>
      <p>
        Choose the microphone and speakers used for calls and sound previews.
      </p>
      <div className="settings-device-grid">
        <Field label="Microphone">
          <select
            value={preferences.audioInputDeviceId}
            onChange={(event) =>
              preference("audioInputDeviceId", event.target.value)
            }
          >
            <option value="">System default</option>
            {inputs.map((device, index) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || `Microphone ${index + 1}`}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Speakers">
          <select
            value={preferences.audioOutputDeviceId}
            onChange={(event) =>
              preference("audioOutputDeviceId", event.target.value)
            }
          >
            <option value="">System default</option>
            {outputs.map((device, index) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || `Speaker ${index + 1}`}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="audio-test-row">
        <button
          className="button secondary"
          type="button"
          onClick={() => refresh(true)}
        >
          <RefreshCw /> Refresh devices
        </button>
        <button
          className="button secondary"
          type="button"
          onClick={testMicrophone}
          disabled={testing}
        >
          <Mic2 /> {testing ? "Listening…" : "Test microphone"}
        </button>
        <div
          className="settings-mic-meter"
          aria-label={`Microphone level ${level}%`}
        >
          <i style={{ width: `${level}%` }} />
        </div>
      </div>
      <label className="check-field">
        <input
          type="checkbox"
          checked={preferences.pushToTalkDefault}
          onChange={(event) =>
            preference("pushToTalkDefault", event.target.checked)
          }
        />
        <span>Start calls with push to talk enabled</span>
      </label>
      <Field label="Push to talk key">
        <select
          value={preferences.pushToTalkKey || "Space"}
          onChange={(event) => preference("pushToTalkKey", event.target.value)}
        >
          <option value="Space">Space</option>
          <option value="KeyV">V</option>
          <option value="Backquote">`</option>
          <option value="CapsLock">Caps Lock</option>
        </select>
      </Field>
      <div className="settings-audio-processing">
        <label className="check-field voice-check-setting">
          <input
            type="checkbox"
            checked={preferences.voiceCheckBeforeJoining !== false}
            onChange={(event) =>
              preference("voiceCheckBeforeJoining", event.target.checked)
            }
          />
          <span>
            <strong>Voice check before joining</strong>
            <small>
              Show a microphone preview and audio summary before a call
              connects.
            </small>
          </span>
        </label>
        <label className="check-field">
          <input
            type="checkbox"
            checked={preferences.noiseSuppression !== false}
            onChange={(event) =>
              preference("noiseSuppression", event.target.checked)
            }
          />
          <span>Reduce background noise</span>
        </label>
        <label className="check-field">
          <input
            type="checkbox"
            checked={preferences.echoCancellation !== false}
            onChange={(event) =>
              preference("echoCancellation", event.target.checked)
            }
          />
          <span>Cancel speaker echo</span>
        </label>
        <label className="check-field">
          <input
            type="checkbox"
            checked={preferences.autoGainControl !== false}
            onChange={(event) =>
              preference("autoGainControl", event.target.checked)
            }
          />
          <span>Automatically balance microphone volume</span>
        </label>
      </div>
      {message && <p className="micro-copy">{message}</p>}
    </section>
  );
}

export default function AppSettings({ user }) {
  const [accountMessage, setAccountMessage] = useState("");
  const [diagnostics, setDiagnostics] = useState([]);
  const [diagnosing, setDiagnosing] = useState(false);
  const [settings, setSettings] = useState({
    enabled: false,
    timeoutMinutes: 5,
  });
  const [current, setCurrent] = useState("");
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [preferences, setPreferences] = useState(defaultPreferences);
  const [friendSettings, setFriendSettings] = useState({
    recommendations_enabled: false,
    activity_feed_enabled: false,
    one_click_meetup_enabled: false,
    meetup_preset: {},
    show_badges: true,
    show_interests: true,
    show_favorite_games: true,
  });
  const [friendSettingsMessage, setFriendSettingsMessage] = useState("");
  const [interactionPreferences, setInteractionPreferences] = useState({
    messages_from: "everyone",
    calls_from: "everyone",
    invites_from: "everyone",
    mentions_from: "everyone",
    friend_requests_from: "everyone",
    warn_suspicious_links: true,
  });
  const [privacyMessage, setPrivacyMessage] = useState("");
  const [privacyCrew, setPrivacyCrew] = useState([]);
  const [trustedContacts, setTrustedContacts] = useState([]);
  const [boundaries, setBoundaries] = useState([]);
  const [notificationStatus, setNotificationStatus] = useState(null);
  const [notificationMessage, setNotificationMessage] = useState("");
  const [startup, setStartup] = useState(false);
  const [update, setUpdate] = useState({
    status: "idle",
    currentVersion: "",
    message: "",
  });
  useEffect(() => {
    window.desktop.appLock.getState().then(setSettings);
    window.desktop.notifications.getStatus().then(setNotificationStatus);
    window.desktop.system
      .getStartup()
      .then((value) => setStartup(Boolean(value.enabled)));
    setPreferences(getPreferences());
    if (user?.id) {
      supabase
        .from("friend_feature_settings")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (data)
            setFriendSettings((current) => ({
              ...current,
              ...data,
              meetup_preset: data.meetup_preset || {},
            }));
        });
      supabase.from("interaction_preferences").select("*").eq("user_id", user.id).maybeSingle().then(({ data }) => data && setInteractionPreferences((current) => ({ ...current, ...data })));
      refreshPrivacyContacts();
    }
  }, []);
  function preference(key, value) {
    setPreferences(updatePreferences({ [key]: value }));
  }
  async function saveFriendSettings(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const next = {
      ...friendSettings,
      user_id: user.id,
      meetup_preset: {
        duration: Number(form.get("duration") || 2),
        meetup_type: String(
          form.get("meetup_type") || "Hanging Out / Chatting",
        ),
        time_flexibility: String(form.get("time_flexibility") || "exact"),
        message: String(form.get("message") || "").trim(),
      },
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase
      .from("friend_feature_settings")
      .upsert(next, { onConflict: "user_id" });
    setFriendSettingsMessage(error?.message || "Friend settings saved.");
    if (!error) setFriendSettings(next);
  }
  async function saveInteractionPreferences(event) {
    event.preventDefault();
    const { error } = await supabase.from("interaction_preferences").upsert({ ...interactionPreferences, user_id:user.id, updated_at:new Date().toISOString() }, { onConflict:"user_id" });
    setPrivacyMessage(error?.message || "Privacy checkup saved.");
  }
  async function refreshPrivacyContacts() {
    if (!user?.id) return;
    const [crew, trusted, paused] = await Promise.all([
      supabase.from("profiles").select("id,username").neq("id", user.id).order("username"),
      supabase.from("trusted_contacts").select("trusted_user_id").eq("owner_id", user.id),
      supabase.from("communication_boundaries").select("target_id,paused_until").eq("owner_id", user.id).gt("paused_until", new Date().toISOString()),
    ]);
    setPrivacyCrew(crew.data || []); setTrustedContacts(trusted.data || []); setBoundaries(paused.data || []);
  }
  async function addTrustedContact(event) {
    event.preventDefault(); const target = new FormData(event.currentTarget).get("target_id"); if (!target) return;
    const { error } = await supabase.from("trusted_contacts").upsert({ owner_id:user.id, trusted_user_id:target }); setPrivacyMessage(error?.message || "Trusted contact added."); if (!error) { event.currentTarget.reset(); refreshPrivacyContacts(); }
  }
  async function pauseContact(event) {
    event.preventDefault(); const form = new FormData(event.currentTarget); const target = form.get("target_id"); if (!target) return; const days = Number(form.get("days") || 1);
    const { error } = await supabase.from("communication_boundaries").upsert({ owner_id:user.id, target_id:target, paused_until:new Date(Date.now() + days * 86400000).toISOString() }); setPrivacyMessage(error?.message || "Contact paused."); if (!error) { event.currentTarget.reset(); refreshPrivacyContacts(); }
  }
  useEffect(() => {
    window.desktop.updater.getState().then(setUpdate);
    return window.desktop.updater.onState(setUpdate);
  }, []);
  async function save(event) {
    event.preventDefault();
    if (pin !== confirm) return setMessage("The new PIN entries do not match.");
    const result = await window.desktop.appLock.setPin(pin, current);
    setMessage(result.ok ? "App lock enabled." : result.error);
    if (result.ok) {
      setSettings(result.settings);
      setCurrent("");
      setPin("");
      setConfirm("");
    }
  }
  async function disable() {
    const result = await window.desktop.appLock.disable(current);
    setMessage(result.ok ? "App lock disabled." : result.error);
    if (result.ok) setSettings(result.settings);
  }
  async function setTimeoutMinutes(value) {
    const result = await window.desktop.appLock.setTimeout(Number(value));
    if (result.ok) setSettings(result.settings);
  }
  async function testWindowsNotification() {
    const result = await window.desktop.notifications.test();
    setNotificationMessage(
      result.ok ? "Test notification sent to Windows." : result.error,
    );
  }
  async function setLaunchAtStartup(enabled) {
    const result = await window.desktop.system.setStartup(enabled);
    setStartup(Boolean(result.enabled));
  }
  async function runDiagnostics() {
    if (diagnosing) return;
    setDiagnosing(true);
    setDiagnostics([]);
    const started = performance.now();
    const checks = [];
    try {
      checks.push({
        name: "Internet connection",
        ok: navigator.onLine,
        detail: navigator.onLine ? "Online" : "CrewDeck is offline",
      });
      const session = await supabase.auth.getSession();
      checks.push({
        name: "Account session",
        ok: Boolean(session.data.session) && !session.error,
        detail:
          session.error?.message ||
          (session.data.session ? "Signed in securely" : "No active session"),
      });
      const databaseStarted = performance.now();
      const [profileCheck, services, notificationCheck] = await Promise.all([
        supabase.from("profiles").select("id").eq("id", user.id).maybeSingle(),
        supabase
          .from("community_system_state")
          .select(
            "messaging_status,calls_status,notifications_status,maintenance_enabled",
          )
          .eq("id", true)
          .maybeSingle(),
        supabase
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id),
      ]);
      checks.push({
        name: "Supabase database",
        ok: !profileCheck.error && Boolean(profileCheck.data),
        detail:
          profileCheck.error?.message ||
          `${Math.round(performance.now() - databaseStarted)} ms response`,
      });
      checks.push({
        name: "Messaging service",
        ok: !services.error && services.data?.messaging_status !== "offline",
        detail:
          services.error?.message ||
          services.data?.messaging_status ||
          "Operational",
      });
      checks.push({
        name: "Voice call service",
        ok: !services.error && services.data?.calls_status !== "offline",
        detail:
          services.error?.message ||
          services.data?.calls_status ||
          "Operational",
      });
      checks.push({
        name: "Notification database",
        ok: !notificationCheck.error,
        detail:
          notificationCheck.error?.message ||
          `${notificationCheck.count || 0} notifications reachable`,
      });
      const realtime = await new Promise((resolve) => {
        const channel = supabase.channel(`diagnostic-${crypto.randomUUID()}`);
        const timer = setTimeout(() => {
          supabase.removeChannel(channel);
          resolve({ ok: false, detail: "Connection timed out" });
        }, 5000);
        channel.subscribe((status) => {
          if (status === "SUBSCRIBED") {
            clearTimeout(timer);
            supabase.removeChannel(channel);
            resolve({ ok: true, detail: "Realtime connection established" });
          }
          if (["CHANNEL_ERROR", "TIMED_OUT"].includes(status)) {
            clearTimeout(timer);
            supabase.removeChannel(channel);
            resolve({
              ok: false,
              detail: status.toLowerCase().replace("_", " "),
            });
          }
        });
      });
      checks.push({ name: "Realtime updates", ...realtime });
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const microphones = devices.filter(
          (item) => item.kind === "audioinput",
        ).length;
        const speakers = devices.filter(
          (item) => item.kind === "audiooutput",
        ).length;
        checks.push({
          name: "Call hardware",
          ok: microphones > 0,
          detail: `${microphones} microphone${microphones === 1 ? "" : "s"} · ${speakers} output${speakers === 1 ? "" : "s"}`,
        });
      } catch (error) {
        checks.push({
          name: "Call hardware",
          ok: false,
          detail: error.message,
        });
      }
      const alerts = await window.desktop.notifications.getStatus();
      checks.push({
        name: "Windows alerts",
        ok: Boolean(alerts.supported),
        detail: alerts.supported
          ? "Available"
          : "Unavailable in Windows settings",
      });
      checks.push({
        name: "Maintenance mode",
        ok: !services.data?.maintenance_enabled,
        detail: services.data?.maintenance_enabled
          ? "Community actions are paused"
          : "Normal operation",
      });
      setDiagnostics(checks);
      setAccountMessage(
        `${checks.filter((item) => item.ok).length} of ${checks.length} checks passed in ${Math.round(performance.now() - started)} ms.`,
      );
    } catch (error) {
      checks.push({
        name: "Diagnostics runner",
        ok: false,
        detail: error?.message || "The diagnostic check stopped unexpectedly.",
      });
      setDiagnostics(checks);
      setAccountMessage("Diagnostics finished with an unexpected error.");
    } finally {
      setDiagnosing(false);
    }
  }
  return (
    <div className="page settings-page">
      <PageHeader
        eyebrow="Desktop settings"
        title="Settings that matter"
        description="Personalize CrewDeck, choose how calls sound, and manage privacy and desktop behavior."
      />
      <div className="settings-grid">
        <div className="settings-group-heading">
          <span>01</span>
          <div>
            <h2>Friends & discovery</h2>
            <p>
              Private connections, recommendations, activity, and meetup
              shortcuts.
            </p>
          </div>
        </div>
        <section className="panel settings-panel settings-panel-wide friend-settings-panel">
          <div className="section-icon">
            <UserPlus />
          </div>
          <h2>Friends & discovery</h2>
          <p>
            Choose which friend features appear and set the defaults used when
            you plan a meetup from the Friends page.
          </p>
          <form
            className="stack-form"
            onSubmit={saveFriendSettings}
            key={JSON.stringify(friendSettings.meetup_preset || {})}
          >
            <div className="settings-toggle-grid">
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={friendSettings.recommendations_enabled}
                  onChange={(event) =>
                    setFriendSettings((value) => ({
                      ...value,
                      recommendations_enabled: event.target.checked,
                    }))
                  }
                />
                <span>Show friend recommendations</span>
              </label>
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={friendSettings.activity_feed_enabled}
                  onChange={(event) =>
                    setFriendSettings((value) => ({
                      ...value,
                      activity_feed_enabled: event.target.checked,
                    }))
                  }
                />
                <span>Show friend activity</span>
              </label>
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={friendSettings.one_click_meetup_enabled}
                  onChange={(event) =>
                    setFriendSettings((value) => ({
                      ...value,
                      one_click_meetup_enabled: event.target.checked,
                    }))
                  }
                />
                <span>Use my meetup preset from Friends</span>
              </label>
            </div>
            <h3>Profile highlights shared with friends</h3>
            <div className="settings-toggle-grid">
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={friendSettings.show_badges}
                  onChange={(event) =>
                    setFriendSettings((value) => ({
                      ...value,
                      show_badges: event.target.checked,
                    }))
                  }
                />
                <span>Badges</span>
              </label>
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={friendSettings.show_interests}
                  onChange={(event) =>
                    setFriendSettings((value) => ({
                      ...value,
                      show_interests: event.target.checked,
                    }))
                  }
                />
                <span>Interests</span>
              </label>
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={friendSettings.show_favorite_games}
                  onChange={(event) =>
                    setFriendSettings((value) => ({
                      ...value,
                      show_favorite_games: event.target.checked,
                    }))
                  }
                />
                <span>Favorite games</span>
              </label>
            </div>
            <section className="friend-meetup-preset-card">
              <header>
                <span className="friend-meetup-preset-icon">01</span>
                <div>
                  <h3>One-click meetup preset</h3>
                  <p>
                    Defaults used when you plan a meetup directly from a friend
                    card.
                  </p>
                </div>
              </header>
              <div className="form-grid friend-meetup-preset">
                <Field label="Default duration">
                  <select
                    name="duration"
                    defaultValue={friendSettings.meetup_preset?.duration || 2}
                  >
                    <option value="1">1 hour</option>
                    <option value="2">2 hours</option>
                    <option value="3">3 hours</option>
                    <option value="4">4 hours</option>
                  </select>
                </Field>
                <Field label="Default meetup type">
                  <select
                    name="meetup_type"
                    defaultValue={
                      friendSettings.meetup_preset?.meetup_type ||
                      "Hanging Out / Chatting"
                    }
                  >
                    <option>Gaming</option>
                    <option>World Exploration</option>
                    <option>Hanging Out / Chatting</option>
                    <option>Watching Something</option>
                    <option>Working on a Project</option>
                    <option>Other</option>
                  </select>
                </Field>
                <Field label="Scheduling flexibility">
                  <select
                    name="time_flexibility"
                    defaultValue={
                      friendSettings.meetup_preset?.time_flexibility || "exact"
                    }
                  >
                    <option value="exact">Exact time only</option>
                    <option value="30">±30 minutes</option>
                    <option value="60">±1 hour</option>
                  </select>
                </Field>
                <Field label="Default note">
                  <input
                    name="message"
                    maxLength="700"
                    defaultValue={friendSettings.meetup_preset?.message || ""}
                  />
                </Field>
              </div>
            </section>
            <button className="button primary">Save friend settings</button>
            {friendSettingsMessage && (
              <p className="form-message">{friendSettingsMessage}</p>
            )}
          </form>
        </section>
        <div className="settings-group-heading">
          <span>02</span>
          <div>
            <h2>Look & privacy</h2>
            <p>How CrewDeck feels and how it protects your session.</p>
          </div>
        </div>
        <section className="panel settings-panel">
          <div className="section-icon">
            <SlidersHorizontal />
          </div>
          <h2>Appearance & accessibility</h2>
          <p>
            Balanced is the intended Space Glass look. Soft is calmer; Deep adds
            stronger transparency and depth.
          </p>
          <Field label="Glass strength">
            <select
              value={preferences.glassIntensity}
              onChange={(event) =>
                preference("glassIntensity", event.target.value)
              }
            >
              <option value="soft">Soft</option>
              <option value="balanced">Balanced · recommended</option>
              <option value="deep">Deep</option>
            </select>
          </Field>
          <Field label="Space Glass theme">
            <select
              value={preferences.accent || "default"}
              onChange={(event) => preference("accent", event.target.value)}
            >
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
          <Field label="Interface size">
            <select
              value={preferences.interfaceScale}
              onChange={(event) =>
                preference("interfaceScale", Number(event.target.value))
              }
            >
              <option value="90">Small · 90%</option>
              <option value="100">Default · 100%</option>
              <option value="110">Large · 110%</option>
              <option value="120">Extra large · 120%</option>
            </select>
          </Field>
          <Field
            label={`Message text size · ${preferences.messageFontSize || 100}%`}
          >
            <input
              type="range"
              min="90"
              max="130"
              step="5"
              value={preferences.messageFontSize || 100}
              onChange={(event) =>
                preference("messageFontSize", Number(event.target.value))
              }
            />
          </Field>
          <Field label="Reading width">
            <select
              value={preferences.readingWidth || "wide"}
              onChange={(event) =>
                preference("readingWidth", event.target.value)
              }
            >
              <option value="narrow">Narrow</option>
              <option value="wide">Comfortable</option>
              <option value="full">Full width</option>
            </select>
          </Field>
          <Field label="Message spacing">
            <select
              value={preferences.messageSpacing || "comfortable"}
              onChange={(event) =>
                preference("messageSpacing", event.target.value)
              }
            >
              <option value="compact">Compact</option>
              <option value="comfortable">Comfortable</option>
              <option value="spacious">Spacious</option>
            </select>
          </Field>
          <Field
            label={`Motion intensity · ${preferences.reduceMotion ? 0 : (preferences.motionIntensity ?? 100)}%`}
          >
            <input
              type="range"
              min="0"
              max="100"
              step="10"
              value={
                preferences.reduceMotion
                  ? 0
                  : (preferences.motionIntensity ?? 100)
              }
              disabled={preferences.reduceMotion}
              onChange={(event) =>
                preference("motionIntensity", Number(event.target.value))
              }
            />
          </Field>
          <label className="check-field">
            <input
              type="checkbox"
              checked={Boolean(preferences.dyslexicFont)}
              onChange={(event) =>
                preference("dyslexicFont", event.target.checked)
              }
            />
            <span>Use a dyslexia-friendly reading font</span>
          </label>
          <label className="check-field">
            <input
              type="checkbox"
              checked={Boolean(preferences.reducedEffects)}
              onChange={(event) =>
                preference("reducedEffects", event.target.checked)
              }
            />
            <span>Reduce glass blur and visual effects</span>
          </label>
          <label className="check-field">
            <input
              type="checkbox"
              checked={preferences.compactLayout}
              onChange={(event) =>
                preference("compactLayout", event.target.checked)
              }
            />
            <span>Use a more compact layout</span>
          </label>
          <label className="check-field">
            <input
              type="checkbox"
              checked={preferences.reduceMotion}
              onChange={(event) =>
                preference("reduceMotion", event.target.checked)
              }
            />
            <span>Reduce motion and animation</span>
          </label>
          <label className="check-field">
            <input
              type="checkbox"
              checked={preferences.highContrast}
              onChange={(event) =>
                preference("highContrast", event.target.checked)
              }
            />
            <span>Increase text and border contrast</span>
          </label>
          <label className="check-field">
            <input
              type="checkbox"
              checked={preferences.strongFocus}
              onChange={(event) =>
                preference("strongFocus", event.target.checked)
              }
            />
            <span>Use stronger keyboard focus outlines</span>
          </label>
          <label className="check-field">
            <input
              type="checkbox"
              checked={preferences.underlineLinks}
              onChange={(event) =>
                preference("underlineLinks", event.target.checked)
              }
            />
            <span>Underline links</span>
          </label>
          <label className="check-field">
            <input
              type="checkbox"
              checked={preferences.largeControls}
              onChange={(event) =>
                preference("largeControls", event.target.checked)
              }
            />
            <span>Use larger buttons and form controls</span>
          </label>
          <label className="check-field"><input type="checkbox" checked={Boolean(preferences.reducedTransparency)} onChange={(event) => preference("reducedTransparency", event.target.checked)} /><span>Reduce transparency while keeping Space Glass borders</span></label>
          <label className="check-field"><input type="checkbox" checked={Boolean(preferences.colorblindIndicators)} onChange={(event) => preference("colorblindIndicators", event.target.checked)} /><span>Use shapes and labels with status colors</span></label>
          <label className="check-field"><input type="checkbox" checked={Boolean(preferences.audioCueCaptions)} onChange={(event) => preference("audioCueCaptions", event.target.checked)} /><span>Show a visual caption when CrewDeck plays an audio cue</span></label>
        </section>
        <section className="panel settings-panel">
          <div className="section-icon">
            <LockKeyhole />
          </div>
          <h2>App lock with PIN</h2>
          <p>
            The PIN never leaves this computer and is stored as a salted one-way
            hash.
          </p>
          <form onSubmit={save}>
            {settings.enabled && (
              <Field label="Current PIN">
                <input
                  type="password"
                  inputMode="numeric"
                  value={current}
                  onChange={(e) =>
                    setCurrent(e.target.value.replace(/\D/g, ""))
                  }
                  required
                />
              </Field>
            )}
            <Field label="New PIN">
              <input
                type="password"
                inputMode="numeric"
                minLength="4"
                maxLength="8"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                required
              />
            </Field>
            <Field label="Confirm PIN">
              <input
                type="password"
                inputMode="numeric"
                minLength="4"
                maxLength="8"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ""))}
                required
              />
            </Field>
            <div className="button-row">
              <button className="button primary">
                {settings.enabled ? "Change PIN" : "Enable app lock"}
              </button>
              {settings.enabled && (
                <button
                  className="button danger"
                  type="button"
                  onClick={disable}
                >
                  Disable
                </button>
              )}
            </div>
          </form>
          <div className="settings-lock-rules">
            <Field label="Lock after app is in the background">
              <select
                value={settings.timeoutMinutes}
                disabled={!settings.enabled}
                onChange={(event) => setTimeoutMinutes(event.target.value)}
              >
                <option value="1">1 minute</option>
                <option value="5">5 minutes</option>
                <option value="15">15 minutes</option>
                <option value="30">30 minutes</option>
              </select>
            </Field>
            <Field label="Lock after no activity">
              <select
                value={preferences.inactivityLockMinutes}
                disabled={!settings.enabled}
                onChange={(event) =>
                  preference(
                    "inactivityLockMinutes",
                    Number(event.target.value),
                  )
                }
              >
                <option value="0">Never</option>
                <option value="1">1 minute</option>
                <option value="5">5 minutes</option>
                <option value="15">15 minutes</option>
                <option value="30">30 minutes</option>
              </select>
            </Field>
          </div>
          <button
            className="button secondary"
            type="button"
            disabled={!settings.enabled}
            onClick={() => window.desktop.appLock.lockNow()}
          >
            Lock now
          </button>
          {message && <p className="form-message">{message}</p>}
        </section>
        <div className="settings-group-heading">
          <span>03</span>
          <div>
            <h2>Calls & account</h2>
            <p>Audio hardware, voice processing, and moderation history.</p>
          </div>
        </div>
        <AudioDevices preferences={preferences} preference={preference} />
        {user && <MyModerationAppeals user={user} />}
        <div className="settings-group-heading">
          <span>04</span>
          <div>
            <h2>Alerts & desktop</h2>
            <p>Notification behavior, startup, and app updates.</p>
          </div>
        </div>
        <section className="panel settings-panel settings-panel-wide">
          <div className="section-icon">
            <Bell />
          </div>
          <h2>Notifications</h2>
          <p>
            Control Windows alerts, sounds, quiet hours, and meetup reminders.
          </p>
          <p className="micro-copy">
            Alerts and incoming-call sounds stay active while the app is locked.
            You can optionally hide their details until you enter your PIN.
          </p>
          {notificationStatus && !notificationStatus.supported && (
            <div className="notification-health blocked">
              <Bell />
              <span>
                <strong>Windows notifications are unavailable</strong>
                <small>
                  Check Windows notification permissions for CrewDeck.
                </small>
              </span>
            </div>
          )}
          <div className="settings-toggle-grid">
            <label className="check-field">
              <input
                type="checkbox"
                checked={preferences.desktopNotifications}
                onChange={(event) =>
                  preference("desktopNotifications", event.target.checked)
                }
              />
              <span>Show Windows notifications</span>
            </label>
            <label className="check-field"><input type="checkbox" checked={preferences.callNotifications !== false} onChange={(event) => preference("callNotifications", event.target.checked)} /><span>Notify and ring for incoming calls</span></label>
            <label className="check-field"><input type="checkbox" checked={preferences.reactionNotifications !== false} onChange={(event) => preference("reactionNotifications", event.target.checked)} /><span>Notify when someone reacts to my message</span></label>
            <label className="check-field"><input type="checkbox" checked={preferences.notificationBundling !== false} onChange={(event) => preference("notificationBundling", event.target.checked)} /><span>Bundle message bursts into one notification</span></label>
            <label className="check-field"><input type="checkbox" checked={Boolean(preferences.privateNotificationPreviews)} onChange={(event) => preference("privateNotificationPreviews", event.target.checked)} /><span>Hide message contents in notification previews</span></label>
            <label className="check-field">
              <input
                type="checkbox"
                checked={preferences.messageNotifications}
                disabled={!preferences.desktopNotifications}
                onChange={(event) =>
                  preference("messageNotifications", event.target.checked)
                }
              />
              <span>Notify for messages I am not viewing</span>
            </label>
            <label className="check-field">
              <input
                type="checkbox"
                checked={preferences.hideNotificationContentWhenLocked}
                disabled={!preferences.desktopNotifications}
                onChange={(event) =>
                  preference(
                    "hideNotificationContentWhenLocked",
                    event.target.checked,
                  )
                }
              />
              <span>Hide notification details while app is locked</span>
            </label>
          </div>
          <label className="check-field">
            <input
              type="checkbox"
              checked={preferences.notificationSound}
              onChange={(event) =>
                preference("notificationSound", event.target.checked)
              }
            />
            <span>Play notification sounds</span>
          </label>
          <Field label="Sound volume">
            <div className="settings-range">
              <Volume2 />
              <input
                type="range"
                min="0"
                max="100"
                value={preferences.notificationVolume}
                disabled={!preferences.notificationSound}
                onChange={(event) =>
                  preference("notificationVolume", Number(event.target.value))
                }
              />
              <span>{preferences.notificationVolume}%</span>
            </div>
          </Field>
          <div className="button-row">
            <button
              className="button secondary"
              type="button"
              disabled={!preferences.notificationSound}
              onClick={() =>
                playNotificationSound({
                  force: true,
                  outputDeviceId: preferences.audioOutputDeviceId,
                })
              }
            >
              <Volume2 /> Play sound
            </button>
            <button
              className="button secondary"
              type="button"
              disabled={!notificationStatus?.supported}
              onClick={testWindowsNotification}
            >
              <Bell /> Send test notification
            </button>
          </div>
          <label className="check-field">
            <input
              type="checkbox"
              checked={preferences.quietHours}
              onChange={(event) =>
                preference("quietHours", event.target.checked)
              }
            />
            <span>Use quiet hours</span>
          </label>
          {preferences.quietHours && (
            <div className="form-grid">
              <Field label="Quiet from">
                <input
                  type="time"
                  value={preferences.quietStart}
                  onChange={(event) =>
                    preference("quietStart", event.target.value)
                  }
                />
              </Field>
              <Field label="Until">
                <input
                  type="time"
                  value={preferences.quietEnd}
                  onChange={(event) =>
                    preference("quietEnd", event.target.value)
                  }
                />
              </Field>
            </div>
          )}
          <label className="check-field">
            <input
              type="checkbox"
              checked={preferences.meetupReminders}
              onChange={(event) =>
                preference("meetupReminders", event.target.checked)
              }
            />
            <span>Remind me before approved meetups</span>
          </label>
          <Field label="Reminder time">
            <select
              value={preferences.reminderMinutes}
              disabled={!preferences.meetupReminders}
              onChange={(event) =>
                preference("reminderMinutes", Number(event.target.value))
              }
            >
              <option value="5">5 minutes before</option>
              <option value="15">15 minutes before</option>
              <option value="30">30 minutes before</option>
              <option value="60">1 hour before</option>
              <option value="1440">1 day before</option>
            </select>
          </Field>
          {notificationMessage && (
            <p className="form-message">{notificationMessage}</p>
          )}
        </section>
        <section className="panel settings-panel settings-panel-wide privacy-checkup-panel">
          <div className="section-icon">
            <LockKeyhole />
          </div>
          <h2>Privacy checkup</h2>
          <p>Review who can reach you. Trusted contacts can pass stricter friend-only settings.</p>
          <form className="privacy-checkup-grid" onSubmit={saveInteractionPreferences}>
            {[["messages_from","Message me"],["calls_from","Call me"],["invites_from","Invite me"],["mentions_from","Mention me"]].map(([key,label]) => <Field label={`Who may ${label.toLowerCase()}?`} key={key}><select value={interactionPreferences[key]} onChange={(event) => setInteractionPreferences((current) => ({ ...current, [key]:event.target.value }))}><option value="everyone">Everyone</option><option value="friends">Friends</option><option value="trusted">Trusted contacts</option><option value="nobody">Nobody</option></select></Field>)}
            <Field label="Who may add me as a friend?"><select value={interactionPreferences.friend_requests_from} onChange={(event) => setInteractionPreferences((current) => ({ ...current, friend_requests_from:event.target.value }))}><option value="everyone">Everyone</option><option value="friends_of_friends">Friends of friends</option><option value="nobody">Nobody</option></select></Field>
            <label className="check-field"><input type="checkbox" checked={interactionPreferences.warn_suspicious_links} onChange={(event) => setInteractionPreferences((current) => ({ ...current, warn_suspicious_links:event.target.checked }))} /><span>Warn before opening suspicious or misleading links</span></label>
            <button className="button primary">Save privacy choices</button>{privacyMessage && <p className="form-message">{privacyMessage}</p>}
          </form>
          <div className="privacy-contact-manager">
            <form className="privacy-contact-card" onSubmit={addTrustedContact}><h3>Trusted contacts</h3><p>Allow selected people through trusted-only contact settings.</p><Field label="Crew member"><select name="target_id" required><option value="">Choose a crew member</option>{privacyCrew.map((person) => <option key={person.id} value={person.id}>{person.username}</option>)}</select></Field><button className="button secondary">Add trusted contact</button><div className="privacy-contact-chips">{trustedContacts.map((item) => <button type="button" key={item.trusted_user_id} onClick={async () => { await supabase.from("trusted_contacts").delete().eq("owner_id", user.id).eq("trusted_user_id", item.trusted_user_id); refreshPrivacyContacts(); }}>{privacyCrew.find((person) => person.id === item.trusted_user_id)?.username || "Crew member"} ×</button>)}</div></form>
            <form className="privacy-contact-card" onSubmit={pauseContact}><h3>Temporary contact pause</h3><p>Pause calls, messages, mentions, and invitations from one person.</p><Field label="Crew member"><select name="target_id" required><option value="">Choose a crew member</option>{privacyCrew.map((person) => <option key={person.id} value={person.id}>{person.username}</option>)}</select></Field><Field label="Pause for"><select name="days"><option value="1">1 day</option><option value="7">7 days</option><option value="30">30 days</option></select></Field><button className="button secondary">Pause contact</button><div className="privacy-contact-chips">{boundaries.map((item) => <button type="button" key={item.target_id} onClick={async () => { await supabase.from("communication_boundaries").delete().eq("owner_id", user.id).eq("target_id", item.target_id); refreshPrivacyContacts(); }}>{privacyCrew.find((person) => person.id === item.target_id)?.username || "Crew member"} · {new Date(item.paused_until).toLocaleDateString()} ×</button>)}</div></form>
          </div>
        </section>
        <section className="panel settings-panel settings-panel-wide diagnostics-panel">
          <div className="section-icon"><RefreshCw /></div><h2>Connection diagnostics</h2><p>Check your session, database, messaging, voice, realtime updates, notifications, and audio hardware.</p>
          <button className="button secondary" type="button" disabled={diagnosing} onClick={runDiagnostics}><RefreshCw /> {diagnosing ? "Checking CrewDeck…" : "Run full diagnostics"}</button>
          {accountMessage && <p className="form-message">{accountMessage}</p>}
          {diagnostics.length > 0 && <div className="diagnostic-grid">{diagnostics.map((item) => <article className={item.ok ? "ok" : "failed"} key={item.name}><strong>{item.name}</strong><span>{item.ok ? "Ready" : "Needs attention"}</span><small>{item.detail}</small></article>)}</div>}
        </section>
        <section className="panel settings-panel">
          <div className="section-icon"><UserPlus /></div><h2>Account support</h2><p>For account deletion, recovery, or a private problem, open a Captain support ticket in Discord.</p>
          <button className="button secondary" type="button" onClick={() => window.desktop.openExternal("https://discord.gg/Gk3YRYmMfA")}>Open Discord support</button>
        </section>
        <section className="panel settings-panel">
          <div className="section-icon">
            <Power />
          </div>
          <h2>Windows startup</h2>
          <p>Open CrewDeck automatically after you sign in to Windows.</p>
          <label className="check-field">
            <input
              type="checkbox"
              checked={startup}
              onChange={(event) => setLaunchAtStartup(event.target.checked)}
            />
            <span>Launch CrewDeck with Windows</span>
          </label>
          <Field label="Open this page at startup"><select value={preferences.startupPage || "introductions"} onChange={(event) => preference("startupPage", event.target.value)}><option value="introductions">Introductions</option><option value="messages">Messages</option><option value="friends">Friends</option><option value="meetups">Meetup Calendar</option><option value="community-calendar">Community Calendar</option></select></Field>
          <label className="check-field"><input type="checkbox" checked={preferences.backgroundMessages !== false} onChange={(event) => preference("backgroundMessages", event.target.checked)} /><span>Keep message notifications active in the background</span></label>
          <label className="check-field"><input type="checkbox" checked={preferences.backgroundCalls !== false} onChange={(event) => preference("backgroundCalls", event.target.checked)} /><span>Keep incoming calls active in the background</span></label>
          <label className="check-field"><input type="checkbox" checked={Boolean(preferences.globalPushToTalk)} onChange={async (event) => { preference("globalPushToTalk", event.target.checked); if (event.target.checked) await window.desktop.globalPtt.enable("Control+Shift+Space"); }} /><span>Enable global push to talk toggle · Ctrl Shift Space</span></label>
          <button className="button secondary" type="button" onClick={async () => { const result = await window.desktop.repair(); setNotificationMessage(result.ok ? "Repair complete. CrewDeck caches were rebuilt." : "Repair could not finish."); }}><RefreshCw /> Repair local app cache</button>
          <p className="micro-copy">
            Closing the window keeps CrewDeck running in the Windows
            notification area so messages and alerts can still arrive. Use the
            tray icon’s Quit option to close it completely.
          </p>
        </section>
        <section className="panel settings-panel">
          <div className="section-icon">
            <Download />
          </div>
          <h2>App updates</h2>
          <p>
            The installed app checks for new releases automatically and
            downloads them in the background.
          </p>
          <div className="update-version">
            Installed version <strong>{update.currentVersion || "—"}</strong>
          </div>
          {["downloading", "ready", "installing"].includes(update.status) && (
            <UpdateVisual update={update} />
          )}
          <p
            className={
              update.status === "error" ? "form-message" : "micro-copy"
            }
          >
            {update.message ||
              "Updates are checked after startup and every four hours."}
          </p>
          <div className="button-row">
            <button
              className="button secondary"
              disabled={["checking", "downloading"].includes(update.status)}
              onClick={() => window.desktop.updater.check()}
            >
              <RefreshCw />
              Check now
            </button>
            {update.status === "ready" && (
              <button
                className="button primary"
                onClick={() => window.desktop.updater.install()}
              >
                <Download />
                Restart & install
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
