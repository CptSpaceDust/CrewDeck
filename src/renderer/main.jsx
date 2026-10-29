import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import VrOverlayWindow from "./components/VrOverlayWindow";
import "./styles.css";
import "./space-glass.css";
import { applyPreferences } from "./lib/preferences";

applyPreferences();

if (!window.desktop) {
  window.desktop = {
    notify: () => {},
    openExternal: (url) => window.open(url, "_blank", "noopener,noreferrer"),
    onNavigate: () => () => {},
    onDeepLink: () => () => {},
    updater: {
      getState: async () => ({
        status: "unavailable",
        currentVersion: "development",
        message: "Updates are available in packaged builds.",
      }),
      check: async () => ({ status: "unavailable" }),
      install: async () => ({ ok: false }),
      onState: () => () => {},
    },
    appLock: {
      getState: async () => ({
        loading: false,
        locked: false,
        enabled: false,
        timeoutMinutes: 5,
      }),
      setPin: async () => ({
        ok: false,
        error: "App lock is available in the desktop build.",
      }),
      disable: async () => ({
        ok: true,
        settings: { enabled: false, timeoutMinutes: 5 },
      }),
      verify: async () => ({ ok: true }),
      setTimeout: async () => ({ ok: true }),
      lockNow: async () => ({ ok: false }),
      onState: () => () => {},
    },
    overlay: { open:async()=>({ok:false}), close:async()=>({ok:true}), setPreferences:async()=>({ok:true}), update:()=>{}, onState:()=>()=>{}, command:()=>{}, onCommand:()=>()=>{} },
  };
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {new URLSearchParams(location.search).get("overlay") === "1" ? <VrOverlayWindow /> : <App />}
  </React.StrictMode>,
);
