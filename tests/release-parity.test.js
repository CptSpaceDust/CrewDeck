const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");

test("group messaging uses the website tables and voice-call context", () => {
  const data = read("src", "renderer", "lib", "data.js");
  const page = read("src", "renderer", "pages", "MessagesPageV2.jsx");
  for (const table of [
    "group_conversations",
    "group_members",
    "group_messages",
  ])
    assert.match(data, new RegExp(`from\\(\\"${table}\\"\\)`));
  assert.match(data, /create_group_chat/);
  assert.match(data, /leave_group_chat/);
  assert.match(page, /Group Messages/);
  assert.match(page, /group_conversation_id/);
  assert.match(page, /groupId: contextId/);
});

test("packaged app is wired to publish and consume GitHub releases", () => {
  const pkg = JSON.parse(read("package.json"));
  const main = read("src", "main.js");
  const workflow = read(".github", "workflows", "release.yml");
  assert.equal(pkg.dependencies["electron-updater"], "6.8.9");
  assert.equal(pkg.name, "crewdeck-desktop");
  assert.equal(pkg.build.appId, "com.crewdeck.app");
  assert.equal(pkg.build.productName, "CrewDeck");
  assert.equal(pkg.build.nsis.shortcutName, "CrewDeck");
  assert.equal(pkg.build.nsis.guid, "d7a6a953-56df-5b98-b299-c025a7d6ae7b");
  assert.deepEqual(pkg.build.publish[0], {
    provider: "github",
    owner: "CptSpaceDust",
    repo: "CrewDeck",
    releaseType: "release",
  });
  assert.deepEqual(pkg.build.win.target, ["nsis"]);
  assert.doesNotMatch(pkg.scripts.dist, /portable/);
  assert.match(main, /checkForUpdates/);
  assert.match(main, /quitAndInstall/);
  assert.match(workflow, /--publish never/);
  assert.match(workflow, /gh release upload/);
  assert.match(workflow, /dist\/latest\.yml/);
  assert.match(workflow, /CrewDeck-Setup-\$version\.exe/);
  assert.match(workflow, /get-release-notes\.ps1/);
  assert.match(workflow, /--notes-file "release-notes\.md"/);
  assert.match(main, /DEEP_LINK_SCHEMES = \["crewdeck", "cptspacedust"\]/);
  assert.match(main, /app\.setPath\("userData", crewDeckUserData\)/);
});

test("CrewDeck branding is present across app entry points", () => {
  const auth = read("src", "renderer", "components", "AuthScreen.jsx");
  const sidebar = read("src", "renderer", "components", "Sidebar.jsx");
  const lock = read("src", "renderer", "components", "LockScreen.jsx");
  const updater = read("build", "UpdateAnimation.cs");
  const icon = path.join(root, "assets", "icon.png");
  assert.match(auth, /<strong>CrewDeck<\/strong>/);
  assert.match(sidebar, /<strong>CrewDeck<\/strong>/);
  assert.match(lock, /<strong>CrewDeck<\/strong>/);
  assert.match(updater, /Updating CrewDeck/);
  assert.ok(fs.statSync(icon).size > 1000);
});

test("CrewDeck exposes the public privacy policy before and after sign in", () => {
  const auth = read("src", "renderer", "components", "AuthScreen.jsx");
  const settings = read("src", "renderer", "components", "AppSettings.jsx");
  const policyUrl = /https:\/\/cptspacedust\.com\/Privacy\.html/;
  assert.match(auth, policyUrl);
  assert.match(settings, policyUrl);
  assert.match(auth, /Privacy Policy/);
  assert.match(settings, /Read privacy policy/);
});
