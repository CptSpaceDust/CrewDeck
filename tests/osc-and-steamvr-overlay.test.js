const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("VRChat OSC stays local and accepts only CrewDeck parameters", () => {
  const main = read("src/main.js");
  assert.match(main, /127\.0\.0\.1/);
  assert.match(main, /\/avatar\/parameters\/CrewDeck\//);
  assert.match(main, /remote\.address !== "127\.0\.0\.1"/);
  assert.match(main, /osc:configure/);
});

test("OSC shock automation is session armed and keeps Control Center safety gates", () => {
  const page = read("src/renderer/pages/ControlCenterPage.jsx");
  assert.match(page, /oscShockArmed/);
  assert.match(page, /Safe Mode/);
  assert.match(page, /Trusted Person/);
  assert.match(page, /control\.warningEnabled/);
  assert.match(page, /OSC shock commands for this session only/);
});

test("live controls coalesce stale commands and SteamVR has an interactive window path", () => {
  const page = read("src/renderer/pages/ControlCenterPage.jsx");
  const main = read("src/main.js");
  const settings = read("src/renderer/components/AppSettings.jsx");
  assert.match(page, /pending: new Map\(\)/);
  assert.match(page, /queue\.pending\.set/);
  assert.match(page, /queue\.pending\.clear\(\)/);
  assert.match(main, /overlay:open-steamvr/);
  assert.match(main, /steam:\/\/run\/250820/);
  assert.match(settings, /Open in SteamVR/);
});
