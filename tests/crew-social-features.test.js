const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");

test("social feature migration protects conversation and moderation data", () => {
  const sql = read(
    "supabase",
    "migrations",
    "20261014150256_crew_social_calls_and_safety.sql",
  );
  for (const table of [
    "conversation_preferences",
    "message_pins",
    "message_reactions",
    "message_read_receipts",
    "message_reminders",
    "friendships",
    "meetup_participants",
    "moderation_evidence_snapshots",
    "call_messages",
  ]) {
    assert.match(
      sql,
      new RegExp(`alter table public\\.${table} enable row level security`),
    );
  }
  assert.match(sql, /private\.can_access_conversation/);
  assert.match(sql, /private\.can_access_call/);
  assert.match(sql, /private\.enforce_group_slow_mode/);
  assert.match(sql, /private\.promote_meetup_waitlist/);
  assert.match(
    sql,
    /create or replace function public\.delete_dm_conversation/,
  );
  assert.match(sql, /delete from public\.dm_conversations/);
  assert.match(sql, /set search_path = ''/);
  assert.doesNotMatch(sql, /auth\.role\(\)/);
});

test("desktop messaging exposes the selected realtime conversation tools", () => {
  const features = read(
    "src",
    "renderer",
    "components",
    "ConversationFeatures.jsx",
  );
  const messages = read("src", "renderer", "pages", "MessagesPageV2.jsx");
  const data = read("src", "renderer", "lib", "data.js");
  const crewFeatures = read("src", "renderer", "lib", "crewFeatures.js");
  const combined = `${features}\n${crewFeatures}`;
  for (const marker of [
    "message_reactions",
    "message_read_receipts",
    "message_reminders",
    "forward_crew_message",
    "moderation_evidence_snapshots",
    "Conversation folder",
    "Conversation sound",
  ])
    assert.match(combined, new RegExp(marker));
  assert.match(messages, /PinnedMessages/);
  assert.match(features, /Seen by/);
  assert.match(messages, /call_messages/);
  assert.match(messages, /handRaised/);
  assert.match(messages, /deafened/);
  assert.match(messages, /Delete conversation/);
  assert.match(data, /delete_dm_conversation/);
  assert.match(data, /mentionsEveryone/);
  assert.match(data, /senderMembership/);
  assert.match(data, /forwarded_from_message_id/);
});

test("website and desktop ship matching community operations surfaces", () => {
  const captain = read(
    "src",
    "renderer",
    "components",
    "CaptainOperations.jsx",
  );
  const hub = read("src", "renderer", "pages", "CrewHubPage.jsx");
  const meetup = read("src", "renderer", "components", "MeetupExtras.jsx");
  const settings = read("src", "renderer", "components", "AppSettings.jsx");
  assert.match(captain, /Evidence inbox/);
  assert.match(captain, /Maintenance mode/);
  assert.match(hub, /Looking for group/);
  assert.match(hub, /Temporary party rooms/);
  assert.match(meetup, /meetup_waitlist/);
  assert.match(settings, /Run diagnostics/);
  assert.match(settings, /Export my data/);
});
