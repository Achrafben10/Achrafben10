/* ============================================================
   Config — the ONLY place with rule numbers.
   Change a value here; no other file needs editing.

   Bundled rules:
     - daily quest budget / count / minimum duration
     - XP curve, multipliers, late ratio, proof ratio
     - FAIL penalty (50% of the day's potential XP)
     - forced penalty quest (15 min, inside the 180 budget)
     - demotion (3 fails in a rolling 7 days)
     - Emergency Pause (30% of current-level XP, once a month)
     - daily reset time (default; the user can override in Settings)
   ============================================================ */
var CONFIG = {
  /* ---- daily quests ---- */
  budgetMinutes: 180,          // hard ceiling for the sum of daily minutes
  minDailies: 3,
  maxDailies: 5,
  maxCore: 2,
  minQuestMinutes: 20,         // proof floor = 80% of this => 16 min tracked

  /* ---- xp / levels ---- */
  baseXp: 100,                 // level 1 -> 2
  levelGrowth: 1.15,           // +15% per level
  multipliers: { easy: 1.0, normal: 1.5, hard: 2.0 },
  proofRatio: 0.8,             // tracked time required to validate
  lateRatio: 0.5,              // XP kept when finishing after the deadline

  /* ---- failure ---- */
  fail: {
    xpRatio: 0.5,              // lose 50% of the day's potential XP
    penaltyQuestMinutes: 15    // forced quest next day, must fit the budget
  },

  /* ---- demotion ---- */
  demotion: {
    fails: 3,                  // 3 failed days...
    windowDays: 7              // ...inside a rolling 7-day window
  },

  /* ---- emergency pause ---- */
  pause: {
    xpRatio: 0.3,              // costs 30% of the current level's XP
    perMonth: 1,
    minReason: 10              // characters of written reason
  },

  /* ---- day boundary ---- */
  reset: { time: '00:00' },    // default reset time (Settings can override)

  /* ---- storage ---- */
  historyDays: 500,

  /* ---- ranks / weekly judgement / escalation ---- */
  ranks: {
    list: ['E', 'D', 'C', 'B', 'A', 'S'],
    promoteClearedDays: 5,   // cleared days in a 7-day window to rank up
    promoteMaxFails: 0       // max fails in the same window to rank up
  },
  weekly: {
    judgementDay: 0           // 0 = Sunday (Date.getDay())
  },
  escalation: {
    clearedDays: 7,           // consecutive cleared days to escalate
    bonus: 0.1               // +10% XP per escalation level
  },

  /* ---- monthly boss ---- */
  boss: {
    target: 10,            // progress units to clear the boss
    rewardXp: 500,         // XP granted on clear
    failXp: 200            // XP lost if the month ends uncleared
  },

  /* ---- charts ---- */
  charts: {
    shortDays: 14,
    longDays: 30
  },

  /* ---- debug panel (js/debug.js) ---- */
  debug: false
};

if (typeof module !== 'undefined' && module.exports) module.exports = CONFIG;
