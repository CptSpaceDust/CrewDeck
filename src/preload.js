const { contextBridge, ipcRenderer } = require("electron");

function subscribe(channel, callback) {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld("desktop", {
  platform: process.platform,
  notify: (title, body, route = "", options = {}) =>
    ipcRenderer.invoke("desktop:notify", {
      title,
      body,
      route,
      hideWhenLocked: Boolean(options.hideWhenLocked),
    }),
  notifications: {
    getStatus: () => ipcRenderer.invoke("desktop:notification-status"),
    test: () => ipcRenderer.invoke("desktop:test-notification"),
  },
  system: {
    getStartup: () => ipcRenderer.invoke("system:get-startup"),
    setStartup: (enabled) => ipcRenderer.invoke("system:set-startup", enabled),
  },
  openExternal: (url) => ipcRenderer.send("desktop:open-external", url),
  onNavigate: (callback) => subscribe("desktop:navigate", callback),
  openMessageWindow: (route) => ipcRenderer.invoke("desktop:open-message-window", route),
  shareTarget: { get: () => ipcRenderer.invoke("desktop:get-share-target") },
  repair: () => ipcRenderer.invoke("desktop:repair"),
  globalPtt: { enable: (accelerator) => ipcRenderer.invoke("desktop:set-global-ptt", accelerator), onToggle: (callback) => subscribe("desktop:global-ptt", callback) },
  onDeepLink: (callback) => subscribe("auth:deep-link", callback),
  screenShare: {
    listSources: () => ipcRenderer.invoke("screen-share:list-sources"),
    selectSource: (sourceId) =>
      ipcRenderer.invoke("screen-share:select-source", sourceId),
  },
  updater: {
    getState: () => ipcRenderer.invoke("updater:get-state"),
    check: () => ipcRenderer.invoke("updater:check"),
    install: () => ipcRenderer.invoke("updater:install"),
    onState: (callback) => subscribe("updater:state", callback),
  },
  appLock: {
    getState: () => ipcRenderer.invoke("app-lock:get-state"),
    setPin: (pin, currentPin) =>
      ipcRenderer.invoke("app-lock:set-pin", { pin, currentPin }),
    disable: (pin) => ipcRenderer.invoke("app-lock:disable", { pin }),
    verify: (pin) => ipcRenderer.invoke("app-lock:verify", { pin }),
    setTimeout: (timeoutMinutes) =>
      ipcRenderer.invoke("app-lock:set-timeout", { timeoutMinutes }),
    lockNow: () => ipcRenderer.invoke("app-lock:lock-now"),
    onState: (callback) => subscribe("app-lock:state", callback),
  },
});
