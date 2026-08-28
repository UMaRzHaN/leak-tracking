import { createComponentBlock } from "@/configs/shared/componentBlock";
import { PROJECT_LOCATION_CONFIG } from "@/configs/projectLocation.config";
import { addresses } from "@/data/leak/fieldDictionary";
import { LOCATION_FIELDS } from "./fields";

/**
 * Реестр компонентов распределительной сети.
 *
 * Уровни места городские — Населенный пункт / Район / Адрес, — и младший из
 * них автодополняется словарём адресов, а не узлов промысла: так же, как в
 * форме утечки этого типа.
 */
export default createComponentBlock({
  locationLevels: LOCATION_FIELDS,
  lastOptions: Object.values(addresses).flat(),
  location: PROJECT_LOCATION_CONFIG.downstream,
});
