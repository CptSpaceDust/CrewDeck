const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");

test("CrewDeck routes authorized members to the Control Center", () => {
  const app = read("src", "renderer", "App.jsx");
  const sidebar = read("src", "renderer", "components", "Sidebar.jsx");
  assert.match(app, /import ControlCenterPage/);
  assert.match(app, /case "control-center"/);
  assert.match(app, /<ControlCenterPage \{\.\.\.props\} \/>/);
  assert.match(sidebar, /Control Center/);
  assert.match(sidebar, /trusted person/);
  const sidebarAccess = sidebar.slice(
    sidebar.indexOf("function controlCenterAccess"),
    sidebar.indexOf("const groups"),
  );
  assert.doesNotMatch(sidebarAccess, /rank.*captain/i);
});

test("Control Center verifies auth, Trusted Person badge, and Safe Mode", () => {
  const page = read("src", "renderer", "pages", "ControlCenterPage.jsx");
  assert.match(page, /supabase\.auth\.getUser\(\)/);
  assert.match(page, /select\("badges"\)/);
  assert.match(page, /trusted person/);
  const pageAccess = page.slice(
    page.indexOf("function canUseControlCenter"),
    page.indexOf("async function functionError"),
  );
  assert.doesNotMatch(pageAccess, /rank.*captain/i);
  assert.match(page, /from\("site_settings"\)/);
  assert.match(page, /safe_mode/);
  assert.match(page, /Control Center access is required|Access denied/);
});

test("Control Center includes device operations and real dials", () => {
  const page = read("src", "renderer", "pages", "ControlCenterPage.jsx");
  const css = read("src", "renderer", "space-glass.css");
  for (const feature of [
    "openshock-devices",
    "openshock-control",
    "shocker_presets",
    "control_logs",
    "Warning duration",
    "Live Control",
    "Emergency Stop",
  ])
    assert.ok(page.includes(feature), `Missing ${feature}`);
  assert.match(page, /role="slider"/);
  assert.match(page, /pointerAngle - 135/);
  assert.match(page, /--dial-color/);
  assert.match(page, /sendCommand\(device, "stop", 0, 0, true\)/);
  assert.match(
    page,
    /Control my shock devices over the internet! Be careful!!/,
  );
  assert.doesNotMatch(page, /nextDevices\.length\} connected device/);
  assert.doesNotMatch(page, /Authorized systems|Secure control link/);
  assert.doesNotMatch(page, /[⚡🔊]\s*(?:Vibrate|Beep|Shock)/);
  assert.match(css, /\.control-dial/);
  assert.match(css, /repeating-conic-gradient/);
  assert.match(css, /--dial-angle/);
  assert.match(css, /--dial-color/);
  assert.match(css, /control-emergency-flash/);
  assert.match(css, /user-select: none/);
});
