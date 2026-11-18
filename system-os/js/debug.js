/* ============================================================
   Debug panel — fake clock + simulate reset.
   Removal: delete this file and its <script> tag, or set
   CONFIG.debug = false. Nothing else depends on it.
   ============================================================ */
(function () {
  'use strict';
  if (typeof CONFIG === 'undefined' || !CONFIG.debug) return;
  if (typeof Core === 'undefined') return;

  var open = false;
  var panel = null;

  function fmt(ms) {
    var d = new Date(ms);
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
      '  ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }

  function status() {
    var s = Core.debug.status();
    return '<div class="dbg-row"><span>fake clock</span><b>' + (s.fake ? 'ON' : 'OFF') + '</b></div>' +
      '<div class="dbg-row"><span>now</span><b>' + fmt(s.clock) + '</b></div>' +
      '<div class="dbg-row"><span>logical day</span><b>' + s.day + '</b></div>' +
      '<div class="dbg-row"><span>reset time</span><b>' + s.resetTime + '</b></div>' +
      '<div class="dbg-row"><span>level / xp</span><b>' + s.level + ' / ' + s.exp + '</b></div>' +
      '<div class="dbg-row"><span>rank</span><b>' + s.rank + '</b></div>' +
      '<div class="dbg-row"><span>streak</span><b>' + s.streak + '</b></div>' +
      '<div class="dbg-row"><span>fails (7d)</span><b>' + s.fails + '</b></div>' +
      '<div class="dbg-row"><span>demotion queued</span><b>' + (s.demotion ? 'YES' : 'no') + '</b></div>' +
      '<div class="dbg-row"><span>penalty quest</span><b>' + (s.penalty ? 'YES' : 'no') + '</b></div>' +
      '<div class="dbg-row"><span>paused today</span><b>' + (s.paused ? 'YES' : 'no') + '</b></div>' +
      '<div class="dbg-row"><span>cleared today</span><b>' + (s.cleared ? 'YES' : 'no') + '</b></div>' +
      '<div class="dbg-row"><span>queued (tomorrow)</span><b>' + s.queued + '</b></div>';
  }

  function build() {
    var btn = document.createElement('button');
    btn.id = 'dbgFab';
    btn.type = 'button';
    btn.textContent = 'DBG';
    btn.className = 'dbg-fab';
    document.body.appendChild(btn);

    panel = document.createElement('div');
    panel.id = 'dbgPanel';
    panel.className = 'dbg-panel';
    panel.innerHTML =
      '<div class="dbg-head"><b>DEBUG</b><button type="button" class="dbg-close" id="dbgClose">×</button></div>' +
      '<div class="dbg-status" id="dbgStatus"></div>' +
      '<div class="dbg-group"><label>Set date/time</label>' +
      '<input type="datetime-local" id="dbgWhen">' +
      '<button type="button" class="btn btn-sm" id="dbgSet">Set clock</button></div>' +
      '<div class="dbg-group"><label>Advance</label>' +
      '<div class="dbg-adv">' +
      '<button type="button" class="btn btn-sm" data-adv="3600000">+1h</button>' +
      '<button type="button" class="btn btn-sm" data-adv="21600000">+6h</button>' +
      '<button type="button" class="btn btn-sm" data-adv="86400000">+1d</button>' +
      '<button type="button" class="btn btn-sm" data-adv="604800000">+7d</button>' +
      '</div></div>' +
      '<div class="dbg-group">' +
      '<button type="button" class="btn btn-primary btn-block" id="dbgReset">Simulate reset</button>' +
      '<button type="button" class="btn btn-ghost btn-block" id="dbgBoss" style="margin-top:6px">+1 Boss progress (debug)</button>' +
      '<button type="button" class="btn btn-ghost btn-block" id="dbgClear" style="margin-top:6px">Clear clock (real time)</button>' +
      '</div>';
    document.body.appendChild(panel);

    btn.addEventListener('click', function () { open = !open; panel.classList.toggle('open', open); refresh(); });
    panel.querySelector('#dbgClose').addEventListener('click', function () { open = false; panel.classList.remove('open'); });
    panel.querySelector('#dbgSet').addEventListener('click', function () {
      var v = panel.querySelector('#dbgWhen').value;
      if (!v) return;
      var ms = new Date(v).getTime();
      if (isFinite(ms)) Core.debug.setNow(ms);
      refresh();
    });
    panel.querySelectorAll('[data-adv]').forEach(function (b) {
      b.addEventListener('click', function () {
        Core.debug.advance(parseInt(b.dataset.adv, 10));
        refresh();
      });
    });
    panel.querySelector('#dbgReset').addEventListener('click', function () {
      Core.debug.simulateReset();
      refresh();
    });
    panel.querySelector('#dbgBoss').addEventListener('click', function () {
      Core.addBossProgress(1);
      refresh();
    });
    panel.querySelector('#dbgClear').addEventListener('click', function () {
      Core.debug.clear();
      refresh();
    });

    Core.on(refresh);
  }

  function refresh() {
    if (!panel) return;
    var el = panel.querySelector('#dbgStatus');
    if (el) el.innerHTML = status();
  }

  function init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', build);
    } else {
      build();
    }
  }
  init();
})();