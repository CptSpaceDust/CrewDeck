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
  assert.match(features, /message-reaction-summary/);
  assert.match(features, /emoji-picker-popover/);
  assert.match(features, /ConversationDetails/);
  assert.match(crewFeatures, /deleteMessageReminder/);
  assert.doesNotMatch(messages, /call_messages|Call chat/);
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
  const friends = read("src", "renderer", "pages", "FriendsPage.jsx");
  const meetup = read("src", "renderer", "components", "MeetupExtras.jsx");
  const settings = read("src", "renderer", "components", "AppSettings.jsx");
  assert.match(captain, /Evidence inbox/);
  assert.match(captain, /Maintenance mode/);
  assert.match(friends, /Your crew friends/);
  assert.doesNotMatch(
    friends,
    /Looking for group|Temporary party rooms|favorite_crew/,
  );
  assert.match(meetup, /meetup_waitlist/);
  assert.match(settings, /Run full diagnostics/);
  assert.match(settings, /Realtime updates/);
  assert.match(settings, /Open Discord support/);
  assert.doesNotMatch(settings, /Export my data|What’s New history/);
});

test("friend hub stays private, opt-in, and available in the packaged app", () => {
  const migration = read(
    "supabase",
    "migrations",
    "20261018024500_friend_hub.sql",
  );
  const hardening = read(
    "supabase",
    "migrations",
    "20261018030000_harden_friend_hub.sql",
  );
  const desktop = read("src", "renderer", "pages", "FriendsPage.jsx");
  assert.match(migration, /create table if not exists public\.friend_details/);
  assert.match(migration, /friend_details_owner/);
  assert.match(
    migration,
    /recommendations_enabled boolean not null default false/,
  );
  assert.match(
    migration,
    /activity_feed_enabled boolean not null default false/,
  );
  assert.match(hardening, /security invoker/);
  for (const marker of [
    "Private nickname",
    "Close friend",
    "Mutual friends",
    "Plan with preset",
  ]) {
    assert.match(desktop, new RegExp(marker));
  }
  assert.match(desktop, /get_friend_recommendations/);
  assert.match(desktop, /get_friend_activity_feed/);
  assert.match(desktop, /start_call=1/);
});
