import { fromEntries } from "@/utils/fromEntries";

/*
 * Надгробия удалённых утечек: сколько их хранить и что делать, когда их много.
 *
 * Вынесено из `projectSyncState` отдельным модулем: там состояние обмена
 * целиком — часы, переменные, чтение и запись, — а здесь одна тема, у которой
 * своя арифметика и свои последствия.
 *
 * Потолок задан в записях, а хранятся надгробия опознавателями. У каждой
 * удалённой утечки их два: по внутреннему номеру и по бирке. Оба нужны —
 * телефон, получивший утечку из книги Excel, знает её только по бирке, а
 * заведённую в приложении опознаёт номер. Пока потолок считался прямо в
 * опознавателях, десять тысяч в коде означали пять тысяч записей: цифра
 * обещала вдвое больше, чем давала.
 *
 * Цена ошибки здесь не в памяти. Уплотнение поднимает поколение, а телефоны с
 * разными поколениями к обмену не допускаются до полной передачи проекта, —
 * то есть за этой цифрой стоит обрыв, а не замедление.
 *
 * Связать опознаватели одной утечки в самой карте нельзя: она плоская, и после
 * записи `id:` и `tag:` уже ничего не связывает. Поэтому предел объявлен в
 * записях, а границы в опознавателях выведены умножением.
 */
const IDENTITIES_PER_LEAK = 2;
export const MAX_DELETED_LEAKS = 10_000;
export const DELETED_LEAKS_AFTER_COMPACTION = 5_000;
export const MAX_PROJECT_TOMBSTONES = MAX_DELETED_LEAKS * IDENTITIES_PER_LEAK;
export const TOMBSTONES_AFTER_COMPACTION =
  DELETED_LEAKS_AFTER_COMPACTION * IDENTITIES_PER_LEAK;

/**
 * Карта удалений, приведённая к общему виду.
 *
 * Приведение времени передаётся снаружи: в состоянии обмена оно заодно
 * подводит логические часы устройства, и заводить здесь вторую такую функцию
 * значило бы развести их поведение.
 *
 * @param {any} value
 * @param {(value: any) => number} toTime
 * @returns {Record<string, number>}
 */
export function normalizeDeleted(value, toTime) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return fromEntries(
    Object.entries(value)
      .map(([identity, deletedAt]) => [identity, toTime(deletedAt)])
      .filter(([identity, deletedAt]) => identity && Number(deletedAt) > 0),
  );
}

/**
 * Опознание новой эпохи.
 *
 * Случайное значение здесь не годится: два телефона, уплотнившие один и тот же
 * набор надгробий, обязаны получить одну эпоху, иначе они разойдутся навсегда
 * из-за совпавшей по смыслу уборки. Поэтому оно выводится из того, что у обоих
 * одинаково, — прежнего поколения, прежней эпохи и выброшенных надгробий.
 */
export function createCompactionEpochId(state, droppedEntries) {
  const hashes = [2166136261, 2246822519, 3266489917, 668265263];
  const update = (text) => {
    for (let index = 0; index < text.length; index += 1) {
      const code = text.charCodeAt(index);
      hashes[0] = Math.imul(hashes[0] ^ code, 16777619);
      hashes[1] = Math.imul(hashes[1] ^ code, 2246822519);
      hashes[2] = Math.imul(hashes[2] ^ code, 3266489917);
      hashes[3] = Math.imul(hashes[3] ^ code, 668265263);
    }
  };
  update(`${state.generation}|${state.epochId}|`);
  for (const [identity, deletedAt] of droppedEntries) {
    update(`${identity}:${deletedAt}|`);
  }
  const digest = hashes
    .map((value) => (value >>> 0).toString(16).padStart(8, "0"))
    .join("");
  return `epoch-${state.generation + 1}-${digest}`;
}

/**
 * Уплотнение: свежие надгробия остаются, старые уходят вместе с поколением.
 *
 * Записи приходят уже отсортированными от свежих к старым, поэтому уборка —
 * это разрез списка, а не выбор.
 */
export function compactDeletedState(state, deletedEntries) {
  if (deletedEntries.length <= MAX_PROJECT_TOMBSTONES) {
    return { ...state, deleted: fromEntries(deletedEntries) };
  }

  const retained = deletedEntries.slice(0, TOMBSTONES_AFTER_COMPACTION);
  const dropped = deletedEntries.slice(TOMBSTONES_AFTER_COMPACTION);
  const newestDroppedAt = dropped[0]?.[1] ?? 0;
  return {
    ...state,
    generation: state.generation + 1,
    epochId: createCompactionEpochId(state, dropped),
    compactedAt: Math.max(state.compactedAt, newestDroppedAt),
    deleted: fromEntries(retained),
  };
}
