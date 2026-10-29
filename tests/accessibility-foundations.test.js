const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("shared app navigation and dialogs expose keyboard semantics", () => {
  const modal = read("src/renderer/components/ui.jsx");
  const sidebar = read("src/renderer/components/Sidebar.jsx");
  const palette = read("src/renderer/components/CommandPalette.jsx");
  assert.match(modal, /event\.key === "Escape"/);
  assert.match(modal, /event\.key !== "Tab"/);
  assert.match(modal, /previousFocus/);
  assert.match(modal, /role="status"/);
  assert.match(modal, /role="alert"/);
  assert.match(sidebar, /aria-label="Primary navigation"/);
  assert.match(sidebar, /aria-current=/);
  assert.match(palette, /aria-label="Search CrewDeck pages and actions"/);
  assert.match(palette, /event\.key !== "Tab"/);
  assert.match(palette, /previousFocus/);
});

test("production renderer separates stable and high-cost dependencies", () => {
  const config = read("vite.config.mjs");
  assert.match(config, /manualChunks/);
  assert.match(config, /livekit-client/);
  assert.match(config, /@supabase\/supabase-js/);
  assert.match(config, /lucide-react/);
});

test("renderer source stays free of console output", () => {
  const files = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (/\.(?:js|jsx)$/.test(entry.name)) files.push(absolute);
    }
  };
  visit(path.join(root, "src", "renderer"));
  for (const file of files) {
    assert.doesNotMatch(fs.readFileSync(file, "utf8"), /console\.(?:log|warn|error)\s*\(/, path.relative(root, file));
  }
});
