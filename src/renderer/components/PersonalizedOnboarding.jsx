import { useEffect, useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { getOnboarding, saveOnboarding } from "../lib/onboarding";
import { updatePreferences } from "../lib/preferences";

const sectionOptions = [
  ["introductions", "Introductions"],
  ["ideas", "Ideas Board"],
  ["collabs", "Collab Board"],
  ["meetups", "Meetups"],
  ["messages", "Messages"],
  ["birthdays", "Birthdays"],
];
const walkthroughs = {
  messages: ["Messages", "Start direct or group conversations, reply to a message, and adjust alerts for each conversation."],
  meetups: ["Meetups", "Compare availability, invite crew members, and keep every meetup or event in My Plans."],
  calls: ["Voice calls", "Start or join calls from a conversation and keep audio, screen sharing, and call controls together."],
  boards: ["Community boards", "Use the shared workflow for ideas, collaborations, help requests, and bug reports."],
};
const split = (value) =>
  String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 20);

function CheckGroup({ name, options, selected, onChange }) {
  return (
    <div className="onboarding-check-grid">
      {options.map(([key, label]) => (
        <label className="check-field" key={key}>
          <input
            type="checkbox"
            checked={selected.includes(key)}
            onChange={(event) =>
              onChange(
                event.target.checked
                  ? [...selected, key]
                  : selected.filter((item) => item !== key),
              )
            }
          />
          <span>{label}</span>
        </label>
      ))}
    </div>
  );
}

export default function PersonalizedOnboarding({ user }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [tour, setTour] = useState([]);
  const [tourIndex, setTourIndex] = useState(0);
  const [values, setValues] = useState({
    favoriteGamesText: "",
    vrchatInterestsText: "",
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
    typicalAvailability: "",
    selectedSections: [],
    selectedWalkthroughs: [],
    notifications: { messages: true, calls: true, meetups: true, community: true, friends: true, sound: true },
    recommendations: false,
    preferredContact: "",
  });
  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    getOnboarding(user.id)
      .then(({ onboarding, notifications }) => {
        if (!active) return;
        if (onboarding) {
          setValues((current) => ({
            ...current,
            favoriteGamesText: (onboarding.favorite_games || []).join(", "),
            vrchatInterestsText: (onboarding.vrchat_interests || []).join(", "),
            timeZone: onboarding.time_zone || current.timeZone,
            typicalAvailability: onboarding.typical_availability || "",
            selectedSections: onboarding.selected_sections || [],
            selectedWalkthroughs: onboarding.selected_walkthroughs || [],
            notifications: { ...current.notifications, ...(notifications || onboarding.notification_defaults || {}) },
            recommendations: Boolean(onboarding.friend_recommendations_enabled),
            preferredContact: onboarding.preferred_contact_method || "",
          }));
        }
        setOpen(!onboarding?.completed_at && !onboarding?.skipped_at);
      })
      .catch((error) => setMessage(error.message));
    const reopen = () => setOpen(true);
    window.addEventListener("crewdeck-open-onboarding", reopen);
    return () => {
      active = false;
      window.removeEventListener("crewdeck-open-onboarding", reopen);
    };
  }, [user?.id]);
  const tourEntry = useMemo(
    () => walkthroughs[tour[tourIndex]],
    [tour, tourIndex],
  );
  async function save(skipped = false) {
    setBusy(true);
    setMessage("");
    try {
      await saveOnboarding(
        user.id,
        {
          ...values,
          favoriteGames: split(values.favoriteGamesText),
          vrchatInterests: split(values.vrchatInterestsText),
        },
        skipped,
      );
      if (!skipped) {
        updatePreferences({
          desktopNotifications: values.notifications.messages || values.notifications.calls || values.notifications.meetups || values.notifications.community || values.notifications.friends,
          messageNotifications: values.notifications.messages,
          callNotifications: values.notifications.calls,
          meetupReminders: values.notifications.meetups,
          notificationSound: values.notifications.sound,
        });
        setTour(values.selectedWalkthroughs);
        setTourIndex(0);
      }
      setOpen(false);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }
  if (tourEntry)
    return (
      <div className="onboarding-modal-layer" role="dialog" aria-modal="true" aria-label={`${tourEntry[0]} walkthrough`}>
        <section className="onboarding-tour-card">
          <span>{tourIndex + 1} / {tour.length}</span>
          <h2>{tourEntry[0]}</h2>
          <p>{tourEntry[1]}</p>
          <button className="button primary" onClick={() => tourIndex + 1 < tour.length ? setTourIndex(tourIndex + 1) : setTour([])}>{tourIndex + 1 < tour.length ? "Next" : "Finish"}</button>
        </section>
      </div>
    );
  if (!open) return null;
  return (
    <div className="onboarding-modal-layer" role="dialog" aria-modal="true" aria-label="Personalize CrewDeck">
      <section className="onboarding-modal">
        <header><Sparkles /><div><span className="eyebrow">Welcome aboard</span><h2>Make CrewDeck feel like yours</h2><p>Every answer is optional, private, and editable later from Profile or Settings.</p></div></header>
        <div className="onboarding-form-grid">
          <label className="field"><span>Favorite games</span><input value={values.favoriteGamesText} maxLength={400} placeholder="VRChat, Minecraft, Portal" onChange={(event) => setValues({ ...values, favoriteGamesText: event.target.value })} /></label>
          <label className="field"><span>VRChat interests</span><input value={values.vrchatInterestsText} maxLength={400} placeholder="World hopping, avatars, events" onChange={(event) => setValues({ ...values, vrchatInterestsText: event.target.value })} /></label>
          <label className="field"><span>Time zone</span><input value={values.timeZone} maxLength={80} onChange={(event) => setValues({ ...values, timeZone: event.target.value })} /></label>
          <label className="field"><span>Typical availability</span><input value={values.typicalAvailability} maxLength={300} placeholder="Weeknights after 7 PM" onChange={(event) => setValues({ ...values, typicalAvailability: event.target.value })} /></label>
          <label className="field"><span>Preferred contact</span><select value={values.preferredContact} onChange={(event) => setValues({ ...values, preferredContact: event.target.value })}><option value="">Skip</option><option value="messages">Messages</option><option value="calls">Calls</option><option value="meetups">Meetups</option><option value="discord">Discord</option><option value="any">Any</option></select></label>
        </div>
        <fieldset><legend>Sections you care about</legend><CheckGroup options={sectionOptions} selected={values.selectedSections} onChange={(selectedSections) => setValues({ ...values, selectedSections })} /></fieldset>
        <fieldset><legend>Notification defaults</legend><CheckGroup options={Object.keys(values.notifications).map((key) => [key, key[0].toUpperCase() + key.slice(1)])} selected={Object.keys(values.notifications).filter((key) => values.notifications[key])} onChange={(selected) => setValues({ ...values, notifications: Object.fromEntries(Object.keys(values.notifications).map((key) => [key, selected.includes(key)])) })} /></fieldset>
        <fieldset><legend>Optional feature tours</legend><CheckGroup options={Object.entries(walkthroughs).map(([key, value]) => [key, value[0]])} selected={values.selectedWalkthroughs} onChange={(selectedWalkthroughs) => setValues({ ...values, selectedWalkthroughs })} /></fieldset>
        <label className="check-field onboarding-recommend"><input type="checkbox" checked={values.recommendations} onChange={(event) => setValues({ ...values, recommendations: event.target.checked })} /><span>Suggest crew members with shared interests. Only other people who opt in can appear.</span></label>
        {message && <p className="form-message">{message}</p>}
        <footer><button className="button secondary" disabled={busy} onClick={() => save(true)}>Skip for now</button><button className="button primary" disabled={busy} onClick={() => save(false)}>{busy ? "Saving…" : "Save my setup"}</button></footer>
      </section>
    </div>
  );
}
