export const DATA_VERSION = 1;
export const STORAGE_KEY = 'habit-tracker-data-v1';
export const EXPORT_APP_ID = 'tja-growth-tracker';

export const WEEKDAYS = Object.freeze([
  { value: 1, short: '一', label: '周一' },
  { value: 2, short: '二', label: '周二' },
  { value: 3, short: '三', label: '周三' },
  { value: 4, short: '四', label: '周四' },
  { value: 5, short: '五', label: '周五' },
  { value: 6, short: '六', label: '周六' },
  { value: 7, short: '日', label: '周日' },
]);

const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const THEMES = new Set(['system', 'light', 'dark']);

export function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `habit-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

export function padNumber(value, length = 2) {
  return String(value).padStart(length, '0');
}

export function toDateKey(date = new Date()) {
  return `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`;
}

export function isValidDateKey(value) {
  if (typeof value !== 'string') return false;
  const match = DATE_KEY_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day, 12);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function parseDateKey(dateKey) {
  if (!isValidDateKey(dateKey)) throw new Error(`无效日期：${dateKey}`);
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}

export function compareDateKeys(left, right) {
  return left.localeCompare(right);
}

export function addDays(dateKey, amount) {
  const date = parseDateKey(dateKey);
  date.setDate(date.getDate() + amount);
  return toDateKey(date);
}

export function getWeekday(dateKey) {
  const day = parseDateKey(dateKey).getDay();
  return day === 0 ? 7 : day;
}

export function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

export function getMonthEndDateKey(year, month) {
  return `${year}-${padNumber(month)}-${padNumber(getDaysInMonth(year, month))}`;
}

export function getMonthStartDateKey(year, month) {
  return `${year}-${padNumber(month)}-01`;
}

export function formatDateLong(dateKey) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(parseDateKey(dateKey));
}

export function formatDateFull(dateKey) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(parseDateKey(dateKey));
}

export function formatMonthTitle(year, month) {
  return `${year}年${month}月`;
}

export function formatSchedule(weekdays) {
  const values = [...new Set(weekdays)].sort((a, b) => a - b);
  if (values.length === 7) return '每天';
  if (values.join(',') === '1,2,3,4,5') return '工作日';
  if (values.join(',') === '6,7') return '周末';
  return values.map((value) => WEEKDAYS[value - 1]?.label).filter(Boolean).join('、');
}

export function createDefaultData() {
  return {
    schemaVersion: DATA_VERSION,
    habits: [],
    checkins: {},
    preferences: { theme: 'system' },
  };
}

function cleanWeekdays(values) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map(Number).filter((value) => Number.isInteger(value) && value >= 1 && value <= 7))].sort((a, b) => a - b);
}

function cleanName(value) {
  return typeof value === 'string' ? value.trim().slice(0, 30) : '';
}

function cleanEmoji(value) {
  if (typeof value !== 'string') return '•';
  const trimmed = value.trim();
  return trimmed ? [...trimmed].slice(0, 2).join('') : '•';
}

function datePart(value, fallback) {
  if (typeof value === 'string' && isValidDateKey(value.slice(0, 10))) return value.slice(0, 10);
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return toDateKey(parsed);
  }
  return fallback;
}

function normalizeScheduleHistory(history, legacyWeekdays, fallbackDate) {
  const entries = Array.isArray(history) ? history : [];
  const normalized = entries
    .map((entry) => ({
      effectiveFrom: datePart(entry?.effectiveFrom, fallbackDate),
      weekdays: cleanWeekdays(entry?.weekdays),
    }))
    .filter((entry) => entry.weekdays.length > 0)
    .sort((left, right) => compareDateKeys(left.effectiveFrom, right.effectiveFrom));

  if (normalized.length > 0) return normalized;

  const weekdays = cleanWeekdays(legacyWeekdays);
  return [{
    effectiveFrom: fallbackDate,
    weekdays: weekdays.length > 0 ? weekdays : [1, 2, 3, 4, 5, 6, 7],
  }];
}

function normalizeArchivePeriods(periods, archivedAt, createdDate) {
  const normalized = Array.isArray(periods)
    ? periods
      .map((period) => {
        const from = datePart(period?.from, null);
        const to = period?.to ? datePart(period.to, null) : null;
        if (!from) return null;
        return to && compareDateKeys(to, from) < 0 ? { from, to: null } : { from, to };
      })
      .filter(Boolean)
      .sort((left, right) => compareDateKeys(left.from, right.from))
    : [];

  if (normalized.length === 0 && archivedAt) {
    normalized.push({ from: datePart(archivedAt, createdDate), to: null });
  }
  return normalized;
}

function normalizeHabit(habit, index) {
  if (!habit || typeof habit !== 'object') return null;
  const now = new Date();
  const createdAt = typeof habit.createdAt === 'string' && !Number.isNaN(new Date(habit.createdAt).getTime())
    ? habit.createdAt
    : now.toISOString();
  const createdDate = datePart(habit.createdDate, toDateKey(new Date(createdAt)));
  const name = cleanName(habit.name);
  if (!name) return null;

  return {
    id: typeof habit.id === 'string' && habit.id ? habit.id : createId(),
    name,
    emoji: cleanEmoji(habit.emoji),
    createdDate,
    createdAt,
    scheduleHistory: normalizeScheduleHistory(habit.scheduleHistory, habit.weekdays, createdDate),
    archivePeriods: normalizeArchivePeriods(habit.archivePeriods, habit.archivedAt, createdDate),
    archivedAt: typeof habit.archivedAt === 'string' ? habit.archivedAt : null,
    sortOrder: Number.isFinite(Number(habit.sortOrder)) ? Number(habit.sortOrder) : index,
  };
}

export function normalizeData(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const habits = Array.isArray(source.habits)
    ? source.habits.map(normalizeHabit).filter(Boolean)
    : [];
  const validHabitIds = new Set(habits.map((habit) => habit.id));
  const checkins = {};

  if (source.checkins && typeof source.checkins === 'object') {
    for (const [habitId, dates] of Object.entries(source.checkins)) {
      if (!validHabitIds.has(habitId) || !dates || typeof dates !== 'object') continue;
      const activeDates = {};
      for (const [dateKey, completed] of Object.entries(dates)) {
        if (completed === true && isValidDateKey(dateKey)) activeDates[dateKey] = true;
      }
      if (Object.keys(activeDates).length > 0) checkins[habitId] = activeDates;
    }
  }

  const theme = THEMES.has(source.preferences?.theme) ? source.preferences.theme : 'system';
  return {
    schemaVersion: DATA_VERSION,
    habits,
    checkins,
    preferences: { theme },
  };
}

export function validateExportPayload(payload) {
  if (!payload || typeof payload !== 'object') return { valid: false, error: '文件内容不是有效的 JSON 对象。' };
  if (payload.app !== EXPORT_APP_ID) return { valid: false, error: '这不是“Tja的成长之路”的备份文件。' };
  if (payload.schemaVersion !== DATA_VERSION || payload.data?.schemaVersion !== DATA_VERSION) {
    return { valid: false, error: `备份版本不受支持，当前需要版本 ${DATA_VERSION}。` };
  }
  if (!Array.isArray(payload.data.habits)) return { valid: false, error: '备份中缺少习惯列表。' };
  if (!payload.data.checkins || typeof payload.data.checkins !== 'object') return { valid: false, error: '备份中缺少打卡记录。' };

  const ids = new Set();
  for (const habit of payload.data.habits) {
    if (!habit || typeof habit !== 'object') return { valid: false, error: '习惯数据格式不正确。' };
    if (typeof habit.id !== 'string' || !habit.id) return { valid: false, error: '习惯缺少有效 ID。' };
    if (ids.has(habit.id)) return { valid: false, error: '备份中存在重复的习惯 ID。' };
    ids.add(habit.id);
    const name = cleanName(habit.name);
    if (!name) return { valid: false, error: '存在名称为空的习惯。' };
    if (!Array.isArray(habit.scheduleHistory) || habit.scheduleHistory.length === 0) {
      return { valid: false, error: `“${name}”缺少排期数据。` };
    }
    for (const schedule of habit.scheduleHistory) {
      if (!isValidDateKey(schedule?.effectiveFrom) || cleanWeekdays(schedule?.weekdays).length === 0) {
        return { valid: false, error: `“${name}”的排期数据无效。` };
      }
    }
  }

  for (const [habitId, dates] of Object.entries(payload.data.checkins)) {
    if (!ids.has(habitId) || !dates || typeof dates !== 'object') {
      return { valid: false, error: '打卡记录包含无效的习惯引用。' };
    }
    for (const [dateKey, completed] of Object.entries(dates)) {
      if (!isValidDateKey(dateKey) || completed !== true) {
        return { valid: false, error: '打卡记录包含无效日期或状态。' };
      }
    }
  }

  return { valid: true, data: normalizeData(payload.data) };
}

export function sortHabits(habits) {
  return [...habits].sort((left, right) => {
    const order = Number(left.sortOrder) - Number(right.sortOrder);
    if (order !== 0) return order;
    return left.createdAt.localeCompare(right.createdAt);
  });
}

export function getScheduleForDate(habit, dateKey) {
  const applicable = (habit?.scheduleHistory ?? [])
    .filter((entry) => compareDateKeys(entry.effectiveFrom, dateKey) <= 0)
    .sort((left, right) => compareDateKeys(left.effectiveFrom, right.effectiveFrom));
  return applicable.at(-1)?.weekdays ?? habit?.scheduleHistory?.[0]?.weekdays ?? [1, 2, 3, 4, 5, 6, 7];
}

export function isDateInArchive(habit, dateKey) {
  return (habit?.archivePeriods ?? []).some((period) => {
    if (compareDateKeys(dateKey, period.from) < 0) return false;
    return !period.to || compareDateKeys(dateKey, period.to) <= 0;
  });
}

export function isHabitRelevantOnDate(habit, dateKey) {
  if (!habit || !isValidDateKey(dateKey)) return false;
  if (compareDateKeys(dateKey, habit.createdDate) < 0) return false;
  return !isDateInArchive(habit, dateKey);
}

export function isHabitDueOnDate(habit, dateKey) {
  if (!isHabitRelevantOnDate(habit, dateKey)) return false;
  return getScheduleForDate(habit, dateKey).includes(getWeekday(dateKey));
}

export function getDueHabitsForDate(data, dateKey) {
  return sortHabits((data?.habits ?? []).filter((habit) => isHabitDueOnDate(habit, dateKey)));
}

export function getOffScheduleHabitsForDate(data, dateKey) {
  return sortHabits((data?.habits ?? []).filter((habit) => {
    return isHabitRelevantOnDate(habit, dateKey) && !isHabitDueOnDate(habit, dateKey);
  }));
}

export function isHabitCompleted(data, habitId, dateKey) {
  return data?.checkins?.[habitId]?.[dateKey] === true;
}

export function setHabitCompletion(data, habitId, dateKey, completed) {
  if (!isValidDateKey(dateKey) || !data?.habits?.some((habit) => habit.id === habitId)) return data;
  const nextCheckins = { ...(data.checkins ?? {}) };
  const habitDates = { ...(nextCheckins[habitId] ?? {}) };

  if (completed) habitDates[dateKey] = true;
  else delete habitDates[dateKey];

  if (Object.keys(habitDates).length > 0) nextCheckins[habitId] = habitDates;
  else delete nextCheckins[habitId];

  return { ...data, checkins: nextCheckins };
}

export function getDayStats(data, dateKey) {
  const dueHabits = getDueHabitsForDate(data, dateKey);
  const completed = dueHabits.filter((habit) => isHabitCompleted(data, habit.id, dateKey)).length;
  return {
    due: dueHabits.length,
    completed,
    isComplete: dueHabits.length > 0 && completed === dueHabits.length,
    percentage: dueHabits.length > 0 ? Math.round((completed / dueHabits.length) * 100) : 0,
  };
}

export function getOverallStreak(data, throughDateKey, maximumDays = 3660) {
  const habits = data?.habits ?? [];
  if (habits.length === 0) return 0;
  const earliestDate = habits.map((habit) => habit.createdDate).sort(compareDateKeys)[0];
  let cursor = throughDateKey;
  let streak = 0;
  let checkedDays = 0;

  while (compareDateKeys(cursor, earliestDate) >= 0 && checkedDays < maximumDays) {
    const stats = getDayStats(data, cursor);
    if (stats.due > 0) {
      if (!stats.isComplete) break;
      streak += 1;
    }
    cursor = addDays(cursor, -1);
    checkedDays += 1;
  }
  return streak;
}

export function getHabitStreak(data, habit, throughDateKey, maximumDays = 3660) {
  if (!habit || !isHabitRelevantOnDate(habit, throughDateKey)) return 0;
  let cursor = throughDateKey;
  let streak = 0;
  let checkedDays = 0;
  while (compareDateKeys(cursor, habit.createdDate) >= 0 && checkedDays < maximumDays) {
    if (isHabitDueOnDate(habit, cursor)) {
      if (!isHabitCompleted(data, habit.id, cursor)) break;
      streak += 1;
    }
    cursor = addDays(cursor, -1);
    checkedDays += 1;
  }
  return streak;
}

export function getMonthStats(data, year, month, todayDateKey) {
  const start = getMonthStartDateKey(year, month);
  const monthEnd = getMonthEndDateKey(year, month);
  const end = compareDateKeys(monthEnd, todayDateKey) <= 0 ? monthEnd : todayDateKey;
  if (compareDateKeys(start, end) > 0) return { due: 0, completed: 0, percentage: 0 };

  let cursor = start;
  let due = 0;
  let completed = 0;
  while (compareDateKeys(cursor, end) <= 0) {
    const stats = getDayStats(data, cursor);
    due += stats.due;
    completed += stats.completed;
    cursor = addDays(cursor, 1);
  }
  return { due, completed, percentage: due > 0 ? Math.round((completed / due) * 100) : 0 };
}

export function updateHabitSchedule(habit, weekdays, effectiveFrom) {
  const nextWeekdays = cleanWeekdays(weekdays);
  if (nextWeekdays.length === 0) return habit;
  const history = [...(habit.scheduleHistory ?? [])].sort((left, right) => compareDateKeys(left.effectiveFrom, right.effectiveFrom));
  const current = getScheduleForDate(habit, effectiveFrom);
  if (current.join(',') === nextWeekdays.join(',')) return { ...habit, scheduleHistory: history };

  const last = history.at(-1);
  if (last?.effectiveFrom === effectiveFrom) {
    history[history.length - 1] = { effectiveFrom, weekdays: nextWeekdays };
  } else {
    history.push({ effectiveFrom, weekdays: nextWeekdays });
  }
  return { ...habit, scheduleHistory: history };
}

export function archiveHabit(data, habitId, dateKey) {
  return {
    ...data,
    habits: data.habits.map((habit) => {
      if (habit.id !== habitId || habit.archivedAt) return habit;
      return {
        ...habit,
        archivedAt: new Date().toISOString(),
        archivePeriods: [...habit.archivePeriods, { from: dateKey, to: null }],
      };
    }),
  };
}

export function restoreHabit(data, habitId, dateKey) {
  const yesterday = addDays(dateKey, -1);
  return {
    ...data,
    habits: data.habits.map((habit) => {
      if (habit.id !== habitId || !habit.archivedAt) return habit;
      const archivePeriods = habit.archivePeriods.map((period, index, all) => {
        if (index !== all.length - 1 || period.to) return period;
        return { ...period, to: yesterday };
      }).filter((period) => compareDateKeys(period.to ?? period.from, period.from) >= 0);
      return { ...habit, archivedAt: null, archivePeriods };
    }),
  };
}

export function deleteHabitCompletely(data, habitId) {
  const checkins = { ...data.checkins };
  delete checkins[habitId];
  return {
    ...data,
    habits: data.habits.filter((habit) => habit.id !== habitId),
    checkins,
  };
}

export function extractPlainData(data) {
  return normalizeData(JSON.parse(JSON.stringify(data)));
}

export function buildExportPayload(data) {
  return {
    app: EXPORT_APP_ID,
    schemaVersion: DATA_VERSION,
    exportedAt: new Date().toISOString(),
    data: extractPlainData(data),
  };
}