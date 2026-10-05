import test from 'node:test';
import assert from 'node:assert/strict';
import {
  archiveHabit,
  buildExportPayload,
  createDefaultData,
  deleteHabitCompletely,
  getDayStats,
  getDueHabitsForDate,
  getHabitStreak,
  getMonthStats,
  getOffScheduleHabitsForDate,
  getOverallStreak,
  getWeekday,
  isHabitDueOnDate,
  normalizeData,
  restoreHabit,
  setHabitCompletion,
  updateHabitSchedule,
  validateExportPayload,
} from '../js/core.js';

function habit(overrides = {}) {
  return {
    id: overrides.id ?? 'habit-1',
    name: overrides.name ?? '喝水',
    emoji: '💧',
    createdDate: overrides.createdDate ?? '2026-10-01',
    createdAt: overrides.createdAt ?? '2026-10-01T00:00:00.000Z',
    scheduleHistory: overrides.scheduleHistory ?? [{ effectiveFrom: '2026-10-01', weekdays: [1, 2, 3, 4, 5, 6, 7] }],
    archivePeriods: overrides.archivePeriods ?? [],
    archivedAt: overrides.archivedAt ?? null,
    sortOrder: overrides.sortOrder ?? 0,
  };
}

test('weekdays use Monday=1 through Sunday=7', () => {
  assert.equal(getWeekday('2026-10-05'), 1);
  assert.equal(getWeekday('2026-10-11'), 7);
});

test('habit schedule, creation date and off-schedule state are respected', () => {
  const weekdaysOnly = habit({ scheduleHistory: [{ effectiveFrom: '2026-10-01', weekdays: [1, 2, 3, 4, 5] }] });
  const data = { ...createDefaultData(), habits: [weekdaysOnly] };

  assert.equal(isHabitDueOnDate(weekdaysOnly, '2026-10-05'), true);
  assert.equal(isHabitDueOnDate(weekdaysOnly, '2026-10-10'), false);
  assert.equal(isHabitDueOnDate(weekdaysOnly, '2026-09-30'), false);
  assert.deepEqual(getDueHabitsForDate(data, '2026-10-05').map((item) => item.id), ['habit-1']);
  assert.deepEqual(getOffScheduleHabitsForDate(data, '2026-10-10').map((item) => item.id), ['habit-1']);
});

test('schedule changes apply from their effective date without rewriting history', () => {
  const original = habit({ scheduleHistory: [{ effectiveFrom: '2026-10-01', weekdays: [1] }] });
  const updated = updateHabitSchedule(original, [1, 3], '2026-10-05');

  assert.equal(isHabitDueOnDate(updated, '2026-10-05'), true);
  assert.equal(isHabitDueOnDate(updated, '2026-10-07'), true);
  assert.equal(isHabitDueOnDate(updated, '2026-10-06'), false);
  assert.equal(isHabitDueOnDate(updated, '2026-10-04'), false);
  assert.equal(updated.scheduleHistory.length, 2);
});

test('completion updates are immutable and daily stats reflect scheduled habits only', () => {
  const first = habit({ id: 'first' });
  const second = habit({ id: 'second', sortOrder: 1 });
  const weekendOnly = habit({
    id: 'weekend',
    sortOrder: 2,
    scheduleHistory: [{ effectiveFrom: '2026-10-01', weekdays: [6, 7] }],
  });
  const data = { ...createDefaultData(), habits: [first, second, weekendOnly] };
  const next = setHabitCompletion(data, 'first', '2026-10-05', true);

  assert.equal(data.checkins.first, undefined);
  assert.equal(next.checkins.first['2026-10-05'], true);
  assert.deepEqual(getDayStats(next, '2026-10-05'), {
    due: 2,
    completed: 1,
    isComplete: false,
    percentage: 50,
  });
  assert.deepEqual(getDayStats(next, '2026-10-06'), {
    due: 2,
    completed: 0,
    isComplete: false,
    percentage: 0,
  });

  const cleared = setHabitCompletion(next, 'first', '2026-10-05', false);
  assert.equal(cleared.checkins.first, undefined);
});

test('habit streak skips unscheduled days and overall streak requires all scheduled habits', () => {
  const mondayHabit = habit({
    id: 'monday',
    createdDate: '2026-09-01',
    createdAt: '2026-09-01T00:00:00.000Z',
    scheduleHistory: [{ effectiveFrom: '2026-09-01', weekdays: [1] }],
  });
  let data = { ...createDefaultData(), habits: [mondayHabit] };
  data = setHabitCompletion(data, 'monday', '2026-09-28', true);
  data = setHabitCompletion(data, 'monday', '2026-10-05', true);

  assert.equal(getHabitStreak(data, mondayHabit, '2026-10-05'), 2);
  assert.equal(getOverallStreak(data, '2026-10-05'), 2);
});

test('month statistics only include dates up to today', () => {
  const daily = habit();
  let data = { ...createDefaultData(), habits: [daily] };
  data = setHabitCompletion(data, daily.id, '2026-10-01', true);
  data = setHabitCompletion(data, daily.id, '2026-10-02', true);

  assert.deepEqual(getMonthStats(data, 2026, 10, '2026-10-05'), {
    due: 5,
    completed: 2,
    percentage: 40,
  });
});

test('archiving hides the habit for the archive period while preserving checkins', () => {
  const daily = habit();
  let data = { ...createDefaultData(), habits: [daily] };
  data = setHabitCompletion(data, daily.id, '2026-10-01', true);
  data = setHabitCompletion(data, daily.id, '2026-10-02', true);
  data = archiveHabit(data, daily.id, '2026-10-03');
  const archivedHabit = data.habits[0];

  assert.equal(isHabitDueOnDate(archivedHabit, '2026-10-02'), true);
  assert.equal(isHabitDueOnDate(archivedHabit, '2026-10-03'), false);
  assert.equal(data.checkins[daily.id]['2026-10-01'], true);

  data = restoreHabit(data, daily.id, '2026-10-04');
  const restoredHabit = data.habits[0];
  assert.equal(isHabitDueOnDate(restoredHabit, '2026-10-03'), false);
  assert.equal(isHabitDueOnDate(restoredHabit, '2026-10-04'), true);
});

test('permanent deletion removes both the habit and its checkins', () => {
  const daily = habit();
  let data = { ...createDefaultData(), habits: [daily] };
  data = setHabitCompletion(data, daily.id, '2026-10-01', true);
  data = deleteHabitCompletely(data, daily.id);

  assert.deepEqual(data.habits, []);
  assert.deepEqual(data.checkins, {});
});

test('export payload validates strict checkin data', () => {
  const daily = habit();
  let data = { ...createDefaultData(), habits: [daily] };
  data = setHabitCompletion(data, daily.id, '2026-10-01', true);
  const payload = buildExportPayload(data);

  assert.equal(validateExportPayload(payload).valid, true);

  const invalid = structuredClone(payload);
  invalid.data.checkins[daily.id]['not-a-date'] = true;
  const validation = validateExportPayload(invalid);
  assert.equal(validation.valid, false);
  assert.match(validation.error, /日期/);
});

test('normalization fills defaults and drops unrelated checkins', () => {
  const normalized = normalizeData({
    schemaVersion: 1,
    habits: [{ id: 'kept', name: '阅读' }],
    checkins: {
      kept: { '2026-10-05': true },
      removed: { '2026-10-05': true },
    },
    preferences: { theme: 'unknown' },
  });

  assert.equal(normalized.habits[0].scheduleHistory[0].weekdays.length, 7);
  assert.equal(normalized.checkins.removed, undefined);
  assert.equal(normalized.preferences.theme, 'system');
});