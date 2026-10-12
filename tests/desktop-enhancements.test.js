const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");

test("desktop enhancements cover notifications, drafts, reminders, and privacy", () => {
  const preferences = read("src", "renderer", "lib", "preferences.js");
  const enhancements = read(
    "src",
    "renderer",
    "components",
    "DesktopEnhancements.jsx",
  );
  const settings = read("src", "renderer", "components", "AppSettings.jsx");
  const mayuLoader = read("src", "renderer", "components", "MayuLoader.jsx");
  const startup = read("src", "renderer", "components", "StartupScreen.jsx");
  const auth = read("src", "renderer", "components", "AuthScreen.jsx");
  const app = read("src", "renderer", "App.jsx");
  const messages = read("src", "renderer", "pages", "MessagesPageV2.jsx");
  const profile = read(
    "src",
    "renderer",
    "pages",
    "EnhancedCommunityPages.jsx",
  );

  assert.match(preferences, /quietHours/);
  assert.match(preferences, /mutedConversations/);
  assert.match(preferences, /markAllConversationsRead/);
  assert.match(preferences, /saveDraft/);
  assert.match(settings, /Lock after no activity/);
  assert.match(enhancements, /Meetup starting soon/);
  assert.match(enhancements, /What’s Changed/);
  assert.match(settings, /Appearance & accessibility/);
  assert.match(settings, /Calls & audio/);
  assert.match(settings, /Send test notification/);
  assert.doesNotMatch(settings, /Show Mayu on loading screens/);
  assert.doesNotMatch(settings, /<h2>Messages<\/h2>/);
  assert.match(preferences, /glassIntensity/);
  assert.match(preferences, /enterToSend/);
  assert.match(preferences, /audioInputDeviceId/);
  assert.match(preferences, /desktopNotifications/);
  assert.match(mayuLoader, /mayu-walk-6\.png/);
  assert.match(mayuLoader, /src=\{walkFrames\[frame\]\}/);
  assert.doesNotMatch(mayuLoader, /backgroundImage/);
  assert.doesNotMatch(startup, /Bringing your crew together|Secure session|Community sync|Ready/);
  assert.match(startup, /startup-starflight/);
  assert.match(startup, /startup-ring/);
  assert.doesNotMatch(startup, /Mayu|mayu/);
  assert.match(app, /<StartupScreen \/>/);
  assert.match(auth, /auth-card-\$\{mode\}/);
  assert.match(auth, /Forgot password\?/);
  assert.match(auth, /What happens next\?/);
  assert.match(messages, /Search messages/);
  assert.match(profile, /Report a concern/);
});

test("notifications stay synchronized and app flows avoid native popups", () => {
  const app = read("src", "renderer", "App.jsx");
  const notifications = read(
    "src",
    "renderer",
    "pages",
    "NotificationsPage.jsx",
  );
  const community = read("src", "renderer", "pages", "CommunityPagesV2.jsx");
  const enhanced = read(
    "src",
    "renderer",
    "pages",
    "EnhancedCommunityPages.jsx",
  );
  const messages = read("src", "renderer", "pages", "MessagesPageV2.jsx");
  const dialog = read("src", "renderer", "components", "InAppDialog.jsx");
  const combined = [notifications, community, enhanced, messages].join("\n");

  assert.match(app, /notifications-changed/);
  assert.match(notifications, /notifications-changed/);
  assert.doesNotMatch(app, /setUnread\(0\)/);
  assert.doesNotMatch(combined, /\b(?:alert|confirm|prompt)\s*\(/);
  assert.match(combined, /confirmInApp/);
  assert.match(dialog, /<Modal/);
});

test("closing the desktop window keeps realtime notifications running in the tray", () => {
  const main = read("src", "main.js");
  const settings = read("src", "renderer", "components", "AppSettings.jsx");

  assert.match(main, /new Tray\(ICON_PATH\)/);
  assert.match(main, /label: "Open CrewDeck"/);
  assert.match(main, /label: "Quit CrewDeck"/);
  assert.match(main, /mainWindow\.on\("close", \(event\) =>/);
  assert.match(
    main,
    /event\.preventDefault\(\);\s+lockApp\(\);\s+mainWindow\.hide\(\);/,
  );
  assert.match(main, /backgroundThrottling: false/);
  assert.match(main, /app\.on\("before-quit"/);
  assert.doesNotMatch(main, /window-all-closed", \(\) => app\.quit/);
  assert.match(settings, /Windows\s+notification area/);
});

test("locked and backgrounded apps keep private, reliable alert delivery", () => {
  const main = read("src", "main.js");
  const preload = read("src", "preload.js");
  const app = read("src", "renderer", "App.jsx");
  const settings = read("src", "renderer", "components", "AppSettings.jsx");

  assert.match(app, /pollNotifications/);
  assert.match(app, /\["INSERT", "UPDATE"\]/);
  assert.match(app, /window\.setInterval\([^]*4000/);
  assert.match(preload, /hideWhenLocked/);
  assert.match(main, /locked && Boolean\(payload\.hideWhenLocked\)/);
  assert.match(main, /pendingNotificationRoute/);
  assert.match(main, /deliverPendingNotificationRoute\(\)/);
  assert.match(settings, /Hide notification details while app is locked/);
});

test("Ideas Board actions and call routes have stable layouts and one-shot behavior", () => {
  const community = read("src", "renderer", "pages", "CommunityPagesV2.jsx");
  const messages = read("src", "renderer", "pages", "MessagesPageV2.jsx");
  const styles = read("src", "renderer", "styles.css");

  assert.match(community, /className="idea-card-footer"/);
  assert.match(styles, /\.idea-card-footer/);
  assert.match(styles, /overflow-wrap: anywhere/);
  assert.match(messages, /onRouteConsumed\?\.\(\)/);
  assert.match(messages, /\[route\?\.conversation, route\?\.call/);
  assert.match(messages, /blockedUntil=\{slowUntil\}/);
});

test("community meetup times convert into a real instant", async () => {
  const { communityDateTime, zonedDateTime } = await import(
    "../src/renderer/lib/time.js"
  );
  const winter = communityDateTime("2026-01-10", "12:00");
  const summer = communityDateTime("2026-07-10", "12:00");
  assert.equal(winter.toISOString(), "2026-01-10T19:00:00.000Z");
  assert.equal(summer.toISOString(), "2026-07-10T18:00:00.000Z");

  const meetup = zonedDateTime("2026-01-10", "19:00", "America/Denver");
  assert.equal(meetup.toISOString(), "2026-01-11T02:00:00.000Z");
  assert.equal(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      minute: "2-digit",
    }).format(meetup),
    "9:00 PM",
  );
});
