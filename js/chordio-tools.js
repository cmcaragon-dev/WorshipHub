/* CHORDIO Musician's Toolkit
   A self-contained drawer: Metronome, Pitch pipe, Capo & transpose, Chord family, Timer.
   No dependency on the app's own code. Everything runs in the browser.
   Pages that have the song list or a song sheet get the full toolkit;
   other pages (login, register, settings) only get the theme switch.
   Saved in localStorage (optional): chordioTheme, chordioToolsBpm. */
(function () {
  'use strict';
  if (window.__chordioToolsLoaded) return;
  window.__chordioToolsLoaded = true;

  var NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  var FLAT = { 'Db': 1, 'Eb': 3, 'Gb': 6, 'Ab': 8, 'Bb': 10, 'Cb': 11, 'Fb': 4, 'E#': 5, 'B#': 0 };
  var FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function el(tag, attrs, html) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (html != null) n.innerHTML = html;
    return n;
  }
  function store(k, v) {
    try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (_) {}
    return null;
  }
  function noteIndex(name) {
    if (!name) return -1;
    var n = name.charAt(0).toUpperCase() + name.slice(1);
    if (FLAT.hasOwnProperty(n)) return FLAT[n];
    return NOTES.indexOf(n);
  }
  function spell(i, flats) { i = ((i % 12) + 12) % 12; return flats ? FLAT_NAMES[i] : NOTES[i]; }
  function keyOptions(selected) {
    return FLAT_NAMES.map(function (n, i) {
      var label = NOTES[i] === n ? n : NOTES[i] + ' / ' + n;
      return '<option value="' + i + '"' + (i === selected ? ' selected' : '') + '>' + label + '</option>';
    }).join('');
  }

  var ICON_TOOLS = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/></svg>';
  var ICON_SUN = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  var ICON_MOON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/></svg>';

  /* ---------- Shared audio context (created on first user gesture) ---------- */
  var audio = null;
  function ctx() {
    if (!audio) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      audio = new AC();
    }
    if (audio.state === 'suspended') audio.resume();
    return audio;
  }
  function beep(freq, when, dur, vol, type) {
    var c = ctx(); if (!c) return;
    var o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(vol, when + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g); g.connect(c.destination);
    o.start(when); o.stop(when + dur + 0.02);
  }

  /* ---------- Theme switch (works on every page) ---------- */
  function themeButton() {
    var b = el('button', { type: 'button', class: 'cxt-theme', 'aria-label': 'Switch between night and day theme' });
    function sync() {
      var dark = (window.chordioGetTheme ? window.chordioGetTheme() : 'dark') === 'dark';
      b.innerHTML = dark ? ICON_SUN : ICON_MOON;
      b.title = dark ? 'Switch to day theme' : 'Switch to night theme';
    }
    b.addEventListener('click', function () { if (window.chordioToggleTheme) window.chordioToggleTheme(); sync(); });
    window.addEventListener('chordio-theme', sync);
    sync();
    return b;
  }

  var fullToolkit = !!(document.getElementById('songGrid') || document.getElementById('songPaper'));

  if (!fullToolkit) {
    var lone = themeButton();
    lone.classList.add('cxt-theme-floating');
    document.body.appendChild(lone);
    return;
  }

  /* ---------- Launcher + drawer ---------- */
  var launcher = el('button', { type: 'button', class: 'cxt-launcher', 'aria-label': 'Open musician tools', 'aria-haspopup': 'dialog', 'aria-expanded': 'false' }, ICON_TOOLS + '<span>Tools</span>');
  var drawer = el('aside', { class: 'cxt-drawer', role: 'dialog', 'aria-label': 'Musician tools', 'aria-hidden': 'true', tabindex: '-1' });
  drawer.innerHTML =
    '<header class="cxt-head"><div><strong>Musician tools</strong><span>Everything you need at rehearsal</span></div><div class="cxt-head-actions"></div></header>' +
    '<div class="cxt-tabs" role="tablist" aria-label="Tools">' +
      '<button role="tab" data-tab="metro" aria-selected="true">Metronome</button>' +
      '<button role="tab" data-tab="pitch" aria-selected="false">Pitch pipe</button>' +
      '<button role="tab" data-tab="capo" aria-selected="false">Capo</button>' +
      '<button role="tab" data-tab="chords" aria-selected="false">Chords</button>' +
      '<button role="tab" data-tab="timer" aria-selected="false">Timer</button>' +
    '</div>' +
    '<div class="cxt-body">' +
      /* Metronome */
      '<section class="cxt-panel" data-panel="metro" role="tabpanel">' +
        '<div class="cxt-bpm"><button type="button" class="cxt-step" data-bpm="-5" aria-label="Slower by 5">−5</button><button type="button" class="cxt-step" data-bpm="-1" aria-label="Slower by 1">−1</button>' +
        '<div class="cxt-bpm-read"><output id="cxtBpm">90</output><small>BPM</small></div>' +
        '<button type="button" class="cxt-step" data-bpm="1" aria-label="Faster by 1">+1</button><button type="button" class="cxt-step" data-bpm="5" aria-label="Faster by 5">+5</button></div>' +
        '<input id="cxtBpmRange" class="cxt-range" type="range" min="30" max="260" value="90" aria-label="Tempo in beats per minute">' +
        '<div class="cxt-beats" id="cxtBeats" aria-hidden="true"></div>' +
        '<div class="cxt-row"><label>Beats per bar<select id="cxtSig"><option>2</option><option>3</option><option selected>4</option><option>5</option><option>6</option><option>7</option></select></label>' +
        '<button type="button" class="cxt-ghost" id="cxtTap">Tap tempo</button></div>' +
        '<button type="button" class="cxt-primary" id="cxtMetroGo">Start</button>' +
        '<p class="cxt-hint">Tap the button in time with the music four or more times to set the tempo.</p>' +
      '</section>' +
      /* Pitch pipe */
      '<section class="cxt-panel" data-panel="pitch" role="tabpanel" hidden>' +
        '<p class="cxt-hint">Tap a note to hold it. Tap it again, or another note, to stop.</p>' +
        '<div class="cxt-pipe" id="cxtPipe"></div>' +
        '<div class="cxt-row"><label>Octave<select id="cxtOct"><option value="3">Low</option><option value="4" selected>Middle</option><option value="5">High</option></select></label>' +
        '<label>Sound<select id="cxtWave"><option value="sine">Soft</option><option value="triangle">Warm</option></select></label></div>' +
        '<div class="cxt-readout" id="cxtPipeRead">Choose a note</div>' +
      '</section>' +
      /* Capo + transpose */
      '<section class="cxt-panel" data-panel="capo" role="tabpanel" hidden>' +
        '<div class="cxt-row"><label>Song key<select id="cxtCapoKey">' + keyOptions(7) + '</select></label>' +
        '<label>Mode<select id="cxtCapoMode"><option value="maj">Major</option><option value="min">Minor</option></select></label></div>' +
        '<div class="cxt-capo-table" id="cxtCapoTable"></div>' +
        '<h4 class="cxt-sub">Transpose a chord line</h4>' +
        '<textarea id="cxtTransIn" class="cxt-text" rows="2" spellcheck="false" placeholder="G   D/F#   Em7   Cadd9"></textarea>' +
        '<div class="cxt-row"><div class="cxt-semi"><button type="button" class="cxt-step" id="cxtSemiDown" aria-label="Down one semitone">−</button><output id="cxtSemi">+0</output><button type="button" class="cxt-step" id="cxtSemiUp" aria-label="Up one semitone">+</button></div>' +
        '<label>Spelling<select id="cxtSpell"><option value="sharp">Sharps (F#)</option><option value="flat">Flats (Gb)</option></select></label></div>' +
        '<div class="cxt-out" id="cxtTransOut" aria-live="polite">—</div>' +
        '<button type="button" class="cxt-ghost" id="cxtCopy">Copy result</button>' +
      '</section>' +
      /* Chord family */
      '<section class="cxt-panel" data-panel="chords" role="tabpanel" hidden>' +
        '<div class="cxt-row"><label>Key<select id="cxtFamKey">' + keyOptions(7) + '</select></label>' +
        '<label>Mode<select id="cxtFamMode"><option value="maj">Major</option><option value="min">Minor</option></select></label></div>' +
        '<div class="cxt-family" id="cxtFamily"></div>' +
        '<p class="cxt-hint">These are the chords that belong together in the key. The number is the Nashville number musicians use to talk about a progression.</p>' +
        '<div class="cxt-prog" id="cxtProg"></div>' +
      '</section>' +
      /* Timer */
      '<section class="cxt-panel" data-panel="timer" role="tabpanel" hidden>' +
        '<div class="cxt-time" id="cxtTime" aria-live="off">00:00</div>' +
        '<div class="cxt-presets"><button type="button" data-min="5">5 min</button><button type="button" data-min="10">10 min</button><button type="button" data-min="15">15 min</button><button type="button" data-min="30">30 min</button><button type="button" data-min="45">45 min</button></div>' +
        '<div class="cxt-row"><button type="button" class="cxt-primary" id="cxtTimerGo">Start</button><button type="button" class="cxt-ghost" id="cxtTimerReset">Reset</button></div>' +
        '<div class="cxt-row"><label>Mode<select id="cxtTimerMode"><option value="down">Countdown</option><option value="up">Stopwatch</option></select></label></div>' +
        '<p class="cxt-hint">Pick a length for a countdown. A soft chime plays when time is up.</p>' +
      '</section>' +
    '</div>';

  $('.cxt-head-actions', drawer).appendChild(themeButton());
  var closeBtn = el('button', { type: 'button', class: 'cxt-close', 'aria-label': 'Close tools' }, '✕');
  $('.cxt-head-actions', drawer).appendChild(closeBtn);

  document.body.appendChild(launcher);
  document.body.appendChild(drawer);

  var lastFocus = null;
  function open() {
    lastFocus = document.activeElement;
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    launcher.setAttribute('aria-expanded', 'true');
    launcher.classList.add('hide');
    setTimeout(function () { var t = $('.cxt-tabs [aria-selected="true"]', drawer); if (t) t.focus(); }, 30);
  }
  function close() {
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    launcher.setAttribute('aria-expanded', 'false');
    launcher.classList.remove('hide');
    if (lastFocus && lastFocus.focus) try { lastFocus.focus(); } catch (_) {}
  }
  launcher.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && drawer.classList.contains('open')) close(); });
  window.chordioOpenTools = open;

  /* Tabs (arrow keys move between tabs) */
  var tabs = $$('.cxt-tabs [role="tab"]', drawer);
  function selectTab(name) {
    tabs.forEach(function (t) {
      var on = t.getAttribute('data-tab') === name;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
    });
    $$('.cxt-panel', drawer).forEach(function (p) { p.hidden = p.getAttribute('data-panel') !== name; });
  }
  tabs.forEach(function (t, i) {
    t.addEventListener('click', function () { selectTab(t.getAttribute('data-tab')); });
    t.addEventListener('keydown', function (e) {
      var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      var n = tabs[(i + d + tabs.length) % tabs.length];
      selectTab(n.getAttribute('data-tab')); n.focus();
    });
  });
  selectTab('metro');

  /* ---------- Metronome ---------- */
  var bpm = parseInt(store('chordioToolsBpm'), 10);
  if (!(bpm >= 30 && bpm <= 260)) bpm = 90;
  var beatsPerBar = 4, running = false, nextTime = 0, beatNo = 0, timerId = null;
  var bpmOut = $('#cxtBpm', drawer), bpmRange = $('#cxtBpmRange', drawer), beatsBox = $('#cxtBeats', drawer);
  var goBtn = $('#cxtMetroGo', drawer);

  function drawBeats() {
    beatsBox.innerHTML = '';
    for (var i = 0; i < beatsPerBar; i++) beatsBox.appendChild(el('span', { class: i === 0 ? 'dot first' : 'dot' }));
  }
  function setBpm(v) {
    bpm = Math.max(30, Math.min(260, Math.round(v)));
    bpmOut.textContent = bpm; bpmRange.value = bpm; store('chordioToolsBpm', String(bpm));
  }
  function flash(i) {
    var dots = $$('.dot', beatsBox);
    dots.forEach(function (d) { d.classList.remove('on'); });
    if (dots[i]) dots[i].classList.add('on');
  }
  function schedule() {
    var c = ctx(); if (!c) return;
    while (nextTime < c.currentTime + 0.15) {
      var i = beatNo % beatsPerBar;
      beep(i === 0 ? 1320 : 880, nextTime, 0.05, i === 0 ? 0.5 : 0.32, 'square');
      (function (idx, t) {
        setTimeout(function () { if (running) flash(idx); }, Math.max(0, (t - c.currentTime) * 1000));
      })(i, nextTime);
      nextTime += 60 / bpm;
      beatNo++;
    }
  }
  function startMetro() {
    var c = ctx(); if (!c) { goBtn.textContent = 'Audio not supported'; return; }
    running = true; beatNo = 0; nextTime = c.currentTime + 0.06;
    goBtn.textContent = 'Stop'; goBtn.classList.add('live');
    schedule(); timerId = setInterval(schedule, 25);
  }
  function stopMetro() {
    running = false; clearInterval(timerId); timerId = null;
    goBtn.textContent = 'Start'; goBtn.classList.remove('live'); flash(-1);
  }
  $$('.cxt-step[data-bpm]', drawer).forEach(function (b) {
    b.addEventListener('click', function () { setBpm(bpm + parseInt(b.getAttribute('data-bpm'), 10)); });
  });
  bpmRange.addEventListener('input', function () { setBpm(parseInt(bpmRange.value, 10)); });
  $('#cxtSig', drawer).addEventListener('change', function (e) { beatsPerBar = parseInt(e.target.value, 10); drawBeats(); beatNo = 0; });
  goBtn.addEventListener('click', function () { running ? stopMetro() : startMetro(); });
  var taps = [];
  $('#cxtTap', drawer).addEventListener('click', function () {
    var now = performance.now();
    if (taps.length && now - taps[taps.length - 1] > 2000) taps = [];
    taps.push(now);
    if (taps.length > 8) taps.shift();
    if (taps.length >= 3) {
      var sum = 0; for (var i = 1; i < taps.length; i++) sum += taps[i] - taps[i - 1];
      setBpm(60000 / (sum / (taps.length - 1)));
    }
  });
  setBpm(bpm); drawBeats();

  /* ---------- Pitch pipe ---------- */
  var pipe = $('#cxtPipe', drawer), osc = null, oscGain = null, playing = -1;
  NOTES.forEach(function (n, i) {
    var b = el('button', { type: 'button', class: 'cxt-note' + (n.indexOf('#') > -1 ? ' sharp' : ''), 'data-i': i, 'aria-pressed': 'false' }, n.replace('#', '♯'));
    pipe.appendChild(b);
  });
  function stopPipe() {
    if (osc) {
      try { var c = ctx(); oscGain.gain.cancelScheduledValues(c.currentTime); oscGain.gain.setTargetAtTime(0.0001, c.currentTime, 0.05); osc.stop(c.currentTime + 0.3); } catch (_) {}
      osc = null; oscGain = null;
    }
    $$('.cxt-note', pipe).forEach(function (b) { b.classList.remove('on'); b.setAttribute('aria-pressed', 'false'); });
    playing = -1; $('#cxtPipeRead', drawer).textContent = 'Choose a note';
  }
  function playPipe(i) {
    var c = ctx(); if (!c) return;
    var wasSame = playing === i;
    stopPipe();
    if (wasSame) return;
    var oct = parseInt($('#cxtOct', drawer).value, 10);
    var midi = 12 * (oct + 1) + i;
    var f = 440 * Math.pow(2, (midi - 69) / 12);
    osc = c.createOscillator(); oscGain = c.createGain();
    osc.type = $('#cxtWave', drawer).value; osc.frequency.value = f;
    oscGain.gain.setValueAtTime(0.0001, c.currentTime);
    oscGain.gain.exponentialRampToValueAtTime(0.35, c.currentTime + 0.06);
    osc.connect(oscGain); oscGain.connect(c.destination); osc.start();
    playing = i;
    var btn = $('.cxt-note[data-i="' + i + '"]', pipe); btn.classList.add('on'); btn.setAttribute('aria-pressed', 'true');
    $('#cxtPipeRead', drawer).textContent = NOTES[i] + ' · ' + f.toFixed(1) + ' Hz';
  }
  pipe.addEventListener('click', function (e) { var b = e.target.closest('.cxt-note'); if (b) playPipe(parseInt(b.getAttribute('data-i'), 10)); });
  $('#cxtOct', drawer).addEventListener('change', function () { var p = playing; if (p > -1) { playing = -2; playPipe(p); } });
  $('#cxtWave', drawer).addEventListener('change', function () { var p = playing; if (p > -1) { playing = -2; playPipe(p); } });

  /* ---------- Capo + transpose ---------- */
  var FRIENDLY_MAJ = [0, 2, 4, 7, 9];      // C D E G A shapes
  var FRIENDLY_MIN = [2, 4, 9];            // Dm Em Am shapes
  function renderCapo() {
    var key = parseInt($('#cxtCapoKey', drawer).value, 10);
    var minor = $('#cxtCapoMode', drawer).value === 'min';
    var friendly = minor ? FRIENDLY_MIN : FRIENDLY_MAJ;
    var best = null, html = '<div class="cxt-capo-head"><span>Capo</span><span>Play shapes in</span></div>';
    for (var f = 0; f <= 7; f++) {
      var shape = ((key - f) % 12 + 12) % 12;
      var good = friendly.indexOf(shape) > -1;
      if (good && best === null) best = f;
      html += '<div class="cxt-capo-row' + (good ? ' good' : '') + '"><span>' + (f === 0 ? 'No capo' : 'Fret ' + f) + '</span><b>' + spell(shape, false) + (minor ? 'm' : '') + '</b></div>';
    }
    $('#cxtCapoTable', drawer).innerHTML = html;
  }
  var semis = 0;
  var CHORD = /^([A-G][#b]?)((?:maj|min|m|M|dim|aug|sus|add|\+|°|ø|-|\d|#|b|\(|\)|,)*)(?:\/([A-G][#b]?))?$/;
  function shift(root, flats) {
    var i = noteIndex(root); if (i < 0) return root;
    return spell(i + semis, flats);
  }
  function renderTranspose() {
    var flats = $('#cxtSpell', drawer).value === 'flat';
    var out = $('#cxtTransIn', drawer).value.split('\n').map(function (line) {
      return line.split(/(\s+)/).map(function (tok) {
        if (!tok || /^\s+$/.test(tok)) return tok;
        var m = CHORD.exec(tok);
        if (!m) return tok;
        return shift(m[1], flats) + (m[2] || '') + (m[3] ? '/' + shift(m[3], flats) : '');
      }).join('');
    }).join('\n');
    $('#cxtTransOut', drawer).textContent = out.trim() ? out : '—';
    $('#cxtSemi', drawer).textContent = (semis > 0 ? '+' : '') + semis;
  }
  $('#cxtCapoKey', drawer).addEventListener('change', renderCapo);
  $('#cxtCapoMode', drawer).addEventListener('change', renderCapo);
  $('#cxtTransIn', drawer).addEventListener('input', renderTranspose);
  $('#cxtSpell', drawer).addEventListener('change', renderTranspose);
  $('#cxtSemiUp', drawer).addEventListener('click', function () { semis = Math.min(11, semis + 1); renderTranspose(); });
  $('#cxtSemiDown', drawer).addEventListener('click', function () { semis = Math.max(-11, semis - 1); renderTranspose(); });
  $('#cxtCopy', drawer).addEventListener('click', function () {
    var b = this, text = $('#cxtTransOut', drawer).textContent;
    if (text === '—') return;
    function done() { var o = b.textContent; b.textContent = 'Copied'; setTimeout(function () { b.textContent = o; }, 1400); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () {});
  });
  renderCapo(); renderTranspose();

  /* ---------- Chord family ---------- */
  var MAJ = { steps: [0, 2, 4, 5, 7, 9, 11], q: ['', 'm', 'm', '', '', 'm', 'dim'], n: ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'] };
  var MIN = { steps: [0, 2, 3, 5, 7, 8, 10], q: ['m', 'dim', '', 'm', 'm', '', ''], n: ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII'] };
  function renderFamily() {
    var key = parseInt($('#cxtFamKey', drawer).value, 10);
    var minor = $('#cxtFamMode', drawer).value === 'min';
    var s = minor ? MIN : MAJ;
    // Flat keys: F, Bb, Eb, Ab, Db, Gb. A minor key spells like its relative major (3 semitones up).
    var flats = [5, 10, 3, 8, 1, 6].indexOf(minor ? (key + 3) % 12 : key) > -1;
    $('#cxtFamily', drawer).innerHTML = s.steps.map(function (st, i) {
      return '<div class="cxt-chord"><small>' + s.n[i] + '</small><b>' + spell(key + st, flats) + s.q[i] + '</b></div>';
    }).join('');
    var prog = $('#cxtFamMode', drawer).value === 'min'
      ? [['i', 'VI', 'III', 'VII'], ['i', 'iv', 'v', 'i']]
      : [['I', 'V', 'vi', 'IV'], ['I', 'IV', 'V', 'I'], ['vi', 'IV', 'I', 'V']];
    $('#cxtProg', drawer).innerHTML = '<h4 class="cxt-sub">Common progressions</h4>' + prog.map(function (p) {
      var chords = p.map(function (num) { var i = s.n.indexOf(num); return i > -1 ? spell(key + s.steps[i], flats) + s.q[i] : num; });
      return '<div class="cxt-prog-row"><span>' + p.join(' – ') + '</span><b>' + chords.join('  ') + '</b></div>';
    }).join('');
  }
  $('#cxtFamKey', drawer).addEventListener('change', renderFamily);
  $('#cxtFamMode', drawer).addEventListener('change', renderFamily);
  renderFamily();

  /* ---------- Timer / stopwatch ---------- */
  var tSec = 0, tRun = false, tId = null, tEnd = 0, tStart = 0;
  var timeOut = $('#cxtTime', drawer), tGo = $('#cxtTimerGo', drawer), tMode = $('#cxtTimerMode', drawer);
  function fmt(s) { s = Math.max(0, Math.round(s)); var m = Math.floor(s / 60), r = s % 60; return (m < 10 ? '0' : '') + m + ':' + (r < 10 ? '0' : '') + r; }
  function tick() {
    var now = Date.now();
    if (tMode.value === 'down') {
      tSec = Math.max(0, Math.ceil((tEnd - now) / 1000));
      timeOut.textContent = fmt(tSec);
      if (tSec <= 0) {
        tStop(); timeOut.classList.add('done');
        var c = ctx(); if (c) { var t = c.currentTime; beep(880, t, 0.4, 0.4); beep(1100, t + 0.45, 0.4, 0.4); beep(1320, t + 0.9, 0.7, 0.4); }
      }
    } else { tSec = Math.floor((now - tStart) / 1000); timeOut.textContent = fmt(tSec); }
  }
  function tStop() { tRun = false; clearInterval(tId); tId = null; tGo.textContent = 'Start'; tGo.classList.remove('live'); }
  function tBegin() {
    if (tMode.value === 'down' && tSec <= 0) return;
    ctx(); timeOut.classList.remove('done');
    tRun = true; tGo.textContent = 'Pause'; tGo.classList.add('live');
    if (tMode.value === 'down') tEnd = Date.now() + tSec * 1000; else tStart = Date.now() - tSec * 1000;
    tId = setInterval(tick, 250);
  }
  tGo.addEventListener('click', function () { tRun ? tStop() : tBegin(); });
  $('#cxtTimerReset', drawer).addEventListener('click', function () { tStop(); tSec = 0; timeOut.classList.remove('done'); timeOut.textContent = fmt(0); });
  tMode.addEventListener('change', function () { tStop(); tSec = 0; timeOut.classList.remove('done'); timeOut.textContent = fmt(0); });
  $$('.cxt-presets button', drawer).forEach(function (b) {
    b.addEventListener('click', function () { tMode.value = 'down'; tStop(); tSec = parseInt(b.getAttribute('data-min'), 10) * 60; timeOut.classList.remove('done'); timeOut.textContent = fmt(tSec); });
  });
  timeOut.textContent = fmt(0);

  /* Stop sound when the tab is hidden so nothing keeps playing in the background */
  document.addEventListener('visibilitychange', function () { if (document.hidden) { if (running) stopMetro(); stopPipe(); } });
})();
