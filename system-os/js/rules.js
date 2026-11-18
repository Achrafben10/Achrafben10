/* ============================================================
   Rules — pure functions only. No state, no DOM, no storage.
   Every number comes from CONFIG.
   Loaded before core.js (browser) and inside the test sandbox.
   ============================================================ */
var Rules = (function () {
  'use strict';

  var C = (typeof CONFIG !== 'undefined') ? CONFIG
    : (typeof require === 'function' ? require('./config.js') : {});

  /* ---------- constants (read once from CONFIG) ---------- */
  var BUDGET_MIN = C.budgetMinutes;
  var MIN_DAILIES = C.minDailies;
  var MAX_DAILIES = C.maxDailies;
  var CORE_MAX = C.maxCore;
  var MIN_QUEST_MIN = C.minQuestMinutes;

  var BASE_XP = C.baseXp;
  var GROWTH = C.levelGrowth;
  var PROOF_RATIO = C.proofRatio;
  var LATE_RATIO = C.lateRatio;
  var MULT = C.multipliers;

  var FAIL_RATIO = C.fail.xpRatio;
  var PENALTY_MIN = C.fail.penaltyQuestMinutes;
  var DEMOTE_FAILS = C.demotion.fails;
  var DEMOTE_WINDOW = C.demotion.windowDays;
  var PAUSE_RATIO = C.pause.xpRatio;
  var RESET_DEFAULT = C.reset.time;

  var RANKS = (C.ranks && Array.isArray(C.ranks.list)) ? C.ranks.list.slice() : ['E','D','C','B','A','S'];
  var PROMOTE_CLEARED = (C.ranks && C.ranks.promoteClearedDays) || 5;
  var PROMOTE_MAX_FAILS = (C.ranks && (C.ranks.promoteMaxFails != null)) ? C.ranks.promoteMaxFails : 0;
  var JUDGEMENT_DAY = (C.weekly && C.weekly.judgementDay != null) ? C.weekly.judgementDay : 0;
  var ESCALATION_DAYS = (C.escalation && C.escalation.clearedDays) || 7;
  var ESCALATION_BONUS = (C.escalation && C.escalation.bonus != null) ? C.escalation.bonus : 0.1;

  var BOSS_TARGET = (C.boss && C.boss.target) || 10;
  var BOSS_REWARD = (C.boss && C.boss.rewardXp) || 500;
  var BOSS_FAIL_XP = (C.boss && C.boss.failXp) || 200;
  var CHART_SHORT = (C.charts && C.charts.shortDays) || 14;
  var CHART_LONG = (C.charts && C.charts.longDays) || 30;

  /* ---------- small date helpers (pure) ---------- */
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }

  function parseTime(hm) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(hm == null ? '' : hm).trim());
    if (!m) return null;
    var h = parseInt(m[1], 10), mi = parseInt(m[2], 10);
    if (h > 23 || mi > 59) return null;
    return h * 60 + mi;
  }

  function isTime(hm) { return parseTime(hm) !== null; }

  function parseKey(k) {
    var p = String(k || '').split('-');
    if (p.length !== 3) return null;
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    return isNaN(d.getTime()) ? null : d;
  }

  function addDays(k, n) {
    var d = parseKey(k);
    if (!d) return k;
    d.setDate(d.getDate() + n);
    return ymd(d);
  }

  function diffDays(a, b) {
    var da = parseKey(a), db = parseKey(b);
    if (!da || !db) return 0;
    return Math.round((db - da) / 86400000);
  }

  /* Logical day for a timestamp and a reset time. */
  function logicalDay(nowMs, hm) {
    var d = new Date(nowMs);
    var reset = parseTime(hm);
    if (reset === null) reset = parseTime(RESET_DEFAULT) || 0;
    if (d.getHours() * 60 + d.getMinutes() < reset) d.setDate(d.getDate() - 1);
    return ymd(d);
  }

  /* First reset boundary strictly after nowMs. */
  function nextResetAt(nowMs, hm) {
    var d = new Date(nowMs);
    var reset = parseTime(hm);
    if (reset === null) reset = parseTime(RESET_DEFAULT) || 0;
    var target = new Date(d.getFullYear(), d.getMonth(), d.getDate(),
      Math.floor(reset / 60), reset % 60, 0, 0);
    if (target.getTime() <= nowMs) target.setDate(target.getDate() + 1);
    return target.getTime();
  }

  /* ---------- xp ---------- */
  function mult(difficulty) {
    return Object.prototype.hasOwnProperty.call(MULT, difficulty) ? MULT[difficulty] : MULT.normal;
  }

  function levelXp(level) {
    var lv = Math.max(1, Math.floor(level || 1));
    return Math.round(BASE_XP * Math.pow(GROWTH, lv - 1));
  }

  function questXp(minutes, difficulty) {
    var m = Math.max(1, Math.round(minutes || 0));
    return Math.round(m * mult(difficulty));
  }

  function awardXp(minutes, difficulty, late) {
    var xp = questXp(minutes, difficulty);
    if (late) xp = Math.max(1, Math.round(xp * LATE_RATIO));
    return xp;
  }

  /* ---------- proof of work ---------- */
  function requiredSec(minutes) {
    return Math.ceil(Math.max(1, Math.round(minutes || 0)) * 60 * PROOF_RATIO);
  }

  var MIN_PROOF_SEC = requiredSec(MIN_QUEST_MIN);

  function proofOk(trackedSec, minutes, note) {
    var need = requiredSec(minutes);
    var tracked = Math.max(0, Math.floor(trackedSec || 0));
    var text = String(note == null ? '' : note).trim();
    if (tracked < need) return { ok: false, code: 'time', need: need, tracked: tracked };
    if (!text.length) return { ok: false, code: 'note', need: need, tracked: tracked };
    return { ok: true, code: 'ok', need: need, tracked: tracked };
  }

  /* ---------- daily quests / budget ---------- */
  function isDaily(q) {
    return !!q && (q.type === 'daily' || q.type === undefined);
  }

  function isActiveOn(q, dayKey) {
    if (!isDaily(q)) return false;
    if (!dayKey) return true;
    return !q.activeFrom || q.activeFrom <= dayKey;
  }

  function isQueuedOn(q, dayKey) {
    return isDaily(q) && !!q.activeFrom && !!dayKey && q.activeFrom > dayKey;
  }

  function activeDailies(quests, dayKey) {
    return (quests || []).filter(function (q) { return isActiveOn(q, dayKey); });
  }

  function queuedDailies(quests, dayKey) {
    return (quests || []).filter(function (q) { return isQueuedOn(q, dayKey); });
  }

  function budgetUsed(quests, dayKey) {
    return activeDailies(quests, dayKey).reduce(function (n, q) {
      return n + Math.max(0, Math.round(q.estimatedMinutes || 0));
    }, 0);
  }

  function budgetLeft(quests, dayKey) {
    return BUDGET_MIN - budgetUsed(quests, dayKey);
  }

  /* Can another daily of `minutes` be scheduled in this list? */
  function canAddDaily(list, minutes) {
    var items = (list || []).filter(isDaily);
    var m = Math.round(minutes || 0);
    if (m < MIN_QUEST_MIN) return { ok: false, code: 'minutes', min: MIN_QUEST_MIN };
    if (items.length >= MAX_DAILIES) return { ok: false, code: 'max', limit: MAX_DAILIES };
    var used = budgetUsed(items);
    if (used + m > BUDGET_MIN) {
      return { ok: false, code: 'budget', left: BUDGET_MIN - used, over: used + m - BUDGET_MIN };
    }
    return { ok: true, code: 'ok', left: BUDGET_MIN - used - m };
  }

  function canRemoveDaily(list) {
    var n = (list || []).filter(isDaily).length;
    if (n <= MIN_DAILIES) return { ok: false, code: 'min', limit: MIN_DAILIES };
    return { ok: true, code: 'ok' };
  }

  function coreCount(list) {
    return (list || []).filter(isDaily).filter(function (q) { return !!q.core; }).length;
  }

  function canSetCore(list, questId, nextValue) {
    var others = (list || []).filter(isDaily).filter(function (q) {
      return q.id !== questId && q.core;
    }).length;
    var next = others + (nextValue ? 1 : 0);
    if (next > CORE_MAX) return { ok: false, code: 'coreMax', limit: CORE_MAX };
    return { ok: true, code: 'ok' };
  }

  /* ---------- penalty insertion ---------- */
  /* Fit a forced penalty quest into a day: drop the largest non-CORE
     quests until the penalty fits the budget and the 5-quest ceiling. */
  function planWithPenalty(routine, penaltyQuest, budget, maxDailies) {
    var list = (routine || []).slice();
    var cap = maxDailies || MAX_DAILIES;
    var total = budgetUsed(list);
    var extra = Math.round(penaltyQuest.estimatedMinutes || 0);

    while (list.length && (total + extra > (budget || BUDGET_MIN) || list.length >= cap)) {
      var idx = -1, size = -1;
      for (var i = 0; i < list.length; i++) {
        if (!list[i].core && list[i].estimatedMinutes > size) { size = list[i].estimatedMinutes; idx = i; }
      }
      if (idx < 0) break;
      total -= list[idx].estimatedMinutes;
      list.splice(idx, 1);
    }
    list.push(penaltyQuest);
    return list;
  }

  /* ---------- day state ---------- */
  function clearedQuest(q, dayKey) {
    return !!q && q.validatedDay === dayKey && !q.late;
  }

  function clearedCount(quests, dayKey) {
    return activeDailies(quests, dayKey).filter(function (q) {
      return clearedQuest(q, dayKey);
    }).length;
  }

  function dayCleared(quests, dayKey) {
    var list = activeDailies(quests, dayKey);
    if (!list.length) return false;
    return list.every(function (q) { return clearedQuest(q, dayKey); });
  }

  function dayPotentialXp(quests, dayKey) {
    return activeDailies(quests, dayKey).reduce(function (n, q) {
      return n + questXp(q.estimatedMinutes, q.difficulty);
    }, 0);
  }

  /* ---------- failure / demotion / pause ---------- */
  function failXpLoss(potential) {
    return Math.max(0, Math.round((potential || 0) * FAIL_RATIO));
  }

  function pruneFails(fails, dayKey) {
    return (fails || []).filter(function (f) {
      var gap = diffDays(f, dayKey);
      return gap >= 0 && gap < DEMOTE_WINDOW;
    });
  }

  function demotionDue(fails, dayKey) {
    return pruneFails(fails, dayKey).length >= DEMOTE_FAILS;
  }

  function pauseCost(levelRequirement) {
    return Math.max(1, Math.round((levelRequirement || 0) * PAUSE_RATIO));
  }

  /* ---------- ranks ---------- */
  function rankIndex(rank) { return RANKS.indexOf(rank); }
  function nextRank(rank) {
    var i = rankIndex(rank);
    if (i < 0) return RANKS[0];
    if (i >= RANKS.length - 1) return RANKS[RANKS.length - 1];
    return RANKS[i + 1];
  }
  function prevRank(rank) {
    var i = rankIndex(rank);
    if (i <= 0) return RANKS[0];
    return RANKS[i - 1];
  }
  function isJudgementDay(dayKey) {
    var d = parseKey(dayKey);
    if (!d) return false;
    return d.getDay() === JUDGEMENT_DAY;
  }
  function clearedDaysInWindow(history, dayKey, windowDays) {
    var wd = windowDays || 7;
    var count = 0;
    for (var i = 0; i < wd; i++) {
      var k = addDays(dayKey, -i);
      var h = history && history[k];
      if (h && h.cleared) count += 1;
    }
    return count;
  }
  function failsInWindowCount(fails, dayKey, windowDays) {
    var wd = windowDays || 7;
    return (fails || []).filter(function (f) {
      var gap = diffDays(f, dayKey);
      return gap >= 0 && gap < wd;
    }).length;
  }
  function escalationDue(streak) {
    return (streak || 0) > 0 && (streak % ESCALATION_DAYS) === 0;
  }
  function escalationMultiplier(level) {
    return 1 + Math.max(0, Math.round(level || 0)) * ESCALATION_BONUS;
  }

  function bossProgressPct(progress, target) {
    var t = Math.max(1, Math.round(target || BOSS_TARGET));
    return Math.max(0, Math.min(100, Math.round((progress || 0) / t * 100)));
  }

  /* ---------- attributes ---------- */
  var STATS = ['strength', 'intelligence', 'wealth', 'creativity', 'discipline'];
  var STAT_LABELS = {
    strength: 'statStrength',
    intelligence: 'statIntelligence',
    wealth: 'statWealth',
    creativity: 'statCreativity',
    discipline: 'statDiscipline'
  };

  function isStat(key) { return STATS.indexOf(key) >= 0; }

  return {
    BUDGET_MIN: BUDGET_MIN,
    MIN_DAILIES: MIN_DAILIES,
    MAX_DAILIES: MAX_DAILIES,
    CORE_MAX: CORE_MAX,
    MIN_QUEST_MIN: MIN_QUEST_MIN,
    MIN_PROOF_SEC: MIN_PROOF_SEC,
    BASE_XP: BASE_XP,
    GROWTH: GROWTH,
    PROOF_RATIO: PROOF_RATIO,
    LATE_RATIO: LATE_RATIO,
    FAIL_RATIO: FAIL_RATIO,
    PENALTY_MIN: PENALTY_MIN,
    DEMOTE_FAILS: DEMOTE_FAILS,
    DEMOTE_WINDOW: DEMOTE_WINDOW,
    PAUSE_RATIO: PAUSE_RATIO,
    RESET_DEFAULT: RESET_DEFAULT,
    RANKS: RANKS,
    PROMOTE_CLEARED: PROMOTE_CLEARED,
    PROMOTE_MAX_FAILS: PROMOTE_MAX_FAILS,
    JUDGEMENT_DAY: JUDGEMENT_DAY,
    ESCALATION_DAYS: ESCALATION_DAYS,
    ESCALATION_BONUS: ESCALATION_BONUS,
    BOSS_TARGET: BOSS_TARGET,
    BOSS_REWARD: BOSS_REWARD,
    BOSS_FAIL_XP: BOSS_FAIL_XP,
    CHART_SHORT: CHART_SHORT,
    CHART_LONG: CHART_LONG,
    MULT: MULT,
    STATS: STATS,
    STAT_LABELS: STAT_LABELS,

    parseTime: parseTime,
    isTime: isTime,
    addDays: addDays,
    diffDays: diffDays,
    logicalDay: logicalDay,
    nextResetAt: nextResetAt,

    mult: mult,
    levelXp: levelXp,
    questXp: questXp,
    awardXp: awardXp,
    requiredSec: requiredSec,
    proofOk: proofOk,

    isDaily: isDaily,
    isActiveOn: isActiveOn,
    isQueuedOn: isQueuedOn,
    activeDailies: activeDailies,
    queuedDailies: queuedDailies,
    budgetUsed: budgetUsed,
    budgetLeft: budgetLeft,
    canAddDaily: canAddDaily,
    canRemoveDaily: canRemoveDaily,
    coreCount: coreCount,
    canSetCore: canSetCore,
    planWithPenalty: planWithPenalty,

    clearedQuest: clearedQuest,
    clearedCount: clearedCount,
    dayCleared: dayCleared,
    dayPotentialXp: dayPotentialXp,

    failXpLoss: failXpLoss,
    pruneFails: pruneFails,
    demotionDue: demotionDue,
    pauseCost: pauseCost,

    rankIndex: rankIndex,
    nextRank: nextRank,
    prevRank: prevRank,
    isJudgementDay: isJudgementDay,
    clearedDaysInWindow: clearedDaysInWindow,
    failsInWindowCount: failsInWindowCount,
    escalationDue: escalationDue,
    escalationMultiplier: escalationMultiplier,
    bossProgressPct: bossProgressPct,

    isStat: isStat
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Rules;
