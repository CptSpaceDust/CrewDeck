const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("main process monitors one removable access key without formatting drives", () => {
  const main = read("src/main.js");
  assert.match(main, /new AccessKeyStore/);
  assert.match(main, /refreshAccessKeyPresence/);
  assert.match(main, /750/);
  assert.match(main, /access-key:provision/);
  assert.match(main, /access-key:recover/);
  assert.match(
    main,
    /Disable the physical access key before removing its recovery PIN/,
  );
  assert.doesNotMatch(main, /Format-Volume|diskpart|Clear-Disk/);
});

test("captain-only panel provisions the key and documents recovery", () => {
  const captain = read("src/renderer/components/CaptainControls.jsx");
  const panel = read("src/renderer/components/PhysicalAccessKey.jsx");
  assert.match(captain, /Physical App Access Key/);
  assert.match(panel, /Create physical access key/);
  assert.match(panel, /Ctrl \+ Shift \+ U/);
  assert.match(panel, /No formatting or storage erasure/);
});

test("a missing key renders the neutral privacy cover", () => {
  const app = read("src/renderer/App.jsx");
  const cover = read("src/renderer/components/PrivacyCover.jsx");
  assert.match(app, /lock\.accessKey\?\.enabled/);
  assert.match(cover, /Daily Focus/);
  assert.doesNotMatch(cover, />CrewDeck</);
  assert.match(cover, /window\.desktop\.accessKey\.recover/);
});
