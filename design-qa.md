# Design QA — Current CrewDeck UI fixes

## Reference

- User screenshot: `Screenshot 2026-11-01 203358.png`
- User screenshots: `Screenshot 2026-11-01 205631.png`, `Screenshot 2026-11-01 205728.png`, and `Screenshot 2026-11-01 210051.png`.
- Target: repair board filters, checkbox alignment, community compose flows, profile badges, and runtime icon imports while retaining CrewDeck's Space Glass language.

## Checks completed

- [x] Link expiry and maximum-use fields have matching height, spacing, labels, and focus treatment.
- [x] Device cards have clear included/excluded states and no longer rely on oversized native checkboxes.
- [x] Intensity and duration controls align in a responsive two-column grid.
- [x] Hold-to-shock is presented as a distinct safety control rather than a loose checkbox.
- [x] Narrow layouts collapse cleanly to one column.
- [x] Startup animation uses the CrewDeck mark, orbiting feature icons, a scan pass, and a segmented progress sequence without extra marketing copy.
- [x] The packaged renderer reaches the sign-in screen without a rendering failure.
- [x] Board status and tag filters use matched Space Glass selects instead of native gray controls.
- [x] Resolved and Archived controls center square checkboxes inside consistent cards.
- [x] Long-term availability uses a centered square checkbox without the broken switch geometry.
- [x] Help and Bug Report forms open from clear page actions in centered, dismissible dialogs.
- [x] Ideas Board no longer shows the retired three-step guide.
- [x] Shared board workspaces no longer add a second refresh button.
- [x] Profile badges accept array, JSON-string, and comma-separated storage formats.
- [x] Every `ShieldCheck` use has a matching import.

## Findings

- P1: none.
- P2: none.
- P3: the first packaged-app pass exposed an unrelated missing `ShieldCheck` import in the authentication screen; fixed before final verification.

## Verification

- Renderer production build: passed.
- Automated tests: passed.
- Native app launch: passed.
- Renderer production build: passed after the current changes.
