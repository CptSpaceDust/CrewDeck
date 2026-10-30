import React, { Component } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import VrOverlayWindow from "./components/VrOverlayWindow";
import "./styles.css";
import "./space-glass.css";
import { applyPreferences } from "./lib/preferences";

class RootErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="startup-failure" role="alert">
        <div className="startup-failure-card">
          <strong>CrewDeck could not finish starting</strong>
          <p>
            Your account data is safe. Reload the app, or repair its local cache
            if this continues.
          </p>
          <div>
            <button type="button" onClick={() => location.reload()}>
              Reload CrewDeck
            </button>
            <button
              type="button"
              onClick={async () => {
                await window.desktop?.repair?.();
                location.reload();
              }}
            >
              Repair and reload
            </button>
          </div>
        </div>
      </main>
    );
  }
}

try {
  applyPreferences();
} catch {
  document.documentElement.removeAttribute("style");
}

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
    overlay: {
      open: async () => ({ ok: false }),
      close: async () => ({ ok: true }),
      toggle: async () => ({ ok: true }),
      setPreferences: async () => ({ ok: true }),
      update: () => {},
      onState: () => () => {},
      command: () => {},
      onCommand: () => () => {},
    },
  };
}

const rootNode = document.getElementById("root");
if (!rootNode) throw new Error("CrewDeck root element is missing.");

createRoot(rootNode).render(
  <RootErrorBoundary>
    <React.StrictMode>
      {new URLSearchParams(location.search).get("overlay") === "1" ? (
        <VrOverlayWindow />
      ) : (
        <App />
      )}
    </React.StrictMode>
  </RootErrorBoundary>,
);
