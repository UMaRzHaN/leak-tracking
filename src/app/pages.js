/**
 * What pages exist and how the shell has to lay them out.
 *
 * Plain facts rather than part of the navigation hook: components need them to
 * pick a layout class, and a component should not have to pull in — or mock —
 * a stateful hook to ask what kind of page it is showing.
 */

import { MAP_BASE } from "@/pages/MapPage/mapBase";

export const HOME_PAGE = "";

/**
 * Every page the app can navigate to. Anything outside this set is rewritten
 * to home, silently — so a navigation target added to the interface without
 * being added here looks like a button that does nothing.
 */
export const APP_PAGES = new Set([
  HOME_PAGE,
  "add",
  "db",
  "map",
  "monitoring",
  "components",
  "component",
  "settings",
]);

/**
 * Pages that fill the viewport and scroll their own content instead of the
 * document. They need the shell pinned to the viewport height — without it the
 * screen grows with its content until the whole document scrolls, header and
 * all.
 *
 * One set rather than a condition repeated per component: it was written out
 * twice before and the two copies drifted, which reads as a screen that
 * scrolls the wrong thing.
 */
export const LIST_PAGES = new Set(["db", "monitoring", "components"]);

/**
 * Pages that take over the screen: the app header and the bottom navigation are
 * hidden, and the page carries its own header with a way back. A form filled in
 * front of equipment gets the whole display, and its action bar can sit at the
 * bottom edge without landing under the navigation.
 *
 * Deliberately not list pages — these scroll the document, the way the leak form
 * does, rather than being pinned to the viewport.
 */
export const FULL_SCREEN_PAGES = new Set(["add", "settings", "component"]);

export function isFullScreenPage(page) {
  return FULL_SCREEN_PAGES.has(page);
}

export function isListPage(page) {
  return LIST_PAGES.has(page);
}

export function normalizePage(value) {
  return typeof value === "string" && APP_PAGES.has(value) ? value : HOME_PAGE;
}

/**
 * Показывает ли экран железо, а не утечки.
 *
 * От этого зависит, чьё дерево мест открывает выбор места в шапке. Реестр
 * показывает железо всегда, карта — когда на ней включена база компонентов;
 * иначе рядом с «Мессояхское УПГ» стояло бы число утечек, а открывалась папка
 * с железом. Ровно эту рассогласованность когда-то развели на реестре, а карта
 * осталась с ней.
 *
 * @param {string} page
 * @param {string} [mapBase]
 * @returns {boolean}
 */
export function showsComponentTree(page, mapBase) {
  if (page === "components" || page === "component") return true;
  return page === "map" && mapBase === MAP_BASE.COMPONENTS;
}
