const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");

test("desktop voice calls include screen sharing and full room controls", () => {
  const main = read("src", "main.js");
  const preload = read("src", "preload.js");
  const page = read("src", "renderer", "pages", "MessagesPageV2.jsx");
  const settings = read("src", "renderer", "components", "AppSettings.jsx");
  assert.match(main, /setDisplayMediaRequestHandler/);
  assert.match(main, /desktopCapturer\.getSources/);
  assert.match(main, /audio: "loopback"/);
  assert.match(main, /useSystemPicker: false/);
  assert.match(main, /autoplay-policy", "no-user-gesture-required/);
  assert.match(main, /backgroundThrottling: false/);
  assert.match(preload, /screen-share:list-sources/);
  assert.match(page, /setScreenShareEnabled\(true/);
  assert.match(page, /publish\(false\)/);
  assert.match(page, /<video ref=\{videoRef\} autoPlay playsInline muted/);
  assert.match(page, /RoomEvent\.ActiveSpeakersChanged/);
  assert.match(page, /RoomEvent\.AudioPlaybackStatusChanged/);
  assert.match(page, /ScreenShareTile/);
  assert.match(page, /playCallEventSound\("join"\)/);
  assert.match(page, /playCallEventSound\("leave"\)/);
  assert.match(page, /switchActiveDevice/);
  assert.match(settings, /Test microphone/);
  assert.match(settings, /audioInputDeviceId/);
  assert.match(page, /Push to talk/);
  assert.match(page, /pushToTalkCode/);
  assert.match(page, /pushToTalkLabel/);
  assert.match(settings, /Push to talk key/);
});

test("desktop notifications use the website sounds and ring globally", () => {
  const app = read("src", "renderer", "App.jsx");
  const sounds = read("src", "renderer", "lib", "sounds.js");
  const data = read("src", "renderer", "lib", "data.js");
  assert.match(app, /startRingtone\(\)/);
  assert.match(app, /playNotificationSound\(\)/);
  assert.match(app, /incoming-call-card/);
  assert.match(sounds, /notification\.wav/);
  assert.match(sounds, /voice-call-ringtone\.mp3/);
  assert.match(data, /New group message in/);
  assert.match(data, /target_user_id: targetUserId/);
});

test("sidebar branding is reduced to the website name", () => {
  const sidebar = read("src", "renderer", "components", "Sidebar.jsx");
  assert.match(sidebar, /<strong>CrewDeck<\/strong>/);
  assert.doesNotMatch(sidebar, /Community Desktop/);
  assert.doesNotMatch(sidebar, /<Rocket/);
});
