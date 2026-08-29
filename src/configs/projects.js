import upstream from "./upstream/upstream.config";
import midstream from "./midstream/midstream.config";
import downstream from "./downstream/downstream.config";

/**
 * Полные конфигурации типов проекта: поля, словари, шаги формы, колонки
 * выгрузки. Тяжёлый модуль — импортировать только там, где нужен сам конфиг.
 * За названием и папкой типа ходить в `@/configs/projectMeta`.
 */
export const PROJECTS = {
  upstream,
  midstream,
  downstream,
};
