(function () {
  'use strict';

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

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { showStatus(); registerSW(); });
  else { showStatus(); registerSW(); }
  window.addEventListener('online', showStatus);
  window.addEventListener('offline', showStatus);
})();
