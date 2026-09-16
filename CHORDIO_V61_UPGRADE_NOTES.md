# CHORDIO V61 — User Experience Upgrade

This build is based on **CHORDIO FINAL(4) — Lyrics Display Settings Fixed**.

## Included UX upgrades
- Modern CHORDIO visual shell using the existing navy/orange brand direction.
- Dashboard hero and Quick Actions.
- Favorites and Recently Used song shortcuts stored locally.
- Star/favorite control on song cards.
- Improved global search wording and Enter-to-search behavior.
- Service template starter controls.
- Keyboard shortcut help (`?`).
- Live Mode for the Multi-Screen controller (`L` toggles it).
- Live Mode hides configuration controls that are not needed during presentation.
- Lyrics Display quick presets: Standard, Large, Projector, Reset Defaults.
- Autosave/status indicator layer for the dashboard.
- Modern toast notifications instead of relying only on browser alerts for UX feedback.
- Responsive behavior for dashboard/action areas.
- Existing Multi-Screen, Firebase, song editor, Bible, screen output and presentation logic are retained.

## Important behavior
The upgrade is intentionally layered on top of the existing application so existing song/service/Firebase logic is not replaced.

### Keyboard shortcuts
- `→` or `Space` — next presentation item when available
- `←` — previous presentation item when available
- `L` — toggle Multi-Screen Live Mode
- `?` — show shortcut help
- `Esc` — close dialogs / exit Live Mode

### Lyrics presets
In Multi-Screen → Control Settings / Song Content → Lyrics Display Settings:
- Standard
- Large
- Projector
- Reset Defaults

## Notes
The app continues to use its existing Firebase and browser local-storage architecture. The new UX layer does not require a new backend collection.
