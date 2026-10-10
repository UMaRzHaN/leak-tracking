import { MODULE } from "@/app/modules/activeModule";

/**
 * Какие отборы есть на карте в каждом модуле.
 *
 * Базу карты выбирает модуль, а не переключатель: в инвентаризации на ней
 * железо, в остальных — утечки. И отборы у каждого свои: мониторингу нужны
 * обход, фикции и физ. тег, а не статус с приоритетом. Скрытый отбор при этом
 * не действует — иначе выбранное в базе молча прятало бы точки обхода.
 */
export const MAP_FILTER = Object.freeze({
  STATUS: "status",
  PRIORITY: "priority",
  FICTION: "fiction",
  MONITORING: "monitoring",
  TAG: "tag",
  STAGE: "stage",
  NEARBY: "nearby",
  COMPONENT_STATUS: "componentStatus",
});

const BY_MODULE = {
  [MODULE.LDAR]: [MAP_FILTER.STATUS, MAP_FILTER.PRIORITY, MAP_FILTER.NEARBY],
  [MODULE.MONITORING]: [
    MAP_FILTER.MONITORING,
    MAP_FILTER.FICTION,
    MAP_FILTER.TAG,
    MAP_FILTER.NEARBY,
  ],
  // Ремонт отбирается по стадии работ, а не по статусу утечки: у всех
  // ремонтов он один — «в работе».
  [MODULE.REPAIRS]: [MAP_FILTER.STAGE, MAP_FILTER.PRIORITY, MAP_FILTER.NEARBY],
  [MODULE.INVENTORY]: [MAP_FILTER.COMPONENT_STATUS, MAP_FILTER.NEARBY],
};

const ALL = new Set(Object.values(MAP_FILTER));
// Один и тот же набор на модуль: карта держит его в зависимостях мемо, и
// новый Set на каждый рендер пересчитывал бы отборы впустую.
const SETS = new Map(
  Object.entries(BY_MODULE).map(([module, list]) => [module, new Set(list)]),
);

/**
 * @param {string} [module]
 * @returns {Set<string>} без модуля — все отборы сразу
 */
export function mapFiltersFor(module) {
  return (module && SETS.get(module)) || ALL;
}
