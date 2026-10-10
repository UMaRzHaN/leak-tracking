import { useCallback, useState } from "react";

/**
 * Рабочий модуль приложения. От него зависит нижняя панель: в LDAR в центре
 * «+», и утечки добавляются только здесь; в мониторинге в центре маршрут
 * обхода, а новых утечек во время обхода не заводят — ровно так, как это
 * устроено в полевой работе. Модуль ремонтов устроен так же: своя панель, и
 * утечек там тоже не заводят. Переключается из бургер-меню.
 */
export const MODULE = Object.freeze({
  LDAR: "ldar",
  MONITORING: "monitoring",
  REPAIRS: "repairs",
  INVENTORY: "inventory",
});

/** Страница, с которой модуль открывается: у инвентаризации это реестр. */
export function moduleHomePage(module) {
  return module === MODULE.INVENTORY ? "components" : "";
}

const STORAGE_KEY = "app:active_module_v1";
const KNOWN = new Set(Object.values(MODULE));

export function normalizeModule(value) {
  return KNOWN.has(value) ? value : MODULE.LDAR;
}

function readModule() {
  try {
    return normalizeModule(localStorage.getItem(STORAGE_KEY));
  } catch {
    return MODULE.LDAR;
  }
}

/**
 * Модуль переживает перезапуск: оператор, ушедший на обход, после
 * перезагрузки WebView должен оказаться в обходе, а не в LDAR.
 */
export function useActiveModule() {
  const [activeModule, setActiveModule] = useState(readModule);
  const selectModule = useCallback((next) => {
    const resolved = normalizeModule(next);
    setActiveModule(resolved);
    try {
      localStorage.setItem(STORAGE_KEY, resolved);
    } catch {
      // Без хранилища модуль живёт до перезапуска — этого достаточно.
    }
  }, []);
  return [activeModule, selectModule];
}
