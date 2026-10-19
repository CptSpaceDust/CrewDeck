const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");

test("Space Glass is loaded after the base design system", () => {
  const main = read("src", "renderer", "main.jsx");
  assert.match(
    main,
    /import "\.\/styles\.css";\s*import "\.\/space-glass\.css";/,
  );
});

test("Space Glass covers every major app surface", () => {
  const css = read("src", "renderer", "space-glass.css");
  for (const selector of [
    ".sidebar",
    ".topbar",
    ".panel",
    ".auth-card",
    ".lock-card",
    ".calendar-day",
    ".crew-card",
    ".chat-panel",
    ".message.mine",
    ".notification-row.unread",
    ".settings-panel",
    ".call-panel",
    ".whats-new",
    ".captain-page .captain-management-section",
  ]) {
    assert.ok(
      css.includes(selector),
      `Missing Space Glass coverage for ${selector}`,
    );
  }
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /prefers-reduced-transparency/);
});

test("What’s Changed contains Added, Changed, and Fixed summaries", () => {
  const source = read(
    "src",
    "renderer",
    "components",
    "DesktopEnhancements.jsx",
  );
  assert.match(source, /<h2>What’s Changed<\/h2>/);
  assert.equal((source.match(/className="change-card /g) || []).length, 3);
  assert.match(source, /<strong>Added<\/strong>/);
  assert.match(source, /<strong>Changed<\/strong>/);
  assert.match(source, /<strong>Fixed<\/strong>/);
  assert.match(source, /clears the matching private file/);
  assert.match(source, /stay beneath shared media/);
  assert.match(source, /no longer remain stuck/);
});
