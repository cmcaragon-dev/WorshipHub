# WorshipHub v23 — Modern Light 2-Column Song Pages

Updated the 45 built-in song pages to use a shared modern light design.

## Song-page layout
- Two-column continuous song flow on desktop/tablet.
- Content fills column 1 from the top downward.
- When the next complete section no longer fits, it moves to the top of column 2.
- When both columns are filled, the next two-column page continues below.
- The visible song area is vertically scrollable.
- Mobile switches to one column.
- Small minimalist controls sit directly below the song title bar.
- Lyrics are dark/black and chords remain gold.
- No section cards/boxes in the reading area.
- Chord/lyric rows have no artificial vertical gap.
- Original chord spacing is preserved through the existing source HTML.

## Implementation
- `css/song-pages-modern.css` contains the final v23 visual layer.
- `js/song-runtime.js` builds the two-column flow from the existing `.song-section` elements while keeping the original song DOM as the source of truth for transpose, presentation, and print.
- All 45 song HTML files continue to load the shared CSS and song runtime.
