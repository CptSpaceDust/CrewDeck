const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { transformSync } = require("esbuild");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

test("message auto-scroll never returns Chromium's scroll promise to React", async () => {
  const { scrollMessageStream } = await import(
    "../src/renderer/lib/messageBehavior.mjs"
  );
  const calls = [];
  const endRef = {
    current: {
      scrollIntoView(options) {
        calls.push(options);
        return Promise.resolve();
      },
    },
  };
  assert.equal(scrollMessageStream(endRef), undefined);
  assert.deepEqual(calls, [{ behavior: "smooth" }]);
});

test("Enter sends; Shift+Enter, IME composition, and held Enter do not", async () => {
  const { shouldSendOnEnter } = await import(
    "../src/renderer/lib/messageBehavior.mjs"
  );
  assert.equal(shouldSendOnEnter({ key: "Enter" }), true);
  for (const event of [
    { key: "Enter", shiftKey: true },
    { key: "Enter", isComposing: true },
    { key: "Enter", repeat: true },
    { key: "a" },
  ])
    assert.equal(shouldSendOnEnter(event), false);
});

test("message alerts are suppressed for the visible matching conversation", async () => {
  const { shouldAlertForMessage } = await import(
    "../src/renderer/lib/messageBehavior.mjs"
  );
  const current = { id: "a", group: false };
  assert.equal(shouldAlertForMessage(current, "a", false, true, true), false);
  assert.equal(shouldAlertForMessage(current, "b", false, true, true), true);
  assert.equal(shouldAlertForMessage(current, "a", true, true, true), true);
  assert.equal(shouldAlertForMessage(current, "a", false, false, true), true);
  assert.equal(shouldAlertForMessage(current, "a", false, true, false), true);
  assert.equal(shouldAlertForMessage(null, "a", false, true, true), true);
});

test("duplicate realtime and notification-row alerts collapse into one delivery", async () => {
  const { claimConversationAlert, resetConversationAlertClaims } = await import(
    "../src/renderer/lib/alertDelivery.mjs"
  );
  resetConversationAlertClaims();
  assert.equal(claimConversationAlert("conversation-a", false, 1000), true);
  assert.equal(claimConversationAlert("conversation-a", false, 1200), false);
  assert.equal(claimConversationAlert("conversation-b", false, 1200), true);
  assert.equal(claimConversationAlert("conversation-a", false, 3600), true);
});

test("rapid direct messages enable a short slow-mode cooldown", async () => {
  const { recordDirectMessageBurst } = await import(
    "../src/renderer/lib/messageBehavior.mjs"
  );
  let state = { history: [], blockedUntil: 0 };
  for (const now of [1000, 2000, 3000]) {
    state = recordDirectMessageBurst(state.history, now);
    assert.equal(state.blockedUntil, 0);
  }
  state = recordDirectMessageBurst(state.history, 4000);
  assert.equal(state.blockedUntil, 9000);
  state = recordDirectMessageBurst(state.history, 13000);
  assert.equal(state.blockedUntil, 0);
});

test("website message formatting preserves whitespace and safely escapes HTML", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../src/renderer/components/MessageComposer.jsx"),
    "utf8",
  );
  const code = transformSync(source, {
    loader: "jsx",
    jsx: "automatic",
    format: "cjs",
  }).code;
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module,
    exports: module.exports,
    require: (id) =>
      id.includes("supabase") ||
      id.includes("messageBehavior") ||
      id.includes("crewFeatures") ||
      id.includes("preferences") ||
      id === "lucide-react"
        ? {}
        : require(id),
  });
  const format = (text) =>
    renderToStaticMarkup(
      React.createElement(module.exports.FormattedMessage, null, text),
    ).replace(/^<span class="formatted-message">|<\/span>$/g, "");
  assert.equal(
    format("*italic* ||bold|| **both**"),
    "<em>italic</em> <strong>bold</strong> <strong><em>both</em></strong>",
  );
  assert.equal(format("line 1\nline 2"), "line 1\nline 2");
  assert.equal(
    format("<script>alert(1)</script>"),
    "&lt;script&gt;alert(1)&lt;/script&gt;",
  );
  assert.equal(format("*unfinished"), "*unfinished");
  assert.equal(format("**first\nsecond**"), "**first\nsecond**");
  const quote = (message, messages = []) =>
    renderToStaticMarkup(
      React.createElement(module.exports.MessageReplyQuote, {
        message,
        messages,
        people: [{ id: "nova", username: "Nova" }],
      }),
    );
  assert.equal(quote({}), "");
  assert.match(
    quote({ is_reply: true }),
    /Original message unavailable.*Deleted or expired/,
  );
  const reply = quote({ reply_to_id: "original" }, [
    { id: "original", sender_id: "nova", content: "||Hello||" },
  ]);
  assert.match(reply, /Replying to Nova/);
  assert.match(reply, /<strong>Hello<\/strong>/);
});

test("message deletion uses an in-app dialog and restores composer focus", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../src/renderer/pages/MessagesPageV2.jsx"),
    "utf8",
  );
  assert.doesNotMatch(source, /confirm\("Delete this message\?"\)/);
  assert.match(source, /function DeleteMessageDialog/);
  assert.match(
    source,
    /querySelector\("\.chat-panel \.composer textarea"\)\?\.focus\(\)/,
  );
  assert.equal(
    (source.match(/onClick=\{\(\) => setDeleting\(item\)\}/g) || []).length,
    2,
  );
});
