/* ============================================================
   Boot — PWA wiring, lifecycle
   ============================================================ */
(function () {
  'use strict';

  function boot() {
    UI.init();

    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register('sw.js').catch(function () { /* ignore */ });
    }

    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      window.__deferredPrompt = e;
    });

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) {
        if (Core.tick()) UI.render();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
