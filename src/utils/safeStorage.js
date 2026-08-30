import { globalScope } from "@/utils/globalScope";
function getLocalStorage() {
  try {
    return globalScope.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * Читатель, у которого спросили запасное значение, получает его же, а не
 * «строку или пусто»: без этого каждый вызов с запасным значением приходилось
 * бы проверять на пустоту, которой там быть не может.
 *
 * @template {string|null} [T=null]
 * @param {string} key
 * @param {T} [fallback]
 * @returns {string|T}
 */
export function getStorageItem(key, fallback = /** @type {any} */ (null)) {
  try {
    return getLocalStorage()?.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function setStorageItem(key, value) {
  try {
    const storage = getLocalStorage();
    if (!storage) return false;
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function removeStorageItem(key) {
  try {
    const storage = getLocalStorage();
    if (!storage) return false;
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
