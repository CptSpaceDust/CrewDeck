import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) =>
  readFileSync(new URL(`../src/renderer/${path}`, import.meta.url), "utf8");

test("desktop onboarding is private, optional, and editable", () => {
  const component = read("components/PersonalizedOnboarding.jsx");
  const api = read("lib/onboarding.js");
  const profile = read("pages/CommunityPagesV2.jsx");
  const settings = read("components/AppSettings.jsx");
  assert.match(component, /Every answer is optional, private/);
  assert.match(component, /Skip for now/);
  assert.match(component, /selectedWalkthroughs/);
  assert.match(component, /updatePreferences/);
  assert.match(api, /member_onboarding_preferences/);
  assert.match(profile, /Personalize CrewDeck/);
  assert.match(settings, /Edit onboarding answers/);
});
