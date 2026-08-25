import { hasComponentRegistry } from "@/configs/componentRegistry.config";
import { loadComponentRegistry } from "@/configs/projectAdapter";
import { compareComponentsByUid } from "@/domain/componentRegistry";
import { liveComponents } from "@/domain/componentTombstones";
import {
  buildComponentRowIds,
  buildComponentRows,
} from "@/services/excelExport/componentSheet";
import { logger } from "@/utils/logger";

/**
 * Assembles everything the workbook needs to write the registry sheet.
 *
 * Kept on the main thread and separate from the sheet writer: reaching storage
 * and resolving the project config are both things the worker cannot do, so
 * what crosses to it is plain rows and headers.
 *
 * Returns null whenever there is no sheet to write — a project type without a
 * registry, an empty walk, or storage that would not answer. A missing tab is
 * a better outcome than failing an export somebody is waiting on.
 */
/**
 * `ComponentRepository` тянет за собой мост Capacitor и нативное хранилище
 * карточек. Статический импорт клал его в стартовый чанк — сборка предупреждала
 * об этом прямо, — хотя нужен он только тем, кто уже открыл реестр, экспорт или
 * импорт. Здесь он читается на месте вызова.
 */
function componentRepository() {
  return import("@/repositories/ComponentRepository").then(
    (module) => module.ComponentRepository,
  );
}

export async function buildComponentSheetSpec(project) {
  if (!project?.id || !hasComponentRegistry(project)) return null;

  try {
    const [registry, stored] = await Promise.all([
      loadComponentRegistry(project),
      componentRepository().then((repository) => repository.load(project)),
    ]);
    // Лист — это то, что человек прочтёт. Запись об удалённой карточке в нём
    // не строка, а недоразумение; ездит она служебным листом бэкапа.
    const components = liveComponents(stored);
    if (components.length === 0) return null;

    const { sheet, headers, keysOrder } = registry.excel;
    const ordered = [...components].sort(compareComponentsByUid);

    return {
      name: sheet,
      headers,
      keysOrder,
      rows: buildComponentRows(ordered, keysOrder),
      // Лист не показывает UUID — читателю он ничего не значит, — но ссылка на
      // снимок должна найти картинку той строки, на которой стоит.
      ids: buildComponentRowIds(ordered),
      /*
       * Сами карточки и объявление полей — для листа истории: он пишет, кто и
       * когда что менял, и подписывает поля их заголовками, а не ключами.
       * Строки листа реестра для этого не годятся: истории в них нет.
       */
      components: ordered,
      fields: registry.fields?.all ?? [],
    };
  } catch (error) {
    logger.warn("[components] registry left out of the export:", error);
    return null;
  }
}
