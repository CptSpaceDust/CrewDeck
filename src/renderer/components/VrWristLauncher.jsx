import {
  AlertTriangle,
  CalendarDays,
  CalendarClock,
  MessageCircle,
  Phone,
  Sparkles,
  SlidersHorizontal,
} from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { canUseControlCenter } from "../pages/ControlCenterPage";

const items = [
  ["Messages.html", MessageCircle, "Messages"],
  ["MyMeetups.html", CalendarClock, "My meetups"],
  ["MeetupCalendar.html", CalendarDays, "Calendar"],
  ["Messages.html?call=active", Phone, "Calls"],
];

export default function VrWristLauncher() {
  const [trusted, setTrusted] = useState(false);
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: profile } = await supabase.from("profiles").select("badges").eq("id", data.user.id).maybeSingle();
      setTrusted(canUseControlCenter(profile));
    });
  }, []);
  const emergencyStop = async () => {
    window.desktop.overlay.nativeCommand({ type: "haptic", strength: 3000 });
    await supabase.functions.invoke("openshock-control", { body: { action: "stop_all" } });
  };
  return (
    <main className="vr-wrist-launcher">
      <header>
        <Sparkles />
        <span>CrewDeck</span>
      </header>
      <nav aria-label="CrewDeck VR features">
        {items.map(([route, Icon, label]) => (
          <button
            key={route}
            type="button"
            onClick={() => window.desktop.overlay.showPanel(route)}
          >
            <Icon />
            <span>{label}</span>
          </button>
        ))}
        {trusted && (
          <button type="button" onClick={() => window.desktop.overlay.showPanel("ControlCenter.html?vr=1")}>
            <SlidersHorizontal />
            <span>Control</span>
          </button>
        )}
        {trusted && (
          <button type="button" className="vr-wrist-stop" onClick={emergencyStop}>
            <AlertTriangle />
            <span>STOP</span>
          </button>
        )}
      </nav>
    </main>
  );
}
