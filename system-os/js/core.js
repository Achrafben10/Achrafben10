/* ============================================================
   Core — state v3, quests, lock, fail, penalty, pause.
   All arithmetic lives in Rules; all numbers in CONFIG.
   ============================================================ */
var Core = (function () {
  'use strict';

  var KEY = 'system-os:v2';
  var OLD_KEY = 'system-os:v1';
  var listeners = [];
  var queue = [];
  var S = null;

  /* ---------------- clock ---------------- */
  function now() {
    return (S && S.debug && S.debug.now) ? S.debug.now : Date.now();
  }

  function resetTime() {
    return (S && S.settings && S.settings.resetTime) || CONFIG.reset.time;
  }

  function today() {
    return Rules.logicalDay(now(), resetTime());
  }

  function tomorrow() {
    return Rules.addDays(today(), 1);
  }

  /* ---------------- utilities ---------------- */
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function dateKey(d) {
    if (!d) return today();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function parseKey(k) {
    var p = String(k).split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }

  function addDays(k, n) { return Rules.addDays(k, n); }
  function diffDays(a, b) { return Rules.diffDays(a, b); }

  function uid(p) {
    return (p || 'id') + '_' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
  }

  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

  function nowMinute() {
    var d = new Date(now());
    return d.getHours() * 60 + d.getMinutes();
  }

  function parseHM(hm) { return Rules.parseTime(hm); }

  function notify(kind, text, params) {
    queue.push({ kind: kind, text: text, params: params || {} });
  }

  /* ---------------- schema ---------------- */
  function baseQuest(o) {
    var day = today();
    return Object.assign({
      id: uid('q'),
      type: 'daily',
      title: '',
      titleKey: null,
      desc: '',
      stat: 'discipline',
      difficulty: 'normal',
      estimatedMinutes: CONFIG.minQuestMinutes,
      core: false,
      penalty: false,
      dueTime: null,
      activeFrom: day,

      trackedSec: 0,
      timerStart: 0,
      note: '',
      validatedDay: null,
      validatedAt: 0,
      late: false,

      createdAt: now(),
      dayKey: day,
      streak: 0,
      bestStreak: 0
    }, o || {});
  }

  function seedQuests() {
    var day = today();
    return [
      baseQuest({ titleKey: 'seedWake', stat: 'discipline', difficulty: 'easy', estimatedMinutes: 20, core: true, activeFrom: day }),
      baseQuest({ titleKey: 'seedWorkout', stat: 'strength', difficulty: 'normal', estimatedMinutes: 30, core: true, activeFrom: day }),
      baseQuest({ titleKey: 'seedRead', stat: 'intelligence', difficulty: 'easy', estimatedMinutes: 20, activeFrom: day }),
      baseQuest({ titleKey: 'seedFocus', stat: 'wealth', difficulty: 'hard', estimatedMinutes: 60, activeFrom: day })
    ];
  }

  function blankStats() {
    return { strength: 0, intelligence: 0, wealth: 0, creativity: 0, discipline: 0 };
  }

  function blankBoss(d) {
    return {
      month: String(d).slice(0, 7),
      titleKey: 'bossTitle',
      target: CONFIG.boss.target,
      progress: 0,
      reward: CONFIG.boss.rewardXp,
      cleared: false,
      failed: false,
      awardedDay: null
    };
  }

  function blank() {
    var d = today();
    return {
      schema: 3,
      lang: 'ar',
      sound: true,
      player: {
        name: '',
        level: 1,
        exp: 0,
        streak: 0,
        bestStreak: 0,
        rank: 'E',
        escalationLevel: 0,
        created: d,
        lastDay: d,
        lastPauseMonth: null,
        pausedDay: null,
        fails: [],
        demotionQueued: false
      },
      settings: { resetTime: CONFIG.reset.time },
      stats: blankStats(),
      quests: seedQuests(),
      history: {},
      boss: blankBoss(d),
      debug: { now: null }
    };
  }

  function isDayKey(k) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(k || ''));
  }

  /* Quest shape normaliser, used on load / import / migrate. */
  function normQuest(q) {
    var out = Object.assign({}, baseQuest(), q || {});
    if (!Rules.isStat(out.stat)) out.stat = 'discipline';
    if (!Rules.MULT[out.difficulty]) out.difficulty = 'normal';
    out.estimatedMinutes = clamp(
      Math.round(out.estimatedMinutes || 0) || CONFIG.minQuestMinutes,
      Rules.MIN_QUEST_MIN,
      Rules.BUDGET_MIN
    );
    out.type = 'daily';
    out.core = !!out.core;
    out.penalty = !!out.penalty;
    out.activeFrom = isDayKey(out.activeFrom) ? out.activeFrom : today();
    out.trackedSec = Math.max(0, Math.round(out.trackedSec || 0));
    out.timerStart = Math.max(0, out.timerStart || 0);
    out.note = String(out.note || '');
    out.late = !!out.late;
    return out;
  }

  /* Keep today's list inside the rules; queued quests are kept as-is. */
  function fitQuests(list) {
    var day = today();
    var active = [];
    var queued = [];
    (list || []).forEach(function (raw) {
      var q = normQuest(raw);
      if (Rules.isQueuedOn(q, day)) {
        queued.push(q);
      } else {
        var check = Rules.canAddDaily(active, q.estimatedMinutes);
        if (check.ok) active.push(q);
      }
    });
    return active.concat(queued);
  }

  /* v1 history used {exp, quests, missed}; v2/v3 use {xp, done, total, cleared}. */
  function normHistory(raw) {
    var out = {};
    Object.keys(raw && typeof raw === 'object' ? raw : {}).forEach(function (k) {
      var h = raw[k] || {};
      var done = h.done != null ? h.done : (h.quests || 0);
      var total = h.total != null ? h.total : (h.quests || 0) + (h.missed || 0);
      out[k] = {
        xp: Math.max(0, Math.round(h.xp != null ? h.xp : (h.exp || 0))),
        potential: Math.max(0, Math.round(h.potential || 0)),
        done: Math.max(0, Math.round(done)),
        total: Math.max(0, Math.round(total)),
        cleared: !!h.cleared,
        paused: !!h.paused,
        loss: Math.max(0, Math.round(h.loss || 0))
      };
    });
    return out;
  }

  function ensureState(s) {
    var b = blank();
    var out = Object.assign({}, b, s || {});
    out.schema = 3;
    out.lang = (out.lang === 'en' || out.lang === 'ar') ? out.lang : 'ar';
    out.sound = out.sound !== false;

    out.player = Object.assign({}, b.player, s && s.player ? s.player : {});
    out.player.level = Math.max(1, Math.round(out.player.level || 1));
    out.player.exp = Math.max(0, Math.round(out.player.exp || 0));
    out.player.rank = (Rules.RANKS.indexOf(out.player.rank) >= 0) ? out.player.rank : 'E';
    out.player.escalationLevel = Math.max(0, Math.round(out.player.escalationLevel || 0));
    out.player.streak = Math.max(0, Math.round(out.player.streak || 0));
    out.player.fails = Array.isArray(out.player.fails) ? out.player.fails.filter(isDayKey) : [];
    out.player.demotionQueued = !!out.player.demotionQueued;
    out.player.pausedDay = isDayKey(out.player.pausedDay) ? out.player.pausedDay : null;

    out.settings = Object.assign({ resetTime: CONFIG.reset.time }, s && s.settings ? s.settings : {});
    if (!Rules.isTime(out.settings.resetTime)) out.settings.resetTime = CONFIG.reset.time;

    out.stats = Object.assign(blankStats(), s && s.stats ? s.stats : {});
    Rules.STATS.forEach(function (k) {
      out.stats[k] = Math.max(0, Math.round(out.stats[k] || 0));
    });

    out.quests = fitQuests(Array.isArray(out.quests) ? out.quests : seedQuests());
    if (!out.quests.length) out.quests = seedQuests();
    out.history = normHistory(s && s.history);
    out.boss = (s && s.boss && typeof s.boss === 'object') ? Object.assign(blankBoss(today()), s.boss) : blankBoss(today());
    if (!out.player.lastDay) out.player.lastDay = today();

    out.debug = Object.assign({ now: null }, s && s.debug ? s.debug : {});
    if (out.debug.now != null && !isFinite(out.debug.now)) out.debug.now = null;

    delete out.shop;
    delete out.goals;
    delete out.dungeon;
    delete out.penalty;
    delete out.achievements;
    delete out.totals;
    delete out.journal;
    return out;
  }

  /* v1 -> v3: keep level, exp, history; rebuild quests on the new shape. */
  var MIGRATE_MINUTES = { easy: 20, normal: 30, hard: 40, epic: 50, legendary: 60 };
  function migrateV1(old) {
    var quests = [];
    (old.quests || []).filter(function (q) { return q.type === 'daily'; }).forEach(function (q) {
      quests.push(baseQuest({
        title: q.title || '',
        titleKey: q.titleKey || null,
        desc: q.desc || '',
        difficulty: q.difficulty === 'easy' ? 'easy' : (q.difficulty === 'normal' ? 'normal' : 'hard'),
        estimatedMinutes: MIGRATE_MINUTES[q.difficulty] || 30,
        core: false,
        activeFrom: today(),
        streak: q.streak || 0,
        bestStreak: q.bestStreak || 0,
        validatedDay: q.lastDoneDate === today() ? today() : null,
        validatedAt: 0
      }));
    });
    var p = old.player || {};
    return ensureState({
      schema: 3,
      lang: old.lang || 'ar',
      sound: old.sound !== false,
      player: {
        name: p.name || '',
        level: p.level || 1,
        exp: p.exp || 0,
        rank: 'E',
        escalationLevel: 0,
        created: p.created || today(),
        lastDay: p.lastDay || today()
      },
      quests: quests.length ? quests : seedQuests(),
      history: old.history || {},
      boss: blankBoss(today())
    });
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) return ensureState(JSON.parse(raw));
      var legacy = localStorage.getItem(OLD_KEY);
      if (legacy) {
        var migrated = migrateV1(JSON.parse(legacy));
        try { localStorage.removeItem(OLD_KEY); } catch (e) { /* ignore */ }
        localStorage.setItem(KEY, JSON.stringify(migrated));
        return migrated;
      }
    } catch (e) { /* corrupt storage falls through to a clean state */ }
    return null;
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* blocked */ }
  }

  function emit() {
    save();
    listeners.forEach(function (fn) {
      try { fn(); } catch (e) { console.error(e); }
    });
  }

  /* ---------------- history ---------------- */
  function historyFor(key) {
    var k = key || today();
    var h = S.history[k];
    if (!h) h = S.history[k] = { xp: 0, potential: 0, done: 0, total: 0, cleared: false, paused: false, loss: 0 };
    return h;
  }

  function trimHistory() {
    var keys = Object.keys(S.history).sort();
    while (keys.length > CONFIG.historyDays) { delete S.history[keys.shift()]; }
  }

  function totalXp() {
    return Object.keys(S.history).reduce(function (n, k) {
      return n + (S.history[k].xp || 0);
    }, 0);
  }

  /* ---------------- quest collections ---------------- */
  function getQuest(id) {
    for (var i = 0; i < S.quests.length; i++) if (S.quests[i].id === id) return S.quests[i];
    return null;
  }

  function dailies() { return Rules.activeDailies(S.quests, today()); }
  function queued() { return Rules.queuedDailies(S.quests, today()); }

  /* What tomorrow's list will look like if nothing else changes. */
  function projected() {
    var day = tomorrow();
    return S.quests.filter(function (q) {
      if (!Rules.isDaily(q)) return false;
      if (q.activeFrom && q.activeFrom > day) return false;
      if (q.penalty && q.activeFrom && q.activeFrom < day) return false;
      return true;
    });
  }

  function isActive(q) { return !!q && Rules.isActiveOn(q, today()); }
  function isQueued(id) {
    var q = getQuest(id);
    return !!q && Rules.isQueuedOn(q, today());
  }

  function questName(q) {
    if (q.titleKey) return t(q.titleKey);
    return q.title || t('emptyQuestName');
  }

  function trackedSec(q) {
    var extra = q.timerStart ? Math.max(0, (now() - q.timerStart) / 1000) : 0;
    var cap = Math.max(1, q.estimatedMinutes) * 60;
    return Math.min(cap, Math.round(q.trackedSec + extra));
  }

  function timerRunning(q) { return !!q.timerStart; }
  function requiredSec(q) { return Rules.requiredSec(q.estimatedMinutes); }
  function proofState(q) { return Rules.proofOk(trackedSec(q), q.estimatedMinutes, q.note); }
  function previewXp(q, late) { return Rules.awardXp(q.estimatedMinutes, q.difficulty, !!late); }

  function isLate(q) {
    if (!q.dueTime) return false;
    var due = parseHM(q.dueTime);
    if (due === null) return false;
    return nowMinute() > due;
  }

  function isDone(q) { return q.validatedDay === today(); }
  function isLocked() { return true; } // the current day is always locked at start

  /* ---------------- xp / level ---------------- */
  function grantXp(amount) {
    var p = S.player;
    var mult = Rules.escalationMultiplier(p.escalationLevel || 0);
    var gained = Math.max(0, Math.round((amount || 0) * mult));
    p.exp += gained;
    var ups = 0;
    var guard = 0;
    while (p.exp >= Rules.levelXp(p.level) && guard < 200) {
      p.exp -= Rules.levelXp(p.level);
      p.level += 1;
      ups += 1;
      guard += 1;
    }
    if (ups) {
      notify('level', 'levelUpT', { n: p.level });
      notify('level', 'levelUp', { n: p.level });
    }
    return gained;
  }

  /* Remove XP; drop levels when the current level cannot pay. */
  function spendXp(amount) {
    var p = S.player;
    var left = Math.max(0, Math.round(amount));
    var spent = 0;
    var guard = 0;
    while (left > 0 && guard < 200) {
      guard += 1;
      if (p.exp > 0) {
        var take = Math.min(left, p.exp);
        p.exp -= take;
        left -= take;
        spent += take;
        continue;
      }
      if (p.level <= 1) break;
      p.level -= 1;
      p.exp = Rules.levelXp(p.level);
    }
    return spent;
  }

  /* ---------------- timers ---------------- */
  function guardActive(q) {
    return !!q && Rules.isActiveOn(q, today());
  }

  function startQuestTimer(id) {
    var q = getQuest(id);
    if (!guardActive(q) || isDone(q) || q.timerStart) return { ok: false, code: 'locked' };
    q.timerStart = now();
    notify('info', 'timerStart', { name: questName(q) });
    emit();
    return { ok: true };
  }

  function pauseQuestTimer(id) {
    var q = getQuest(id);
    if (!q || !q.timerStart) return;
    var cap = q.estimatedMinutes * 60;
    q.trackedSec = Math.min(cap, Math.round(q.trackedSec + (now() - q.timerStart) / 1000));
    q.timerStart = 0;
    emit();
  }

  function setNote(id, note, silent) {
    var q = getQuest(id);
    if (!q) return;
    q.note = String(note || '').trim().slice(0, 140);
    if (silent) save(); else emit();
  }

  /* ---------------- validation ---------------- */
  function validateQuest(id, note) {
    var q = getQuest(id);
    if (!q) return { ok: false, code: 'missing' };
    if (!guardActive(q)) return { ok: false, code: 'locked' };
    if (isDone(q)) return { ok: false, code: 'done' };

    if (note != null) q.note = String(note).trim().slice(0, 140);

    if (q.timerStart) {
      var capAll = q.estimatedMinutes * 60;
      q.trackedSec = Math.min(capAll, Math.round(q.trackedSec + (now() - q.timerStart) / 1000));
      q.timerStart = 0;
    }

    var proof = Rules.proofOk(q.trackedSec, q.estimatedMinutes, q.note);
    if (!proof.ok) {
      notify('warn', proof.code === 'time' ? 'proofTime' : 'proofNote', {
        need: Math.ceil((proof.need - proof.tracked) / 60),
        name: questName(q)
      });
      emit();
      return { ok: false, code: proof.code, need: proof.need, tracked: proof.tracked };
    }

    var late = isLate(q);
    var xp = Rules.awardXp(q.estimatedMinutes, q.difficulty, late);
    var day = today();

    q.validatedDay = day;
    q.validatedAt = now();
    q.late = late;
    q.streak = q.streak + 1;
    q.bestStreak = Math.max(q.bestStreak, q.streak);

    grantXp(xp);
    S.stats[q.stat] = (S.stats[q.stat] || 0) + 1;
    if (q.stat !== 'discipline') S.stats.discipline = (S.stats.discipline || 0) + 1;

    var h = historyFor(day);
    h.xp += xp;
    h.potential = Rules.dayPotentialXp(S.quests, day);
    h.done = Rules.clearedCount(S.quests, day);
    h.total = dailies().length;
    h.cleared = Rules.dayCleared(S.quests, day);

    if (h.cleared && S.boss && S.boss.awardedDay !== day) {
      awardBossProgress(day);
    }

    notify(late ? 'warn' : 'quest', late ? 'questLate' : 'questValidated', {
      name: questName(q),
      xp: xp,
      stat: t(Rules.STAT_LABELS[q.stat])
    });
    notify('reward', 'xpGain', { xp: xp });
    emit();
    return { ok: true, xp: xp, late: late };
  }

  /* ---------------- quest editing (locked day) ---------------- */
  function refuse(code, key, params) {
    notify('refuse', key, params || {});
    emit();
    return { ok: false, code: code };
  }

  function addQuest(data) {
    var minutes = Math.round(data.estimatedMinutes || 0);
    var list = projected();
    var check = Rules.canAddDaily(list, minutes);
    if (!check.ok) {
      if (check.code === 'budget') return refuse('budget', 'refuseBudget', { left: check.left || 0 });
      if (check.code === 'max') return refuse('max', 'refuseMax', {});
      return refuse('minutes', 'refuseMinutes', { min: Rules.MIN_QUEST_MIN });
    }
    if (data.core && !Rules.canSetCore(list, null, true).ok) {
      return refuse('coreMax', 'refuseCore', {});
    }

    var day = tomorrow();
    var q = baseQuest({
      title: String(data.title || '').trim(),
      desc: String(data.desc || '').trim(),
      stat: Rules.isStat(data.stat) ? data.stat : 'discipline',
      difficulty: Rules.MULT[data.difficulty] ? data.difficulty : 'normal',
      estimatedMinutes: minutes,
      core: !!data.core,
      dueTime: data.dueTime || null,
      activeFrom: day,
      dayKey: day
    });
    S.quests.push(q);
    notify('ok', 'queuedAdded', { name: questName(q) });
    emit();
    return { ok: true, quest: q, queued: true };
  }

  function updateQuest(id, data) {
    var q = getQuest(id);
    if (!q) return { ok: false, code: 'missing' };
    if (isActive(q)) return refuse('locked', 'lockRefused', {});

    var minutes = Math.round(data.estimatedMinutes || 0);
    var others = projected().filter(function (x) { return x.id !== id; });
    var check = Rules.canAddDaily(others, minutes);
    if (!check.ok) {
      if (check.code === 'budget') return refuse('budget', 'refuseBudget', { left: check.left || 0 });
      if (check.code === 'max') return refuse('max', 'refuseMax', {});
      return refuse('minutes', 'refuseMinutes', { min: Rules.MIN_QUEST_MIN });
    }
    if (data.core && !Rules.canSetCore(others, id, true).ok) {
      return refuse('coreMax', 'refuseCore', {});
    }

    q.title = String(data.title || '').trim();
    q.titleKey = null;
    q.desc = String(data.desc || '').trim();
    q.stat = Rules.isStat(data.stat) ? data.stat : q.stat;
    q.difficulty = Rules.MULT[data.difficulty] ? data.difficulty : q.difficulty;
    q.estimatedMinutes = minutes;
    q.core = !!data.core;
    q.dueTime = data.dueTime || null;
    emit();
    return { ok: true };
  }

  function deleteQuest(id) {
    var q = getQuest(id);
    if (!q) return { ok: false, code: 'missing' };
    if (isActive(q)) return refuse('locked', 'lockRefused', {});

    var check = Rules.canRemoveDaily(projected());
    if (!check.ok) return refuse('min', 'refuseMin', { min: Rules.MIN_DAILIES });

    S.quests = S.quests.filter(function (x) { return x.id !== id; });
    notify('ok', 'questDeleted', {});
    emit();
    return { ok: true };
  }

  /* ---------------- boss ---------------- */
  function monthKey(d) { return String(d || today()).slice(0, 7); }

  function ensureBoss() {
    var m = monthKey(today());
    if (!S.boss || typeof S.boss !== 'object') S.boss = blankBoss(today());
    if (S.boss.month !== m) {
      // resolve previous boss
      if (!S.boss.cleared && !S.boss.failed) {
        spendXp(Rules.BOSS_FAIL_XP);
        S.boss.failed = true;
        notify('fail', 'bossFailed', { xp: Rules.BOSS_FAIL_XP });
      }
      S.boss = blankBoss(today());
    }
    if (S.boss.target == null) S.boss.target = CONFIG.boss.target;
    if (S.boss.reward == null) S.boss.reward = CONFIG.boss.rewardXp;
  }

  function boss() { return S.boss; }
  function bossProgress() { return S.boss ? S.boss.progress || 0 : 0; }
  function bossTarget() { return S.boss ? S.boss.target || CONFIG.boss.target : CONFIG.boss.target; }
  function bossCleared() { return !!(S.boss && S.boss.cleared); }

  function awardBossProgress(day) {
    ensureBoss();
    if (S.boss.cleared) return;
    var d = day || today();
    if (monthKey(d) !== S.boss.month) return;
    if (S.boss.awardedDay === d) return;
    S.boss.progress = Math.min(S.boss.target, (S.boss.progress || 0) + 1);
    S.boss.awardedDay = d;
    if (S.boss.progress >= S.boss.target && !S.boss.cleared) {
      S.boss.cleared = true;
      grantXp(S.boss.reward);
      notify('quest', 'bossCleared', { xp: S.boss.reward });
    }
  }

  function addBossProgress(n) {
    ensureBoss();
    if (S.boss.cleared) return { ok: false, code: 'cleared' };
    var inc = Math.max(1, Math.round(n || 1));
    for (var i = 0; i < inc; i++) {
      S.boss.progress = Math.min(S.boss.target, (S.boss.progress || 0) + 1);
      if (S.boss.progress >= S.boss.target && !S.boss.cleared) {
        S.boss.cleared = true;
        grantXp(S.boss.reward);
        notify('quest', 'bossCleared', { xp: S.boss.reward });
      }
    }
    emit();
    return { ok: true, progress: S.boss.progress, cleared: S.boss.cleared };
  }

  /* ---------------- day cycle ---------------- */
  function dayList(key) { return Rules.activeDailies(S.quests, key); }

  function processDay(day) {
    var list = dayList(day);
    var paused = S.player.pausedDay === day;
    var h = historyFor(day);
    var cleared = !paused && list.length > 0 && Rules.dayCleared(list, day);

    h.potential = Rules.dayPotentialXp(list, day);
    h.total = list.length;
    h.done = list.filter(function (q) { return q.validatedDay === day; }).length;
    h.cleared = cleared;
    h.paused = paused;

    if (paused) {
      h.streak = S.player.streak;
      return { failed: false, cleared: false, paused: true };
    }

    if (cleared) {
      S.player.streak = (S.player.streak || 0) + 1;
      S.player.bestStreak = Math.max(S.player.bestStreak || 0, S.player.streak);
      awardBossProgress(day);
      if (Rules.escalationDue(S.player.streak)) {
        S.player.escalationLevel = (S.player.escalationLevel || 0) + 1;
        notify('level', 'escalation', { n: S.player.escalationLevel });
      }
      h.streak = S.player.streak;
      return { failed: false, cleared: true, paused: false };
    }

    /* FAIL */
    var loss = Rules.failXpLoss(h.potential);
    spendXp(loss);
    h.loss = loss;
    h.streak = 0;
    S.player.streak = 0;
    S.player.fails = Rules.pruneFails(S.player.fails.concat([day]), day);

    if (Rules.demotionDue(S.player.fails, day) && !S.player.demotionQueued) {
      S.player.demotionQueued = true;
      notify('fail', 'demotionQueued', { n: Rules.DEMOTE_FAILS, days: Rules.DEMOTE_WINDOW });
    }
    return { failed: true, cleared: false, paused: false, loss: loss };
  }

  function weakestStat() {
    var best = Rules.STATS[0];
    Rules.STATS.forEach(function (k) {
      if ((S.stats[k] || 0) < (S.stats[best] || 0)) best = k;
    });
    return best;
  }

  function addPenaltyQuest(day) {
    var pen = baseQuest({
      titleKey: 'penaltyQuest',
      stat: weakestStat(),
      difficulty: 'normal',
      estimatedMinutes: Rules.PENALTY_MIN,
      core: false,
      penalty: true,
      activeFrom: day,
      dayKey: day
    });
    var active = dayList(day);
    var queuedList = Rules.queuedDailies(S.quests, day);
    S.quests = Rules.planWithPenalty(active, pen, Rules.BUDGET_MIN, Rules.MAX_DAILIES).concat(queuedList);
    notify('fail', 'penaltyForced', { n: Rules.PENALTY_MIN });
    return pen;
  }

  function resetActive(day) {
    S.quests.forEach(function (q) {
      if (!Rules.isActiveOn(q, day)) return;
      q.timerStart = 0;
      q.trackedSec = 0;
      q.note = '';
      q.validatedDay = null;
      q.validatedAt = 0;
      q.late = false;
      q.dayKey = day;
    });
  }

  function applyJudgement(day) {
    var cleared = Rules.clearedDaysInWindow(S.history, day, 7);
    var fails = Rules.failsInWindowCount(S.player.fails, day, 7);
    if (S.player.demotionQueued || fails >= Rules.DEMOTE_FAILS) {
      S.player.rank = Rules.prevRank(S.player.rank);
      S.player.demotionQueued = false;
      notify('fail', 'demotionApplied', { rank: S.player.rank });
    } else if (cleared >= Rules.PROMOTE_CLEARED && fails <= Rules.PROMOTE_MAX_FAILS) {
      if (Rules.rankIndex(S.player.rank) < Rules.RANKS.length - 1) {
        S.player.rank = Rules.nextRank(S.player.rank);
        notify('level', 'rankUp', { rank: S.player.rank });
      }
    }
  }

  function rollover() {
    var day = today();
    if (!S.player.lastDay) {
      S.player.lastDay = day;
      resetActive(day);
      return false;
    }
    var gap = diffDays(S.player.lastDay, day);
    if (gap <= 0) return false;
    gap = Math.min(gap, CONFIG.historyDays);

    var lastFailed = null;
    var judgementDay = null;
    for (var i = 0; i < gap; i++) {
      var key = addDays(S.player.lastDay, i);
      var res = processDay(key);
      if (res.failed) lastFailed = key;
      if (Rules.isJudgementDay(key)) judgementDay = key;
    }

    S.player.lastDay = day;
    S.player.pausedDay = null;

    if (judgementDay) applyJudgement(judgementDay);

    /* penalty quests only live for their day */
    S.quests = S.quests.filter(function (q) {
      return !q.penalty || (q.activeFrom && q.activeFrom >= day);
    });

    /* yesterday failed -> serve a penalty today (inside the budget) */
    if (lastFailed && lastFailed === addDays(day, -1)) addPenaltyQuest(day);

    /* clear the demotion flag once the window is clean */
    S.player.fails = Rules.pruneFails(S.player.fails, day);
    if (!Rules.demotionDue(S.player.fails, day)) S.player.demotionQueued = false;

    resetActive(day);
    trimHistory();
    notify('info', 'newDay', {});
    return true;
  }

  function tick() {
    var changed = false;
    if (S.player.lastDay !== today()) {
      rollover();
      changed = true;
    }
    ensureBoss();
    if (changed) { save(); return true; }
    return false;
  }

  /* ---------------- emergency pause ---------------- */
  function monthOf(dayKey) { return String(dayKey).slice(0, 7); }

  function pauseUsedThisMonth() {
    return S.player.lastPauseMonth === monthOf(today());
  }

  function pausedToday() { return S.player.pausedDay === today(); }

  function emergencyPause(reason) {
    var text = String(reason || '').trim();
    var day = today();
    if (text.length < CONFIG.pause.minReason) {
      notify('refuse', 'pauseReasonShort', { n: CONFIG.pause.minReason });
      emit();
      return { ok: false, code: 'reason' };
    }
    if (pausedToday()) return refuse('used', 'pauseUsedToday', {});
    if (pauseUsedThisMonth()) return refuse('limit', 'pauseLimit', { n: CONFIG.pause.perMonth });

    var cost = Rules.pauseCost(Rules.levelXp(S.player.level));
    spendXp(cost);
    S.player.lastPauseMonth = monthOf(day);
    S.player.pausedDay = day;

    var h = historyFor(day);
    h.paused = true;
    h.potential = Rules.dayPotentialXp(S.quests, day);

    notify('warn', 'pauseApplied', { xp: cost });
    emit();
    return { ok: true, cost: cost };
  }

  /* ---------------- summary helpers for views ---------------- */
  function streak() { return S.player.streak || 0; }
  function bestStreak() { return S.player.bestStreak || 0; }
  function clearedToday() { return Rules.dayCleared(S.quests, today()); }
  function failsIn7() { return Rules.pruneFails(S.player.fails, today()).length; }
  function demotionQueued() { return !!S.player.demotionQueued; }

  function dayProgress() {
    var cleared = Rules.clearedCount(S.quests, today());
    return { cleared: cleared, total: dailies().length, clearedDay: clearedToday() };
  }

  function activePenalty() {
    return dailies().filter(function (q) { return q.penalty; })[0] || null;
  }

  /* ---------------- settings ---------------- */
  function setResetTime(hm) {
    if (!Rules.isTime(hm)) return false;
    S.settings.resetTime = hm;
    notify('ok', 'resetTimeSaved', { time: hm });
    emit();
    return true;
  }

  /* ---------------- data ---------------- */
  function exportJSON() { return JSON.stringify(S, null, 2); }

  function importJSON(text) {
    var data = JSON.parse(text);
    if (!data || !data.player || !Array.isArray(data.quests)) throw new Error('invalid');
    S = ensureState(data);
    emit();
  }

  function resetAll() {
    S = blank();
    try { localStorage.removeItem(KEY); localStorage.removeItem(OLD_KEY); } catch (e) { /* ignore */ }
    save();
    notify('info', 'resetDone', {});
    emit();
  }

  function setLang(lang) {
    S.lang = (lang === 'en') ? 'en' : 'ar';
    save();
    emit();
  }

  function setSound(on) {
    S.sound = !!on;
    save();
    emit();
  }

  function setName(name) {
    S.player.name = String(name || '').trim();
    notify('ok', 'nameSaved', {});
    emit();
  }

  /* ---------------- debug clock ---------------- */
  var Debug = {
    clock: function () { return S.debug.now; },
    setNow: function (ms) {
      if (!isFinite(ms)) return null;
      S.debug.now = Math.round(ms);
      tick();
      emit();
      return S.debug.now;
    },
    advance: function (ms) {
      S.debug.now = (S.debug.now == null ? Date.now() : S.debug.now) + Math.round(ms || 0);
      tick();
      emit();
      return S.debug.now;
    },
    clear: function () {
      S.debug.now = null;
      tick();
      emit();
    },
    simulateReset: function () {
      var at = Rules.nextResetAt(now(), resetTime()) + 1000;
      S.debug.now = at;
      tick();
      emit();
      return at;
    },
    status: function () {
      return {
        fake: S.debug.now != null,
        clock: now(),
        day: today(),
        resetTime: resetTime(),
        level: S.player.level,
        exp: S.player.exp,
        rank: S.player.rank,
        streak: streak(),
        fails: failsIn7(),
        demotion: demotionQueued(),
        penalty: !!activePenalty(),
        paused: pausedToday(),
        cleared: clearedToday(),
        queued: queued().length
      };
    }
  };

  /* ---------------- boot ---------------- */
  S = load() || blank();
  rollover();
  if (!S.quests.length) S.quests = seedQuests();
  ensureBoss();
  save();

  return {
    dateKey: dateKey,
    addDays: addDays,
    diffDays: diffDays,
    today: today,
    tomorrow: tomorrow,
    get state() { return S; },
    get stats() { return S.stats; },
    on: function (fn) { listeners.push(fn); },
    emit: emit,
    drain: function () { var q = queue; queue = []; return q; },
    notify: notify,

    dailies: dailies,
    queued: queued,
    projected: projected,
    getQuest: getQuest,
    questName: questName,
    isDone: isDone,
    isLate: isLate,
    isActive: isActive,
    isQueued: isQueued,
    isLocked: isLocked,
    activePenalty: activePenalty,
    trackedSec: trackedSec,
    requiredSec: requiredSec,
    timerRunning: timerRunning,
    proofState: proofState,
    previewXp: previewXp,

    addQuest: addQuest,
    updateQuest: updateQuest,
    deleteQuest: deleteQuest,
    startQuestTimer: startQuestTimer,
    pauseQuestTimer: pauseQuestTimer,
    setNote: setNote,
    validateQuest: validateQuest,

    budgetUsed: function () { return Rules.budgetUsed(S.quests, today()); },
    budgetLeft: function () { return Rules.budgetLeft(S.quests, today()); },
    projectedBudget: function () { return Rules.budgetUsed(projected()); },
    dayPotential: function () { return Rules.dayPotentialXp(S.quests, today()); },
    dayProgress: dayProgress,
    clearedToday: clearedToday,
    streak: streak,
    bestStreak: bestStreak,
    boss: boss,
    bossProgress: bossProgress,
    bossTarget: bossTarget,
    bossCleared: bossCleared,
    addBossProgress: addBossProgress,
    ensureBoss: ensureBoss,
    rank: function () { return S.player.rank; },
    escalationLevel: function () { return S.player.escalationLevel || 0; },
    applyJudgement: applyJudgement,
    failsIn7: failsIn7,
    demotionQueued: demotionQueued,
    pausedToday: pausedToday,
    pauseUsedThisMonth: pauseUsedThisMonth,
    emergencyPause: emergencyPause,
    resetTime: resetTime,
    setResetTime: setResetTime,
    totalXp: totalXp,
    levelXp: function () { return Rules.levelXp(S.player.level); },

    tick: tick,
    debug: Debug,
    exportJSON: exportJSON,
    importJSON: importJSON,
    resetAll: resetAll,
    setLang: setLang,
    setSound: setSound,
    setName: setName,
    save: save
  };
})();
