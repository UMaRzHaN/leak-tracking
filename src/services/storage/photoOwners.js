/**
 * Всё, что в проекте держит фотографию.
 *
 * Сборщик мусора удаляет из папки проекта каждый файл, на который не сослался
 * переданный ему список. Список этот собирали из одних утечек — и снимки
 * карточек реестра оказывались сиротами в глазах сборщика. При импорте в
 * существующий проект они удалялись сразу после того, как их восстановили: два
 * телефона, обменявшиеся базами, теряли фотографии обхода. В приложении это
 * однажды уже чинили (см. usePhotoStorage), но чинили в одном месте из
 * четырёх — поэтому теперь ответ на вопрос «кто держит фото» живёт один.
 */

import { logger } from "@/utils/logger";
import { hasCorruptedPhotoValues } from "./photoValueRepair";

/**
 * @param {{id: string, folderName?: string}|null|undefined} project
 * @param {any[]} [leaks] записи об утечках, которые останутся в проекте
 * @returns {Promise<any[]|null>} null — если реестр прочитать не удалось или
 *   в записях снимок лежит не путём; собирать мусор в этих случаях нельзя:
 *   молчание реестра не значит, что на его снимки никто не ссылается, а
 *   порченую запись как раз чинят, и снимки, сохранённые починкой, до записи
 *   путей числились бы сиротами.
 */
export async function collectPhotoOwners(project, leaks = []) {
  const list = Array.isArray(leaks) ? leaks : [];
  if (hasCorruptedPhotoValues(list)) {
    logger.warn(
      "[photoOwners] в записях снимок не путём, уборка снимков отложена",
    );
    return null;
  }
  if (!project?.id) return list;

  try {
    const { ComponentRepository } =
      await import("@/repositories/ComponentRepository");
    const components = await ComponentRepository.load(project);
    if (!Array.isArray(components)) return null;
    return [...list, ...components];
  } catch (error) {
    logger.warn(
      "[photoOwners] реестр не прочитался, уборка снимков отменена:",
      error,
    );
    return null;
  }
}
