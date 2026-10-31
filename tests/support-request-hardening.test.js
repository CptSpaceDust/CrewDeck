const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const appPage = fs.readFileSync(
  path.join(root, "app/src/renderer/pages/SupportRequestsPage.jsx"),
  "utf8",
);
const websitePage = fs.readFileSync(
  path.join(root, "js/supportRequests.js"),
  "utf8",
);
const migration = fs.readFileSync(
  path.join(
    root,
    "supabase/migrations/20261030190000_v2_release_support_hardening.sql",
  ),
  "utf8",
);

test("private support requests can transfer only to permitted helpers", () => {
  for (const source of [appPage, websitePage]) {
    assert.match(source, /list_support_transfer_helpers/);
    assert.match(source, /transfer_support_request/);
  }
  assert.match(migration, /Assigned helper or Captain access required/);
  assert.match(migration, /is_support_helper\(target_helper/);
  assert.match(migration, /action, details[\s\S]*'transferred'/);
});

test("private response reminders and retention maintenance run server side", () => {
  assert.match(migration, /response_due_at/);
  assert.match(migration, /run_support_request_reminders/);
  assert.match(migration, /support-request-response-reminders/);
  assert.match(migration, /support_response_reminder/);
  assert.match(migration, /community_support_attachments/);
});
