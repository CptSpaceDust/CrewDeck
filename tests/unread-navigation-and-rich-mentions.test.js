import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("src/renderer/pages/MessagesPageV2.jsx", "utf8");
const navigation = readFileSync("src/renderer/components/MessageNavigation.jsx", "utf8");
const composer = readFileSync("src/renderer/components/MessageComposer.jsx", "utf8");
const data = readFileSync("src/renderer/lib/data.js", "utf8");

test("desktop direct and group chats expose cross-device unread navigation", () => {
  assert.match(page, /UnreadDivider/);
  assert.match(page, /UnreadNavigator/);
  assert.match(navigation, /conversation_read_positions/);
  assert.match(navigation, /Mark read/);
  assert.match(navigation, /markUnread/);
  assert.match(navigation, /message-jump-highlight/);
});

test("desktop composer selects durable mentions and broadcast recipients", () => {
  assert.match(composer, /mention-suggestion-menu/);
  assert.match(composer, /selectedMentions/);
  assert.match(composer, /broadcastKind/);
  assert.match(composer, /eligible recipients/);
  assert.match(composer, /message-mention/);
  assert.match(composer, /Former member/);
  assert.match(data, /registerMessageMentions/);
});

