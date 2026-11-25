/* CHORDIO theme switch (Night stage / Day).
   Runs in <head> before first paint so the page never flashes the wrong theme.
   The choice is saved in localStorage ("chordioTheme") and defaults to dark. */
(function () {
  var KEY = 'chordioTheme';
  var root = document.documentElement;

  function read() {
    var v = 'dark';
    try { v = localStorage.getItem(KEY) || 'dark'; } catch (_) {}
    return v === 'light' ? 'light' : 'dark';
  }

  function paint(theme) {
    root.setAttribute('data-cx-theme', theme);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#070B14' : '#0F766E');
  }

  function setTheme(theme) {
    theme = theme === 'light' ? 'light' : 'dark';
    try { localStorage.setItem(KEY, theme); } catch (_) {}
    paint(theme);
    try { window.dispatchEvent(new CustomEvent('chordio-theme', { detail: theme })); } catch (_) {}
    return theme;
  }

  window.chordioGetTheme = function () { return root.getAttribute('data-cx-theme') || read(); };
  window.chordioSetTheme = setTheme;
  window.chordioToggleTheme = function () {
    return setTheme(window.chordioGetTheme() === 'dark' ? 'light' : 'dark');
  };

  try { root.setAttribute('data-cx-motion', localStorage.getItem('chordioMotion') === 'reduced' ? 'reduced' : 'full'); } catch (_) {}
  paint(read());
  // The <meta name="theme-color"> tag is parsed after this script runs, so sync it once more.
  document.addEventListener('DOMContentLoaded', function () { paint(read()); });
  // Keep several open tabs in step.
  window.addEventListener('storage', function (e) { if (e.key === KEY) paint(read()); });
})();
