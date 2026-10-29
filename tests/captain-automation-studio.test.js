import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../src/renderer/${path}`, import.meta.url), "utf8");

test("desktop Captain panel includes the full Automation Studio", () => {
  const studio = read("components/CaptainAutomationStudio.jsx");
  const controls = read("components/CaptainControls.jsx");
  assert.match(controls, /Captain Automation Studio/);
  for (const feature of ["test mode","Exempt members","Exempt roles","Preview affected records","Duplicate","Version history","Undo reversible actions","Scan integrity"]) assert.match(studio, new RegExp(feature, "i"));
  for (const action of ["Preserve evidence","Temporarily hide content","Add to review queue","Notify permitted staff","Issue a warning","Apply a restriction","Create a repair task"]) assert.match(studio, new RegExp(action));
});
