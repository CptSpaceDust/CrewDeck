const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

test("direct-message reads match the deployed website schema", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "src", "renderer", "lib", "data.js"),
    "utf8",
  );
  const getMessages =
    source.match(/export async function getMessages[\s\S]*?\r?\n}\r?\n/)?.[0] ||
    "";
  assert.match(getMessages, /reply_to_id,is_reply/);
  assert.doesNotMatch(getMessages, /edited_at/);
  assert.match(getMessages, /5 \* 24 \* 60 \* 60 \* 1000/);
});

test("closed poll cleanup is limited to the group owner", () => {
  const migration = fs.readFileSync(
    path.join(
      __dirname,
      "..",
      "supabase",
      "migrations",
      "20261014093358_delete_closed_group_polls.sql",
    ),
    "utf8",
  );
  assert.match(migration, /conversation\.owner_id = actor/);
  assert.match(migration, /Close the poll before deleting it/);
  assert.match(migration, /delete from public\.group_polls/);
  assert.match(migration, /security definer\s+set search_path = ''/);
  assert.match(
    migration,
    /revoke all on function public\.delete_closed_group_poll/,
  );
});
