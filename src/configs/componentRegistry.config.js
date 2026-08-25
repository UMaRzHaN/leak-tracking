import { PROJECTS } from "./projects";

/**
 * Есть ли у типа проекта реестр компонентов — и у каких типов он есть.
 *
 * Отдельно от projectAdapter намеренно. Обе проверки синхронные и дешёвые, и
 * спрашивают их из стартового графа: нижняя навигация — на каждой отрисовке,
 * владелец списка реестра — на каждой смене проекта. Всё остальное в
 * projectAdapter описывает поля утечки и на холодном старте не нужно, а лежали
 * бы они вместе — приезжало бы вместе.
 *
 * Ответ выводится из самой конфигурации: тип, не объявивший блок
 * `components`, реестра просто не имеет. Никаких сравнений с именем типа —
 * это то же обещание, что и в projectAdapter.
 */

function resolveConfig(project) {
  const type = project?.type ?? project;
  return PROJECTS[type] ?? PROJECTS.midstream;
}

/**
 * @param {object|string} project
 * @returns {boolean}
 */
export function hasComponentRegistry(project) {
  return typeof resolveConfig(project)?.components?.load === "function";
}

/**
 * Типы проектов, которые вообще ведут реестр компонентов.
 *
 * Нужен там, где реестр приезжает раньше проекта: архив инвентаризации не
 * несёт ни имени проекта, ни его типа — только карточки. Если реестр объявлен
 * ровно у одного типа, выбирать не из чего, и спрашивать человека не о чем;
 * если типов станет несколько, ответ перестанет быть однозначным сам, и
 * вызывающая сторона это увидит.
 *
 * @returns {string[]}
 */
export function componentRegistryProjectTypes() {
  return Object.keys(PROJECTS).filter((type) => hasComponentRegistry(type));
}
