# Changelog

## 0.4.2 — 2026-10-18

- Lightweight live drag preview: the semi-transparent preset follows the pointer, crossed rows slide aside with a 110 ms transform and a dashed slot shows the destination before release.
- Geometry is measured once per drag; pointer moves do not rebuild/reorder the DOM, write the library or call Premiere. Only releasing at a changed position commits the order. Escape cancels and restores the layout without a write.
- Reduced-motion preference disables the transition while retaining the destination preview. Isolated browser checks cover upward/downward movement, cancellation, deferred persistence and no accidental insertion.
- First public 0.4 release: includes the profile sharing, cross-profile move and Black Video fixes documented below. 206 automated tests pass; native macOS behavior and every Premiere workflow are not universally verified.

## 0.4.1 — 2026-10-18 (local build)

- Fixed the reported export rejection: Premiere's native infinite Black Video uses numeric generator ID `1112293707`, not an external file path. Preserve verified generator IDs through collection, transport, import and native media verification.
- Installed effect/font references are preserved as editable native metadata, without bundling their binaries or blocking export because the recipient may lack them.
- Removed the requirements list from the import confirmation; no plugin/font installation check is required to import a profile. Optional requirements metadata remains available inside the preset/package.
- Actual uncollectable media errors now identify the exact file/reference and XML field in the message and local diagnostic.

## 0.4.0 — 2026-10-18 (local build)

- Drag a preset name up/down to persist its position within its profile. Dragging never triggers insertion.
- Move a complete preset to another profile from its expanded contents, without moving/copying its existing payload.
- Settings > Export profile / Import profile: `.fastbind` archives containing editable native sequences, collected media, MOGRTs and a requirements list. Imported resources are copied into the recipient's private library before the profile journal is committed; the received archive can then be deleted.
- Export creates a separate native Premiere project containing only the selected library sequences and their dependencies; it does not distribute the full stored source-project snapshots. Export explicitly saves and then restores the user's current project. No native relinking of the original project.
- External fonts/plugins are not bundled. Plain-text effect/font names exposed by Premiere are listed; opaque effects and MOGRTs may have additional external requirements. Dynamic Link, detected image sequences and unrecognized external file dependencies are refused rather than silently omitted.
- Initial transport limits: 256 MiB total archive/expanded contents, 32 MiB project XML and 2,048 entries. Whole original media files are included, not trimmed. This version is intended for compact preset/SFX libraries, not moving full video productions.
- English/Portuguese labels, requirements viewer, checksum/readback validation, archive path allowlist and bounded decompression. Native Premiere behavior is covered by contract doubles, not a production-timeline test; no macOS native validation yet.

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
