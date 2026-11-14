# CrewDeck physical key and availability planner design QA

Date: 2026-11-14

## Compared evidence

- Source: `D:/OneDrive/Pictures/Screenshots 1/Screenshot 2026-11-14 104221.png`
- Wide planner: `audit-evidence/availability-planner-security-release-wide.png`
- Compact planner: `audit-evidence/availability-planner-security-release-narrow.png`
- Wide physical-key setup: `audit-evidence/physical-access-key-wide.png`
- Compact physical-key setup: `audit-evidence/physical-access-key-narrow.png`
- Wide privacy cover: `audit-evidence/privacy-cover-wide.png`
- Compact privacy cover: `audit-evidence/privacy-cover-narrow.png`

## Findings and corrections

- P1 fixed: profile names, local-time copy, and the time-zone action no longer overlap the first availability slot.
- P1 fixed: availability rows now reserve a stable identity column and an independent timeline column.
- P2 fixed: date controls and the color key share a contained toolbar instead of floating in unused space.
- P2 fixed: suggested times now use consistently sized cards and buttons with clear separation from the timeline.
- P2 fixed: the Captain physical-key setup uses the existing Space Glass hierarchy, selection state, safety note, and responsive action layout.
- P2 fixed: the privacy cover is visually distinct from CrewDeck, contains no CrewDeck branding or user data, and remains useful at both tested sizes.
- Interaction checks: the planner disclosure, drive selection, refresh action, focus timer, quick note, and hidden recovery path have coded interactive states.
- Renderer console: no errors in the six captured states.

## Remaining polish

- P3: at widths below CrewDeck's supported 1040 px minimum, the 16-hour planner timeline intentionally scrolls horizontally rather than compressing into unusable targets.

final result: passed
