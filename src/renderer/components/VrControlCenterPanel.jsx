import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Radio, ShieldAlert, Volume2, Zap } from "lucide-react";
import { supabase } from "../lib/supabase";
import { canUseControlCenter } from "../pages/ControlCenterPage";

const fallback = { max_intensity: 70, max_duration: 10, high_intensity_threshold: 40, hold_milliseconds: 800 };

export default function VrControlCenterPanel() {
  const [access, setAccess] = useState("checking");
  const [devices, setDevices] = useState([]);
  const [selected, setSelected] = useState("");
  const [limits, setLimits] = useState({});
  const [intensity, setIntensity] = useState(10);
  const [duration, setDuration] = useState(1);
  const [notice, setNotice] = useState("Ready");
  const [captain, setCaptain] = useState(false);
  const hold = useRef(null);
  const activated = useRef(false);
  const device = useMemo(() => devices.find((item) => item.id === selected) || devices[0], [devices, selected]);
  const safety = limits[device?.id] || fallback;

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return setAccess("denied");
      const { data: profile } = await supabase.from("profiles").select("badges,rank").eq("id", auth.user.id).maybeSingle();
      if (!canUseControlCenter(profile)) return setAccess("denied");
      setCaptain(profile?.rank?.trim().toLowerCase() === "captain");
      const [{ data: deviceData }, { data: safetyRows }] = await Promise.all([
        supabase.functions.invoke("openshock-devices"),
        supabase.from("control_device_safety_limits").select("*").eq("user_id", auth.user.id),
      ]);
      let list = deviceData?.devices;
      if (!Array.isArray(list) && typeof deviceData?.raw === "string") list = JSON.parse(deviceData.raw)?.data?.[0]?.shockers || [];
      setDevices(list || []);
      setSelected(list?.[0]?.id || "");
      setLimits(Object.fromEntries((safetyRows || []).map((row) => [row.shocker_id, row])));
      setAccess("allowed");
    })().catch(() => setAccess("denied"));
  }, []);

  const command = async (action, target = device) => {
    if (!target) return;
    window.desktop.overlay.nativeCommand({ type: "haptic", strength: action === "shock" ? 3500 : 1800 });
    const { data, error } = await supabase.functions.invoke("openshock-control", {
      body: { shocker_id: target.id, action, intensity: action === "stop" || action === "beep" ? 0 : intensity, duration: action === "stop" ? 0 : duration },
    });
    setNotice(error ? "Command blocked" : data?.error || `${action === "stop" ? "Stopped" : "Sent"} · ${target.name}`);
  };
  const emergency = async () => {
    setNotice("Stopping every device…");
    window.desktop.overlay.nativeCommand({ type: "haptic", strength: 3500 });
    const { data, error } = await supabase.functions.invoke("openshock-control", { body: { action: "stop_all" } });
    setNotice(error || !data?.success ? "Emergency stop failed" : `Stopped ${data.stopped} devices`);
  };
  const startHold = (action) => {
    activated.current = false;
    hold.current = window.setTimeout(async () => {
      activated.current = true;
      await command(action);
    }, safety.hold_milliseconds || 800);
  };
  const release = async () => {
    window.clearTimeout(hold.current);
    if (activated.current) await command("stop");
    activated.current = false;
  };

  if (access !== "allowed") return <section className="vr-control-denied"><ShieldAlert /><h1>Trusted Person access required</h1></section>;
  return (
    <section className="vr-control-center">
      <header><div><small>STEAMVR CONTROL CENTER</small><h1>{device?.name || "No device"}</h1></div><span>{notice}</span></header>
      <div className="vr-device-radial" aria-label="Choose a device">
        {devices.map((item, index) => (
          <button key={item.id} className={item.id === device?.id ? "active" : ""} style={{ "--slot": index }} onClick={() => setSelected(item.id)}>
            <Radio /><span>{item.name}</span>
          </button>
        ))}
      </div>
      <div className="vr-control-sliders">
        <label>Intensity <b>{intensity}</b><input type="range" min="0" max={safety.max_intensity} value={intensity} onChange={(event) => setIntensity(Number(event.target.value))} /></label>
        <label>Duration <b>{duration}s</b><input type="range" min="1" max={Math.max(1, Math.floor(safety.max_duration))} value={duration} onChange={(event) => setDuration(Number(event.target.value))} /></label>
      </div>
      <div className="vr-control-buttons">
        <button disabled={!captain} title={captain ? "Beep" : "Captain only"} onClick={() => command("beep")}><Volume2 />Beep</button>
        <button onPointerDown={() => startHold("vibrate")} onPointerUp={release} onPointerCancel={release}><Radio />Hold vibrate</button>
        <button className="shock" onPointerDown={() => startHold("shock")} onPointerUp={release} onPointerCancel={release}><Zap />Hold shock</button>
      </div>
      <button className="vr-control-emergency" onClick={emergency}><AlertTriangle /> EMERGENCY STOP</button>
    </section>
  );
}
