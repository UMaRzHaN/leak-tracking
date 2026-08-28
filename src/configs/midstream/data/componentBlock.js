import { createComponentBlock } from "@/configs/shared/componentBlock";
import { PROJECT_LOCATION_CONFIG } from "@/configs/projectLocation.config";
import { locations } from "@/data/leak/fieldDictionary";
import { LOCATION_FIELDS } from "./fields";

/**
 * Реестр компонентов газотранспортного предприятия.
 *
 * Железо то же, что на промысле, — краны, фланцы, соединения, — поэтому набор
 * полей, форма и словари общие. Отличаются только уровни места: УМГ /
 * Компрессорная станция / Локация.
 *
 * Уровни берутся из полей утечки этого же типа, а не перечисляются заново:
 * компонент и найденная на нём утечка должны ложиться в одно место на карте и
 * под один фильтр.
 */
export default createComponentBlock({
  locationLevels: LOCATION_FIELDS,
  lastOptions: Object.values(locations).flat(),
  location: PROJECT_LOCATION_CONFIG.midstream,
});
