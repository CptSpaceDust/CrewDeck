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
  assert.match(page, /\.channel\(`control-access:\$\{guestLinkId\}`\)/);
  assert.match(page, /\.on\("broadcast", \{ event: "changed" \}, refreshGuestAccess\)/);
  assert.match(page, /window\.setInterval\(refreshGuestAccess, 15000\)/);
  assert.match(page, /Live shared access/);
});

test("desktop Control Center sends transient results through the shared toast system", () => {
  const page = read("src/renderer/pages/ControlCenterPage.jsx");
  assert.match(page, /new CustomEvent\("crewdeck-toast"/);
  assert.doesNotMatch(page, /notice \|\| "Control access confirmed\."/);
  assert.doesNotMatch(page, /className="control-center-notice"/);
});

test("desktop shared access presents a safe printable QR handoff", () => {
  const page = read("src/renderer/pages/ControlCenterPage.jsx");
  const styles = read("src/renderer/space-glass.css");
  assert.match(page, /QRCode\.toDataURL\(link/);
  assert.match(page, /Show QR code/);
  assert.match(page, /Scan access QR code/);
  assert.match(page, /Save image/);
  assert.match(page, /window\.print\(\)/);
  assert.match(page, /contains no API credential or raw device identifier/);
  assert.match(styles, /\.control-share-qr-presentation/);
  assert.match(styles, /@media print/);
});

