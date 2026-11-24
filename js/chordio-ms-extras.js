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
  function setBlack(mode) {
    blackEl = blackEl || $('#msNowBlack');
    var bar = $('#msTransport');
    if (bar) {
      bar.classList.toggle('is-black', mode === 'on');
      bar.classList.toggle('is-logo', mode === 'logo');
    }
    if (blackEl) {
      blackEl.hidden = mode !== 'on' && mode !== 'logo';
      blackEl.textContent = mode === 'logo' ? 'Logo: background only' : 'Screens black';
    }
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('#msTransport button') : null;
    if (!b) return;
    if (b.dataset.msKey) { e.preventDefault(); press(b.dataset.msKey); }
    if (b.dataset.msBlack) setBlack(b.dataset.msBlack);
  });

  document.addEventListener('keydown', function (e) {
    if (!$('#multiScreenControl.show')) return;
    var t = e.target && e.target.tagName;
    if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT' || e.ctrlKey || e.metaKey || e.altKey) return;
    var k = String(e.key || '').toLowerCase();
    if (k === 'b') setBlack('on'); else if (k === 'l') setBlack('logo'); else if (k === 'r') setBlack('off');
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

  /* Session timer: starts when Multi-Screen opens, stops and clears when it closes. */
  var KEY = 'chordioMsStartedAt';
  var startedAt = 0;
  function pad(n) { return String(n).padStart(2, '0'); }
  function readStart() { try { return Number(sessionStorage.getItem(KEY)) || 0; } catch (e) { return 0; } }
  function writeStart(v) { try { if (v) sessionStorage.setItem(KEY, String(v)); else sessionStorage.removeItem(KEY); } catch (e) {} }
  function isOpen() { var p = $('#multiScreenControl'); return !!(p && p.classList.contains('show')); }
  function startTimer(force) {
    if (!force && startedAt) return;
    startedAt = (!force && readStart()) || Date.now();
    writeStart(startedAt);
    tick();
  }
  function stopTimer() { startedAt = 0; writeStart(0); tick(); }
  function tick() {
    var c = $('#msClock');
    if (!c) return;
    if (!startedAt) { c.textContent = '00:00:00'; return; }
    var s = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
    c.textContent = pad(Math.floor(s / 3600)) + ':' + pad(Math.floor((s % 3600) / 60)) + ':' + pad(s % 60);
  }
  function syncTimerWithPanel() { if (isOpen()) startTimer(false); else if (startedAt) stopTimer(); }

  function watch(sel, fn) {
    var el = $(sel);
    if (!el || !window.MutationObserver) return;
    new MutationObserver(fn).observe(el, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class'] });
  }

  function init() {
    tagParts(); syncNow(); syncTimerWithPanel();
    var panel = $('#multiScreenControl');
    if (panel && window.MutationObserver) new MutationObserver(syncTimerWithPanel).observe(panel, { attributes: true, attributeFilter: ['class'] });
    var clock = $('#msClock');
    if (clock) clock.addEventListener('click', function () { if (isOpen()) startTimer(true); });
    watch('#multiSectionButtons', function () { tagParts(); syncNow(); });
    watch('#multiPartLyricsPreview', tagParts);
    watch('#multiServiceSongList', syncNow);
    watch('#multiScreenCurrent', syncNow);
    setInterval(tick, 1000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
