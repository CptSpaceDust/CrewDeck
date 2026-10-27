const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("desktop meetups include calendar automation and conflict-filtered times", () => {
  const page = read("src/renderer/pages/MeetupsPage.jsx");
  const automation = read("src/renderer/components/CalendarAutomation.jsx");
  assert.match(page, /CalendarAutomation/);
  assert.match(page, /availableStartTimes/);
  assert.match(automation, /Connect Google Calendar/);
  assert.match(automation, /Continue on a phone with QR/);
  assert.match(automation, /AvailabilityPreview rows=\{preview\}/);
});

test("calendar automation surfaces Edge Function error details", () => {
  const component = read("src/renderer/components/CalendarAutomation.jsx");
  assert.match(component, /error\.context instanceof Response/);
  assert.match(component, /error\.context\.clone\(\)\.json\(\)/);
});

test("installer offers startup, background, minimized, and app-lock setup choices", () => {
  const installer = read("build/installer.nsh");
  assert.match(installer, /Keep notifications and calls active/);
  assert.match(installer, /Start CrewDeck when I sign in/);
  assert.match(installer, /Open CrewDeck minimized/);
  assert.match(installer, /app-lock PIN/);
  assert.match(installer, /installer-preferences\.json/);
});
