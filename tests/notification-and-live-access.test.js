const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const read = (file) => readFileSync(path.join(__dirname, "..", file), "utf8");

test("Clear All removes shared notification records and notification cards stay accessible", () => {
  const page = read("src/renderer/pages/NotificationsPage.jsx");
  const styles = read("src/renderer/styles.css");
  assert.match(page, /clearNotifications\(user\.id\)/);
  assert.match(styles, /\.sr-only/);
  assert.match(styles, /desktop-toast-close/);
});

test("desktop Control Center manages and refreshes live shared access", () => {
  const page = read("src/renderer/pages/ControlCenterPage.jsx");
  assert.match(page, /Manage active access/);
  assert.match(page, /captain_update_control_access_link/);
  assert.match(page, /window\.setInterval\(refreshGuestAccess, 1800\)/);
  assert.match(page, /Live shared access/);
});

