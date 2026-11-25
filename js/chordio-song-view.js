/* Adds a Portrait / Landscape view toggle to the song page menu (saved on this device). */
(function () {
  'use strict';
  var KEY = 'chordioSongView';
  function get() { try { return localStorage.getItem(KEY) === 'landscape' ? 'landscape' : 'portrait'; } catch (_) { return 'portrait'; } }
  function apply(btn, view) {
    var paper = document.getElementById('songPaper');
    if (paper) paper.classList.toggle('song-landscape', view === 'landscape');
    if (btn) {
      btn.setAttribute('aria-pressed', String(view === 'landscape'));
      btn.title = view === 'landscape' ? 'Landscape view (2 columns) — switch to portrait' : 'Portrait view — switch to landscape (2 columns)';
      btn.setAttribute('aria-label', btn.title);
      btn.textContent = view === 'landscape' ? '▭' : '▯';
    }
  }
  function init() {
    var menu = document.getElementById('songActionsMenu');
    if (!menu || document.getElementById('songViewBtn')) return;
    var btn = document.createElement('button');
    btn.id = 'songViewBtn'; btn.type = 'button';
    var anchor = document.getElementById('lyricsOnlyBtn');
    if (anchor && anchor.parentNode === menu) anchor.insertAdjacentElement('afterend', btn); else menu.appendChild(btn);
    apply(btn, get());
    btn.addEventListener('click', function () {
      var next = get() === 'landscape' ? 'portrait' : 'landscape';
      try { localStorage.setItem(KEY, next); } catch (_) {}
      apply(btn, next);
      window.chordioSaveStatus && window.chordioSaveStatus.flash(next === 'landscape' ? 'Landscape view' : 'Portrait view');
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
