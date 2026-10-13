# CrewDeck Changelog

Every published CrewDeck release is documented here and copied into its GitHub release notes.

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
