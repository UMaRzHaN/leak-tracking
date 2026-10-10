// Ключи живут здесь, а не в общем списке STORAGE_KEYS: тот лежит в стартовом
// чанке, а напоминание нужно только главной и настройкам, которые грузятся
// лениво. При удалении проекта их не чистят: они привязаны к его случайному
// id и никому другому не достанутся.
const LAST_BACKUP_AT = (projectId) => `app:${projectId}:last_backup_at_v1`;
const BACKUP_WATCH_SINCE = (projectId) =>
  `app:${projectId}:backup_watch_since_v1`;

/**
 * Давно ли проект уходил с устройства.
 *
 * На Android системного резервного копирования нет намеренно, и единственная
 * копия проекта вне телефона — ZIP, выгруженный вручную. Потерянный или
 * сброшенный телефон уносит всё, что накопилось с последней выгрузки, и
 * человек узнаёт об этом только тогда. Здесь — ровно одно: сколько времени
 * данные проекта существуют в единственном экземпляре.
 *
 * Отсчёт для проекта, который не выгружали ни разу, идёт не от создания
 * проекта, а от первого раза, когда в нём увидели данные: пустой проект
 * терять нечего, а только что заведённый не должен встречать человека
 * упрёком.
 */

export const BACKUP_REMINDER_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

function readTime(key) {
  try {
    const value = Number(localStorage.getItem(key));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function writeTime(key, value) {
  try {
    localStorage.setItem(key, String(value));
    return true;
  } catch {
    return false;
  }
}

/** @param {string|null|undefined} projectId */
export function readLastBackupAt(projectId) {
  if (!projectId) return null;
  return readTime(LAST_BACKUP_AT(projectId));
}

/** Отметить, что проект целиком выгружен. @param {string} projectId */
export function markProjectBackedUp(projectId, at = Date.now()) {
  if (!projectId) return false;
  return writeTime(LAST_BACKUP_AT(projectId), at);
}

/**
 * Состояние напоминания для проекта.
 *
 * @param {{projectId?: string|null, hasData: boolean, now?: number}} options
 * @returns {{lastBackupAt: number|null, overdue: boolean, daysWithoutBackup: number}}
 */
export function getBackupReminderState({
  projectId,
  hasData,
  now = Date.now(),
}) {
  const lastBackupAt = readLastBackupAt(projectId);
  if (!projectId || !hasData) {
    return { lastBackupAt, overdue: false, daysWithoutBackup: 0 };
  }

  let since = lastBackupAt;
  if (since == null) {
    const watchKey = BACKUP_WATCH_SINCE(projectId);
    since = readTime(watchKey);
    if (since == null) {
      writeTime(watchKey, now);
      since = now;
    }
  }

  const age = Math.max(0, now - since);
  return {
    lastBackupAt,
    overdue: age >= BACKUP_REMINDER_AFTER_MS,
    daysWithoutBackup: Math.floor(age / (24 * 60 * 60 * 1000)),
  };
}
