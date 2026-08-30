import { useCallback, useSyncExternalStore } from "react";
import { getStorageItem, setStorageItem } from "@/utils/safeStorage";
import { globalScope } from "@/utils/globalScope";

const STORAGE_KEY = "app-theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

// Цвет системной строки на Android. Синий из светлой темы над тёмным экраном
// выглядел не «фирменно», а забытым — как единственное место, куда тема не
// дошла.
const THEME_COLOR = { light: "#1976d2", dark: "#0f172a" };

/**
 * Тема — общее состояние приложения, а не состояние экрана настроек.
 *
 * Раньше хук держал свой `useState`, а звали его из одного места —
 * `AppearanceSection`. Пока настройки закрыты, за системной темой никто не
 * следил, и `theme-color` оставался светлым. Источник истины вынесен в модуль
 * по образцу `useLanguage`, который так же читает общий инстанс i18next:
 * хук стал тонким видом, и звать его можно откуда угодно и сколько угодно раз.
 *
 * Режим — три состояния, а не два. `system` означает «следовать настройке
 * телефона» и является значением по умолчанию: приложение открывается тёмным
 * на телефоне с ночной темой, ничего не спрашивая. Явный выбор пользователя
 * систему перекрывает, в том числе когда она потом меняется. Значения,
 * сохранённые прежними версиями, читаются так же: там писали только `light`
 * или `dark`, и такая запись остаётся осознанным выбором.
 */
function readStoredMode() {
  const stored = getStorageItem(STORAGE_KEY);
  return stored === "dark" || stored === "light" ? stored : "system";
}

function darkMediaQuery() {
  return globalScope.matchMedia?.(DARK_QUERY) ?? null;
}

function systemPrefersDark() {
  return darkMediaQuery()?.matches ?? false;
}

let mode = readStoredMode();
const listeners = new Set();

function resolveDark() {
  return mode === "system" ? systemPrefersDark() : mode === "dark";
}

// useSyncExternalStore сравнивает снимки по ссылке, поэтому новый объект
// создаётся только когда что-то действительно изменилось.
let snapshot = { dark: resolveDark(), mode };

function applyToDocument(dark) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", dark ? THEME_COLOR.dark : THEME_COLOR.light);
}

function publish() {
  const dark = resolveDark();
  if (snapshot.dark === dark && snapshot.mode === mode) return;
  snapshot = { dark, mode };
  applyToDocument(dark);
  for (const listener of listeners) listener();
}

// Настройка телефона меняется и на ходу — по расписанию заката, например.
// Пока режим `system`, приложение обязано ехать за ней без перезапуска.
// Запрос держится в модуле, а не в замыкании подписки: снимать слушателя
// должен уход последнего потребителя, кто бы им ни оказался. В замыкании
// первого он пережил бы всех остальных, если первый уходил не последним.
let mediaQuery = /** @type {MediaQueryList|null} */ (null);

function subscribe(listener) {
  listeners.add(listener);
  if (listeners.size === 1) {
    // До первой отрисовки атрибут ставит theme-init.js в <head>, и обычно
    // применять здесь нечего. Но полагаться на это нельзя: скрипт мог не
    // выполниться, и тогда единственным источником истины остаётся модуль.
    applyToDocument(snapshot.dark);
    mediaQuery = darkMediaQuery();
    mediaQuery?.addEventListener("change", publish);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size > 0) return;
    mediaQuery?.removeEventListener("change", publish);
    mediaQuery = null;
  };
}

function getSnapshot() {
  return snapshot;
}

// На сервере и в тестах без DOM matchMedia нет; светлая тема — то же, что
// отдаёт `:root` без атрибута.
const serverSnapshot = { dark: false, mode: "system" };

function setMode(nextMode) {
  if (mode === nextMode) return;
  mode = nextMode;
  setStorageItem(STORAGE_KEY, nextMode);
  publish();
}

export function useTheme() {
  const { dark } = useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => serverSnapshot,
  );

  /**
   * Переключатель в настройках — один тумблер на два положения, и третьего
   * ему взять неоткуда. Поэтому возврат к `system` выводится: если после
   * переключения тема совпала с системной, выбор снова отдаётся системе.
   *
   * Для пользователя это неотличимо от простого тумблера — он видит ровно ту
   * тему, которую выбрал. Разница появляется позже: телефон переключился на
   * ночную, и приложение переключилось с ним, а не осталось светлым навсегда
   * из-за одного случайного нажатия.
   */
  const toggle = useCallback(() => {
    const next = !dark;
    setMode(next === systemPrefersDark() ? "system" : next ? "dark" : "light");
  }, [dark]);

  return { dark, toggle };
}
