(function () {
  'use strict';

  let deferredInstallPrompt = null;

  function ensureInstallUI() {
    if (document.getElementById('chordioInstallBtn')) return;
    const topActions = document.querySelector('.top-actions');
    if (!topActions) return;

    const btn = document.createElement('button');
    btn.id = 'chordioInstallBtn';
    btn.type = 'button';
    btn.className = 'chordio-install-btn';
    btn.innerHTML = '<i class="fa-solid fa-mobile-screen-button" aria-hidden="true"></i><span>Install CHORDIO</span>';
    btn.title = 'Install CHORDIO on this device';
    btn.addEventListener('click', function () {
      if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        deferredInstallPrompt.userChoice.then(function () {
          deferredInstallPrompt = null;
          updateInstallButton();
        }).catch(function () {});
      } else {
        showInstallHelp();
      }
    });
    topActions.insertBefore(btn, topActions.firstChild);
    updateInstallButton();
  }

  function isStandalone() {
    return window.matchMedia && window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }

  function isIOS() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  function updateInstallButton() {
    const btn = document.getElementById('chordioInstallBtn');
    if (!btn) return;
    if (isStandalone()) {
      btn.classList.add('installed');
      btn.innerHTML = '<i class="fa-solid fa-circle-check" aria-hidden="true"></i><span>CHORDIO Installed</span>';
      btn.title = 'CHORDIO is installed on this device';
      return;
    }
    btn.classList.remove('installed');
    btn.innerHTML = '<i class="fa-solid fa-mobile-screen-button" aria-hidden="true"></i><span>Install CHORDIO</span>';
  }

  function showInstallHelp() {
    let modal = document.getElementById('chordioInstallHelp');
    if (modal) { modal.classList.add('show'); return; }
    modal = document.createElement('div');
    modal.id = 'chordioInstallHelp';
    modal.className = 'chordio-install-modal';
    const ios = isIOS();
    modal.innerHTML = '<div class="chordio-install-backdrop"></div>' +
      '<div class="chordio-install-dialog" role="dialog" aria-modal="true" aria-labelledby="chordioInstallTitle">' +
      '<button class="chordio-install-close" type="button" aria-label="Close">×</button>' +
      '<div class="chordio-install-icon"><i class="fa-solid fa-mobile-screen-button"></i></div>' +
      '<h2 id="chordioInstallTitle">Install CHORDIO</h2>' +
      (ios ? '<p><strong>iPhone / iPad:</strong></p><ol><li>Open CHORDIO in <strong>Safari</strong>.</li><li>Tap the <strong>Share</strong> button.</li><li>Select <strong>Add to Home Screen</strong>.</li><li>Tap <strong>Add</strong>.</li></ol>' :
        '<p><strong>Windows / Android:</strong> use a supported browser such as Chrome or Edge.</p><ol><li>Make sure you are online the first time.</li><li>Click <strong>Install CHORDIO</strong> again when the browser provides the install prompt.</li><li>After installation, launch CHORDIO from your device/app menu.</li></ol><p class="chordio-install-note">If the browser does not show an install prompt, open CHORDIO over HTTPS and refresh the page.</p>') +
      '<button class="chordio-install-ok" type="button">Got it</button>' +
      '</div>';
    document.body.appendChild(modal);
    function close() { modal.classList.remove('show'); }
    modal.querySelector('.chordio-install-close').addEventListener('click', close);
    modal.querySelector('.chordio-install-backdrop').addEventListener('click', close);
    modal.querySelector('.chordio-install-ok').addEventListener('click', close);
    modal.classList.add('show');
  }

  function showStatus() {
    let el = document.getElementById('chordioConnectionStatus');
    if (!el) {
      el = document.createElement('div');
      el.id = 'chordioConnectionStatus';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      el.innerHTML = '<span class="chordio-connection-dot"></span><span class="chordio-connection-text"></span>';
      document.body.appendChild(el);
    }
    const online = navigator.onLine;
    el.classList.toggle('offline', !online);
    el.classList.toggle('online', online);
    el.querySelector('.chordio-connection-text').textContent = online ? 'Online' : 'Offline mode';
  }

  function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('./service-worker.js', { scope: './' }).then(function (registration) {
      console.log('CHORDIO service worker ready:', registration.scope);
      registration.update().catch(function () {});
    }).catch(function (error) {
      console.warn('CHORDIO service worker registration failed:', error);
    });
  }

  window.addEventListener('beforeinstallprompt', function (event) {
    event.preventDefault();
    deferredInstallPrompt = event;
    ensureInstallUI();
    updateInstallButton();
  });
  window.addEventListener('appinstalled', function () {
    deferredInstallPrompt = null;
    updateInstallButton();
  });

  function init() {
    showStatus();
    ensureInstallUI();
    registerSW();
    updateInstallButton();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  window.addEventListener('online', showStatus);
  window.addEventListener('offline', showStatus);
  window.addEventListener('resize', updateInstallButton);
})();
