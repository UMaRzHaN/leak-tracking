import { repairRound } from "@/pages/Repairs/repairRoundStore";
import { reconcileRoundStore } from "@/pages/Reconcile/reconcileRound";
import { resolveMonitoringRound } from "@/services/backup/monitoringRoundResolution";

/**
 * Обходы ремонтов и сверки в бэкапе и при обмене.
 *
 * Обход мониторинга ездит в `project.json` давно; эти два жили только в
 * хранилище браузера, и после восстановления или обмена начинались заново с
 * № 1 — при том что в записях уже стояли номера прежних обходов, и режим
 * «последняя в обходе» в книге смешивал старые с новыми. Теперь они едут
 * рядом, полем `rounds`, и принимаются по тем же правилам, что и мониторинг.
 */
const STORES = {
  repairs: repairRound,
  reconcile: reconcileRoundStore,
};

/**
 * Обходы проекта — каждый вид явно, `null` у вида без обхода: архив должен
 * отличать «обхода не было» от «архив старый и об обходах не знает».
 *
 * @param {string|null} projectId
 * @returns {Record<string, any>}
 */
export function readProjectRounds(projectId) {
  const rounds = {};
  for (const [kind, store] of Object.entries(STORES)) {
    rounds[kind] = store.read(projectId) ?? null;
  }
  return rounds;
}

/**
 * Принимает обходы из архива. Вид, о котором архив молчит (архив старый, без
 * поля `rounds` или без этого вида), не трогается: стирать его нечем
 * оправдать. Явный `null` — «обхода не было».
 *
 * @param {string|null} projectId
 * @param {Record<string, any>|null|undefined} incoming поле `rounds` архива
 * @param {{ resolve?: boolean }} [options] `resolve` — обмен: остаётся обход
 *   с большим номером, при равном — тот, что знает о нём больше (как у
 *   мониторинга); без него — как в архиве (перезапись, новый проект).
 */
export function applyProjectRounds(
  projectId,
  incoming,
  { resolve = false } = {},
) {
  if (!projectId || !incoming || typeof incoming !== "object") return;
  for (const [kind, store] of Object.entries(STORES)) {
    if (!(kind in incoming)) continue;
    const arrived = incoming[kind] ?? null;
    store.replace(
      projectId,
      resolve
        ? resolveMonitoringRound(store.read(projectId), arrived)
        : arrived,
    );
  }
}

/** Откат импорта: ровно то, что было до него. */
export function restoreProjectRounds(projectId, snapshot) {
  if (!projectId) return;
  for (const [kind, store] of Object.entries(STORES)) {
    store.replace(projectId, snapshot?.[kind] ?? null);
  }
}
