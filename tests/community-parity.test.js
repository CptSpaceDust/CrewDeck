import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../src/renderer/", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

test("sidebar matches the requested website community layout", () => {
  const source = read("components/Sidebar.jsx");
  const groupedNavigation = source.slice(
    source.indexOf("const groups"),
    source.indexOf("export default function Sidebar"),
  );
  const labels = [
    "Community",
    "Guidelines",
    "Crew Directory",
    "Introductions",
    "Collab Board",
    "Ideas Board",
    "Birthdays",
    "Connect",
    "Meetup Calendar",
    "My Meetups",
  ];
  let previous = -1;
  for (const label of labels) {
    const index = groupedNavigation.indexOf(`\"${label}\"`);
    assert.ok(index > previous, `${label} should appear in order`);
    previous = index;
  }
  const renderedNavigation = source.slice(
    source.indexOf("export default function Sidebar"),
  );
  assert.ok(
    renderedNavigation.indexOf("Captain Panel") <
      renderedNavigation.indexOf("groups.map"),
  );
  assert.ok(
    renderedNavigation.indexOf("groups.map") <
      renderedNavigation.indexOf("VRChat"),
  );
  assert.ok(
    renderedNavigation.indexOf("VRChat") <
      renderedNavigation.indexOf("Control Center"),
  );
  assert.equal(source.includes("Support the Captain"), false);
  assert.doesNotMatch(source, /\[\"messages\",\"Messages\"/);
  assert.doesNotMatch(source, /\[\"notifications\",\"Notifications\"/);
});

test("community parity controls are wired", () => {
  const app = read("App.jsx");
  const pages = read("pages/CommunityPagesV2.jsx");
  const messages = read("pages/MessagesPageV2.jsx");
  const notifications = read("pages/NotificationsPage.jsx");
  assert.match(app, /title=\"Messages\"/);
  assert.doesNotMatch(app, /Live community uplink/);
  assert.match(pages, /Refresh introductions/);
  assert.match(pages, /Refresh ideas/);
  assert.match(pages, /Refresh collaborations/);
  assert.match(messages, /Request to DM/);
  assert.match(notifications, /Clear All/);
});

test("group polls announce themselves and group menus stay interactive", () => {
  const polls = read("components/GroupPolls.jsx");
  const messages = read("pages/MessagesPageV2.jsx");
  assert.match(polls, /await sendGroupMessage\(/);
  assert.match(polls, /New poll:/);
  assert.match(messages, /const members = Array\.isArray\(group\?\.members\)/);
  assert.doesNotMatch(messages, /onOpen=\{\(\) => setOpen\(false\)\}/);
  assert.match(messages, /onClosed=\{\(\) => setOpen\(false\)\}/);
});

test("the ideas guide only appears on the Ideas Board", () => {
  const pages = read("pages/CommunityPagesV2.jsx");
  const introductionsStart = pages.indexOf("export function IntroductionsPage");
  const ideasStart = pages.indexOf("export function IdeasPage");
  const collabsStart = pages.indexOf("export function CollabsPage");
  const introductions = pages.slice(introductionsStart, ideasStart);
  const ideas = pages.slice(ideasStart, collabsStart);

  assert.doesNotMatch(introductions, /How the ideas board works/);
  assert.match(ideas, /How the ideas board works/);
});

test("desktop login alerts and support errors mirror the website", () => {
  const auth = read("components/AuthScreen.jsx");
  const data = read("lib/data.js");
  assert.match(auth, /send_login_alert:\s*true/);
  assert.match(auth, /Use your CptSpaceDust account/);
  assert.doesNotMatch(auth, /Create account|signUp\(/);
  assert.match(
    auth,
    /Authorization:\s*`Bearer \$\{result\.data\.session\.access_token\}`/,
  );
  assert.match(data, /error\?\.context\?\.json/);
  assert.match(data, /manage-support-subscription/);
});

test("person-to-person meetup planning includes availability and captain reports", () => {
  const app = read("App.jsx");
  const meetups = read("pages/MeetupsPage.jsx");
  const captain = read("components/CaptainControls.jsx");
  const settings = read("components/AppSettings.jsx");
  assert.match(app, /startupMinimumElapsed/);
  assert.match(meetups, /Who are you meeting\?/);
  assert.match(meetups, /My availability/);
  assert.match(meetups, /Offline all day/);
  assert.match(meetups, /Some hours offline/);
  assert.match(meetups, /Already has a meetup/);
  assert.match(meetups, /respondToMeetup/);
  assert.match(captain, /Member Reports/);
  assert.match(captain, /with_user_id/);
  assert.match(captain, /requiresCaptainApproval/);
  assert.doesNotMatch(meetups, /Captain approval is not needed/);
  assert.match(
    meetups,
    /When they accept, the meetup is confirmed automatically/,
  );
  assert.match(read("components/Sidebar.jsx"), /My Meetups/);
  assert.match(app, /my-meetups/);
  assert.match(meetups, /All dates and times are shown in your time zone/);
  assert.match(meetups, /time_zone: localTimeZoneName\(\)/);
  assert.doesNotMatch(meetups, /Times use Mountain Time/);
  assert.doesNotMatch(meetups, /Step 1/);
  assert.match(meetups, /I’m off for a long time/);
  assert.match(meetups, /setLongTermMeetupAvailability/);
  assert.match(meetups, /based on how\s+they’ve configured it/);
  assert.match(read("pages/EnhancedCommunityPages.jsx"), /crew-avatar-stack/);
  assert.match(settings, /Increase text and border contrast/);
  assert.doesNotMatch(settings, /Windows notifications are available/);
});
