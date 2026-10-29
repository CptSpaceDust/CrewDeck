const {
  app,
  BrowserWindow,
  desktopCapturer,
  ipcMain,
  Menu,
  net,
  Notification,
  protocol,
  session,
  shell,
  Tray,
  globalShortcut,
} = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { AppLockStore } = require("./app-lock-store");
const { autoUpdater } = require("electron-updater");

const APP_HOST = "app.cptspacedust.local";
const APP_ORIGIN = `https://${APP_HOST}`;
const DEEP_LINK_SCHEMES = ["crewdeck", "cptspacedust"];
const PRIMARY_DEEP_LINK_SCHEME = DEEP_LINK_SCHEMES[0];
const APP_USER_MODEL_ID = "com.crewdeck.app";
const RENDERER_ROOT = path.join(__dirname, "..", "dist-renderer");
const ICON_PATH = path.join(__dirname, "..", "assets", "icon.png");
const isDevelopment = process.argv.includes("--dev");

// Carry sessions, drafts, and PIN settings into the rebranded user-data folder.
const crewDeckUserData = path.join(app.getPath("appData"), "CrewDeck");
const legacyUserData = path.join(
  app.getPath("appData"),
  "CptSpaceDust Community",
);
if (
  !fs.existsSync(crewDeckUserData) &&
  fs.existsSync(legacyUserData) &&
  path.resolve(crewDeckUserData) !== path.resolve(legacyUserData)
)
  fs.cpSync(legacyUserData, crewDeckUserData, { recursive: true });
app.setPath("userData", crewDeckUserData);
const installerPreferencesPath = path.join(crewDeckUserData, "installer-preferences.json");
let installerPreferences = { background: 1, startup: 0, startMinimized: 0, appLockSetup: 0, applied: true };
try {
  installerPreferences = { ...installerPreferences, ...JSON.parse(fs.readFileSync(installerPreferencesPath, "utf8")) };
} catch {}

app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
if (process.platform === "win32") app.setAppUserModelId(APP_USER_MODEL_ID);

let mainWindow;
let tray;
let isQuitting = false;
let lockStore;
let locked = false;
let blurTimer;
let failedAttempts = [];
let pendingDeepLink = "";
let pendingNotificationRoute = "";
let pendingDisplaySourceId = "";
let pendingShareTarget = "";
const messageWindows = new Set();
const activeNotifications = new Set();
let overlayWindow;
let overlayState = {};
let overlayShortcut = "Control+Shift+O";
let updateState = {
  status: "idle",
  currentVersion: app.getVersion(),
  availableVersion: null,
  percent: 0,
  message: "",
};

function sendUpdateState(patch = {}) {
  updateState = { ...updateState, ...patch, currentVersion: app.getVersion() };
  mainWindow?.webContents.send("updater:state", updateState);
  return updateState;
}

function configureUpdater() {
  if (!app.isPackaged || process.env.PORTABLE_EXECUTABLE_FILE) {
    sendUpdateState({
      status: "unavailable",
      message: process.env.PORTABLE_EXECUTABLE_FILE
        ? "Install the Setup edition to receive automatic updates."
        : "Update checks are available in packaged builds.",
    });
    return;
  }
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("checking-for-update", () =>
    sendUpdateState({ status: "checking", message: "Checking for updates…" }),
  );
  autoUpdater.on("update-available", (info) =>
    sendUpdateState({
      status: "downloading",
      availableVersion: info.version,
      message: `Downloading version ${info.version}…`,
    }),
  );
  autoUpdater.on("download-progress", (progress) =>
    sendUpdateState({
      status: "downloading",
      percent: Math.round(progress.percent || 0),
      message: `Downloading update… ${Math.round(progress.percent || 0)}%`,
    }),
  );
  autoUpdater.on("update-not-available", () =>
    sendUpdateState({
      status: "current",
      availableVersion: null,
      percent: 0,
      message: "You have the latest version.",
    }),
  );
  autoUpdater.on("update-downloaded", (info) =>
    sendUpdateState({
      status: "ready",
      availableVersion: info.version,
      percent: 100,
      message: `Version ${info.version} is ready to install.`,
    }),
  );
  autoUpdater.on("error", (error) =>
    sendUpdateState({
      status: "error",
      message: error?.message || "The update check failed.",
    }),
  );
  setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 10_000);
  setInterval(
    () => autoUpdater.checkForUpdates().catch(() => {}),
    4 * 60 * 60 * 1000,
  );
}

function safeRendererFile(requestUrl) {
  const url = new URL(requestUrl);
  const requested =
    decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";
  const candidate = path.resolve(RENDERER_ROOT, requested);
  const relative = path.relative(RENDERER_ROOT, candidate);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative))
    return null;
  return candidate;
}

function registerAppOrigin() {
  protocol.handle("https", (request) => {
    const url = new URL(request.url);
    if (url.hostname !== APP_HOST)
      return net.fetch(request, { bypassCustomProtocolHandlers: true });
    const filePath = safeRendererFile(request.url);
    if (!filePath) return new Response("Not found", { status: 404 });
    return net.fetch(pathToFileURL(filePath).toString());
  });
}

function sendLockState() {
  mainWindow?.webContents.send("app-lock:state", {
    locked,
    ...lockStore.publicSettings(),
  });
  updateTrayMenu();
}

function lockApp() {
  if (!lockStore?.settings.enabled || locked) return false;
  locked = true;
  sendLockState();
  return true;
}

function scheduleLock() {
  clearTimeout(blurTimer);
  if (locked || !lockStore?.settings.enabled) return;
  blurTimer = setTimeout(lockApp, lockStore.settings.timeoutMinutes * 60_000);
}

function showMainWindow() {
  clearTimeout(blurTimer);
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function updateTrayMenu() {
  if (!tray || tray.isDestroyed()) return;
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "Open CrewDeck",
        click: showMainWindow,
      },
      {
        label: locked ? "App locked" : "Lock app",
        enabled: Boolean(lockStore?.settings.enabled && !locked),
        click: lockApp,
      },
      { type: "separator" },
      {
        label: "Quit CrewDeck",
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ]),
  );
}

function createTray() {
  if (tray && !tray.isDestroyed()) return;
  tray = new Tray(ICON_PATH);
  tray.setToolTip("CrewDeck");
  tray.on("click", showMainWindow);
  tray.on("double-click", showMainWindow);
  updateTrayMenu();
}

function parseDeepLink(value) {
  try {
    const url = new URL(value);
    return DEEP_LINK_SCHEMES.includes(url.protocol.replace(/:$/, ""))
      ? value
      : "";
  } catch {
    return "";
  }
}

function deliverDeepLink(value) {
  const link = parseDeepLink(value);
  if (!link) return;
  pendingDeepLink = link;
  if (!locked && mainWindow && !mainWindow.webContents.isLoading()) {
    mainWindow.webContents.send("auth:deep-link", pendingDeepLink);
    pendingDeepLink = "";
  }
  showMainWindow();
}

function deliverPendingNotificationRoute() {
  if (
    locked ||
    !pendingNotificationRoute ||
    !mainWindow ||
    mainWindow.webContents.isLoading()
  )
    return;
  mainWindow.webContents.send("desktop:navigate", pendingNotificationRoute);
  pendingNotificationRoute = "";
}

function isTrustedRendererOrigin(value) {
  try {
    const origin = new URL(value).origin;
    return (
      origin === APP_ORIGIN ||
      (isDevelopment && origin === "http://127.0.0.1:5173")
    );
  } catch {
    return false;
  }
}

function configurePermissions() {
  session.defaultSession.setPermissionRequestHandler(
    (webContents, permission, callback) => {
      const origin = new URL(webContents.getURL()).origin;
      callback(
        isTrustedRendererOrigin(origin) &&
          ["media", "display-capture", "notifications"].includes(permission),
      );
    },
  );
  session.defaultSession.setPermissionCheckHandler(
    (_webContents, permission, requestingOrigin) => {
      return (
        isTrustedRendererOrigin(requestingOrigin) &&
        ["media", "display-capture", "notifications"].includes(permission)
      );
    },
  );
  session.defaultSession.setDisplayMediaRequestHandler(
    async (request, callback) => {
      try {
        if (!isTrustedRendererOrigin(request.securityOrigin)) {
          callback({});
          return;
        }
        const sourceId = pendingDisplaySourceId;
        pendingDisplaySourceId = "";
        if (!sourceId) {
          callback({});
          return;
        }
        const sources = await desktopCapturer.getSources({
          types: ["screen", "window"],
          thumbnailSize: { width: 0, height: 0 },
        });
        const source = sources.find((item) => item.id === sourceId);
        if (!source) {
          callback({});
          return;
        }
        callback({
          video: source,
          ...(request.audioRequested && process.platform === "win32"
            ? { audio: "loopback" }
            : {}),
        });
      } catch {
        callback({});
      }
    },
    { useSystemPicker: false },
  );
}

function createWindow() {
  const launchedHidden = process.argv.includes("--hidden");
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1040,
    minHeight: 680,
    title: "CrewDeck",
    icon: ICON_PATH,
    backgroundColor: "#070b16",
    show: !launchedHidden,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
      backgroundThrottling: false,
    },
  });

  mainWindow.removeMenu();
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url) && !url.startsWith(APP_ORIGIN))
      shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    const allowed = isDevelopment
      ? url.startsWith("http://127.0.0.1:5173")
      : url.startsWith(APP_ORIGIN);
    if (!allowed) {
      event.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url);
    }
  });
  mainWindow.webContents.on("did-finish-load", () => {
    sendLockState();
    if (pendingDeepLink && !locked) {
      mainWindow.webContents.send("auth:deep-link", pendingDeepLink);
      pendingDeepLink = "";
    }
    deliverPendingNotificationRoute();
  });
  mainWindow.on("blur", scheduleLock);
  mainWindow.on("focus", () => clearTimeout(blurTimer));
  mainWindow.on("minimize", lockApp);
  mainWindow.on("close", (event) => {
    if (isQuitting) return;
    if (!Boolean(Number(installerPreferences.background))) {
      isQuitting = true;
      app.quit();
      return;
    }
    event.preventDefault();
    lockApp();
    mainWindow.hide();
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  const rendererUrl = isDevelopment
    ? "http://127.0.0.1:5173"
    : `${APP_ORIGIN}/index.html`;
  mainWindow.loadURL(rendererUrl);
  if (isDevelopment) mainWindow.webContents.openDevTools({ mode: "detach" });
}

function createMessageWindow(route = "Messages.html") {
  const child = new BrowserWindow({ width:1080, height:760, minWidth:760, minHeight:560, title:"CrewDeck Messages", icon:ICON_PATH, backgroundColor:"#070b16", webPreferences:{ preload:path.join(__dirname, "preload.js"), contextIsolation:true, nodeIntegration:false, sandbox:true, spellcheck:true, backgroundThrottling:false } });
  child.removeMenu();
  child.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/i.test(url) && !url.startsWith(APP_ORIGIN)) shell.openExternal(url); return { action:"deny" }; });
  messageWindows.add(child);
  child.on("closed", () => messageWindows.delete(child));
  child.webContents.on("did-finish-load", () => child.webContents.send("desktop:navigate", route));
  child.loadURL(isDevelopment ? "http://127.0.0.1:5173" : `${APP_ORIGIN}/index.html`);
  return child;
}

function createOverlayWindow(show = true) {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    if (show) overlayWindow.showInactive();
    return overlayWindow;
  }
  overlayWindow = new BrowserWindow({ width:390,height:520,minWidth:280,minHeight:180,maxWidth:900,maxHeight:1000,title:"CrewDeck VR Overlay",icon:ICON_PATH,transparent:true,frame:false,alwaysOnTop:true,skipTaskbar:true,resizable:true,show:false,backgroundColor:"#00000000",webPreferences:{preload:path.join(__dirname,"preload.js"),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false} });
  overlayWindow.setAlwaysOnTop(true,"screen-saver");
  overlayWindow.setVisibleOnAllWorkspaces(true,{visibleOnFullScreen:true});
  overlayWindow.on("close",event=>{if(isQuitting)return;event.preventDefault();overlayWindow.hide();});
  overlayWindow.on("closed",()=>{overlayWindow=null;});
  overlayWindow.webContents.on("did-finish-load",()=>overlayWindow.webContents.send("overlay:state",overlayState));
  overlayWindow.loadURL(isDevelopment?"http://127.0.0.1:5173/?overlay=1":`${APP_ORIGIN}/index.html?overlay=1`);
  if(show)overlayWindow.once("ready-to-show",()=>overlayWindow?.showInactive());
  return overlayWindow;
}

function registerOverlayShortcut(accelerator=overlayShortcut){
  if(overlayShortcut)globalShortcut.unregister(overlayShortcut);
  overlayShortcut=String(accelerator||"Control+Shift+O");
  try{return globalShortcut.register(overlayShortcut,()=>{const window=createOverlayWindow(false);window.isVisible()?window.hide():window.showInactive();});}catch{return false;}
}

function extractShareTarget(argv = []) {
  const candidate = argv.find((value) => { try { return fs.statSync(value).isFile(); } catch { return false; } });
  if (candidate && fs.statSync(candidate).size <= 10 * 1024 * 1024) pendingShareTarget = candidate;
}

function setupIpc() {
  function showDesktopNotification(payload = {}) {
    if (!Notification.isSupported())
      return {
        ok: false,
        error: "Windows notifications are not supported on this system.",
      };
    try {
      const hideContent = locked && Boolean(payload.hideWhenLocked);
      const notification = new Notification({
        title: hideContent
          ? "CrewDeck"
          : String(payload.title || "CrewDeck").slice(0, 120),
        body: hideContent
          ? "Unlock CrewDeck to view this notification."
          : String(payload.body || "").slice(0, 500),
        silent: true,
        icon: ICON_PATH,
      });
      activeNotifications.add(notification);
      notification.on("close", () => activeNotifications.delete(notification));
      notification.on("failed", () => activeNotifications.delete(notification));
      notification.on("click", () => {
        activeNotifications.delete(notification);
        showMainWindow();
        if (payload.route) {
          pendingNotificationRoute = String(payload.route);
          deliverPendingNotificationRoute();
        }
      });
      notification.show();
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: error?.message || "Windows could not show the notification.",
      };
    }
  }
  ipcMain.handle("screen-share:list-sources", async (event) => {
    if (!isTrustedRendererOrigin(event.sender.getURL())) return [];
    const sources = await desktopCapturer.getSources({
      types: ["screen", "window"],
      thumbnailSize: { width: 360, height: 203 },
      fetchWindowIcons: true,
    });
    return sources.map((source) => ({
      id: source.id,
      name: source.name,
      thumbnail: source.thumbnail.toDataURL(),
      icon: source.appIcon?.toDataURL() || "",
      kind: source.id.startsWith("screen:") ? "screen" : "window",
    }));
  });
  ipcMain.handle("screen-share:select-source", (event, sourceId) => {
    if (!isTrustedRendererOrigin(event.sender.getURL())) return { ok: false };
    if (!/^(screen|window):\d+:/i.test(String(sourceId))) return { ok: false };
    pendingDisplaySourceId = String(sourceId);
    return { ok: true };
  });
  ipcMain.handle("app-lock:get-state", () => ({
    locked,
    ...lockStore.publicSettings(),
  }));
  ipcMain.handle("app-lock:set-pin", (_event, payload = {}) =>
    lockStore.setPin(payload.pin, payload.currentPin),
  );
  ipcMain.handle("app-lock:disable", (_event, payload = {}) => {
    const result = lockStore.disable(payload.pin);
    if (result.ok) {
      locked = false;
      sendLockState();
    }
    return result;
  });
  ipcMain.handle("app-lock:set-timeout", (_event, payload = {}) =>
    lockStore.setTimeoutMinutes(payload.timeoutMinutes),
  );
  ipcMain.handle("app-lock:lock-now", () => ({ ok: lockApp() }));
  ipcMain.handle("app-lock:verify", (_event, payload = {}) => {
    const now = Date.now();
    failedAttempts = failedAttempts.filter((time) => now - time < 60_000);
    if (failedAttempts.length >= 5)
      return { ok: false, error: "Too many attempts. Please wait one minute." };
    if (!locked || lockStore.verify(payload.pin)) {
      locked = false;
      failedAttempts = [];
      sendLockState();
      if (pendingDeepLink) deliverDeepLink(pendingDeepLink);
      deliverPendingNotificationRoute();
      return { ok: true };
    }
    failedAttempts.push(now);
    return { ok: false, error: "That PIN is incorrect." };
  });
  ipcMain.handle("desktop:notify", (_event, payload = {}) =>
    showDesktopNotification(payload),
  );
  ipcMain.handle("desktop:notification-status", () => ({
    supported: Notification.isSupported(),
    platform: process.platform,
    appUserModelId: APP_USER_MODEL_ID,
  }));
  ipcMain.handle("desktop:test-notification", () =>
    showDesktopNotification({
      title: "Notifications are working",
      body: "CrewDeck can send Windows notifications from this computer.",
      route: "AppSettings.html",
    }),
  );
  ipcMain.handle("system:get-startup", () => ({
    enabled: app.getLoginItemSettings().openAtLogin,
  }));
  ipcMain.handle("system:set-startup", (_event, enabled) => {
    app.setLoginItemSettings({
      openAtLogin: Boolean(enabled),
      path: process.execPath,
    });
    return { ok: true, enabled: app.getLoginItemSettings().openAtLogin };
  });
  ipcMain.handle("installer:get-preferences", () => installerPreferences);
  ipcMain.handle("installer:acknowledge-preferences", () => {
    installerPreferences.applied = true;
    try { fs.writeFileSync(installerPreferencesPath, JSON.stringify(installerPreferences, null, 2)); } catch {}
    return { ok: true };
  });
  ipcMain.handle("desktop:open-message-window", (_event, route) => { createMessageWindow(String(route || "Messages.html")); return { ok:true }; });
  ipcMain.handle("overlay:open",()=>{createOverlayWindow(true);return{ok:true};});
  ipcMain.handle("overlay:close",()=>{overlayWindow?.hide();return{ok:true};});
  ipcMain.handle("overlay:set-preferences",(_event,value={})=>{const window=createOverlayWindow(false);if(Number.isFinite(value.width)&&Number.isFinite(value.height))window.setSize(Math.round(value.width),Math.round(value.height));if(Number.isFinite(value.opacity))window.setOpacity(Math.max(.35,Math.min(1,value.opacity)));if(value.shortcut)registerOverlayShortcut(value.shortcut);return{ok:true};});
  ipcMain.on("overlay:update",(_event,value={})=>{overlayState={...overlayState,...value};overlayWindow?.webContents.send("overlay:state",overlayState);});
  ipcMain.on("overlay:command",(_event,value)=>{
    for(const window of BrowserWindow.getAllWindows()) if(window!==overlayWindow) window.webContents.send("overlay:command",value);
  });
  ipcMain.handle("desktop:get-share-target", () => {
    if (!pendingShareTarget) return null;
    const target = pendingShareTarget; pendingShareTarget = "";
    try { const extension = path.extname(target).toLowerCase(); const types = { ".png":"image/png", ".jpg":"image/jpeg", ".jpeg":"image/jpeg", ".webp":"image/webp", ".gif":"image/gif", ".pdf":"application/pdf", ".txt":"text/plain", ".mp3":"audio/mpeg", ".wav":"audio/wav", ".ogg":"audio/ogg", ".webm":"audio/webm" }; const mimeType = types[extension]; if (!mimeType) return { error:"CrewDeck cannot safely share this file type." }; return { name:path.basename(target), mimeType, base64:fs.readFileSync(target).toString("base64") }; } catch { return { error:"The shared file could not be opened." }; }
  });
  ipcMain.handle("desktop:repair", async () => { await session.defaultSession.clearCache(); await session.defaultSession.clearStorageData({ storages:["serviceworkers","cachestorage"] }); return { ok:true }; });
  ipcMain.handle("desktop:set-global-ptt", (_event, accelerator) => { globalShortcut.unregister("Control+Shift+Space"); const value = String(accelerator || "Control+Shift+Space"); try { return { ok:globalShortcut.register(value, () => { mainWindow?.webContents.send("desktop:global-ptt"); for (const window of messageWindows) window.webContents.send("desktop:global-ptt"); }) }; } catch { return { ok:false }; } });
  ipcMain.on("desktop:open-external", (_event, value) => {
    try {
      const url = new URL(String(value));
      if (["https:", "http:"].includes(url.protocol))
        shell.openExternal(url.toString());
    } catch {
      /* Ignore malformed links. */
    }
  });
  ipcMain.handle("updater:get-state", () => updateState);
  ipcMain.handle("updater:check", async () => {
    if (!app.isPackaged || process.env.PORTABLE_EXECUTABLE_FILE)
      return sendUpdateState({
        status: "unavailable",
        message: "Install the Setup edition to receive automatic updates.",
      });
    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      sendUpdateState({
        status: "error",
        message: error?.message || "The update check failed.",
      });
    }
    return updateState;
  });
  ipcMain.handle("updater:install", () => {
    if (updateState.status !== "ready")
      return { ok: false, error: "No downloaded update is ready." };
    sendUpdateState({
      status: "installing",
      message: "Restarting to install your update…",
    });
    setTimeout(() => {
      try {
        autoUpdater.quitAndInstall(true, true);
      } catch (error) {
        sendUpdateState({
          status: "error",
          message: error.message || "The update could not start.",
        });
      }
    }, 650);
    return { ok: true };
  });
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    extractShareTarget(argv);
    const link = argv.find((value) => parseDeepLink(value));
    if (link) deliverDeepLink(link);
    else showMainWindow();
  });
  app.on("open-url", (event, url) => {
    event.preventDefault();
    deliverDeepLink(url);
  });
  app.whenReady().then(() => {
    DEEP_LINK_SCHEMES.forEach((scheme) =>
      app.setAsDefaultProtocolClient(scheme),
    );
    lockStore = new AppLockStore(
      path.join(app.getPath("userData"), "app-lock.json"),
    );
    if (!installerPreferences.applied) {
      app.setLoginItemSettings({
        openAtLogin: Boolean(Number(installerPreferences.startup)),
        path: process.execPath,
        args: Boolean(Number(installerPreferences.startMinimized)) ? ["--hidden"] : [],
      });
    }
    locked = lockStore.settings.enabled;
    extractShareTarget(process.argv.slice(1));
    const startupLink = process.argv.find((value) => parseDeepLink(value));
    if (startupLink) pendingDeepLink = startupLink;
    registerAppOrigin();
    configurePermissions();
    setupIpc();
    createWindow();
    createTray();
    registerOverlayShortcut();
    configureUpdater();
  });
}

app.on("before-quit", () => {
  isQuitting = true;
  globalShortcut.unregisterAll();
});
app.on("activate", showMainWindow);
app.on("window-all-closed", () => {
  // Keep the process and notification-area icon alive after closing the window.
});
app.on("will-quit", () => {
  tray?.destroy();
  tray = null;
});
