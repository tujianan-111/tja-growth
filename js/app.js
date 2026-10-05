import {
  WEEKDAYS,
  STORAGE_KEY,
  addDays,
  archiveHabit,
  buildExportPayload,
  compareDateKeys,
  createDefaultData,
  createId,
  deleteHabitCompletely,
  formatDateFull,
  formatMonthTitle,
  formatSchedule,
  getDayStats,
  getDaysInMonth,
  getDueHabitsForDate,
  getHabitStreak,
  getMonthEndDateKey,
  getMonthStartDateKey,
  getMonthStats,
  getOffScheduleHabitsForDate,
  getOverallStreak,
  getScheduleForDate,
  getWeekday,
  isHabitCompleted,
  normalizeData,
  parseDateKey,
  restoreHabit,
  setHabitCompletion,
  sortHabits,
  toDateKey,
  updateHabitSchedule,
  validateExportPayload,
} from './core.js';

const elements = {
  todayDate: document.querySelector('#todayDate'),
  completedCount: document.querySelector('#completedCount'),
  dueCount: document.querySelector('#dueCount'),
  streakCount: document.querySelector('#streakCount'),
  progressTrack: document.querySelector('#progressTrack'),
  progressBar: document.querySelector('#progressBar'),
  summaryMessage: document.querySelector('#summaryMessage'),
  viewTabs: [...document.querySelectorAll('.view-tab')],
  todayView: document.querySelector('#todayView'),
  historyView: document.querySelector('#historyView'),
  habitList: document.querySelector('#habitList'),
  offScheduleSection: document.querySelector('#offScheduleSection'),
  offScheduleCount: document.querySelector('#offScheduleCount'),
  offScheduleList: document.querySelector('#offScheduleList'),
  addHabitButton: document.querySelector('#addHabitButton'),
  previousMonthButton: document.querySelector('#previousMonthButton'),
  nextMonthButton: document.querySelector('#nextMonthButton'),
  monthTitle: document.querySelector('#monthTitle'),
  monthCompletion: document.querySelector('#monthCompletion'),
  monthStreak: document.querySelector('#monthStreak'),
  calendarGrid: document.querySelector('#calendarGrid'),
  settingsButton: document.querySelector('#settingsButton'),
  habitDialog: document.querySelector('#habitDialog'),
  habitForm: document.querySelector('#habitForm'),
  habitIdInput: document.querySelector('#habitIdInput'),
  habitDialogKicker: document.querySelector('#habitDialogKicker'),
  habitDialogTitle: document.querySelector('#habitDialogTitle'),
  habitEmojiInput: document.querySelector('#habitEmojiInput'),
  habitNameInput: document.querySelector('#habitNameInput'),
  weekdayOptions: document.querySelector('#weekdayOptions'),
  habitFormError: document.querySelector('#habitFormError'),
  dayDialog: document.querySelector('#dayDialog'),
  dayDialogTitle: document.querySelector('#dayDialogTitle'),
  dayDialogDescription: document.querySelector('#dayDialogDescription'),
  dayDetailList: document.querySelector('#dayDetailList'),
  settingsDialog: document.querySelector('#settingsDialog'),
  themeSelect: document.querySelector('#themeSelect'),
  exportButton: document.querySelector('#exportButton'),
  importInput: document.querySelector('#importInput'),
  storageSummary: document.querySelector('#storageSummary'),
  archiveList: document.querySelector('#archiveList'),
  confirmDialog: document.querySelector('#confirmDialog'),
  confirmSymbol: document.querySelector('#confirmSymbol'),
  confirmDialogTitle: document.querySelector('#confirmDialogTitle'),
  confirmDialogMessage: document.querySelector('#confirmDialogMessage'),
  confirmCancelButton: document.querySelector('#confirmCancelButton'),
  confirmAcceptButton: document.querySelector('#confirmAcceptButton'),
  toast: document.querySelector('#toast'),
};

const icons = {
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.2 4.2L19 7"/></svg>',
  up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 14 5-5 5 5"/></svg>',
  down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg>',
  edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 6.5 17.5 10.5M4.5 19.5l4.1-.8L19.2 8a2.1 2.1 0 0 0-3-3L5.6 15.6l-1.1 3.9Z"/></svg>',
  archive: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16v13H4zM3 4h18v3H3zM9 11h6"/></svg>',
};

let data = loadData();
let currentDateKey = toDateKey();
let activeView = 'today';
let visibleMonth = new Date();
visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
let selectedDateKey = null;
let confirmResolver = null;
let toastTimer = null;
let initialLoadWarning = '';

function loadData() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return createDefaultData();
    return normalizeData(JSON.parse(stored));
  } catch (error) {
    console.error('读取本地数据失败', error);
    initialLoadWarning = '本地数据读取失败，已使用空白数据。原数据未被覆盖，请先导出或检查浏览器存储。';
    return createDefaultData();
  }
}

function persistData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch (error) {
    console.error('保存本地数据失败', error);
    showToast('保存失败，请检查浏览器存储空间。');
    return false;
  }
}

function commitData(nextData, options = {}) {
  data = nextData;
  persistData();
  render();
  if (options.message) showToast(options.message);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  })[character]);
}

function applyTheme() {
  const theme = data.preferences?.theme ?? 'system';
  if (theme === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.dataset.theme = theme;
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add('is-visible');
  toastTimer = window.setTimeout(() => elements.toast.classList.remove('is-visible'), 2600);
}

function render() {
  applyTheme();
  renderToday();
  renderHistory();
  if (elements.settingsDialog.open) renderSettings();
}

function habitCardTemplate(habit, dateKey, groupIds, groupIndex, isOffSchedule = false) {
  const completed = isHabitCompleted(data, habit.id, dateKey);
  const streak = getHabitStreak(data, habit, dateKey);
  const schedule = getScheduleForDate(habit, dateKey);
  const canMoveUp = groupIndex > 0;
  const canMoveDown = groupIndex >= 0 && groupIndex < groupIds.length - 1;
  const safeName = escapeHtml(habit.name);
  const safeEmoji = escapeHtml(habit.emoji);
  const toggleLabel = completed ? `取消完成${habit.name}` : `完成${habit.name}`;

  return `
    <article class="habit-card ${completed ? 'is-complete' : ''} ${isOffSchedule ? 'is-off-schedule' : ''}">
      <button
        class="check-button"
        type="button"
        data-action="toggle-checkin"
        data-id="${escapeHtml(habit.id)}"
        data-date="${dateKey}"
        aria-label="${escapeHtml(toggleLabel)}"
        aria-pressed="${completed}"
        ${isOffSchedule ? 'disabled' : ''}
      >${icons.check}</button>
      <div class="habit-copy">
        <div class="habit-name-row">
          <span class="habit-emoji" aria-hidden="true">${safeEmoji}</span>
          <h3 class="habit-name" title="${safeName}">${safeName}</h3>
        </div>
        <p class="habit-meta">
          <span>${escapeHtml(formatSchedule(schedule))}</span>
          <span class="habit-meta-dot" aria-hidden="true"></span>
          <span>${streak > 0 ? `连续 ${streak} 次` : (isOffSchedule ? '今天休息' : '尚未开始')}</span>
        </p>
      </div>
      <div class="habit-actions" aria-label="${safeName}的操作">
        <button class="habit-action" type="button" data-action="move-up" data-id="${escapeHtml(habit.id)}" aria-label="上移${safeName}" ${canMoveUp ? '' : 'disabled'}>${icons.up}</button>
        <button class="habit-action" type="button" data-action="move-down" data-id="${escapeHtml(habit.id)}" aria-label="下移${safeName}" ${canMoveDown ? '' : 'disabled'}>${icons.down}</button>
        <button class="habit-action" type="button" data-action="edit-habit" data-id="${escapeHtml(habit.id)}" aria-label="编辑${safeName}">${icons.edit}</button>
        <button class="habit-action danger-action" type="button" data-action="archive-habit" data-id="${escapeHtml(habit.id)}" aria-label="归档${safeName}">${icons.archive}</button>
      </div>
    </article>
  `;
}

function renderToday() {
  elements.todayDate.textContent = formatDateFull(currentDateKey);
  const stats = getDayStats(data, currentDateKey);
  const activeHabits = data.habits.filter((habit) => !habit.archivedAt);
  const dueHabits = getDueHabitsForDate(data, currentDateKey);
  const offScheduleHabits = getOffScheduleHabitsForDate(data, currentDateKey).filter((habit) => !habit.archivedAt);
  const dueIds = dueHabits.map((habit) => habit.id);
  const offScheduleIds = offScheduleHabits.map((habit) => habit.id);

  elements.completedCount.textContent = String(stats.completed);
  elements.dueCount.textContent = String(stats.due);
  elements.streakCount.textContent = `${getOverallStreak(data, currentDateKey)} 天`;
  elements.progressBar.style.width = `${stats.percentage}%`;
  elements.progressTrack.setAttribute('aria-valuenow', String(stats.percentage));

  if (stats.due === 0) {
    elements.summaryMessage.textContent = activeHabits.length > 0
      ? '今天没有安排，按自己的节奏休息一下。'
      : '从今天的第一件小事开始。';
  } else if (stats.isComplete) {
    elements.summaryMessage.textContent = '全部完成，今天的你向前走了一步。';
  } else {
    elements.summaryMessage.textContent = `还差 ${stats.due - stats.completed} 项，慢慢来就好。`;
  }

  if (dueHabits.length > 0) {
    elements.habitList.innerHTML = dueHabits
      .map((habit, index) => habitCardTemplate(habit, currentDateKey, dueIds, index))
      .join('');
  } else if (activeHabits.length === 0) {
    elements.habitList.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-symbol" aria-hidden="true">＋</div>
        <h3>还没有习惯</h3>
        <p>先添加一个想坚持的小目标，比如喝水、散步或阅读。</p>
        <button class="primary-button" type="button" data-action="add-habit">添加第一个习惯</button>
      </div>
    `;
  } else {
    elements.habitList.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-symbol" aria-hidden="true">☕</div>
        <h3>今天没有需要打卡的习惯</h3>
        <p>已安排的习惯都在休息日，今天不必为进度感到压力。</p>
      </div>
    `;
  }

  if (offScheduleHabits.length > 0) {
    elements.offScheduleSection.hidden = false;
    elements.offScheduleCount.textContent = `${offScheduleHabits.length} 项`;
    elements.offScheduleList.innerHTML = offScheduleHabits
      .map((habit, index) => habitCardTemplate(habit, currentDateKey, offScheduleIds, index, true))
      .join('');
  } else {
    elements.offScheduleSection.hidden = true;
    elements.offScheduleList.innerHTML = '';
  }
}

function renderHistory() {
  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth() + 1;
  const currentDate = parseDateKey(currentDateKey);
  const isCurrentMonth = year === currentDate.getFullYear() && month === currentDate.getMonth() + 1;
  elements.monthTitle.textContent = formatMonthTitle(year, month);
  elements.nextMonthButton.disabled = isCurrentMonth || year > currentDate.getFullYear() || (year === currentDate.getFullYear() && month > currentDate.getMonth() + 1);

  const stats = getMonthStats(data, year, month, currentDateKey);
  elements.monthCompletion.textContent = stats.due > 0
    ? `${stats.completed} / ${stats.due} · ${stats.percentage}%`
    : '暂无安排';
  elements.monthStreak.textContent = `${getOverallStreak(data, currentDateKey)} 天`;

  const startKey = getMonthStartDateKey(year, month);
  const firstWeekday = getWeekday(startKey);
  const daysInMonth = getDaysInMonth(year, month);
  const cells = [];

  for (let index = 1; index < firstWeekday; index += 1) {
    cells.push('<span class="calendar-placeholder" aria-hidden="true"></span>');
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayStats = getDayStats(data, dateKey);
    const isFuture = compareDateKeys(dateKey, currentDateKey) > 0;
    const isToday = dateKey === currentDateKey;
    const classes = ['calendar-day'];
    if (dayStats.due > 0) classes.push('has-due');
    if (dayStats.isComplete) classes.push('is-complete');
    else if (dayStats.completed > 0) classes.push('is-partial');
    if (isToday) classes.push('is-today');

    const countLabel = dayStats.due > 0 ? `${dayStats.completed}/${dayStats.due}` : '休';
    const ariaLabel = `${formatDateFull(dateKey)}，${dayStats.due > 0 ? `完成 ${dayStats.completed} 项，共 ${dayStats.due} 项` : '无安排'}`;
    cells.push(`
      <button
        class="${classes.join(' ')}"
        type="button"
        data-action="open-day"
        data-date="${dateKey}"
        aria-label="${escapeHtml(ariaLabel)}"
        ${isFuture ? 'disabled' : ''}
      >
        <span class="calendar-day-number">${day}</span>
        <span class="calendar-day-count">${countLabel}</span>
      </button>
    `);
  }

  elements.calendarGrid.innerHTML = cells.join('');
}

function renderDayDialog() {
  if (!selectedDateKey) return;
  const dueHabits = getDueHabitsForDate(data, selectedDateKey);
  const stats = getDayStats(data, selectedDateKey);
  elements.dayDialogTitle.textContent = selectedDateKey === currentDateKey ? '今天' : formatDateFull(selectedDateKey);
  elements.dayDialogDescription.textContent = dueHabits.length > 0
    ? `完成 ${stats.completed} / ${stats.due} 项，可直接补勾或取消。`
    : '这一天没有需要打卡的习惯。';

  if (dueHabits.length === 0) {
    elements.dayDetailList.innerHTML = '<div class="empty-inline">暂无打卡安排</div>';
    return;
  }

  elements.dayDetailList.innerHTML = dueHabits.map((habit) => {
    const completed = isHabitCompleted(data, habit.id, selectedDateKey);
    const schedule = getScheduleForDate(habit, selectedDateKey);
    return `
      <div class="day-detail-item ${completed ? 'is-complete' : ''}">
        <button
          class="day-detail-check"
          type="button"
          data-action="toggle-day-checkin"
          data-id="${escapeHtml(habit.id)}"
          data-date="${selectedDateKey}"
          aria-label="${completed ? '取消' : '完成'}${escapeHtml(habit.name)}"
          aria-pressed="${completed}"
        >${icons.check}</button>
        <div>
          <p class="day-detail-name">${escapeHtml(habit.emoji)} ${escapeHtml(habit.name)}</p>
          <p class="day-detail-schedule">${escapeHtml(formatSchedule(schedule))}</p>
        </div>
      </div>
    `;
  }).join('');
}

function openDayDialog(dateKey) {
  if (compareDateKeys(dateKey, currentDateKey) > 0) return;
  selectedDateKey = dateKey;
  renderDayDialog();
  if (!elements.dayDialog.open) elements.dayDialog.showModal();
}

function openHabitDialog(habitId = null) {
  const habit = habitId ? data.habits.find((item) => item.id === habitId) : null;
  const selectedWeekdays = habit ? getScheduleForDate(habit, currentDateKey) : WEEKDAYS.map((day) => day.value);
  elements.habitIdInput.value = habit?.id ?? '';
  elements.habitEmojiInput.value = habit?.emoji ?? '';
  elements.habitNameInput.value = habit?.name ?? '';
  elements.habitFormError.textContent = '';
  elements.habitDialogKicker.textContent = habit ? 'EDIT HABIT' : 'NEW HABIT';
  elements.habitDialogTitle.textContent = habit ? '编辑习惯' : '添加习惯';
  elements.habitForm.querySelector('[type="submit"]').textContent = habit ? '保存修改' : '保存习惯';
  elements.weekdayOptions.innerHTML = WEEKDAYS.map((day) => `
    <label class="weekday-option">
      <input type="checkbox" name="weekday" value="${day.value}" ${selectedWeekdays.includes(day.value) ? 'checked' : ''}>
      <span aria-hidden="true">${day.short}</span>
    </label>
  `).join('');

  elements.habitDialog.showModal();
  window.setTimeout(() => elements.habitNameInput.focus(), 50);
}

function renderSettings() {
  elements.themeSelect.value = data.preferences?.theme ?? 'system';
  const activeCount = data.habits.filter((habit) => !habit.archivedAt).length;
  const archivedCount = data.habits.filter((habit) => habit.archivedAt).length;
  const checkinCount = Object.values(data.checkins).reduce((total, dates) => total + Object.keys(dates).length, 0);
  const bytes = new Blob([JSON.stringify(data)]).size;
  elements.storageSummary.textContent = `${activeCount} 个进行中 · ${archivedCount} 个已归档 · ${checkinCount} 次打卡 · 约 ${Math.max(1, Math.ceil(bytes / 1024))} KB`;

  const archivedHabits = sortHabits(data.habits.filter((habit) => habit.archivedAt));
  if (archivedHabits.length === 0) {
    elements.archiveList.innerHTML = '<div class="empty-inline">还没有归档的习惯</div>';
    return;
  }

  elements.archiveList.innerHTML = archivedHabits.map((habit) => `
    <div class="archive-item">
      <div class="archive-copy">
        <span class="archive-emoji" aria-hidden="true">${escapeHtml(habit.emoji)}</span>
        <div>
          <p class="archive-name">${escapeHtml(habit.name)}</p>
          <p class="archive-meta">${escapeHtml(formatSchedule(getScheduleForDate(habit, currentDateKey)))}</p>
        </div>
      </div>
      <div class="archive-actions">
        <button class="archive-action" type="button" data-action="restore-habit" data-id="${escapeHtml(habit.id)}">恢复</button>
        <button class="archive-action danger-action" type="button" data-action="delete-habit" data-id="${escapeHtml(habit.id)}">永久删除</button>
      </div>
    </div>
  `).join('');
}

function setView(view) {
  activeView = view === 'history' ? 'history' : 'today';
  elements.todayView.hidden = activeView !== 'today';
  elements.historyView.hidden = activeView !== 'history';
  elements.viewTabs.forEach((tab) => {
    const selected = tab.dataset.view === activeView;
    tab.classList.toggle('is-active', selected);
    if (selected) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  });
  if (activeView === 'history') renderHistory();
}

function changeMonth(offset) {
  const next = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + offset, 1);
  const current = parseDateKey(currentDateKey);
  const currentMonth = new Date(current.getFullYear(), current.getMonth(), 1);
  if (next > currentMonth) return;
  visibleMonth = next;
  renderHistory();
}

function moveHabit(habitId, direction, groupIds) {
  const groupIndex = groupIds.indexOf(habitId);
  if (groupIndex < 0) return;
  const targetId = groupIds[groupIndex + direction];
  if (!targetId) return;

  const activeHabits = sortHabits(data.habits.filter((habit) => !habit.archivedAt));
  const currentIndex = activeHabits.findIndex((habit) => habit.id === habitId);
  const targetIndex = activeHabits.findIndex((habit) => habit.id === targetId);
  if (currentIndex < 0 || targetIndex < 0) return;

  const reordered = [...activeHabits];
  const [moved] = reordered.splice(currentIndex, 1);
  reordered.splice(targetIndex, 0, moved);
  const orderById = new Map(reordered.map((habit, index) => [habit.id, index]));

  commitData({
    ...data,
    habits: data.habits.map((habit) => orderById.has(habit.id) ? { ...habit, sortOrder: orderById.get(habit.id) } : habit),
  });
}

async function archiveHabitAction(habitId) {
  const habit = data.habits.find((item) => item.id === habitId);
  if (!habit) return;
  const accepted = await askConfirm({
    title: '归档这个习惯？',
    message: `“${habit.name}”会从今日列表隐藏，但历史记录和统计仍会保留，之后可以随时恢复。`,
    confirmText: '确认归档',
    danger: false,
  });
  if (!accepted) return;
  commitData(archiveHabit(data, habitId, currentDateKey), { message: `已归档“${habit.name}”` });
}

function restoreHabitAction(habitId) {
  const habit = data.habits.find((item) => item.id === habitId);
  if (!habit) return;
  commitData(restoreHabit(data, habitId, currentDateKey), { message: `已恢复“${habit.name}”` });
}

async function deleteHabitAction(habitId) {
  const habit = data.habits.find((item) => item.id === habitId);
  if (!habit) return;
  const accepted = await askConfirm({
    title: '永久删除习惯？',
    message: `这会删除“${habit.name}”及其全部打卡历史，且无法撤销。建议先导出备份。`,
    confirmText: '永久删除',
    danger: true,
  });
  if (!accepted) return;
  commitData(deleteHabitCompletely(data, habitId), { message: `已永久删除“${habit.name}”` });
}

function exportData() {
  const payload = buildExportPayload(data);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Tja的成长之路-备份-${currentDateKey}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast('备份文件已导出');
}

async function importData(file) {
  if (!file) return;
  try {
    const payload = JSON.parse(await file.text());
    const validation = validateExportPayload(payload);
    if (!validation.valid) {
      showToast(validation.error);
      return;
    }
    const accepted = await askConfirm({
      title: '导入并替换数据？',
      message: '导入后，当前浏览器中的习惯和打卡记录会被备份文件完整替换。',
      confirmText: '导入并替换',
      danger: true,
    });
    if (!accepted) return;
    commitData(validation.data, { message: '备份已导入' });
  } catch (error) {
    console.error('导入失败', error);
    showToast('导入失败，请确认文件是有效的 JSON 备份。');
  }
}

function askConfirm({ title, message, confirmText = '确认', danger = true }) {
  if (confirmResolver) return Promise.resolve(false);
  elements.confirmDialogTitle.textContent = title;
  elements.confirmDialogMessage.textContent = message;
  elements.confirmAcceptButton.textContent = confirmText;
  elements.confirmAcceptButton.className = danger ? 'danger-button' : 'primary-button';
  elements.confirmSymbol.textContent = danger ? '!' : 'i';
  elements.confirmDialog.showModal();

  return new Promise((resolve) => {
    confirmResolver = resolve;
  });
}

function resolveConfirm(accepted) {
  const resolver = confirmResolver;
  confirmResolver = null;
  if (elements.confirmDialog.open) elements.confirmDialog.close();
  if (resolver) resolver(accepted);
}

function checkDateRollover(force = false) {
  const nextDateKey = toDateKey();
  if (!force && nextDateKey === currentDateKey) return;
  const previousDateKey = currentDateKey;
  currentDateKey = nextDateKey;
  if (force || previousDateKey !== currentDateKey) {
    render();
    if (previousDateKey !== currentDateKey) showToast(`新的一天开始了：${formatDateFull(currentDateKey)}`);
  }
}

function handleHabitListClick(event) {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const { action, id } = button.dataset;
  if (action === 'add-habit') {
    openHabitDialog();
    return;
  }

  const currentHabit = data.habits.find((habit) => habit.id === id);
  if (!currentHabit) return;

  if (action === 'toggle-checkin') {
    const completed = isHabitCompleted(data, id, currentDateKey);
    commitData(setHabitCompletion(data, id, currentDateKey, !completed));
    return;
  }

  if (action === 'edit-habit') {
    openHabitDialog(id);
    return;
  }

  if (action === 'archive-habit') {
    archiveHabitAction(id);
    return;
  }

  if (action === 'move-up' || action === 'move-down') {
    const isOffSchedule = Boolean(button.closest('#offScheduleList'));
    const group = isOffSchedule
      ? getOffScheduleHabitsForDate(data, currentDateKey).filter((habit) => !habit.archivedAt).map((habit) => habit.id)
      : getDueHabitsForDate(data, currentDateKey).map((habit) => habit.id);
    moveHabit(id, action === 'move-up' ? -1 : 1, group);
  }
}

elements.habitList.addEventListener('click', handleHabitListClick);
elements.offScheduleList.addEventListener('click', handleHabitListClick);
elements.addHabitButton.addEventListener('click', () => openHabitDialog());

elements.viewTabs.forEach((tab) => tab.addEventListener('click', () => setView(tab.dataset.view)));
elements.previousMonthButton.addEventListener('click', () => changeMonth(-1));
elements.nextMonthButton.addEventListener('click', () => changeMonth(1));

elements.calendarGrid.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action="open-day"]');
  if (!button || button.disabled) return;
  openDayDialog(button.dataset.date);
});

elements.dayDetailList.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action="toggle-day-checkin"]');
  if (!button) return;
  const { id, date } = button.dataset;
  const completed = isHabitCompleted(data, id, date);
  commitData(setHabitCompletion(data, id, date, !completed), {
    message: `${formatDateFull(date)}的记录已更新`,
  });
});

elements.habitForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const habitId = elements.habitIdInput.value;
  const name = elements.habitNameInput.value.trim();
  const emoji = [...elements.habitEmojiInput.value.trim()].slice(0, 2).join('') || '•';
  const weekdays = [...elements.weekdayOptions.querySelectorAll('input[name="weekday"]:checked')].map((input) => Number(input.value));

  if (!name) {
    elements.habitFormError.textContent = '请填写习惯名称。';
    elements.habitNameInput.focus();
    return;
  }
  if (name.length > 30) {
    elements.habitFormError.textContent = '习惯名称不能超过 30 个字符。';
    elements.habitNameInput.focus();
    return;
  }
  if (weekdays.length === 0) {
    elements.habitFormError.textContent = '请至少选择一天。';
    return;
  }

  if (habitId) {
    const nextHabits = data.habits.map((habit) => {
      if (habit.id !== habitId) return habit;
      return updateHabitSchedule({ ...habit, name, emoji }, weekdays, currentDateKey);
    });
    commitData({ ...data, habits: nextHabits }, { message: `已更新“${name}”` });
  } else {
    const maxOrder = data.habits.reduce((maximum, habit) => Math.max(maximum, Number(habit.sortOrder) || 0), -1);
    const habit = {
      id: createId(),
      name,
      emoji,
      createdDate: currentDateKey,
      createdAt: new Date().toISOString(),
      scheduleHistory: [{ effectiveFrom: currentDateKey, weekdays }],
      archivePeriods: [],
      archivedAt: null,
      sortOrder: maxOrder + 1,
    };
    commitData({ ...data, habits: [...data.habits, habit] }, { message: `已添加“${name}”` });
  }

  elements.habitDialog.close();
});

document.querySelectorAll('[data-close-dialog]').forEach((button) => {
  button.addEventListener('click', () => {
    const dialog = document.getElementById(button.dataset.closeDialog);
    if (dialog?.open) dialog.close();
  });
});

elements.settingsButton.addEventListener('click', () => {
  renderSettings();
  elements.settingsDialog.showModal();
});

elements.themeSelect.addEventListener('change', () => {
  const theme = elements.themeSelect.value;
  commitData({ ...data, preferences: { ...data.preferences, theme } }, { message: '主题已更新' });
});

elements.exportButton.addEventListener('click', exportData);
elements.importInput.addEventListener('change', async () => {
  const [file] = elements.importInput.files;
  elements.importInput.value = '';
  await importData(file);
});

elements.archiveList.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  if (button.dataset.action === 'restore-habit') restoreHabitAction(button.dataset.id);
  if (button.dataset.action === 'delete-habit') deleteHabitAction(button.dataset.id);
});

elements.confirmCancelButton.addEventListener('click', () => resolveConfirm(false));
elements.confirmAcceptButton.addEventListener('click', () => resolveConfirm(true));
elements.confirmDialog.addEventListener('cancel', (event) => {
  event.preventDefault();
  resolveConfirm(false);
});
elements.confirmDialog.addEventListener('close', () => {
  if (confirmResolver) resolveConfirm(false);
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') checkDateRollover();
});
window.addEventListener('focus', () => checkDateRollover());
window.setInterval(() => checkDateRollover(), 30000);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((error) => {
      console.warn('Service Worker 注册失败', error);
    });
  });
}

render();
setView('today');
if (initialLoadWarning) showToast(initialLoadWarning);