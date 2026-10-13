const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");

test("community refresh controls reload data and show an active state", () => {
  const community = read("src", "renderer", "pages", "CommunityPagesV2.jsx");
  const enhanced = read(
    "src",
    "renderer",
    "pages",
    "EnhancedCommunityPages.jsx",
  );
  const meetups = read("src", "renderer", "pages", "MeetupsPage.jsx");

  for (const title of [
    "Refresh introductions",
    "Refresh ideas",
    "Refresh collaborations",
  ]) {
    const start = community.indexOf(`title="${title}"`);
    assert.ok(start >= 0, `Missing ${title}`);
    const control = community.slice(Math.max(0, start - 420), start + 160);
    assert.match(control, /onClick=/);
    assert.match(control, /disabled=\{loading\}/);
    assert.match(control, /aria-busy=\{loading\}/);
  }

  for (const title of ["Refresh crew", "Refresh birthdays"]) {
    const start = enhanced.indexOf(`title="${title}"`);
    assert.ok(start >= 0, `Missing ${title}`);
    const control = enhanced.slice(Math.max(0, start - 260), start + 220);
    assert.match(control, /onClick=\{reload\}/);
    assert.match(control, /disabled=\{loading\}/);
  }

  const meetupRefresh = meetups.slice(
    meetups.indexOf('className="icon-button refresh-button"'),
    meetups.indexOf('className="icon-button refresh-button"') + 320,
  );
  assert.match(meetupRefresh, /title="Refresh meetups"/);
  assert.match(meetupRefresh, /onClick=\{reloadAll\}/);
  assert.match(meetups, /disabled=\{loading\}/);
  assert.match(meetups, /Promise\.all\(\[/);
});

test("system refresh controls call their live reload actions", () => {
  const captain = read("src", "renderer", "pages", "CaptainPage.jsx");
  const controls = read("src", "renderer", "components", "CaptainControls.jsx");
  const center = read("src", "renderer", "pages", "ControlCenterPage.jsx");
  const settings = read("src", "renderer", "components", "AppSettings.jsx");

  assert.match(controls, /onClick=\{onRefresh\}/);
  assert.match(captain, /async function refresh\(\)[\s\S]*?await load\(\)/);
  assert.match(center, /onClick=\{loadDevices\}/);
  assert.match(settings, /onClick=\{\(\) => refresh\(true\)\}/);
  assert.match(settings, /window\.desktop\.updater\.check\(\)/);
});
