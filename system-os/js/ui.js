/* ============================================================
   UI — rendering, navigation, modals, toasts, sounds
   ============================================================ */
var Sound = (function () {
  var ctx = null;

  function tone(freq, start, dur, type, vol) {
    if (!ctx) return;
    var o = ctx.createOscillator();
    var g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, ctx.currentTime + start);
    g.gain.setValueAtTime(0.0001, ctx.currentTime + start);
    g.gain.exponentialRampToValueAtTime(vol || 0.07, ctx.currentTime + start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
    o.connect(g).connect(ctx.destination);
    o.start(ctx.currentTime + start);
    o.stop(ctx.currentTime + start + dur + 0.02);
  }

  function play(kind) {
    if (!Core.state.sound) return;
    try {
      if (!ctx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ctx = new AC();
      }
      if (ctx.state === 'suspended') ctx.resume();
      if (kind === 'level') {
        tone(523, 0, .12, 'triangle', .06);
        tone(659, .1, .12, 'triangle', .06);
        tone(784, .2, .16, 'triangle', .07);
        tone(1046, .33, .28, 'triangle', .06);
      } else if (kind === 'refuse' || kind === 'warn') {
        tone(300, 0, .08, 'square', .04);
        tone(220, .09, .18, 'square', .045);
      } else if (kind === 'quest' || kind === 'reward' || kind === 'ok') {
        tone(880, 0, .08, 'sine', .05);
        tone(1175, .07, .14, 'sine', .05);
      } else if (kind !== 'info') {
        tone(660, 0, .05, 'sine', .03);
      }
    } catch (e) { /* audio blocked */ }
  }

  return { play: play };
})();

var UI = (function () {
  'use strict';

  var view = 'status';
  var els = {};
  var timerHandle = null;

  var ICONS = {
    status: '<path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"/><path d="M4.5 20c.6-3.4 3.9-5.2 7.5-5.2s6.9 1.8 7.5 5.2"/>',
    quests: '<path d="M9 6h11M9 12h11M9 18h7"/><path d="M4 6h.01M4 12h.01M4 18h.01" stroke-width="2.4"/>',
    records: '<path d="M4 20V11M10 20V4M16 20v-6M22 20H2"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>'
  };

  var NAV = [
    ['status', 'navStatus'],
    ['quests', 'navQuests'],
    ['records', 'navStats'],
    ['settings', 'navSettings']
  ];

  /* ---------------- render ---------------- */
  function buildNav() {
    els.nav.innerHTML = NAV.map(function (n) {
      return '<button class="nav-btn" data-nav="' + n[0] + '" type="button">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICONS[n[0]] + '</svg>' +
        '<span class="lbl">' + t(n[1]) + '</span></button>';
    }).join('');
  }

  function render() {
    var S = Core.state;
    document.documentElement.lang = S.lang;
    document.documentElement.dir = S.lang === 'ar' ? 'rtl' : 'ltr';
    document.title = t('appName') + ' — ' + t('appTag');

    els.hudLevel.textContent = S.player.level;
    els.hudStreak.textContent = Core.streak();
    els.langBtn.textContent = S.lang === 'ar' ? 'EN' : 'ع';

    NAV.forEach(function (n) {
      var btn = els.nav.querySelector('[data-nav="' + n[0] + '"]');
      if (btn) {
        btn.classList.toggle('active', n[0] === view);
        var lbl = btn.querySelector('.lbl');
        if (lbl) lbl.textContent = t(n[1]);
      }
    });

    els.view.innerHTML = (Views[view] || Views.status)();
    drain();
  }

  function setView(v) {
    if (!Views[v]) v = 'status';
    view = v;
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------------- toasts ---------------- */
  function toast(kind, msg) {
    var box = els.toasts;
    var el = document.createElement('div');
    el.className = 'toast ' + (kind || '');
    el.innerHTML = '<span class="t-sys">[' + t('system') + ']</span><span class="t-msg">' + esc(msg) + '</span>';
    box.appendChild(el);
    while (box.children.length > 4) box.removeChild(box.firstChild);
    Sound.play(kind);
    setTimeout(function () {
      el.classList.add('out');
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 320);
    }, 4200);
  }

  function drain() {
    var items = Core.drain();
    var levelParams = null;
    items.forEach(function (n) {
      if (n.text === 'levelUpT') { levelParams = n.params; return; }
      toast(n.kind, t(n.text, n.params));
    });
    if (levelParams) {
      setTimeout(function () { openLevelUp(levelParams); }, 380);
    }
  }

  /* ---------------- modal helpers ---------------- */
  function closeModal() {
    els.modalRoot.classList.remove('open');
    els.modalRoot.innerHTML = '';
    document.body.style.overflow = '';
  }

  function openModal(opts) {
    closeModal();
    var html = '<div class="backdrop" data-close></div>' +
      '<div class="modal panel ' + (opts.cls || '') + '" role="dialog" aria-modal="true">' +
      '<div class="modal-head"><h2>' + (opts.title || '') + '</h2>' +
      '<button class="modal-close" data-close type="button" aria-label="' + t('close') + '">×</button></div>' +
      '<div class="modal-body">' + (opts.body || '') + '</div>' +
      (opts.footer ? '<div class="modal-foot">' + opts.footer + '</div>' : '') +
      '</div>';
    els.modalRoot.innerHTML = html;
    els.modalRoot.classList.add('open');
    document.body.style.overflow = 'hidden';
    els.modalRoot.querySelectorAll('[data-close]').forEach(function (b) {
      b.addEventListener('click', closeModal);
    });
    if (opts.onMount) opts.onMount(els.modalRoot);
    var first = els.modalRoot.querySelector('.modal-body input:not([type=hidden]), .modal-body textarea, .modal-body select');
    if (first) setTimeout(function () { try { first.focus(); } catch (e) {} }, 80);
  }

  function confirmDialog(titleKey, descKey, onYes) {
    openModal({
      title: t(titleKey),
      body: '<p class="muted small">' + t(descKey) + '</p>',
      footer: '<button class="btn" data-close type="button">' + t('cancel') + '</button>' +
        '<button class="btn btn-danger" data-yes type="button">' + t('confirm') + '</button>',
      onMount: function (root) {
        root.querySelector('[data-yes]').addEventListener('click', function () {
          closeModal();
          onYes();
        });
      }
    });
  }

  /* ---------------- forms ---------------- */
  function option(value, label, selected) {
    return '<option value="' + value + '"' + (selected ? ' selected' : '') + '>' + esc(label) + '</option>';
  }

  function openQuestModal(id) {
    var q = id ? Core.getQuest(id) : null;
    var statOpts = Rules.STATS.map(function (k) {
      return option(k, t(Rules.STAT_LABELS[k]), (q ? q.stat : 'discipline') === k);
    }).join('');
    var diffOpts = ['easy', 'normal', 'hard'].map(function (k) {
      return option(k, t('diff' + k.charAt(0).toUpperCase() + k.slice(1)), (q ? q.difficulty : 'normal') === k);
    }).join('');
    var used = Core.projectedBudget();
    var left = Math.max(0, Rules.BUDGET_MIN - used);

    var body = '<p class="hint" style="margin-bottom:10px">' + t('queuedHint') + '</p>' +
      '<form class="form" data-form="quest" id="questForm">' +
      '<input type="hidden" name="id" value="' + (q ? q.id : '') + '">' +
      '<div class="field"><span>' + t('questName') + '</span>' +
      '<input name="title" required maxlength="90" value="' + (q ? esc(Core.questName(q)) : '') + '" placeholder="' + t('questNamePh') + '"></div>' +
      '<div class="field"><span>' + t('questDetails') + '</span>' +
      '<textarea name="desc" maxlength="240" placeholder="' + t('questDetailsPh') + '">' + (q ? esc(q.desc || '') : '') + '</textarea></div>' +
      '<div class="field-row">' +
      '<div class="field"><span>' + t('minutesLabel') + '</span>' +
      '<input type="number" name="minutes" required min="' + Rules.MIN_QUEST_MIN + '" max="' + Rules.BUDGET_MIN + '" step="1" value="' + (q ? q.estimatedMinutes : Rules.MIN_QUEST_MIN) + '"></div>' +
      '<div class="field"><span>' + t('statLabel') + '</span><select name="stat">' + statOpts + '</select></div>' +
      '</div>' +
      '<div class="field-row">' +
      '<div class="field"><span>' + t('difficulty') + '</span><select name="difficulty">' + diffOpts + '</select></div>' +
      '<div class="field"><span>' + t('dueTimeLabel') + '</span>' +
      '<input type="time" name="dueTime" value="' + (q && q.dueTime ? esc(q.dueTime) : '') + '"></div>' +
      '</div>' +
      '<label class="check"><input type="checkbox" name="core" value="1"' + (q && q.core ? ' checked' : '') + '>' +
      '<span><b>' + t('coreLabel') + '</b><small>' + t('coreHint') + '</small></span></label>' +
      '<p class="hint">' + t('budgetOf', { used: used, max: Rules.BUDGET_MIN }) + ' · ' +
      (left ? t('budgetLeftShort', { n: left }) : t('budgetFull')) + '</p>' +
      '</form>';

    openModal({
      title: id ? t('editQuest') : t('newQuest'),
      body: body,
      footer: '<button class="btn" data-close type="button">' + t('cancel') + '</button>' +
        '<button class="btn btn-primary" type="submit" form="questForm">' + t('save') + '</button>'
    });
  }

  function openPauseModal() {
    var body = '<form class=\"form\" data-form=\"pause\" id=\"pauseForm\">' +
      '<div class=\"field\"><span>' + t('pauseReason') + '</span>' +
      '<textarea name=\"reason\" required maxlength=\"200\" placeholder=\"' + t('pauseReasonPh') + '\"></textarea></div>' +
      '<p class=\"hint\">' + t('pauseHint') + '</p>' +
      '</form>';
    openModal({
      title: t('pauseTitle'),
      body: body,
      footer: '<button class=\"btn\" data-close type=\"button\">' + t('cancel') + '</button>' +
        '<button class=\"btn btn-danger\" type=\"submit\" form=\"pauseForm\">' + t('pauseApply') + '</button>'
    });
  }

  function openLevelUp(params) {
    var p = Core.state.player;
    openModal({
      cls: 'levelup',
      title: '',
      body: '<div class="levelup-rays"></div>' +
        '<p class="lvl-kicker">[' + t('system') + ']</p>' +
        '<div class="lvl-big">' + t('levelUpT') + '</div>' +
        '<div class="lvl-num">LV ' + p.level + '</div>' +
        '<p class="lvl-desc">' + t('levelUp', { n: p.level }) + '</p>',
      footer: '<button class="btn btn-primary btn-block" data-close type="button">' + t('continue') + '</button>'
    });
  }

  function openOnboarding() {
    var body = '<p class="muted small" style="margin-bottom:14px">' + t('firstBoot') + '</p>' +
      '<form class="form" data-form="name" id="onboardForm">' +
      '<div class="field"><span>' + t('hunterName') + '</span>' +
      '<input name="name" maxlength="24" placeholder="' + t('namePh') + '" required></div>' +
      '</form>';
    openModal({
      title: t('appName') + ' — ' + t('appTag'),
      body: body,
      footer: '<button class="btn btn-primary" type="submit" form="onboardForm">' + t('start') + '</button>'
    });
  }

  /* ---------------- actions ---------------- */
  function noteValue(id) {
    var input = document.querySelector('[data-note="' + id + '"]');
    return input ? input.value : null;
  }

  function handleAction(str) {
    var parts = str.split(':');
    var a = parts[0];

    if (a === 'quest') {
      var act = parts[1];
      var id = parts.slice(2).join(':');
      if (act === 'new') openQuestModal(null);
      else if (act === 'edit') openQuestModal(id);
      else if (act === 'del') confirmDialog('deleteQuestQ', 'deleteQuestD', function () { Core.deleteQuest(id); });
      else if (act === 'timer') {
        if (Core.timerRunning(Core.getQuest(id))) Core.pauseQuestTimer(id);
        else Core.startQuestTimer(id);
      } else if (act === 'validate') {
        Core.validateQuest(id, noteValue(id));
      }
      return;
    }
    if (a === 'lang') { Core.setLang(parts[1]); return; }
    if (a === 'pause') {
      if (parts[1] === 'open') openPauseModal();
      return;
    }
    if (a === 'boss') {
      if (parts[1] === 'add') Core.addBossProgress(1);
      return;
    }
    if (a === 'sound') { Core.setSound(!Core.state.sound); return; }
    if (a === 'data') {
      if (parts[1] === 'export') exportData();
      else if (parts[1] === 'import') els.importFile.click();
      else if (parts[1] === 'reset') confirmDialog('resetQ', 'resetD', function () { Core.resetAll(); setView('status'); });
      else if (parts[1] === 'install') installApp();
      return;
    }
  }

  function exportData() {
    try {
      var blob = new Blob([Core.exportJSON()], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'system-backup-' + Core.dateKey() + '.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
      toast('ok', t('exportOk'));
    } catch (e) {
      toast('warn', t('importErr'));
    }
  }

  function installApp() {
    if (window.__deferredPrompt) {
      window.__deferredPrompt.prompt();
      window.__deferredPrompt = null;
    } else {
      openModal({
        title: t('installBtn'),
        body: '<p class="muted small">' + t('installHint') + '</p>',
        footer: '<button class="btn btn-primary" data-close type="button">' + t('close') + '</button>'
      });
    }
  }

  /* ---------------- forms handling ---------------- */
  function handleForm(form) {
    var fd = new FormData(form);
    var kind = form.dataset.form;

    if (kind === 'quest') {
      var data = {
        title: (fd.get('title') || '').trim(),
        desc: (fd.get('desc') || '').trim(),
        estimatedMinutes: parseInt(fd.get('minutes'), 10) || 0,
        stat: fd.get('stat'),
        difficulty: fd.get('difficulty'),
        core: fd.get('core') === '1',
        dueTime: fd.get('dueTime') || null
      };
      if (!data.title) return;
      var id = fd.get('id');
      var res = id ? Core.updateQuest(id, data) : Core.addQuest(data);
      if (res.ok) closeModal();
      return;
    }
    if (kind === 'name') {
      Core.setName(fd.get('name') || '');
      closeModal();
      return;
    }
    if (kind === 'reset') {
      Core.setResetTime(fd.get('resetTime') || '');
      return;
    }
    if (kind === 'pause') {
      var r = Core.emergencyPause(fd.get('reason') || '');
      if (r.ok) closeModal();
      return;
    }
  }

  /* ---------------- timers ---------------- */
  function updateTimers() {
    Core.dailies().forEach(function (q) {
      if (!q.timerStart) return;
      var total = Math.max(1, q.estimatedMinutes * 60);
      var tracked = Core.trackedSec(q);
      var need = Core.requiredSec(q);
      var row = document.querySelector('[data-tq="' + q.id + '"]');
      var fill = document.querySelector('[data-tqb="' + q.id + '"] .bar > i');
      if (row) {
        row.textContent = mmss(tracked) + ' / ' + mmss(need);
      }
      if (fill) fill.style.width = Math.min(100, tracked / total * 100) + '%';
    });
  }

  /* ---------------- bind ---------------- */
  function bind() {
    document.addEventListener('click', function (e) {
      var nav = e.target.closest('[data-nav]');
      if (nav) { setView(nav.dataset.nav); return; }
      var act = e.target.closest('[data-action]');
      if (!act) return;
      var action = act.dataset.action;
      if (!action) return;
      e.preventDefault();
      handleAction(action);
    });

    document.addEventListener('submit', function (e) {
      var form = e.target.closest('[data-form]');
      if (!form) return;
      e.preventDefault();
      handleForm(form);
    });

    document.addEventListener('input', function (e) {
      var input = e.target.closest('[data-note]');
      if (!input) return;
      Core.setNote(input.dataset.note, input.value, true);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeModal();
    });

    els.langBtn.addEventListener('click', function () {
      Core.setLang(Core.state.lang === 'ar' ? 'en' : 'ar');
    });

    els.importFile.addEventListener('change', function () {
      var file = this.files && this.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          Core.importJSON(String(reader.result));
          toast('ok', t('importOk'));
        } catch (err) {
          toast('warn', t('importErr'));
        }
      };
      reader.readAsText(file);
      this.value = '';
    });
  }

  /* ---------------- init ---------------- */
  function init() {
    els.view = document.getElementById('view');
    els.nav = document.getElementById('nav');
    els.toasts = document.getElementById('toasts');
    els.modalRoot = document.getElementById('modalRoot');
    els.hudLevel = document.getElementById('hudLevel');
    els.hudStreak = document.getElementById('hudStreak');
    els.langBtn = document.getElementById('langBtn');
    els.importFile = document.getElementById('importFile');

    buildNav();
    bind();
    Core.on(render);
    render();

    if (!Core.state.player.name && Core.state.player.created === Core.dateKey()) {
      setTimeout(openOnboarding, 500);
    }

    timerHandle = setInterval(function () {
      if (Core.tick()) { render(); return; }
      updateTimers();
    }, 1000);
  }

  return { init: init, render: render, setView: setView, toast: toast, closeModal: closeModal };
})();
