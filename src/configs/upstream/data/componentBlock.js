import { createComponentBlock } from "@/configs/shared/componentBlock";
import { PROJECT_LOCATION_CONFIG } from "@/configs/projectLocation.config";
import { locations } from "@/data/leak/fieldDictionary";
import { LOCATION_FIELDS } from "./fields";

/**
 * Реестр компонентов промысла.
 *
 * Уровни места берутся из полей утечки этого же типа, а не перечисляются
 * заново: компонент и найденная на нём утечка должны ложиться в одно место на
 * карте и под один фильтр, а два списка подписей разошлись бы.
 */
export default createComponentBlock({
  locationLevels: LOCATION_FIELDS,
  lastOptions: Object.values(locations).flat(),
  location: PROJECT_LOCATION_CONFIG.upstream,
});
