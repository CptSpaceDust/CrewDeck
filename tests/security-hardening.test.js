import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(path, "utf8");

test("patched desktop dependencies stay pinned", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.devDependencies.concurrently, "9.2.5");
  assert.equal(pkg.devDependencies["source-map-js"], "1.2.2");
  assert.equal(pkg.devDependencies.electron, "44.5.1");
  assert.equal(pkg.devDependencies.vite, "6.4.3");
});

test("release and database security gates remain enabled", () => {
  const workflow = read(".github/workflows/release.yml");
  const interactionCheck = read("scripts/interaction-check.cjs");
  const migration = read(
    "supabase/migrations/20261004235812_harden_privileged_functions.sql",
  );

  assert.match(workflow, /npm audit --audit-level=moderate/);
  assert.doesNotMatch(interactionCheck, /JSON\.stringify\(value\)/);
  assert.match(migration, /create schema if not exists private/);
  assert.match(
    migration,
    /drop policy if exists "Authenticated users can create notifications"/,
  );
  assert.match(migration, /alter default privileges/);
});
