const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  AccessKeyStore,
  KEY_FILE_NAME,
  normalizeRoot,
} = require("../src/access-key-store");

test("accepts only explicit Windows drive roots", () => {
  assert.equal(normalizeRoot("e:\\"), "E:\\");
  assert.equal(normalizeRoot("C:\\folder"), "");
  assert.equal(normalizeRoot("\\\\server\\share"), "");
  assert.equal(normalizeRoot(""), "");
});

test("creates one random key and matches both the file and drive identity", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "crewdeck-key-"));
  const settingsPath = path.join(directory, "access-key.json");
  const store = new AccessKeyStore(settingsPath);
  const root = "E:\\";
  const originalKeyPath = store.keyPath.bind(store);
  store.keyPath = () => path.join(directory, KEY_FILE_NAME);
  const drive = { root, serial: "SERIAL-A", label: "Private key" };
  const result = store.provision(drive);
  assert.equal(result.ok, true);
  const document = JSON.parse(fs.readFileSync(store.keyPath(root), "utf8"));
  assert.match(document.secret, /^[a-f0-9]{64}$/);
  assert.equal(
    Object.hasOwn(JSON.parse(fs.readFileSync(settingsPath, "utf8")), "secret"),
    false,
  );
  assert.equal(store.findMatchingDrive([drive])?.serial, "SERIAL-A");
  assert.equal(
    store.findMatchingDrive([{ ...drive, serial: "SERIAL-B" }]),
    null,
  );
  document.secret = "00".repeat(32);
  fs.writeFileSync(store.keyPath(root), JSON.stringify(document));
  assert.equal(store.findMatchingDrive([drive]), null);
  store.keyPath = originalKeyPath;
});

test("disables the active key and removes its removable-drive file", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "crewdeck-key-"));
  const store = new AccessKeyStore(path.join(directory, "access-key.json"));
  store.keyPath = () => path.join(directory, KEY_FILE_NAME);
  const drive = { root: "F:\\", serial: "SERIAL-F", label: "Key" };
  assert.equal(store.provision(drive).ok, true);
  assert.equal(fs.existsSync(store.keyPath(drive.root)), true);
  assert.equal(store.disable([drive]).ok, true);
  assert.equal(fs.existsSync(store.keyPath(drive.root)), false);
  assert.equal(store.settings.enabled, false);
});
