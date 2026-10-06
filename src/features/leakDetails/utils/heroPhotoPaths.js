import { getStatusRepairMilestones } from "@/domain/leakEventsMilestones";
import {
  getLeakDetailsHeroPhotoPath,
  getMonitoringRecords,
} from "@/utils/monitoring";

/**
 * Снимки для шапки карточки (5e), которые листаются свайпом. Первым —
 * тот, что шапка показывала и раньше (последний обход, иначе первичный), за
 * ним снимки осмотров от новых к старым, устранение, ремонт и первичный.
 *
 * Осмотр «утечка есть» со снимком подменяет первичный снимок записи новым, а
 * прежний хранит у себя как `previousPhoto` — без него в ленте был бы один
 * кадр, хотя снято два. Повторы убираются: снимок осмотра часто и есть
 * снимок перехода в ремонт.
 *
 * @param {any} leak
 * @returns {string[]}
 */
export function getLeakHeroPhotoPaths(leak) {
  if (!leak) return [];
  const { repairPhoto, resolvedPhoto } = getStatusRepairMilestones(leak);
  const rounds = getMonitoringRecords(leak)
    .slice()
    .reverse()
    .flatMap((record) => [record.photo, record.previousPhoto]);
  const paths = [
    getLeakDetailsHeroPhotoPath(leak),
    ...rounds,
    resolvedPhoto,
    repairPhoto,
    leak.photo,
  ].filter((path) => typeof path === "string" && path);
  return [...new Set(paths)];
}
