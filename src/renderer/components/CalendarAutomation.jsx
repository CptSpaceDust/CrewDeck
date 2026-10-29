import { useEffect, useRef, useState } from "react";
import { CalendarSync, QrCode, ScanLine, Unplug } from "lucide-react";
import QRCode from "qrcode";
import { supabase } from "../lib/supabase";
import { localTimeZoneName } from "../lib/time";

async function invoke(name, body) {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    let message = data?.error || "";
    if (!message && error.context instanceof Response) {
      try {
        const payload = await error.context.clone().json();
        message = payload?.error || "";
      } catch {}
    }
    throw new Error(message || error.message || "Calendar request failed.");
  }
  if (data?.error) throw new Error(data.error);
  return data;
}
function readFile(file) {
  if (!file?.type?.startsWith("image/")) throw new Error("Choose a schedule image.");
  if (file.size > 10 * 1024 * 1024) throw new Error("Schedule images can be up to 10 MB.");
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("That image could not be read."));
    reader.readAsDataURL(file);
  });
}
function AvailabilityPreview({ rows = [] }) {
  const now = new Date();
  const [month, setMonth] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(() => localDateKey(now));
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  const dayCount = new Date(year, monthIndex + 1, 0).getDate();
  const selectedItems = rows.filter((row) => row.indefinite || row.block_date === selectedDate);
  return (
    <div className="calendar-private-preview">
      <header className="private-calendar-header">
        <button type="button" className="button ghost private-calendar-nav" aria-label="Previous month" onClick={() => setMonth(new Date(year, monthIndex - 1, 1))}>‹</button>
        <strong>{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</strong>
        <button type="button" className="button ghost private-calendar-nav" aria-label="Next month" onClick={() => setMonth(new Date(year, monthIndex + 1, 1))}>›</button>
      </header>
      <div className="private-calendar-weekdays" aria-hidden="true">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <span key={day}>{day}</span>)}
      </div>
      <div className="private-calendar-grid">
        {Array.from({ length: 42 }, (_, cell) => {
          const day = cell - firstWeekday + 1;
          if (day < 1 || day > dayCount) return <span className="private-calendar-day empty" key={`empty-${cell}`} />;
          const key = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const items = rows.filter((row) => row.indefinite || row.block_date === key);
          const allDay = items.some((item) => item.all_day || item.indefinite);
          const classes = ["private-calendar-day", allDay ? "offline" : items.length ? "partial" : "", selectedDate === key ? "selected" : ""].filter(Boolean).join(" ");
          return <button type="button" className={classes} key={key} aria-pressed={selectedDate === key} aria-label={`${new Date(`${key}T12:00:00`).toLocaleDateString()}${items.length ? ", unavailable" : ", available"}`} onClick={() => setSelectedDate(key)}><strong>{day}</strong><span>{allDay ? "Off all day" : items.length ? "Some hours off" : "Open"}</span></button>;
        })}
      </div>
      <section className="private-calendar-details">
        <strong>{new Date(`${selectedDate}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</strong>
        {!selectedItems.length && <p>No off time saved for this day.</p>}
        {selectedItems.map((item) => <div key={item.id}><span>{item.indefinite ? "Offline for a long time" : item.all_day ? "Offline all day" : `${String(item.start_time).slice(0, 5)}–${String(item.end_time).slice(0, 5)}`}</span></div>)}
      </section>
    </div>
  );
}
function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function CalendarAutomation({ onChanged }) {
  const [calendar, setCalendar] = useState({ connected: false });
  const [preview, setPreview] = useState([]);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [scan, setScan] = useState(null);
  const [selectedPerson, setSelectedPerson] = useState("");
  const [handoff, setHandoff] = useState(null);
  const pollRef = useRef(null);
  async function loadPreview() {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return;
    const today = localDateKey();
    const { data, error } = await supabase.from("meetup_availability_blocks")
      .select("id,block_date,all_day,start_time,end_time,time_zone,source,source_label,indefinite")
      .eq("user_id", auth.user.id)
      .or(`indefinite.eq.true,block_date.gte.${today}`)
      .order("block_date")
      .order("start_time")
      .limit(500);
    if (error) throw error;
    setPreview(data || []);
  }
  async function load(silent = false) {
    try { setCalendar(await invoke("calendar-integration", { action: "status" })); }
    catch (error) { if (!silent) setNotice(error.message); }
    try { await loadPreview(); } catch (error) { if (!silent) setNotice(error.message); }
  }
  useEffect(() => { load(true); return () => clearInterval(pollRef.current); }, []);
  async function connect() {
    setBusy(true); setNotice("Opening Google Calendar authorization…");
    try {
      const data = await invoke("calendar-integration", { action: "authorize", returnTo: "https://www.cptspacedust.com/MeetupCalendar.html" });
      window.desktop.openExternal(data.url);
      clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        try { const value = await invoke("calendar-integration", { action: "status" }); if (value.connected) { clearInterval(pollRef.current); setCalendar(value); setNotice("Google Calendar connected. Configure it and sync when ready."); setBusy(false); } } catch {}
      }, 3000);
    } catch (error) { setNotice(error.message); setBusy(false); }
  }
  async function save(sync) {
    setBusy(true); setNotice(sync ? "Scanning the next three months…" : "Saving calendar choices…");
    try {
      await invoke("calendar-integration", { action: "save_settings", settings: { ...calendar.settings, timeZone: localTimeZoneName() } });
      const result = sync ? await invoke("calendar-integration", { action: "sync" }) : null;
      setNotice(sync ? `Calendar synced. ${result.imported || 0} unavailable periods imported and ${result.exported || 0} meetups added.` : "Calendar choices saved.");
      await load(true); await onChanged?.();
    } catch (error) { setNotice(error.message); }
    finally { setBusy(false); }
  }
  async function disconnect() {
    setBusy(true);
    try { await invoke("calendar-integration", { action: "disconnect" }); setCalendar({ connected: false }); setNotice("Google Calendar disconnected and its imported off time was removed."); await onChanged?.(); }
    catch (error) { setNotice(error.message); }
    finally { setBusy(false); }
  }
  const updateSetting = (key, value) => setCalendar((current) => ({ ...current, settings: { ...current.settings, [key]: value } }));
  async function scanFile(file) {
    setBusy(true); setNotice("Reading the schedule…");
    try { const result = await invoke("schedule-scan", { action: "scan", imageData: await readFile(file), mimeType: file.type, timeZone: localTimeZoneName() }); setScan(result); setSelectedPerson(result.selectedPerson || result.result?.people?.[0]?.name || ""); setNotice("Schedule ready for review."); }
    catch (error) { setNotice(error.message); }
    finally { setBusy(false); }
  }
  async function applyScan() {
    if (!scan) return;
    setBusy(true);
    try { const result = await invoke("schedule-scan", { action: "apply", id: scan.id, personName: selectedPerson }); setScan(null); setNotice(`${result.applied} unavailable periods imported for ${result.personName}.`); await onChanged?.(); await load(true); }
    catch (error) { setNotice(error.message); }
    finally { setBusy(false); }
  }
  async function createHandoff() {
    setBusy(true);
    try {
      const result = await invoke("schedule-scan", { action: "create_handoff", timeZone: localTimeZoneName() });
      result.qr = await QRCode.toDataURL(result.uploadUrl, { width: 240, margin: 1, color: { dark: "#071225", light: "#d9f3ff" } });
      setHandoff(result); setNotice("Scan the code with your phone. This screen will update automatically.");
      clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        try { const value = await invoke("schedule-scan", { action: "poll", id: result.id }); if (value.status === "ready") { clearInterval(pollRef.current); setScan({ id: value.id, result: value.result }); setSelectedPerson(value.selectedPerson || value.result?.people?.[0]?.name || ""); setHandoff(null); setNotice("Phone upload ready for review."); } if (value.status === "failed") { clearInterval(pollRef.current); setNotice(value.error || "Schedule scan failed."); } } catch {}
      }, 2500);
    } catch (error) { setNotice(error.message); }
    finally { setBusy(false); }
  }
  const settings = calendar.settings || {};
  return (
    <section className="calendar-automation-app">
      <header><div><span className="eyebrow">Automatic availability</span><h3>Connect or scan your schedule</h3><p>Only unavailable times are shared. Event titles remain private.</p></div><button type="button" className="button ghost" onClick={() => setShowPreview((value) => !value)}>Preview my calendar</button></header>
      {notice && <p className="form-message">{notice}</p>}
      <div className="calendar-automation-cards">
        <article className="calendar-automation-card">
          <CalendarSync />
          <h4>Google Calendar</h4>
          <p>Sync no more than three months ahead. CrewDeck automatically rescans after about two and a half months.</p>
          {!calendar.connected ? <button type="button" className="button primary" disabled={busy} onClick={connect}>Connect Google Calendar</button> : <>
            <strong>{calendar.account || "Google Calendar connected"}</strong>
            <p className="micro-copy">{settings.lastSyncedAt ? `Last synced ${new Date(settings.lastSyncedAt).toLocaleString()}. Next automatic scan ${new Date(settings.nextSyncAt).toLocaleDateString()}.` : "Ready for the first sync."}</p>
            <fieldset><legend>Calendars to scan</legend><div className="calendar-app-choice-list">{(calendar.calendars || []).map((item) => <label className="check-field" key={item.id}><input type="checkbox" checked={(settings.selectedCalendarIds || []).includes(item.id)} onChange={(event) => updateSetting("selectedCalendarIds", event.target.checked ? [...new Set([...(settings.selectedCalendarIds || []), item.id])] : (settings.selectedCalendarIds || []).filter((id) => id !== item.id))}/><span>{item.summary}{item.primary ? " · Primary" : ""}</span></label>)}</div></fieldset>
            <fieldset><legend>What counts as unavailable</legend>
              {[ ["includeTimedEvents", "Timed events"], ["includeAllDayEvents", "All-day events"], ["includeDeclinedEvents", "Declined events"], ["includeFreeEvents", "Events marked free"] ].map(([key, label]) => <label className="check-field" key={key}><input type="checkbox" checked={Boolean(settings[key])} onChange={(event) => updateSetting(key, event.target.checked)}/><span>{label}</span></label>)}
            </fieldset>
            <label className="field"><span>Only titles containing · Optional</span><input value={settings.titleFilter || ""} onChange={(event) => updateSetting("titleFilter", event.target.value)} placeholder="work, class, appointment"/><small>Comma separated. Titles never appear to other members.</small></label>
            <label className="check-field"><input type="checkbox" checked={Boolean(settings.autoCreateMeetupEvents)} onChange={(event) => updateSetting("autoCreateMeetupEvents", event.target.checked)}/><span>Add accepted CrewDeck meetups to Google Calendar</span></label>
            <label className="field"><span>Calendar for accepted meetups</span><select value={settings.meetupCalendarId || "primary"} onChange={(event) => updateSetting("meetupCalendarId", event.target.value)}>{(calendar.calendars || []).map((item) => <option key={item.id} value={item.id}>{item.summary}</option>)}</select></label>
            <div className="button-row"><button type="button" className="button secondary" disabled={busy} onClick={() => save(false)}>Save choices</button><button type="button" className="button primary" disabled={busy} onClick={() => save(true)}>Save & sync</button><button type="button" className="button danger" disabled={busy} onClick={disconnect}><Unplug /> Disconnect</button></div>
          </>}
        </article>
        <article className="calendar-automation-card">
          <ScanLine />
          <h4>Scan a schedule</h4>
          <p>Photograph a work, school, or event schedule. If multiple names appear, choose yours once and CrewDeck remembers it. The image is sent securely for scanning and is not kept afterward.</p>
          <label className="schedule-app-upload"><input type="file" accept="image/*" capture="environment" disabled={busy} onChange={(event) => event.target.files?.[0] && scanFile(event.target.files[0])}/><span>Choose or photograph schedule</span></label>
          <button type="button" className="button secondary" disabled={busy} onClick={createHandoff}><QrCode /> Continue on a phone with QR</button>
          {handoff && <div className="calendar-handoff"><strong>Scan with your phone</strong><img src={handoff.qr} alt="Schedule upload QR code"/><small>Expires after 20 minutes.</small></div>}
          {scan && <div className="calendar-scan-review"><strong>Review scan</strong><p>{scan.result.people.length > 1 ? `This schedule contains ${scan.result.people.length} people. Choose which one is you.` : `${scan.result.people[0]?.blocks?.length || 0} unavailable periods found.`}</p>{scan.result.people.length > 1 && <label className="field"><span>Which person are you?</span><select value={selectedPerson} onChange={(event) => setSelectedPerson(event.target.value)}>{scan.result.people.map((person) => <option key={person.name} value={person.name}>{person.name} · {person.blocks.length} periods</option>)}</select></label>}<button type="button" className="button primary" disabled={busy} onClick={applyScan}>Use these unavailable times</button></div>}
        </article>
      </div>
      {showPreview && <div className="calendar-preview-panel"><h4>Your private availability calendar</h4><p className="micro-copy">Only you can see this calendar. Select a date to check the off time saved for it.</p><AvailabilityPreview rows={preview}/></div>}
    </section>
  );
}
