/**
 * What pages exist and how the shell has to lay them out.
 *
 * Plain facts rather than part of the navigation hook: components need them to
 * pick a layout class, and a component should not have to pull in — or mock —
 * a stateful hook to ask what kind of page it is showing.
 */

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

export function isListPage(page) {
  return LIST_PAGES.has(page);
}

export function normalizePage(value) {
  return typeof value === "string" && APP_PAGES.has(value) ? value : HOME_PAGE;
}
