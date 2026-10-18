const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { transformSync } = require("esbuild");

function loadData(availability) {
  let inserted = false;
  const calls = [];
  const supabase = {
    from(table) {
      let filters = [],
        insert = false;
      return {
        select() {
          return this;
        },
        eq(key, value) {
          filters.push([key, value]);
          return this;
        },
        in() {
          return this;
        },
        limit() {
          return this;
        },
        maybeSingle() {
          return this;
        },
        single() {
          return this;
        },
        insert() {
          insert = true;
          inserted = true;
          return this;
        },
        then(resolve) {
          calls.push({ table, filters });
          const result = insert
            ? { data: { id: "new" } }
            : filters.some(([k, v]) => k === "status" && v === "approved")
              ? availability
              : { data: [] };
          return Promise.resolve(result).then(resolve);
        },
      };
    },
    functions: { invoke: async () => ({ error: null }) },
  };
  const time = {
    zonedDateTime: (date, time) => new Date(`${date}T${time}:00`),
    meetupInstant: (item) =>
      new Date(`${item.meetup_date}T${item.start_time}:00`),
    meetupLocalDateKey: (item) => item.meetup_date,
  };
  const module = { exports: {} };
  const code = transformSync(
    fs.readFileSync(require.resolve("../src/renderer/lib/data.js"), "utf8"),
    { format: "cjs" },
  ).code;
  vm.runInNewContext(code, {
    module,
    exports: module.exports,
    require: (path) => (path.includes("supabase") ? { supabase } : time),
  });
  return {
    create: module.exports.createMeetup,
    calls,
    inserted: () => inserted,
  };
}
test("meetup submission rejects overlapping times before inserting", async () => {
  const data = loadData({
    data: [
      {
        id: "booked",
        user_id: "crew",
        meetup_date: "2026-10-28",
        start_time: "18:00",
        duration: 2,
        with_user_id: "friend",
      },
    ],
  });
  await assert.rejects(
    data.create("crew", {
      meetup_date: "2026-10-28",
      start_time: "19:30",
      time_zone: "America/Denver",
      duration: 1,
      with_user_id: "friend",
    }),
    /overlaps another meetup/,
  );
  assert.equal(data.inserted(), false);
  assert.deepEqual(JSON.parse(JSON.stringify(data.calls[0].filters)), [
    ["status", "approved"],
  ]);
});
test("meetups can share a date when their times do not overlap", async () => {
  const data = loadData({
    data: [
      {
        id: "earlier",
        user_id: "crew",
        with_user_id: "friend",
        meetup_date: "2026-10-28",
        start_time: "18:00",
        duration: 1,
      },
    ],
  });
  await data.create("crew", {
    meetup_date: "2026-10-28",
    start_time: "19:00",
    time_zone: "America/Denver",
    duration: 1,
    with_user_id: "friend",
  });
  assert.equal(data.inserted(), true);
});
test("meetup availability errors fail closed without inserting", async () => {
  const data = loadData({ error: new Error("Unable to check availability") });
  await assert.rejects(
    data.create("crew", { meetup_date: "2026-10-28" }),
    /Unable to check/,
  );
  assert.equal(data.inserted(), false);
});
test("available dates continue through request creation", async () => {
  const data = loadData({ data: [] });
  const result = await data.create("crew", {
    meetup_date: "2026-10-29",
    start_time: "19:00",
    time_zone: "America/Denver",
  });
  assert.equal(result.emailSent, true);
  assert.equal(data.inserted(), true);
});

test("long-term away blocks invitations to a member but not meetups they organize", () => {
  const page = fs.readFileSync(
    require.resolve("../src/renderer/pages/MeetupsPage.jsx"),
    "utf8",
  );
  const migrations = fs.readFileSync(
    require.resolve(
      "../supabase/migrations/20261012225603_organizer_can_override_own_availability.sql",
    ),
    "utf8",
  );
  assert.match(page, /item\.user_id === selectedPerson/);
  assert.match(page, /item\.user_id === user\.id && item\.indefinite/);
  assert.match(migrations, /block\.user_id = new\.with_user_id/);
  assert.match(
    migrations,
    /block\.user_id = new\.user_id and not block\.indefinite/,
  );
});

test("long-term away hides individual off-day controls", () => {
  const page = fs.readFileSync(
    require.resolve("../src/renderer/pages/MeetupsPage.jsx"),
    "utf8",
  );
  assert.match(page, /longTerm \? \(/);
  assert.match(page, /Your calendar appears unavailable to other crew members/);
  assert.match(page, /You can still invite someone else/);
});

test("meetup screens skip malformed saved dates instead of crashing", () => {
  const page = fs.readFileSync(
    require.resolve("../src/renderer/pages/MeetupsPage.jsx"),
    "utf8",
  );
  const extras = fs.readFileSync(
    require.resolve("../src/renderer/components/MeetupExtras.jsx"),
    "utf8",
  );
  const desktop = fs.readFileSync(
    require.resolve("../src/renderer/components/DesktopEnhancements.jsx"),
    "utf8",
  );
  assert.match(page, /const safeAvailabilityRange/);
  assert.match(page, /if \(!range\) return "Unavailable time"/);
  assert.match(extras, /catch \{/);
  assert.match(extras, /Number\.isFinite\(instant\.getTime\(\)\)/);
  assert.match(desktop, /if \(!Number\.isFinite\(start\)\) continue/);
});

test("meetup recurrence state belongs to the calendar form", () => {
  const source = fs.readFileSync(
    require.resolve("../src/renderer/pages/MeetupsPage.jsx"),
    "utf8",
  );
  const availabilityStart = source.indexOf("function AvailabilityModal");
  const calendarStart = source.indexOf("export default function MeetupsPage");
  const availabilitySource = source.slice(availabilityStart, calendarStart);
  const calendarSource = source.slice(calendarStart);
  assert.doesNotMatch(availabilitySource, /\[recurrence, setRecurrence\]/);
  assert.match(
    calendarSource,
    /const \[recurrence, setRecurrence\] = useState\("none"\)/,
  );
  assert.match(calendarSource, /value=\{recurrence\}/);
});
