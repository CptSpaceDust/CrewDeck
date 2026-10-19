# CrewDeck Changelog

Every published CrewDeck release is documented here and copied into its GitHub release notes.

## [1.9.3] - 2026-10-19

### Fixed

- Attachment placeholder text no longer appears above inline images, videos, files, or voice messages after reopening a conversation.
- Voice messages now show the audio player without a duplicate label.
- Command palette results keep their full row size instead of inheriting the small header button dimensions and overlapping each other.

## [1.9.2] - 2026-10-19

### Changed

- Message attachments, voice recording, silent delivery, scheduling, expiration, and saved messages now live in a compact plus menu beside the composer.
- Images and videos render inside conversations, while voice messages use an inline audio player without exposing generated filenames.
- The command palette now sits in the app header without overlapping the Messages button.

### Fixed

- Video and browser-recorded audio uploads are accepted by the attachment service up to the 10 MB limit.
- Attachment failures now show the actual server response and remove incomplete placeholder messages.
- Schedule and expiration controls use a clearer Space Glass layout on the website and app.

## [1.9.1] - 2026-10-18

### Fixed

- Opening a direct or group conversation no longer crashes with `Timer is not defined`.
- Conversation search stays in its own fixed section beside the message panel while the conversation list scrolls independently.
- Added regression coverage for the composer icon import and both conversation-list layouts.

## [1.9.0] - 2026-10-18

### Added

- Conversations now support 10 MB scanned attachments, voice messages, a shared media gallery, expiring messages, daily dividers, group welcome messages, and controlled invite links.
- Voice calls now include a speaker queue, saved per-friend volume, screen-share pointers, network reconnection feedback, and a global push-to-talk shortcut.
- The Help Request Board, Bug Report Center, and filterable Community Calendar are available on the website and in CrewDeck.
- Privacy Checkup now controls messages, calls, invites, mentions, and friend requests, with trusted contacts and temporary contact pauses.
- CrewDeck adds a command palette, separate conversation windows, Windows share targets, startup profiles, local media caching, and repair mode.

### Changed

- Community Operations now combines announcements, bug reports, help requests, evidence, moderation cases, maintenance, and Community Calendar publishing in a clearer Captain workspace.
- Notifications, appearance, accessibility, meetup presets, and custom time controls use expanded Space Glass layouts.
- Scheduled and active announcements appear in the app header and can be removed from Captain tools.

### Fixed

- Group invite-link controls now let owners choose expiration and use limits, and their state no longer crashes the group manager.
- Call invitations, direct-message requests, friend requests, and group invitations now honor member interaction privacy.
- Obsolete Call Chat, Favorite Crew, and UI-preference tables were identified for a separate cleanup review.

## [1.8.6] - 2026-10-18

### Added

- Meetups can now share a date when their times do not overlap.
- Confirmed participants can back out while notifying the remaining crew, and the meetup is removed when only one person remains.
- Meetup and availability forms use a custom Space Glass time picker.

### Changed

- The website Friends page now uses a clearer responsive crew list and settings layout.
- My Meetups shows synchronized invitation and check-in details for every participant.
- Call Chat was removed from voice calls.

### Fixed

- Selecting another crew member no longer marks unrelated dates as occupied.
- Accepted invitations and “I’m here” check-ins now update group attendance immediately.
- Group meetup capacity now includes every invited participant.

## [1.8.5] - 2026-10-18

### Added

- Profile pages on the website now include complete friend request controls.
- App calls can stay connected while navigating and shrink into a draggable speaker tile.
- The app can optionally show a microphone check before joining calls.

### Changed

- Friends, one-click meetup presets, Evidence Inbox, polls, call chat, message reminders, and the CrewDeck download button use clearer Space Glass layouts.
- Website message controls appear only when the pointer is over the message bubble.

### Fixed

- Meetup requests no longer lose their form reference on the website or fail notification RLS in the app.
- Poll deletion removes its embedded group message, and reminder excerpts no longer include emoji controls.
- The app sidebar no longer shifts sideways on hover.

## [1.8.4] - 2026-10-17

### Added

- Friends now support private nicknames and notes, close-friend priority alerts, friendship anniversaries, mutual friends and groups, profile highlights, recommendations, and an optional activity feed.
- Friend cards now include quick actions for messages, calls, profiles, mutual connections, and meetup requests with an optional saved meetup preset.
- Message reactions now include a full emoji picker, persistent reaction summaries, reminder management, and conversation details.

### Changed

- Friends sort online members first and synchronize friend feature settings across the website and desktop app.
- Voice call speaking indicators now follow each member's avatar shape instead of stretching around the participant card.

### Fixed

- Group poll messages resolve their poll correctly and no longer show a removed-poll message for active polls.
- Reaction controls stay aligned with message bubbles while saved reactions remain visible after the controls close.

## [1.8.2] - 2026-10-14

### Added

- Group conversation invitations now require each invited member to accept before joining.
- Settings diagnostics now check the account session, Supabase, messaging, calls, notifications, realtime updates, audio hardware, Windows alerts, and maintenance state.
- Account deletion guidance now opens the community Discord support server directly.

### Changed

- Hidden reaction controls no longer reserve empty space inside message bubbles.
- Conversation notification settings use clear alert choices with separate folder and sound controls.
- The new conversation picker identifies existing conversations, pending requests, and friends.
- Friends can start direct conversations immediately without a message request.
- Friend profile actions update to Cancel request, Accept request, or Friends as appropriate.
- Community Operations now matches the Captain Panel sections and sits directly above Meetup Management.
- Space Glass themes now match the website profile themes and color more interface surfaces.

### Fixed

- Meetup availability validates time ranges, handles repeated saves safely, and no longer leaves a saved row behind after showing an error.
- Sidebar navigation keeps a stable width and scroll gutter while changing pages.

## [1.8.1] - 2026-10-14

### Added

- Group polls now appear as interactive cards inside the message stream and update votes in real time.
- Friends now have a focused app page with incoming request actions and live updates.

### Changed

- Removed Crew Hub, favorite crew, Looking for Group posts, and temporary party rooms from the website and app.
- Conversation reactions stay hidden until a message is hovered or focused, while notification folder and sound controls now live in the conversation menu.
- Community Operations is now a collapsible Captain Panel section near the top of the page.
- Blocked members' introductions, ideas, collaborations, and comments are strongly blurred.
- Space Glass accent choices now visibly affect primary controls, navigation, icons, and panel borders, and Settings uses a calmer single-column layout.
- The meetup calendar keeps recurrence state inside the calendar form, preventing the date-selection rendering crash.

### Fixed

- Friend actions use the normal accent color instead of appearing as destructive red buttons.
- Captain audit records older than seven days are removed by a verified daily Supabase Cron job.

## [1.8.0] - 2026-10-14

### Added

- Direct conversations can now be permanently deleted from the conversation options menu, including their messages and active call data.
- Added message reactions, pins, mentions, read receipts, reminders, forwarding, notification controls, folders, and per-conversation sounds.
- Added group descriptions, slow mode, role-aware controls, Crew Hub friends and favorites, temporary party rooms, and Looking for Group posts.
- Added group meetup participants, waitlists, suggested availability tools, Captain evidence and audit tools, community announcements, safety controls, and account diagnostics.
- Calls now include chat, raise hand, deafen, configurable push to talk, host controls, and visible call status.

### Changed

- Group owners now see a clear delete or leave action while moderators and members keep the standard leave action.
- Conversation lists recover immediately when a selected conversation is removed.
- Community, meetup, notification, profile, account, and Captain tools now share their latest data across the website and desktop app.

### Security

- Direct conversation deletion verifies membership on the server and removes linked conversation preferences, reactions, receipts, reminders, pins, and call records in one protected operation.

## [1.7.2] - 2026-10-14

### Added

- Creating a group poll now posts a realtime message in the conversation and alerts the other group members.

### Changed

- The group options menu and Manage Group panel now stay interactive while group controls are open.
- Group conversations safely handle incomplete member, poll, and vote updates without breaking the page.

### Removed

- Removed the menu behavior that closed the Manage Group panel as soon as it opened.

## [1.7.1] - 2026-10-14

### Added

- Page-level recovery controls prevent a single rendering failure from leaving CrewDeck on a blank screen.
- Direct and group message screens now include manual refresh controls.

### Changed

- Group polls, group management, member roles, and leaving a group now live in the group conversation options menu.
- Direct and group messages appear immediately after sending while realtime synchronization continues in the background.
- The Manage Group panel and Settings page use clearer, more organized Space Glass layouts.
- The Meetup Calendar now ignores malformed schedule records instead of allowing them to break the page.
- The startup animation uses a cleaner CrewDeck scan sequence with stronger contrast.
- Control Center headings focus on shock controls without repeated connected-device labels.

### Removed

- Removed message search fields from direct and group conversations.

## [1.7.0] - 2026-10-13

### Added

- Recurring weekly and monthly meetups, live countdowns, participant check-ins, email reminders, and Google Calendar, Outlook, and `.ics` exports.
- Polls inside group conversations for crew decisions.
- Owner, moderator, and member group roles, including moderator invite and removal controls.
- Pre-call microphone testing, connection quality warnings, echo cancellation, noise suppression, and automatic gain controls.
- Moderation appeals with saved evidence, Captain review history, and automatic restriction removal when an appeal is approved.
- Saved drafts for messages, ideas, collabs, and introductions, plus offline status and automatic reconnection feedback.

### Changed

- Meetup reminder preferences and participant check-ins synchronize between the website and CrewDeck in real time.
- Monthly meetup recurrence stays on the last valid date when a month is shorter than the original date.

### Removed

- Removed browser prompts from website poll creation in favor of a centered Space Glass panel.

## [1.6.3] - 2026-10-13

### Changed

- Reordered the sidebar into Community, Connect, and VRChat sections, with the Captain Panel first for Captains.
- Control Center access now requires the Trusted Person badge throughout the app, website, and OpenShock functions.
- Control Center dials no longer select nearby text while being adjusted, and the header uses the new warning copy.
- Refresh controls now show an active state and reliably reload their complete page data.

### Removed

- Removed the connected-device count from the Control Center status area.
- Removed the Captain-rank shortcut for Control Center access.

## [1.6.2] - 2026-10-13

### Added

- The Space Glass Control Center now matches the website with authenticated OpenShock device controls.
- Emergency Stop now sends an unlogged stop command to every connected device and shows an immediate system response.

### Changed

- Control dials now follow their visible 270-degree track smoothly, use value-aware colors, and place their readouts lower on the dial face.
- The Control Center header now focuses on OpenShock device power, timing, and safety controls.

## [1.6.1] - 2026-10-12

### Changed

- My Meetups now keeps its header focused on invitations and plans instead of showing the availability control.
- The calendar availability control now uses the clearer My availability label.

## [1.6.0] - 2026-10-12

### Added

- A dedicated My Meetups screen for invitations, responses, and upcoming meetup details.
- Meetup invitation and response emails from both the website and CrewDeck app.
- An animation-only startup experience.

### Changed

- Members marked away for a long time remain unavailable to others while still being able to organize their own meetup.
- Long-term away mode now hides the day and time availability controls until it is turned off.
- Meetup invitations use clearer wording about what happens after the recipient responds.

## [1.5.2] - 2026-10-12

### Fixed

- Direct and group message screens no longer turn blank after sending or receiving a message.
- Message auto-scroll no longer returns a Chromium Promise to React as an effect cleanup value.
- The isolated Electron interaction check now includes the realtime client used by the message composer.

### Security

- Updated affected release dependencies and replaced the older Electron download helper that pulled in the vulnerable proxy package.

## [1.5.1] - 2026-10-12

### Fixed

- Direct and group message screens no longer turn blank after the message list changes.
- Message auto-scroll no longer returns a Chromium Promise to React as an effect cleanup value.
- The isolated Electron interaction check now includes the realtime client used by the message composer.

## [1.5.0] - 2026-10-04

### Added

- Local-time-zone meetup scheduling so every member sees dates, availability, and start times in their own time zone.
- A long-term unavailable option that blocks upcoming meetup dates until the member turns it off.

### Changed

- Redesigned Ideas Board cards make vote totals, authors, statuses, and actions easier to scan.
- The Ideas Board guide now appears only on the Ideas Board.
- Crew Directory presence indicators now stay aligned with profile pictures.
- Captain meetup reports use the same local-time conversion as member calendars.
- Electron, Vite, and supporting build packages were updated to patched versions.
- Privileged database functions now use a private schema with narrow public entry points.

### Removed

- The CrewDeck GitHub Wiki and its documentation-only preview resources.

## [1.4.0] - 2026-10-04

### Added

- Person-to-person meetup invitations with accept and decline actions.
- Full-day and partial-time availability controls with clear calendar colors.
- A dedicated reports workspace in the Captain panel.
- Interface scaling, high contrast, stronger focus outlines, underlined links, and larger-control accessibility options.
- A startup sequence that reliably appears whenever CrewDeck launches.

### Changed

- Crew-to-crew meetups now confirm when the invited member accepts; Captain approval is only required when the meetup involves the Captain.
- Meetup notifications now go to the people involved instead of routing every request through the Captain.
- The Ideas Board explains its posting, voting, and status flow more clearly.
- Support tiers now explain what contributions help cover instead of promising perks.
- Crew Directory presence indicators are centered above profile pictures.

### Removed

- Account creation inside CrewDeck. Members now sign in with their existing CptSpaceDust website account.
- The unnecessary “Windows notifications are available” notice.
