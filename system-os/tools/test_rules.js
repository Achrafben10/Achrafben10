/* Pure-function tests for js/rules.js. Same harness style as test_core.js. */
const path = require('path');
const Rules = require(path.join(__dirname, '..', 'js', 'rules.js'));

let failures = 0;
function assert(cond, msg) {
  if (cond) console.log('  PASS ' + msg);
  else { failures += 1; console.log('  FAIL ' + msg); }
}
function eq(actual, expected, msg) {
  assert(actual === expected, msg + (actual === expected ? '' : ' (got ' + actual + ', want ' + expected + ')'));
}
function q(minutes, difficulty, extra) {
  return Object.assign({ id: 'q' + minutes + difficulty, type: 'daily', estimatedMinutes: minutes, difficulty: difficulty }, extra || {});
}

console.log('\n[1] difficulty multipliers');
eq(Rules.mult('easy'), 1.0, 'easy = 1.0');
eq(Rules.mult('normal'), 1.5, 'normal = 1.5');
eq(Rules.mult('hard'), 2.0, 'hard = 2.0');
eq(Rules.mult('legendary'), 1.5, 'unknown difficulty falls back to 1.5');

console.log('\n[2] level curve: +15% each level');
eq(Rules.levelXp(1), 100, 'level 1 needs 100');
eq(Rules.levelXp(2), 115, 'level 2 needs 115');
eq(Rules.levelXp(3), 132, 'level 3 needs 132');
eq(Rules.levelXp(4), 152, 'level 4 needs 152');
eq(Rules.levelXp(5), 175, 'level 5 needs 175');
let mono = true;
for (let lv = 1; lv < 40; lv++) {
  if (!(Rules.levelXp(lv + 1) > Rules.levelXp(lv))) mono = false;
}
assert(mono, 'curve is strictly increasing for 40 levels');
eq(Rules.levelXp(0), 100, 'level 0 clamps to level 1');

console.log('\n[3] quest xp = minutes x multiplier');
eq(Rules.questXp(30, 'normal'), 45, '30 min normal = 45 xp');
eq(Rules.questXp(20, 'easy'), 20, '20 min easy = 20 xp');
eq(Rules.questXp(60, 'hard'), 120, '60 min hard = 120 xp');
eq(Rules.questXp(5, 'easy'), 5, '5 min easy = 5 xp');
eq(Rules.questXp(0, 'normal'), 2, '0 minutes still clamps to 1 minute');

console.log('\n[4] late completion keeps 50%');
eq(Rules.awardXp(30, 'normal', false), 45, 'on time = full xp');
eq(Rules.awardXp(30, 'normal', true), 23, 'late = half xp (23)');
eq(Rules.awardXp(20, 'easy', true), 10, 'late easy 20 = 10');

console.log('\n[5] proof of work');
eq(Rules.requiredSec(30), 1440, '30 min needs 1440 s tracked');
eq(Rules.requiredSec(7), 336, '7 min needs 336 s (ceil)');
eq(Rules.proofOk(1439, 30, 'did it').code, 'time', 'one second short is rejected');
eq(Rules.proofOk(1440, 30, 'did it').ok, true, 'exactly 80% passes');
eq(Rules.proofOk(1800, 30, '   ').code, 'note', 'blank note is rejected');
eq(Rules.proofOk(1800, 30, 'finished 3 sets').ok, true, 'time + note validates');
eq(Rules.proofOk(0, 30, '').code, 'time', 'nothing tracked, nothing noted');

console.log('\n[6] 180-minute budget');
const day = [q(30, 'normal'), q(20, 'easy'), q(60, 'hard')];
eq(Rules.budgetUsed(day), 110, 'budget sums minutes');
eq(Rules.budgetLeft(day), 70, 'budget left = 180 - used');
eq(Rules.budgetUsed([Object.assign(q(40, 'easy'), { type: 'boss' })]), 0, 'non-daily minutes are ignored');

eq(Rules.canAddDaily(day, 70).ok, true, '70 more minutes fit exactly');
eq(Rules.canAddDaily(day, 71).ok, false, '71 more minutes are refused');
eq(Rules.canAddDaily(day, 71).code, 'budget', 'refusal reason is budget');
eq(Rules.canAddDaily(day, 71).left, 70, 'refusal reports 70 minutes left');

const full = [q(60, 'hard'), q(60, 'hard'), q(60, 'hard')];
eq(Rules.canAddDaily(full, 1).ok, false, 'nothing fits at 180');
eq(Rules.canAddDaily(day, 0).ok, false, 'zero-minute quests are refused');
eq(Rules.canAddDaily(day, 0).code, 'minutes', 'zero-minute reason is minutes');

const five = [q(20, 'easy'), q(20, 'easy'), q(20, 'easy'), q(20, 'easy'), q(20, 'easy')];
eq(Rules.canAddDaily(five, 20).code, 'max', 'sixth daily is refused');
eq(Rules.canAddDaily(five, 20).ok, false, 'max 5 dailies');

console.log('\n[7] daily floor');
eq(Rules.canRemoveDaily(five).ok, true, 'can remove from 5');
eq(Rules.canRemoveDaily(day).code, 'min', 'cannot drop below 3');
eq(Rules.canRemoveDaily([q(10, 'easy'), q(10, 'easy')]).ok, false, 'cannot remove from 2');

console.log('\n[8] CORE quests');
eq(Rules.coreCount([q(10, 'easy', { core: true }), q(10, 'easy', { core: true })]), 2, 'counts core quests');
eq(Rules.canSetCore([q(10, 'easy', { core: true }), q(10, 'easy', { core: true }), q(10, 'easy')], 'x', true).code, 'coreMax', 'third core is refused');
eq(Rules.canSetCore([q(10, 'easy', { core: true }), q(10, 'easy')], 'x', true).ok, true, 'second core is allowed');

console.log('\n[9] day clear state');
const today = '2026-01-10';
const list = [
  Object.assign(q(30, 'normal'), { validatedDay: today, late: false }),
  Object.assign(q(20, 'easy'), { validatedDay: today, late: true }),
  Object.assign(q(10, 'easy'), { validatedDay: '2026-01-09', late: false })
];
eq(Rules.clearedCount(list, today), 1, 'late and stale quests are not cleared');
eq(Rules.dayCleared(list, today), false, 'day is not cleared');
const allDone = list.map((x) => Object.assign({}, x, { validatedDay: today, late: false }));
eq(Rules.dayCleared(allDone, today), true, 'all validated + on time clears the day');
eq(Rules.dayCleared([], today), false, 'empty day is never cleared');
eq(Rules.dayPotentialXp(list), 75, 'potential xp sums the day (45 + 20 + 10)');

console.log('\n[10] budget invariant over random days');
let bad = 0;
for (let i = 0; i < 200; i++) {
  const quests = [];
  for (let k = 0; k < 5; k++) {
    const m = 5 + Math.floor(Math.random() * 70);
    if (Rules.canAddDaily(quests, m).ok) quests.push(q(m, 'normal'));
  }
  if (Rules.budgetUsed(quests) > Rules.BUDGET_MIN) bad += 1;
  if (quests.length > Rules.MAX_DAILIES) bad += 1;
}
eq(bad, 0, '200 random builds never exceed 180 min or 5 quests');

console.log('\\n[11] logical day & reset boundary');
eq(Rules.isTime('00:00'), true, '00:00 is a time');
eq(Rules.isTime('23:59'), true, '23:59 is a time');
eq(Rules.isTime('24:00'), false, '24:00 is invalid');
eq(Rules.isTime('abc'), false, 'garbage is invalid');
eq(Rules.logicalDay(new Date('2026-01-10T12:00:00').getTime(), '00:00'), '2026-01-10', 'noon belongs to same day');
eq(Rules.logicalDay(new Date('2026-01-10T00:30:00').getTime(), '05:00'), '2026-01-09', 'before reset rolls back a day');
eq(Rules.logicalDay(new Date('2026-01-10T06:00:00').getTime(), '05:00'), '2026-01-10', 'after reset stays');
const nra = Rules.nextResetAt(new Date('2026-01-10T12:00:00').getTime(), '00:00');
const nraD = new Date(nra);
eq(nraD.getDate(), 11, 'next reset is next midnight');
eq(Rules.addDays('2026-01-10', 1), '2026-01-11', 'addDays works');
eq(Rules.diffDays('2026-01-10','2026-01-13'), 3, 'diffDays works');

console.log('\\n[12] active vs queued');
const qToday = [Object.assign(q(20,'easy'), { activeFrom: '2026-01-10' })];
const qTom = [Object.assign(q(20,'easy'), { activeFrom: '2026-01-11' })];
eq(Rules.activeDailies(qToday.concat(qTom), '2026-01-10').length, 1, 'one active today');
eq(Rules.queuedDailies(qToday.concat(qTom), '2026-01-10').length, 1, 'one queued for tomorrow');

console.log('\\n[13] penalty planning');
const pen = Object.assign(q(15,'normal'), { penalty: true });
const routine = [q(60,'hard'), q(60,'hard'), q(60,'hard')];
const planned = Rules.planWithPenalty(routine, pen, 180, 5);
assert(planned.length <= 5, 'plan keeps <= 5 quests');
assert(Rules.budgetUsed(planned) <= 180, 'plan fits the budget');
assert(planned.some((x) => x.penalty), 'penalty quest included');

console.log('\\n[14] fail / demotion / pause math');
eq(Rules.failXpLoss(100), 50, 'fail loses 50% of potential');
eq(Rules.failXpLoss(33), 17, 'fail rounds');
const fails = ['2026-01-10','2026-01-11','2026-01-12'];
eq(Rules.pruneFails(fails, '2026-01-12').length, 3, 'prune keeps 3 within window');
eq(Rules.demotionDue(fails, '2026-01-12'), true, '3 fails triggers demotion');
eq(Rules.demotionDue(['2026-01-10'], '2026-01-12'), false, 'one fail does not');
eq(Rules.pauseCost(100), 30, 'pause costs 30%');
eq(Rules.pauseCost(115), 35, 'pause rounds up');
eq(Rules.MIN_QUEST_MIN, 20, 'min quest minutes is 20');
eq(Rules.MIN_PROOF_SEC, 960, 'min proof seconds is 960');

console.log('\\n[15] ranks');
eq(Rules.RANKS[0], 'E', 'first rank is E');
eq(Rules.rankIndex('E'), 0, 'E index 0');
eq(Rules.nextRank('E'), 'D', 'E -> D');
eq(Rules.nextRank('S'), 'S', 'S stays S');
eq(Rules.prevRank('E'), 'E', 'E stays E');
eq(Rules.prevRank('D'), 'E', 'D -> E');

console.log('\\n[16] judgement day');
eq(Rules.isJudgementDay('2026-01-04'), true, '2026-01-04 is a Sunday');
eq(Rules.isJudgementDay('2026-01-05'), false, 'Monday is not');

console.log('\\n[17] cleared days in window');
const hist = { '2026-01-04': { cleared: true }, '2026-01-03': { cleared: true }, '2026-01-02': { cleared: false } };
eq(Rules.clearedDaysInWindow(hist, '2026-01-04', 7), 2, '2 cleared in window');
eq(Rules.failsInWindowCount(['2026-01-04','2026-01-01'], '2026-01-04', 7), 2, '2 fails in window');

console.log('\\n[18] escalation');
eq(Rules.escalationDue(7), true, '7 streak escalates');
eq(Rules.escalationDue(6), false, '6 does not');
eq(Rules.escalationMultiplier(1), 1.1, 'level 1 bonus');
eq(Rules.escalationMultiplier(0), 1, 'level 0 no bonus');

console.log('\\n[19] boss progress');
eq(Rules.bossProgressPct(0, 10), 0, '0%');
eq(Rules.bossProgressPct(5, 10), 50, '50%');
eq(Rules.bossProgressPct(10, 10), 100, '100%');
eq(Rules.bossProgressPct(15, 10), 100, 'clamped at 100');

console.log('\\n' + (failures ? failures + ' FAILURE(S)' : 'ALL RULES TESTS PASSED'));
process.exit(failures ? 1 : 0);
