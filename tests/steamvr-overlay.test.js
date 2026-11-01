const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const websiteRoot = path.resolve(root, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("Control Center no longer includes VRChat OSC automation", () => {
  const desktop = [
    read("src/main.js"),
    read("src/preload.js"),
    read("src/renderer/pages/ControlCenterPage.jsx"),
  ].join("\n");
  const website = [
    fs.readFileSync(path.join(websiteRoot, "control-center.html"), "utf8"),
    fs.readFileSync(path.join(websiteRoot, "js/control-center.js"), "utf8"),
    fs.readFileSync(
      path.join(websiteRoot, "css/control-center-space-glass.css"),
      "utf8",
    ),
  ].join("\n");
  assert.doesNotMatch(
    desktop,
    /VRChat OSC|osc:configure|node:dgram|oscShockArmed/,
  );
  assert.doesNotMatch(website, /VRChat OSC|OSC shock|CrewDeck\/Intensity/);
});

test("live controls coalesce stale commands and SteamVR has an interactive window path", () => {
  const page = read("src/renderer/pages/ControlCenterPage.jsx");
  const main = read("src/main.js");
  const settings = read("src/renderer/components/AppSettings.jsx");
  const wrist = read("src/renderer/components/VrWristLauncher.jsx");
  const panel = read("src/renderer/components/VrPanelShell.jsx");
  const vrControl = read("src/renderer/components/VrControlCenterPanel.jsx");
  const keyboard = read("src/renderer/components/VrKeyboard.jsx");
  const native = read("native/CrewDeck.SteamVrOverlay/Program.cs");
  assert.match(page, /pending: new Map\(\)/);
  assert.match(page, /queue\.pending\.set/);
  assert.match(page, /queue\.pending\.clear\(\)/);
  assert.match(main, /overlay:open-steamvr/);
  assert.match(main, /steam:\/\/run\/250820/);
  assert.match(settings, /Connect to SteamVR/);
  assert.match(main, /CrewDeck\.SteamVrOverlay/);
  assert.match(main, /offscreen: true/);
  assert.match(native, /VRApplication_Overlay/);
  assert.match(native, /SetOverlayTransformTrackedDeviceRelative/);
  assert.match(native, /SetOverlayTransformAbsolute/);
  assert.match(native, /SetOverlayAlpha/);
  assert.match(wrist, /Messages/);
  assert.match(wrist, /My meetups/);
  assert.match(wrist, /Trusted Person|canUseControlCenter/);
  assert.match(wrist, /Emergency|STOP/);
  assert.match(panel, /drag to move/);
  assert.match(panel, /set-anchor/);
  assert.match(vrControl, /STEAMVR CONTROL CENTER/);
  assert.match(vrControl, /Hold shock/);
  assert.match(native, /TriggerHapticPulse/);
  assert.match(native, /set-anchor/);
  assert.match(keyboard, /VR keyboard/);
});
