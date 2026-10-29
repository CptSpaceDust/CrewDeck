import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("src/renderer/pages/MessagesPageV2.jsx", "utf8");
const decisions = readFileSync("src/renderer/components/DecisionRecords.jsx", "utf8");
const archive = readFileSync("src/renderer/lib/decisionArchive.js", "utf8");

test("desktop group decisions support history, corrections, and actions", () => {
  assert.match(page, /Decision records/);
  assert.match(decisions, /Correct decision/);
  assert.match(decisions, /Create next action/);
  assert.match(decisions, /Search decisions/);
});

test("desktop direct and group conversations expose synced archives", () => {
  assert.match(page, /Archive conversation/);
  assert.match(page, /Archive group/);
  assert.match(page, /Auto archive/);
  assert.match(archive, /conversation_archives/);
});
