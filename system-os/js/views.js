/* ============================================================
   Views — HTML builders for rules v3.
   No arithmetic beyond formatting: totals come from Rules / Core.
   ============================================================ */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function fmt(n) {
  return Number(n || 0).toLocaleString('en-US');
}

function fmtDate(k) {
  if (!k) return '';
  var d = new Date(k + 'T00:00:00');
  var loc = currentLang() === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB';
  return d.toLocaleDateString(loc, { day: 'numeric', month: 'short' });
}

function mmss(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  var m = Math.floor(sec / 60);
  var s = sec % 60;
  var p = function (n) { return (n < 10 ? '0' : '') + n; };
  return m + ':' + p(s);
}

function bar(pct, cls) {
  return '<div class="bar ' + (cls || '') + '"><i style="width:' + Math.max(0, Math.min(100, pct)) + '%"></i></div>';
}

function barLabel(label, value, pct, cls) {
  return '<div class="bar-line">' +
    '<div class="bar-label"><span>' + label + '</span><span class="v">' + value + '</span></div>' +
    bar(pct, cls) + '</div>';
}

function dayChip() {
  var p = Core.dayProgress();
  return p.clearedDay
    ? '<span class="chip chip-gold">' + t('dayCleared') + '</span>'
    : '<span class="chip chip-dim">' + t('dayNotCleared') + '</span>';
}

var Views = (function () {
  'use strict';

  var DIFF_SHORT = { easy: 'diffEasyShort', normal: 'diffNormalShort', hard: 'diffHardShort' };

  /* ---------------- shared blocks ---------------- */
  function budgetPanel() {
    var used = Core.budgetUsed();
    var max = Rules.BUDGET_MIN;
    var left = Math.max(0, max - used);
    var pct = max ? used / max * 100 : 0;
    var cls = pct >= 100 ? 'full' : (pct >= 80 ? 'near' : '');
    return '<section class="panel budget-panel">' +
      '<div class="sec-head"><h2>' + t('timeBudget') + '</h2><span class="rule"></span>' +
      '<span class="count">' + t('budgetOf', { used: used, max: max }) + '</span></div>' +
      bar(pct, 'budget ' + cls) +
      '<div class="budget-foot">' +
      '<span class="' + (left ? '' : 'danger-text') + '">' + (left ? t('budgetLeftShort', { n: left }) : t('budgetFull')) + '</span>' +
      '<span>' + t('potentialXp', { xp: Core.dayPotential() }) + '</span>' +
      '</div></section>';
  }

  function tomorrowPanel() {
    var list = Core.queued();
    if (!list.length) return '';
    var used = Core.projectedBudget();
    var max = Rules.BUDGET_MIN;
    var pct = max ? used / max * 100 : 0;
    var cls = pct >= 100 ? 'full' : (pct >= 80 ? 'near' : '');
    return '<section class="panel budget-panel tomorrow-budget">' +
      '<div class="sec-head"><h2>' + t('tomorrowBudgetTitle') + '</h2><span class="rule"></span>' +
      '<span class="count">' + t('budgetOf', { used: used, max: max }) + '</span></div>' +
      bar(pct, 'budget ' + cls) +
      '<div class="budget-foot"><span>' + t('tomorrowHint') + '</span>' +
      '<span>' + t('queuedCount', { n: list.length }) + '</span></div></section>';
  }

  function statRow(key) {
    var icon = key.slice(0, 2).toUpperCase();
    var hint = 'statHint' + key.charAt(0).toUpperCase() + key.slice(1);
    return '<div class="stat-row">' +
      '<span class="stat-ico">' + icon + '</span>' +
      '<div class="stat-info"><b>' + t(Rules.STAT_LABELS[key]) + '</b><small>' + t(hint) + '</small></div>' +
      '<span class="stat-val">' + (Core.state.stats[key] || 0) + '</span>' +
      '</div>';
  }

  function bossPanel() {
    var b = Core.boss();
    if (!b) return '';
    var pct = Rules.bossProgressPct(b.progress, b.target);
    var title = b.titleKey ? t(b.titleKey) : (b.title || t('bossTitle'));
    var reward = b.reward || Rules.BOSS_REWARD;
    var statusTag = b.cleared ? '<span class=\"chip chip-gold\">' + t('bossCleared') + '</span>' :
      (b.failed ? '<span class=\"chip chip-danger\">' + t('bossFailed') + '</span>' : '');
    return '<section class=\"panel\">' +
      '<div class=\"sec-head\"><h2>' + title + '</h2><span class=\"rule\"></span>' +
      '<span class=\"count\">' + b.progress + ' / ' + b.target + '</span></div>' +
      bar(pct, 'boss') +
      '<div class=\"budget-foot\">' +
      '<span>' + t('bossProgress', { a: b.progress, b: b.target }) + '</span>' +
      '<span>' + t('bossReward', { xp: reward }) + '</span>' +
      '</div>' + statusTag +
      '</section>';
  }

  function miniQuest(q) {
    var done = Core.isDone(q);
    var pen = q.penalty ? '<span class="chip chip-danger">' + t('penaltyBadge') + '</span>' : '';
    return '<li class="' + (done ? 'is-done' : '') + '">' +
      '<span class="tick ' + (done ? 'is-done' : '') + '" aria-hidden="true">✓</span>' +
      '<span class="mq-name">' + esc(Core.questName(q)) + '</span>' +
      pen +
      '<span class="mq-meta">' + q.estimatedMinutes + ' ' + t('minUnit') + ' · +' + Rules.questXp(q.estimatedMinutes, q.difficulty) + '</span>' +
      '</li>';
  }

  function penaltyBanner() {
    var pen = Core.activePenalty();
    if (!pen) return '';
    return '<section class="panel warn-panel">' +
      '<div class="warn-head"><span class="warn-dot"></span><h2>' + t('penaltyBannerTitle') + '</h2></div>' +
      '<p class="muted small">' + t('penaltyBannerText') + '</p>' +
      '</section>';
  }

  function pauseBanner() {
    if (!Core.pausedToday()) return '';
    return '<section class="panel pause-panel">' +
      '<div class="warn-head"><span class="pause-dot"></span><h2>' + t('pauseActive') + '</h2></div>' +
      '<p class="muted small">' + t('pauseActiveText') + '</p>' +
      '</section>';
  }

  /* ---------------- status ---------------- */
  function status() {
    var S = Core.state;
    var p = S.player;
    var need = Core.levelXp();
    var pctExp = need ? Math.round(p.exp / need * 100) : 0;
    var prog = Core.dayProgress();
    var quests = Core.dailies();

    var hero = '<section class="hero panel">' +
      '<div class="hero-top">' +
      '<div class="avatar"><span>' + p.level + '</span></div>' +
      '<div class="hero-id">' +
      '<h1 class="hunter-name">' + esc(p.name || t('emptyHunter')) + '</h1>' +
      '<div class="hero-tags">' +
      '<span class="chip chip-cyan">' + t('levelShort') + ' ' + p.level + '</span>' +
      '<span class="chip chip-gold">' + t('rankLabel') + ' ' + Core.rank() + '</span>' +
      '<span class="chip chip-fire">' + t('streakLabel') + ' ' + Core.streak() + '</span>' +
      dayChip() +
      '</div>' +
      '<div class="bars">' +
      barLabel(t('expShort'), t('xpToNext', { a: fmt(p.exp), b: fmt(need) }), pctExp, 'exp') +
      '</div></div></div>' +
      '</section>';

    var stats = '<section class="panel"><div class="sec-head"><h2>' + t('attributes') + '</h2><span class="rule"></span></div>' +
      Rules.STATS.map(statRow).join('') + '</section>';

    var today = '<section class="panel">' +
      '<div class="sec-head"><h2>' + t('todayProgress') + '</h2><span class="rule"></span>' +
      '<span class="count">' + t('clearedOf', { done: prog.cleared, total: prog.total }) + '</span>' +
      '<button class="btn btn-sm btn-ghost" data-nav="quests" type="button">' + t('viewAll') + '</button></div>' +
      (quests.length ? '<ul class="mini-quests">' + quests.map(miniQuest).join('') + '</ul>'
        : '<div class="empty"><span class="glyph">◇</span>' + t('noQuests') + '</div>') +
      '</section>';

    return pauseBanner() + penaltyBanner() + hero + budgetPanel() + bossPanel() + stats + today;
  }

  /* ---------------- quest card ---------------- */
  function questCard(q, mode) {
    var locked = mode === 'today';
    var queued = mode === 'tomorrow';
    var done = !queued && Core.isDone(q);
    var tracked = queued ? 0 : Core.trackedSec(q);
    var needSec = Core.requiredSec(q);
    var total = Math.max(1, q.estimatedMinutes * 60);
    var pct = tracked / total * 100;
    var running = !queued && Core.timerRunning(q);
    var meterCls = tracked >= needSec ? 'proof-ok' : '';
    var coreBadge = q.core ? '<span class="core-badge">' + t('coreBadge') + '</span>' : '';
    var penBadge = q.penalty ? '<span class="core-badge penalty-badge">' + t('penaltyBadge') + '</span>' : '';
    var queuedBadge = queued ? '<span class="core-badge queued-badge">' + t('queuedBadge') + '</span>' : '';
    var late = !queued && !done && Core.isLate(q);

    var actions = queued
      ? '<button class="btn btn-sm btn-ghost" data-action="quest:edit:' + q.id + '" type="button">' + t('edit') + '</button>' +
        '<button class="btn btn-sm btn-ghost danger-text" data-action="quest:del:' + q.id + '" type="button">' + t('delete') + '</button>'
      : '';

    var body = queued
      ? '<p class="q-desc">' + t('queuedHint') + '</p>'
      : '<div class="quest-timer" data-tqb="' + q.id + '">' + bar(pct, 'slim ' + meterCls) + '</div>' +
        '<div class="qt-row">' +
        '<span class="qt-text" dir="ltr" data-tq="' + q.id + '">' + mmss(tracked) + ' / ' + mmss(needSec) + '</span>' +
        '<span class="qt-btns">' +
        (done ? '<span class="chip chip-gold">' + t('xpTag', { xp: Core.previewXp(q, q.late) }) + '</span>' :
          '<button class="btn btn-sm' + (running ? '' : ' btn-primary') + '" data-action="quest:timer:' + q.id + '" type="button">' +
          (running ? t('btnPause') : t('btnStart')) + '</button>' +
          '<button class="btn btn-sm" data-action="quest:validate:' + q.id + '" type="button">' + t('btnValidate') + '</button>') +
        '</span></div>' +
        (done ? (q.note ? '<p class="q-proof">“' + esc(q.note) + '”</p>' : '') :
          '<input class="q-note" data-note="' + q.id + '" maxlength="140" value="' + esc(q.note) + '" placeholder="' + t('notePh') + '" aria-label="' + t('noteLabel') + '">');

    return '<article class="quest-card ' + (done ? 'done ' : '') + (q.core ? 'is-core ' : '') +
      (q.penalty ? 'is-penalty ' : '') + (queued ? 'is-queued' : '') + '">' +
      '<span class="q-check ' + (done ? 'on' : '') + '" aria-hidden="true">✓</span>' +
      '<div class="q-main">' +
      '<div class="q-head"><h3>' + esc(Core.questName(q)) + '</h3>' +
      '<div class="q-tags">' + penBadge + queuedBadge + coreBadge +
      '<span class="diff diff-' + q.difficulty + '">' + t(DIFF_SHORT[q.difficulty] || 'diffNormalShort') + '</span></div></div>' +
      (q.desc ? '<p class="q-desc">' + esc(q.desc) + '</p>' : '') +
      '<div class="q-chips">' +
      '<span class="chip chip-cyan">' + t(Rules.STAT_LABELS[q.stat]) + '</span>' +
      '<span class="chip chip-dim">' + q.estimatedMinutes + ' ' + t('minUnit') + '</span>' +
      '<span class="chip chip-gold">' + t('xpPreview', { xp: Rules.questXp(q.estimatedMinutes, q.difficulty) }) + '</span>' +
      (running ? '<span class="chip chip-fire">' + t('timerRunningTag') + '</span>' : '') +
      (late ? '<span class="chip chip-danger">' + t('lateTag') + '</span>' : '') +
      (locked ? '<span class="chip chip-dim">' + t('lockBadge') + '</span>' : '') +
      '</div>' +
      body +
      (actions ? '<div class="q-actions">' + actions + '</div>' : '') +
      '</div></article>';
  }

  function quests() {
    var list = Core.dailies();
    var pend = Core.queued();
    return '<div class="page-head"><div><h1>' + t('questsTitle') + '</h1><p>' + t('questsSub') + '</p></div>' +
      '<div class="page-actions"><button class="btn btn-primary" data-action="quest:new" type="button">+ ' + t('newQuest') + '</button></div></div>' +
      budgetPanel() +
      penaltyBanner() +
      pauseBanner() +
      '<section class="panel"><div class="sec-head"><h2>' + t('todayLocked') + '</h2><span class="rule"></span>' +
      '<span class="count">' + list.length + ' / ' + Rules.MAX_DAILIES + '</span></div>' +
      '<p class="hint" style="margin-bottom:12px">' + t('lockNote') + '</p>' +
      (list.length ? '<div class="quest-list">' + list.map(function (q) { return questCard(q, 'today'); }).join('') + '</div>'
        : '<div class="empty"><span class="glyph">◇</span>' + t('noQuests') + '<br><small>' + t('noQuestsSub') + '</small></div>') +
      '</section>' +
      '<section class="panel" style="margin-top:14px"><div class="sec-head"><h2>' + t('tomorrowTitle') + '</h2><span class="rule"></span>' +
      '<span class="count">' + pend.length + '</span></div>' +
      (pend.length ? '<div class="quest-list">' + pend.map(function (q) { return questCard(q, 'tomorrow'); }).join('') + '</div>'
        : '<div class="empty"><span class="glyph">+</span>' + t('emptyTomorrow') + '</div>') +
      '</section>' +
      tomorrowPanel();
  }

  function longChart() {
    var S = Core.state;
    var hist = S.history;
    var days = [];
    var max = 1;
    var n = Rules.CHART_LONG || 30;
    for (var i = n - 1; i >= 0; i--) {
      var k = Core.addDays(Core.dateKey(), -i);
      var v = (hist[k] && hist[k].xp) || 0;
      if (v > max) max = v;
      days.push({ k: k, v: v });
    }
    var loc = currentLang() === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB';
    var chart = days.map(function (d) {
      var h = Math.round(d.v / max * 100);
      return '<div class="chart-col ' + (d.v ? '' : 'zero') + '" title="' + fmtDate(d.k) + ' · ' + d.v + ' XP">' +
        '<div class="chart-bar" style="height:' + Math.max(2, h) + '%"></div></div>';
    }).join('');
    return '<section class="panel" style="margin-top:14px"><div class="sec-head"><h2>' + t('last30') + '</h2><span class="rule"></span></div>' +
      '<div class="chart chart-wide">' + chart + '</div></section>';
  }

  /* ---------------- records ---------------- */
  function records() {
    var S = Core.state;
    var hist = S.history;
    var keys = Object.keys(hist);
    var clearedDays = keys.filter(function (k) { return hist[k].cleared; }).length;

    var days = [];
    var max = 1;
    for (var i = 13; i >= 0; i--) {
      var k = Core.addDays(Core.dateKey(), -i);
      var v = (hist[k] && hist[k].xp) || 0;
      if (v > max) max = v;
      days.push({ k: k, v: v });
    }
    var loc = currentLang() === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB';
    var chart = days.map(function (d) {
      var h = Math.round(d.v / max * 100);
      var wd = new Date(d.k + 'T00:00:00').toLocaleDateString(loc, { weekday: 'narrow' });
      return '<div class="chart-col ' + (d.v ? '' : 'zero') + '" title="' + fmtDate(d.k) + ' · ' + d.v + ' XP">' +
        '<span class="chart-val">' + (d.v || '') + '</span>' +
        '<div class="chart-bar" style="height:' + Math.max(3, h) + '%"></div>' +
        '<span class="chart-lbl">' + esc(wd) + '</span></div>';
    }).join('');

    var rows = keys.sort().reverse().filter(function (k) { return k !== Core.dateKey(); }).slice(0, 12).map(function (kk) {
      var h = hist[kk];
      var tag = h.paused ? 'chip-cyan' : (h.cleared ? 'chip-gold' : 'chip-dim');
      var tagText = h.paused ? t('pausedTag') : (h.cleared ? t('clearedTag') : t('failedTag'));
      return '<div class="hist-row">' +
        '<span class="hist-date">' + fmtDate(kk) + '</span>' +
        '<span class="hist-xp">' + t('xpTag', { xp: fmt(h.xp) }) + '</span>' +
        (h.loss ? '<span class="hist-loss">−' + fmt(h.loss) + '</span>' : '') +
        '<span class="hist-done">' + h.done + '/' + h.total + '</span>' +
        '<span class="chip ' + tag + '">' + tagText + '</span>' +
        '</div>';
    }).join('');

    return '<div class="page-head"><div><h1>' + t('recordsTitle') + '</h1><p>' + t('appTag') + '</p></div></div>' +
      '<div class="kpi-grid">' +
      '<div class="kpi"><span>' + t('kpiTotalXp') + '</span><b>' + fmt(Core.totalXp()) + '</b></div>' +
      '<div class="kpi"><span>' + t('levelLabel') + '</span><b>' + S.player.level + '</b></div>' +
      '<div class="kpi"><span>' + t('kpiClearedDays') + '</span><b>' + clearedDays + '</b></div>' +
      '<div class="kpi"><span>' + t('kpiStreak') + '</span><b>' + Core.streak() + '</b></div>' +
      '<div class="kpi"><span>' + t('kpiBestStreak') + '</span><b>' + Core.bestStreak() + '</b></div>' +
      '</div>' +
      '<section class="panel" style="margin-top:14px"><div class="sec-head"><h2>' + t('last14') + '</h2><span class="rule"></span></div>' +
      '<div class="chart">' + chart + '</div>' +
      (Core.totalXp() ? '' : '<p class="hint" style="margin-top:8px">' + t('chartEmpty') + '</p>') + '</section>' +
      longChart() +
      '<section class="panel" style="margin-top:14px"><div class="sec-head"><h2>' + t('historyTitle') + '</h2><span class="rule"></span></div>' +
      (rows ? '<div class="hist-list">' + rows + '</div>' : '<p class="hint">' + t('historyNone') + '</p>') +
      '</section>';
  }

  /* ---------------- settings ---------------- */
  function settings() {
    var S = Core.state;
    var rules = ['ruleBudget', 'ruleXp', 'ruleProof', 'ruleLate', 'ruleFail', 'ruleLock'].map(function (k) {
      return '<li>' + t(k) + '</li>';
    }).join('');
    var pauseUsed = Core.pauseUsedThisMonth();
    var pauseBlocked = pauseUsed || Core.pausedToday();

    return '<div class="page-head"><div><h1>' + t('settingsTitle') + '</h1><p>' + t('appTag') + '</p></div></div>' +
      '<div class="grid two">' +
      '<section class="panel"><div class="sec-head"><h2>' + t('hunterName') + '</h2><span class="rule"></span></div>' +
      '<form class="form" data-form="name" id="nameForm">' +
      '<div class="field">' +
      '<input name="name" maxlength="24" value="' + esc(S.player.name) + '" placeholder="' + t('namePh') + '"></div>' +
      '<button class="btn btn-primary" type="submit">' + t('save') + '</button>' +
      '</form></section>' +
      '<section class="panel"><div class="sec-head"><h2>' + t('language') + '</h2><span class="rule"></span></div>' +
      '<div class="set-group">' +
      '<div class="set-row"><div class="lbl"><b>' + t('language') + '</b></div>' +
      '<div class="seg"><button class="' + (S.lang === 'ar' ? 'on' : '') + '" data-action="lang:ar" type="button">' + t('arabic') + '</button>' +
      '<button class="' + (S.lang === 'en' ? 'on' : '') + '" data-action="lang:en" type="button">' + t('english') + '</button></div></div>' +
      '<div class="set-row"><div class="lbl"><b>' + t('sound') + '</b><small>' + t('soundHint') + '</small></div>' +
      '<button class="switch ' + (S.sound ? 'on' : '') + '" data-action="sound" type="button" aria-label="' + t('sound') + '"></button></div>' +
      '</div></section>' +
      '</div>' +
      '<div class="grid two" style="margin-top:14px">' +
      '<section class="panel"><div class="sec-head"><h2>' + t('cycleTitle') + '</h2><span class="rule"></span></div>' +
      '<form class="form" data-form="reset" id="resetForm">' +
      '<div class="field"><span>' + t('resetTimeLabel') + '</span>' +
      '<input type="time" name="resetTime" value="' + esc(Core.resetTime()) + '"></div>' +
      '<p class="hint">' + t('resetTimeHint') + '</p>' +
      '<button class="btn" type="submit">' + t('save') + '</button>' +
      '</form>' +
      '<div class="set-row" style="margin-top:14px"><div class="lbl"><b>' + t('failsWindow') + '</b></div>' +
      '<span class="count">' + Core.failsIn7() + ' / ' + Rules.DEMOTE_FAILS + '</span></div>' +
      '<div class="set-row"><div class="lbl"><b>' + t('pauseTitle') + '</b><small>' + t('pauseHint') + '</small></div>' +
      '<button class="btn btn-sm' + (pauseBlocked ? '' : ' btn-danger') + '" data-action="pause:open" type="button"' +
      (pauseBlocked ? ' disabled' : '') + '>' + (pauseUsed ? t('pauseThisMonth') : t('pauseOpen')) + '</button></div>' +
      '</section>' +
      '<section class="panel"><div class="sec-head"><h2>' + t('aboutTitle') + '</h2><span class="rule"></span></div>' +
      '<ul class="rule-list">' + rules + '</ul></section>' +
      '</div>' +
      '<div class="grid two" style="margin-top:14px">' +
      '<section class="panel"><div class="sec-head"><h2>' + t('dataTitle') + '</h2><span class="rule"></span></div>' +
      '<div class="btn-row">' +
      '<button class="btn" data-action="data:export" type="button">' + t('exportBtn') + '</button>' +
      '<button class="btn" data-action="data:import" type="button">' + t('importBtn') + '</button>' +
      '<button class="btn btn-danger" data-action="data:reset" type="button">' + t('resetBtn') + '</button>' +
      '</div>' +
      '<p class="hint" style="margin-top:10px">' + t('storageNote') + '</p>' +
      '<button class="btn btn-ghost btn-block" style="margin-top:10px" data-action="data:install" type="button">' + t('installBtn') + '</button>' +
      '</section>' +
      '<section class="panel"><div class="sec-head"><h2>' + t('demotionTitle') + '</h2><span class="rule"></span></div>' +
      '<p class="hint">' + t('demotionText', { n: Rules.DEMOTE_FAILS, days: Rules.DEMOTE_WINDOW }) + '</p>' +
      (Core.demotionQueued() ? '<p class="danger-text small" style="margin-top:8px">' + t('demotionQueuedText') + '</p>' : '') +
      '</section></div>';
  }

  return { status: status, quests: quests, records: records, settings: settings };
})();
