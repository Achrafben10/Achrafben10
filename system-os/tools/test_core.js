/* Headless rule-engine tests for THE SYSTEM (rules v3).
   Node + vm, fake clock and storage. No browser. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
let failures = 0;

function assert(cond, msg) {
  if (cond) {
    console.log('  PASS ' + msg);
  } else {
    failures += 1;
    console.log('  FAIL ' + msg);
  }
}
function eq(actual, expected, msg) {
  assert(actual === expected,
    msg + (actual === expected ? '' : ' (got ' + JSON.stringify(actual) + ', want ' + JSON.stringify(expected) + ')'));
}

function makeEnv(startDate, preload) {
  let now = new Date(startDate || '2026-01-10T12:00:00').getTime();
  const RealDate = Date;

  class FakeDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(now);
      else super(...args);
    }
    static now() { return now; }
  }

  const store = Object.assign({}, preload || {});
  const sandbox = {
    console, Math, JSON, Object, Array, Number, String, Boolean, Date: FakeDate,
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; }
    },
    currentLang: () => 'en'
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/i18n.js'), 'utf8'), sandbox);
  sandbox.t = sandbox.t || ((k) => k);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/config.js'), 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/rules.js'), 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/core.js'), 'utf8'), sandbox);

  const env = {
    sandbox,
    store,
    Core: sandbox.Core,
    Rules: sandbox.Rules,
    advance(days) { now += days * 86400000; },
    advanceSec(sec) { now += sec * 1000; },
    now() { return now; },
    reload() {
      vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/config.js'), 'utf8'), sandbox);
      vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/rules.js'), 'utf8'), sandbox);
      vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/core.js'), 'utf8'), sandbox);
      env.Core = sandbox.Core;
      return sandbox.Core;
    }
  };
  return env;
}

function toastCodes(C) { return C.drain().map((n) => n.text); }
function questByTitle(C, title) {
  return C.dailies().filter((q) => q.title === title)[0];
}
function finish(C, q) {
  q.trackedSec = q.estimatedMinutes * 60;
  q.note = 'done';
  return C.validateQuest(q.id);
}
function finishAll(C) {
  return C.dailies().map((q) => finish(C, q));
}

/* ------------------------------------------------------------------ */
console.log('\n[1] first boot');
const env = makeEnv();
let C = env.Core;

eq(C.state.schema, 3, 'state is schema 3');
eq(C.state.player.level, 1, 'starts at level 1');
eq(C.state.player.exp, 0, 'starts with 0 xp');
eq(C.dailies().length, 4, 'four seed quests');
eq(C.budgetUsed(), 130, 'seed budget = 130 min');
eq(C.budgetLeft(), 50, '50 min free');
eq(C.state.player.lastDay, '2026-01-10', 'lastDay = today');
eq(C.state.player.gold, undefined, 'gold removed');
eq(C.state.player.hp, undefined, 'hp removed');
eq(C.state.quests.filter((q) => q.core).length, 2, 'two CORE quests by default');
eq(C.levelXp(), 100, 'level 1 costs 100 xp');

console.log('\n[2] budget is enforced on add');
let res = C.addQuest({ title: 'Extra 50', estimatedMinutes: 50, stat: 'strength', difficulty: 'easy' });
eq(res.ok, true, '50 min accepted (130 + 50 = 180)');
eq(C.projectedBudget(), 180, 'projected budget exactly full');
eq(C.budgetUsed(), 130, 'today budget unchanged (queued)');
res = C.addQuest({ title: 'One more', estimatedMinutes: 20, stat: 'wealth', difficulty: 'easy' });
eq(res.ok, false, 'nothing fits while 5 quests are held');
eq(res.code, 'max', 'quest ceiling is checked');

const tight = makeEnv();
const tightRes = tight.Core.addQuest({ title: 'Over', estimatedMinutes: 51, stat: 'wealth', difficulty: 'easy' });
eq(tight.Core.budgetUsed(), 130, 'tight day untouched by the refusal');
eq(tightRes.code, 'budget', 'budget refusal at 130 + 51');

res = C.addQuest({ title: 'Sixth', estimatedMinutes: 20, stat: 'wealth', difficulty: 'easy' });
eq(res.ok, false, 'sixth quest refused');
eq(res.code, 'max', 'refusal reason = max');

console.log('\n[3] min minutes enforced');
res = C.addQuest({ title: 'Tiny', estimatedMinutes: 5, stat: 'wealth', difficulty: 'easy' });
eq(res.ok, false, '5-min quest refused');
eq(res.code, 'minutes', 'refusal reason = minutes');

console.log('\n[4] edit cannot silently break the budget');
const target = C.queued().filter((q) => q.title === 'Extra 50')[0];
res = C.updateQuest(target.id, { title: 'Extra 50', estimatedMinutes: 60, stat: 'creativity', difficulty: 'normal' });
eq(res.ok, false, 'growing a quest past the budget is refused');
eq(target.estimatedMinutes, 50, 'original minutes preserved');
res = C.updateQuest(target.id, { title: 'Extra 40', estimatedMinutes: 40, stat: 'creativity', difficulty: 'normal' });
eq(res.ok, true, 'shrinking is allowed');
eq(C.projectedBudget(), 170, 'projected budget follows the edit');

console.log('\n[5] lock refuses deleting active; queued deletable');
res = C.deleteQuest(C.dailies()[0].id);
eq(res.ok, false, 'deleting an active quest refused');
eq(res.code, 'locked', 'refusal reason = locked');
const delEnv = makeEnv();
const DC2 = delEnv.Core;
const addedQ = DC2.addQuest({ title: 'Qdel', estimatedMinutes: 20, stat: 'wealth', difficulty: 'easy' });
eq(addedQ.ok, true, 'queued quest added');
res = DC2.deleteQuest(addedQ.quest.id);
eq(res.ok, true, 'queued quest deletable');

console.log('\n[6] lock: active quests cannot be edited or deleted');
const lockEnv = makeEnv();
const LC = lockEnv.Core;
const lq = LC.dailies()[0];
res = LC.updateQuest(lq.id, { title: 'X', estimatedMinutes: 20, stat: 'strength', difficulty: 'easy' });
eq(res.ok, false, 'editing an active quest is refused');
eq(res.code, 'locked', 'refusal reason = locked');
res = LC.deleteQuest(lq.id);
eq(res.ok, false, 'deleting an active quest is refused');
eq(res.code, 'locked', 'refusal reason = locked');
// queued quest can be edited
const added = LC.addQuest({ title: 'Tomorrow Q', estimatedMinutes: 20, stat: 'wealth', difficulty: 'easy' });
eq(added.ok, true, 'queued quest added');
eq(added.queued, true, 'marked queued');
res = LC.updateQuest(added.quest.id, { title: 'Tomorrow Q2', estimatedMinutes: 25, stat: 'wealth', difficulty: 'easy' });
eq(res.ok, true, 'queued quest editable');

console.log('\n[7] proof of work gate');
const day2 = makeEnv();
C = day2.Core;
let q1 = C.dailies()[0];
res = C.validateQuest(q1.id);
eq(res.ok, false, 'no tracked time, no note: rejected');
eq(res.code, 'time', 'rejection reason = time');
eq(C.state.player.exp, 0, 'no xp granted on rejection');

q1.trackedSec = C.requiredSec(q1) - 1;
q1.note = 'woke at 6';
res = C.validateQuest(q1.id);
eq(res.code, 'time', 'one second short is rejected');

q1.trackedSec = C.requiredSec(q1);
q1.note = '   ';
res = C.validateQuest(q1.id);
eq(res.code, 'note', 'blank note is rejected');

q1.note = 'woke at 6';
res = C.validateQuest(q1.id);
eq(res.ok, true, '80% tracked + one line validates');
eq(C.state.stats.discipline, 1, 'discipline grows on any quest');
eq(C.state.stats[q1.stat], 1, 'quest stat grows by 1');

const q2 = C.dailies()[1];
finish(C, q2);
eq(C.state.stats.strength, 1, 'strength grows from a strength quest');
eq(C.state.stats.discipline, 2, 'discipline grows from every quest, once');

console.log('\n[8] timer tracks time');
const day3 = makeEnv();
C = day3.Core;
const tq = C.dailies()[2];
C.startQuestTimer(tq.id);
eq(tq.timerStart > 0, true, 'timer started');
day3.advanceSec(6 * 60);
eq(C.trackedSec(tq), 360, 'elapsed seconds count');
C.pauseQuestTimer(tq.id);
eq(tq.trackedSec, 360, 'pause folds elapsed time');
eq(tq.timerStart, 0, 'timer stopped');

console.log('\n[9] xp curve and level up');
const day4 = makeEnv();
C = day4.Core;
finishAll(C);
eq(C.state.player.level, 2, '205 xp crosses level 1 (100) and leaves remainder');
eq(C.state.player.exp, 105, 'remainder 105 into level 2');
eq(C.levelXp(), 115, 'level 2 costs 115 (+15%)');
assert(toastCodes(C).indexOf('levelUpT') >= 0, 'level-up announced');

console.log('\n[10] late completion pays half and never clears the day');
const day5 = makeEnv();
C = day5.Core;
const lq2 = C.dailies()[1];
lq2.dueTime = '06:00';
eq(C.isLate(lq2), true, '12:00 is past a 06:00 deadline');
lq2.trackedSec = lq2.estimatedMinutes * 60;
lq2.note = 'late but done';
res = C.validateQuest(lq2.id);
eq(res.ok, true, 'late quest still validates');
eq(lq2.late, true, 'quest flagged late');
eq(C.clearedToday(), false, 'late quest does not clear the day');

console.log('\n[11] cleared day, streak and rollover');
const day6 = makeEnv();
C = day6.Core;
finishAll(C);
eq(C.clearedToday(), true, 'all four validated on time clears the day');
eq(C.dayProgress().cleared, 4, 'four cleared');
eq(C.streak(), 0, 'streak only moves at rollover');
day6.advance(1);
eq(C.tick(), true, 'rollover fires on a new day');
eq(C.streak(), 1, 'cleared day raises the streak to 1');
eq(C.state.player.lastDay, '2026-01-11', 'lastDay advanced');
eq(C.state.history['2026-01-10'].cleared, true, 'history marks the day cleared');
eq(C.dailies()[0].trackedSec, 0, 'tracked time resets');
eq(C.clearedToday(), false, 'new day starts uncleared');

finishAll(C);
day6.advance(1);
C.tick();
eq(C.streak(), 2, 'second cleared day raises the streak to 2');
eq(C.bestStreak(), 2, 'best streak tracked');

console.log('\n[12] a single miss breaks the streak and records fail loss');
const day7 = makeEnv();
C = day7.Core;
finishAll(C);
day7.advance(1);
C.tick();
eq(C.streak(), 1, 'streak 1 after a clear');
finish(C, C.dailies()[0]);
finish(C, C.dailies()[1]);
finish(C, C.dailies()[2]);
day7.advance(1);
C.tick();
eq(C.streak(), 0, 'one undone quest resets the streak to 0');
eq(C.state.history['2026-01-11'].cleared, false, 'failed day recorded as not cleared');
eq(C.state.history['2026-01-11'].done, 3, 'three quests recorded done');
eq(C.state.history['2026-01-11'].loss > 0, true, 'fail loss recorded');
assert(C.state.player.fails.indexOf('2026-01-11') >= 0, 'fail recorded in fails list');

console.log('\n[13] penalty quest inserted on fail (next day)');
// day7 now on 2026-01-12 after rollover? Actually advanced to 01-12. Check penalty quest present.
eq(C.dailies().some((q) => q.penalty), true, 'penalty quest present today');
const penQ = C.dailies().filter((q) => q.penalty)[0];
eq(penQ.estimatedMinutes, 15, 'penalty quest is 15 min');
assert(C.budgetUsed() <= 180, 'penalty fits 180 budget');

console.log('\n[14] demotion after 3 fails');
// accumulate fails: already 1. Need 2 more failed days.
// clear today? no, fail again.
C.dailies().forEach((q) => { q.trackedSec = 0; q.note = ''; }); // reset not needed
// Fail today by not completing; advance day
day7.advance(1);
C.tick(); // today (with penalty quest) not cleared -> fail
assert(C.state.player.fails.length >= 2, 'second fail recorded');
day7.advance(1);
C.tick();
assert(C.state.player.fails.length >= 3, 'third fail recorded');
eq(C.demotionQueued(), true, 'demotion queued after 3 fails');

console.log('\n[15] emergency pause');
const pEnv = makeEnv();
const PC = pEnv.Core;
eq(PC.pausedToday(), false, 'not paused initially');
const pauseRes = PC.emergencyPause('because I need rest and recovery');
eq(pauseRes.ok, true, 'pause accepted with reason');
eq(PC.pausedToday(), true, 'paused today');
// cost = 30% of levelXp(1)=100 => 30
eq(PC.state.player.exp, 0, 'xp clamped at 0 after cost (was 0)');
// pause freezes streak at rollover
PC.state.player.streak = 5;
pEnv.advance(1);
PC.tick();
eq(PC.streak(), 5, 'pause freezes streak (no increment, no reset)');
console.log('\n[16] pause monthly limit');
const pause2 = PC.emergencyPause('another reason here');
eq(pause2.ok, false, 'second pause same month refused');
eq(pause2.code, 'limit', 'refusal reason = limit');

console.log('\n[17] pause reason too short');
const pEnv2 = makeEnv();
const PC2 = pEnv2.Core;
const shortRes = PC2.emergencyPause('short');
eq(shortRes.ok, false, 'short reason refused');
eq(shortRes.code, 'reason', 'refusal reason = reason');

console.log('\n[18] fake clock / debug');
const dEnv = makeEnv();
const DC = dEnv.Core;
eq(DC.debug.status().fake, false, 'clock not fake initially');
DC.debug.setNow(new Date('2026-01-11T01:00:00').getTime());
eq(DC.debug.status().fake, true, 'clock now fake');
eq(DC.today(), '2026-01-11', 'fake clock reports new day');
DC.debug.simulateReset();
eq(DC.debug.status().fake, true, 'clock still fake after simulate');
DC.debug.clear();
eq(DC.debug.status().fake, false, 'clock cleared');

console.log('\n[19] reset time setting');
const rEnv = makeEnv();
const RC = rEnv.Core;
eq(RC.setResetTime('05:00'), true, 'valid reset time accepted');
eq(RC.resetTime(), '05:00', 'reset time stored');
eq(RC.setResetTime('99:99'), false, 'invalid reset time refused');

console.log('\n[20] persistence');
C = (makeEnv()).Core;
C.setName('Tester');
const snapshot = C.state.player.level;
const envP = makeEnv();
// reload via new env with stored data
const store = envP.store;
// copy state
const st = C.exportJSON();
envP.Core.importJSON(st);
eq(envP.Core.state.player.name, 'Tester', 'name persisted via import');
eq(envP.Core.state.schema, 3, 'schema 3 persisted');

console.log('\n[21] v1 migration');
const legacy = {
  player: { name: 'Old Hunter', level: 7, exp: 33, gold: 500, hp: 80, mp: 50, points: 3, created: '2025-12-01', lastDay: '2026-01-10' },
  quests: [
    { id: 'x1', type: 'daily', title: 'Old daily', difficulty: 'hard', streak: 4, bestStreak: 9, lastDoneDate: '2026-01-10' },
    { id: 'x2', type: 'main', title: 'Old main', difficulty: 'epic' }
  ],
  history: { '2026-01-09': { exp: 40, quests: 2, missed: 1 } },
  gold: 500, shop: [], goals: [], achievements: {}, journal: {}, totals: { exp: 1, quests: 9, gold: 5 }
};
const mig = makeEnv('2026-01-10T12:00:00', { 'system-os:v1': JSON.stringify(legacy) });
C = mig.Core;
eq(C.state.schema, 3, 'migrated state is schema 3');
eq(C.state.player.level, 7, 'level preserved');
eq(C.state.player.exp, 33, 'xp preserved');
eq(C.state.player.name, 'Old Hunter', 'name preserved');
eq(C.state.player.gold, undefined, 'gold dropped');
eq(C.state.quests.length, 1, 'only daily quests survive');
eq(C.state.quests[0].estimatedMinutes, 40, 'old hard tier mapped to 40 min');
eq(C.state.quests[0].streak, 4, 'quest streak preserved');
eq(C.state.history['2026-01-09'].xp, 40, 'legacy exp field migrated to xp');
eq(mig.store['system-os:v1'], undefined, 'legacy key removed');

console.log('\n[22] export / import / reset');
const day8 = makeEnv();
C = day8.Core;
finish(C, C.dailies()[0]);
const json = C.exportJSON();
C.resetAll();
eq(C.state.player.level, 1, 'reset clears the level');
eq(C.state.player.exp, 0, 'reset clears xp');
eq(C.dailies().length, 4, 'reset reseeds quests');
assert(json.indexOf('"schema": 3') >= 0, 'export carries the schema');
C.importJSON(json);
eq(C.state.player.exp, 20, 'import restores xp');
eq(C.state.stats.discipline, 1, 'import restores stats');

console.log('\n[23] rank starts at E');
const rankEnv = makeEnv();
eq(rankEnv.Core.rank(), 'E', 'new player rank E');
eq(rankEnv.Core.state.player.escalationLevel, 0, 'escalation 0');

console.log('\n[24] escalation after 7 cleared days');
const escEnv = makeEnv();
const EC = escEnv.Core;
for (let i = 0; i < 7; i++) {
  EC.dailies().forEach((q) => { q.trackedSec = q.estimatedMinutes * 60; q.note = 'done'; });
  EC.dailies().forEach((q) => EC.validateQuest(q.id));
  escEnv.advance(1);
  EC.tick();
}
eq(EC.streak(), 7, 'streak 7');
eq(EC.escalationLevel(), 1, 'escalation level 1');

console.log('\n[25] weekly judgement promotes on Sunday');
const sunEnv = makeEnv('2025-12-30T12:00:00');
const SC = sunEnv.Core;
for (let i = 0; i < 5; i++) {
  SC.dailies().forEach((q) => { q.trackedSec = q.estimatedMinutes * 60; q.note = 'done'; });
  SC.dailies().forEach((q) => SC.validateQuest(q.id));
  sunEnv.advance(1);
  SC.tick();
}
// clear Sunday itself
SC.dailies().forEach((q) => { q.trackedSec = q.estimatedMinutes * 60; q.note = 'done'; });
SC.dailies().forEach((q) => SC.validateQuest(q.id));
sunEnv.advance(1);
SC.tick();
eq(SC.rank(), 'D', 'promoted to D after Sunday judgement');

console.log('\n[26] demotion applies at judgement');
const demEnv = makeEnv('2025-12-30T12:00:00');
const DC3 = demEnv.Core;
DC3.state.player.rank = 'C';
DC3.state.player.demotionQueued = true;
while (DC3.today() < '2026-01-05') { demEnv.advance(1); DC3.tick(); }
eq(DC3.rank(), 'D', 'demoted to D after Sunday judgement');

console.log('\n[27] monthly boss');
const bossEnv = makeEnv();
const BC = bossEnv.Core;
eq(BC.boss().progress, 0, 'boss starts at 0');
eq(BC.bossTarget(), 10, 'boss target 10');
BC.addBossProgress(3);
eq(BC.bossProgress(), 3, 'progress 3');
eq(BC.bossCleared(), false, 'not cleared');
BC.addBossProgress(7);
eq(BC.bossProgress(), 10, 'progress clamped to 10');
eq(BC.bossCleared(), true, 'boss cleared');
eq(BC.state.player.exp > 0, true, 'reward granted');

console.log('\n[28] boss fail on month change');
const bossEnv2 = makeEnv('2026-01-15T12:00:00');
const BC2 = bossEnv2.Core;
BC2.addBossProgress(2);
eq(BC2.bossProgress(), 2, 'progress 2');
bossEnv2.advance(20);
BC2.tick();
eq(BC2.bossProgress(), 0, 'new month resets boss');

console.log('\n[23] budget invariant after random edits');
let over = 0;
for (let i = 0; i < 120; i++) {
  const e = makeEnv();
  const c = e.Core;
  for (let k = 0; k < 6; k++) {
    const mins = 5 + Math.floor(Math.random() * 70);
    c.addQuest({ title: 'r' + k, estimatedMinutes: mins, stat: 'strength', difficulty: 'easy' });
  }
  if (c.budgetUsed() > 180) over += 1;
  if (c.dailies().length > 5) over += 1;
  if (c.dailies().length < 3) over += 1;
}
eq(over, 0, '120 random add-sprees stay inside 3-5 quests and 180 min');

console.log('\n' + (failures ? failures + ' FAILURE(S)' : 'ALL CORE TESTS PASSED'));
process.exit(failures ? 1 : 0);
