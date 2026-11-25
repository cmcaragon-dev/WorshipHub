/* Multi-Screen dock helpers: size stepper, alignment buttons, live sample.
   Only reads/writes the existing lyric-setting controls; the app logic is unchanged. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  function fire(el) { ['input', 'change'].forEach(function (t) { el.dispatchEvent(new Event(t, { bubbles: true })); }); }

  function sample() {
    var s = $('msLyricsSample'); if (!s) return;
    var px = Math.max(10, Math.min(240, Number(($('multiLyricsFontPx') || {}).value) || 100));
    var on = function (id) { var b = $(id); return b && b.getAttribute('aria-pressed') === 'true'; };
    s.style.fontFamily = ($('multiLyricsFontFamily') || {}).value || 'Arial';
    s.style.fontSize = Math.max(13, Math.min(34, px * 0.22)) + 'px';
    s.style.color = ($('multiLyricsColor') || {}).value || '#fff';
    s.style.fontWeight = on('multiLyricsBold') ? '700' : '400';
    s.style.fontStyle = on('multiLyricsItalic') ? 'italic' : 'normal';
    s.style.textDecoration = on('multiLyricsUnderline') ? 'underline' : 'none';
    s.style.letterSpacing = (Number(($('multiLyricsLetterSpacing') || {}).value) || 0) * 0.3 + 'px';
    s.style.lineHeight = String(Number(($('multiLyricsSpacing') || {}).value) || 1.15);
    s.style.textAlign = ($('multiLyricsAlign') || {}).value || 'center';
    var v = Number(($('multiLyricsVertical') || {}).value);
    s.style.justifyContent = v < 34 ? 'flex-start' : v > 66 ? 'flex-end' : 'center';
  }

  function seg() {
    var sel = $('multiLyricsAlign'); if (!sel) return;
    document.querySelectorAll('#msAlignSeg button').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.align === sel.value));
    });
  }

  function init() {
    document.addEventListener('click', function (e) {
      var st = e.target.closest && e.target.closest('[data-ms-step]');
      if (st) {
        var i = $('multiLyricsFontPx'); if (!i) return;
        var n = Math.max(+i.min || 10, Math.min(+i.max || 240, (Number(i.value) || 100) + Number(st.dataset.msStep)));
        i.value = n; fire(i); sample(); return;
      }
      var al = e.target.closest && e.target.closest('#msAlignSeg button');
      if (al) { var sel = $('multiLyricsAlign'); sel.value = al.dataset.align; fire(sel); seg(); sample(); }
    });
    var panel = document.querySelector('[data-feature-panel="lyrics"]');
    if (panel) ['input', 'change', 'click'].forEach(function (t) { panel.addEventListener(t, function () { setTimeout(function () { sample(); seg(); }, 0); }); });
    setInterval(function () { sample(); seg(); }, 800); // values are also set by the app when a song loads
    sample(); seg();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
