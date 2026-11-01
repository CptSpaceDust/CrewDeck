import { useEffect, useRef, useState } from "react";
import {
  CalendarDays,
  CalendarClock,
  GripHorizontal,
  MessageCircle,
  Phone,
  RotateCcw,
  X,
} from "lucide-react";
import App from "../App";
import VrKeyboard from "./VrKeyboard";
import VrControlCenterPanel from "./VrControlCenterPanel";

const destinations = [
  ["Messages.html", MessageCircle, "Messages"],
  ["MyMeetups.html", CalendarClock, "My meetups"],
  ["MeetupCalendar.html", CalendarDays, "Calendar"],
  ["Messages.html?call=active", Phone, "Calls"],
];

export default function VrPanelShell() {
  const drag = useRef(null);
  const [route, setRoute] = useState("");
  const [anchor, setAnchor] = useState("world");
  useEffect(() => window.desktop.onNavigate((next) => setRoute(String(next || ""))), []);
  const navigate = (route) => window.desktop.overlay.showPanel(route);
  const startDrag = (event) => {
    drag.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveDrag = (event) => {
    if (!drag.current) return;
    const dx = event.clientX - drag.current.x;
    const dy = event.clientY - drag.current.y;
    drag.current = { x: event.clientX, y: event.clientY };
    window.desktop.overlay.nativeCommand({ type: "move-panel", dx, dy });
  };
  return (
    <main className="vr-panel-shell">
      <header className="vr-panel-toolbar">
        <div
          className="vr-panel-drag"
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={() => {
            drag.current = null;
          }}
        >
          <GripHorizontal />
          <strong>CrewDeck VR</strong>
          <small>drag to move</small>
        </div>
        <nav>
          {destinations.map(([route, Icon, label]) => (
            <button key={route} onClick={() => navigate(route)} title={label}>
              <Icon />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <button
          title="Reset position"
          onClick={() =>
            window.desktop.overlay.nativeCommand({ type: "reset-panel" })
          }
        >
          <RotateCcw />
        </button>
        <select
          className="vr-panel-anchor"
          value={anchor}
          aria-label="Panel anchor"
          onChange={(event) => {
            setAnchor(event.target.value);
            window.desktop.overlay.nativeCommand({ type: "set-anchor", anchor: event.target.value });
          }}
        >
          <option value="world">World</option>
          <option value="wrist">Wrist</option>
          <option value="headset">Headset</option>
          <option value="controller">Controller</option>
        </select>
        <button
          title="Close panel"
          onClick={() =>
            window.desktop.overlay.nativeCommand({ type: "hide-panel" })
          }
        >
          <X />
        </button>
      </header>
      <div className="vr-panel-app">
        {route.toLowerCase().startsWith("controlcenter") ? <VrControlCenterPanel /> : <App />}
      </div>
      <VrKeyboard />
    </main>
  );
}
