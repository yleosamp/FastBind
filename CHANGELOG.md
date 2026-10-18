# Changelog

## 0.3.3 — 2026-10-18

- Removed the persistent “previous insertion incomplete” lock, including records from older versions and after manual changes or Undo.
- Post-insert readback differences after an accepted native transaction are diagnostic-only, without red errors or instructions to undo/reinsert. Unverified results are not marked verified.
- Every new insert still plans from current track occupancy, validates target/playhead identity and avoids ripple/overwrite. Actual preparation and commit failures still report normally.
- Keeps existing presets, profiles, operation evidence and plugin identity. No automatic Undo or retries.

## 0.3.2 — 2026-10-17

- Discreet update badge when GitHub has a newer stable FastBind release.
- Background release checks are cached for 24 hours; Settings also provides a manual check.
- Opens the release page only when clicked. No automatic downloads, installation or restarts.
- Offline, failed or rate-limited checks do not block the library or timeline workflow.
- Narrow GitHub API network permission and documented update-check privacy behavior.

## 0.3.1 — 2026-10-17

- Compact modal sizing: removes the unused area around save/confirmation content.
- First public, experimental release with installation and privacy documentation.
- Source distribution excludes private working notes, user libraries and diagnostic records.

## 0.3.0 — 2026-10-17

- Renamed the panel to FastBind while retaining the existing plugin identity and library compatibility.
- Added English and Portuguese, automatic Premiere UI language detection and a saved manual language choice.
- Redesigned dialogs, clarified the **+ MOGRT** action and improved search.
- Replaced the manual review-unlock flow with automatic, sequence-scoped reconciliation after Undo or an interrupted insertion.

## 0.2.0

- Compact, expandable library rows with configurable colors and video/audio contents.
- Search by package or clip name.
- Recoverable item removal and separate profiles.

Earlier experimental builds established native selection capture, MOGRT storage, non-ripple insertion planning, local journal recovery and structural verification.
