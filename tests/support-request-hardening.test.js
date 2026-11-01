const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const appRoot = path.resolve(__dirname, "..");
const workspaceRoot = path.resolve(appRoot, "..");
const appPage = fs.readFileSync(
  path.join(appRoot, "src/renderer/pages/SupportRequestsPage.jsx"),
  "utf8",
);
const websitePath = path.join(workspaceRoot, "js/supportRequests.js");
const migrationPath = path.join(
  workspaceRoot,
  "supabase/migrations/20261030190000_v2_release_support_hardening.sql",
);
const websitePage = fs.existsSync(websitePath)
  ? fs.readFileSync(websitePath, "utf8")
  : null;
const migration = fs.existsSync(migrationPath)
  ? fs.readFileSync(migrationPath, "utf8")
  : null;

test("private support requests can transfer only to permitted helpers", () => {
  for (const source of [appPage, websitePage].filter(Boolean)) {
    assert.match(source, /list_support_transfer_helpers/);
    assert.match(source, /transfer_support_request/);
  }
  if (migration) {
    assert.match(migration, /Assigned helper or Captain access required/);
    assert.match(migration, /is_support_helper\(target_helper/);
    assert.match(migration, /action, details[\s\S]*'transferred'/);
  }
});

test("private response reminders and retention maintenance run server side", () => {
  if (!migration) return;
  assert.match(migration, /response_due_at/);
  assert.match(migration, /run_support_request_reminders/);
  assert.match(migration, /support-request-response-reminders/);
  assert.match(migration, /support_response_reminder/);
  assert.match(migration, /community_support_attachments/);
});
