/* CHORDIO Multi-Screen control extras.
   Adds nothing to the song data. It only:
   - sends the same keyboard shortcuts the control already understands (the buttons in #msTransport)
   - mirrors the current song / part into the "Now showing" readout
   - tags song-part buttons (verse, chorus, bridge...) so they can be color coded
   - shows a clock. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };

  function press(key) {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: key, bubbles: true, cancelable: true }));
  }

  var blackEl;
  function setBlack(on) {
    blackEl = blackEl || $('#msNowBlack');
    var bar = $('#msTransport');
    if (bar) bar.classList.toggle('is-black', !!on);
    if (blackEl) blackEl.hidden = !on;
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('#msTransport button') : null;
    if (!b) return;
    if (b.dataset.msKey) { e.preventDefault(); press(b.dataset.msKey); }
    if (b.dataset.msBlack) setBlack(b.dataset.msBlack === 'on');
  });

  function partKind(label) {
    var s = String(label || '').toLowerCase();
    if (/chorus|refrain/.test(s)) return 'chorus';
    if (/pre/.test(s)) return 'pre';
    if (/verse/.test(s)) return 'verse';
    if (/bridge/.test(s)) return 'bridge';
    if (/tag|outro|ending/.test(s)) return 'outro';
    if (/intro/.test(s)) return 'intro';
    return 'other';
  }
  function tagParts() {
    var box = $('#multiSectionButtons');
    if (!box) return;
    box.querySelectorAll('button').forEach(function (b) {
      var k = partKind(b.textContent);
      if (b.dataset.part !== k) b.dataset.part = k;
    });
    document.querySelectorAll('#multiPartLyricsPreview .multi-part-preview-section').forEach(function (s) {
      var t = s.querySelector('.multi-part-preview-section-title');
      var k = partKind(t && t.textContent);
      if (s.dataset.part !== k) s.dataset.part = k;
    });
  }

  function syncNow() {
    var song = $('#multiServiceSongList .multi-service-song.active .song-name');
    var part = $('#multiScreenCurrent');
    var s = $('#msNowSong'), p = $('#msNowPart');
    if (s) s.textContent = song ? song.textContent.replace(/^\s*📄\s*/, '') : 'No song selected';
    if (p) p.textContent = part ? part.textContent : '—';
  }

  function tick() {
    var c = $('#msClock');
    if (!c) return;
    var d = new Date();
    c.textContent = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function watch(sel, fn) {
    var el = $(sel);
    if (!el || !window.MutationObserver) return;
    new MutationObserver(fn).observe(el, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class'] });
  }

  function init() {
    tagParts(); syncNow(); tick();
    watch('#multiSectionButtons', function () { tagParts(); syncNow(); });
    watch('#multiPartLyricsPreview', tagParts);
    watch('#multiServiceSongList', syncNow);
    watch('#multiScreenCurrent', syncNow);
    setInterval(tick, 15000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
