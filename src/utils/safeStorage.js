function getLocalStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function getStorageItem(key, fallback = null) {
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
