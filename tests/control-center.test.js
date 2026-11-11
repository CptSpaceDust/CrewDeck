const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");

test("CrewDeck routes every member to the Control Center entry point", () => {
  const app = read("src", "renderer", "App.jsx");
  const sidebar = read("src", "renderer", "components", "Sidebar.jsx");
  assert.match(app, /import ControlCenterPage/);
  assert.match(app, /case "control-center"/);
  assert.match(app, /<ControlCenterPage \{\.\.\.props\} \/>/);
  assert.match(sidebar, /Control Center/);
  assert.doesNotMatch(sidebar, /controlCenterAccess/);
});
test("Control Center verifies auth and opens paired owner-specific access", () => {
  const page = read("src", "renderer", "pages", "ControlCenterPage.jsx");
  assert.match(page, /supabase\.auth\.getUser\(\)/);
  const pageAccess = page.slice(
    page.indexOf("function canUseControlCenter"),
    page.indexOf("async function functionError"),
  );
  assert.doesNotMatch(pageAccess, /rank.*captain/i);
  assert.match(page, /from\("site_settings"\)/);
  assert.match(page, /safe_mode/);
  assert.match(page, /Pair API/);
  assert.match(page, /Open \$\{ownerAccessOpen\.profile\?\.username/);
  assert.match(page, /redeem_code/);
  assert.match(page, /control-provider/);
});

test("Control Center includes provider controls, vertical rails, and owner tools", () => {
  const page = read("src", "renderer", "pages", "ControlCenterPage.jsx");
  const css = read("src", "renderer", "space-glass.css");
  for (const feature of [
    "control-provider",
    "shocker_presets",
    "control_logs",
    "Warning on",
    "Live Control",
    "Emergency Stop",
    "Device settings and safety",
    'action: "update_device"',
  ])
    assert.ok(page.includes(feature), `Missing ${feature}`);
  assert.match(page, /vertical label="Intensity"/);
  assert.match(page, /shockIntensity/);
  assert.match(page, /vibrateIntensity/);
  assert.match(page, /sendCommand\(device, "stop", 0, 0, true\)/);
  assert.match(
    page,
    /Control my shock devices over the internet! Be careful!!/,
  );
  assert.doesNotMatch(page, /nextDevices\.length\} connected device/);
  assert.doesNotMatch(page, /Authorized systems|Secure control link/);
  assert.doesNotMatch(page, /[⚡🔊]\s*(?:Vibrate|Beep|Shock)/);
  assert.match(css, /\.control-rail\.vertical/);
  assert.match(css, /\.control-vertical-rails/);
  assert.match(css, /container-name:\s*control-device/);
  assert.match(css, /@container control-device \(max-width: 880px\)/);
  assert.match(css, /grid-template-areas:[\s\S]*"core core"[\s\S]*"shock vibrate"/);
  assert.match(css, /control-emergency-flash/);
  assert.match(css, /user-select: none/);
  for (const safetyFeature of [
    "captain_create_control_access_link",
    "Duplicate command blocked",
    "Hold to shock",
    "Device settings and safety",
    "require_hold_to_shock",
    "Maximum uses",
    "copyControlText",
    "Quick access code",
  ])
    assert.ok(page.includes(safetyFeature), `Missing ${safetyFeature}`);
});

test("Control Center separates vertical shock and vibrate controls and supports owner pause", () => {
  const page = read("src", "renderer", "pages", "ControlCenterPage.jsx");
  const css = read("src", "renderer", "space-glass.css");
  assert.match(page, /shockIntensity/);
  assert.match(page, /vibrateIntensity/);
  assert.match(page, /action: "set_pause"/);
  assert.match(page, /Disconnect API/);
  assert.match(page, /crew_options/);
  assert.match(css, /\.control-rail\.vertical/);
  assert.match(css, /command-confirmed/);
});
