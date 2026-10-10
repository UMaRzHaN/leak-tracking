import { getStatusRepairMilestones } from "@/domain/leakEventsMilestones";
import {
  getLeakCheckPhotoRecords,
  getLeakDetailsHeroPhotoPath,
} from "@/utils/monitoring";

/**
 * Снимки для шапки карточки (5e), которые листаются свайпом. Первым —
 * последний снимок проверки (осмотра или ремонта), иначе первичный, за ним
 * снимки проверок от новых к старым, устранение, ремонт и первичный.
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
  // Осмотры и проверки ремонта — вместе, по времени: снимок проверки,
  // оставившей ремонт идти, раньше в ленту не попадал вовсе.
  const checks = getLeakCheckPhotoRecords(leak).flatMap((record) => [
    record.photo,
    record.previousPhoto,
  ]);
  const paths = [
    getLeakDetailsHeroPhotoPath(leak),
    ...checks,
    resolvedPhoto,
    repairPhoto,
    leak.photo,
  ].filter((path) => typeof path === "string" && path);
  return [...new Set(paths)];
}
