const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { AppLockStore, validPin } = require("../src/app-lock-store");

test("accepts only 4 to 8 digit PINs", () => {
  assert.equal(validPin("1234"), true); assert.equal(validPin("12345678"), true);
  assert.equal(validPin("123"), false); assert.equal(validPin("123456789"), false); assert.equal(validPin("12a4"), false);
});

test("stores a salted hash and verifies the PIN", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cpt-lock-"));
  const file = path.join(directory, "settings.json");
  const store = new AppLockStore(file);
  assert.equal(store.setPin("2468").ok, true);
  assert.equal(store.verify("2468"), true); assert.equal(store.verify("1111"), false);
  const saved = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(Object.hasOwn(saved, "pin"), false);
  assert.equal(saved.enabled, true);
  assert.match(saved.salt, /^[a-f0-9]{48}$/);
  assert.match(saved.pinHash, /^[a-f0-9]{128}$/);
  assert.equal(new AppLockStore(file).verify("2468"), true);
});

test("requires the current PIN to change or disable app lock", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cpt-lock-"));
  const store = new AppLockStore(path.join(directory, "settings.json"));
  store.setPin("2468");
  assert.equal(store.setPin("1357", "0000").ok, false);
  assert.equal(store.disable("0000").ok, false);
  assert.equal(store.setPin("1357", "2468").ok, true);
  assert.equal(store.disable("1357").ok, true);
});
