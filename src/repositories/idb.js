import { logger } from "@/utils/logger";

export function createIdbStore(dbName, storeName, version) {
  const DB_NAME = dbName;
  const STORE_NAME = storeName;
  const DB_VERSION = version;

  let _db = null;
  let _ready = false;
  let _opening = false;
  const _subscribers = new Set();

  function _notify() {
    for (const fn of _subscribers) fn(_db, _ready);
  }

  function open() {
    if (_db || _opening || typeof indexedDB === "undefined") return;
    _opening = true;

    let request;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (err) {
      logger.warn("[idb] indexedDB.open threw:", err);
      _opening = false;
      return;
    }

    request.onupgradeneeded = (event) => {
      const db = /** @type {IDBOpenDBRequest} */ (event.target).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => {
      _db = request.result;
      _ready = true;
      _opening = false;

      _db.onclose = () => {
        _db = null;
        _ready = false;
        _opening = false;
        _notify();
        open();
      };

      _db.onerror = (event) => {
        logger.error(
          "[idb] Unexpected IDB error:",
          /** @type {any} */ (event.target)?.error,
        );
      };

      _notify();
    };

    request.onerror = () => {
      logger.warn("[idb] Failed to open IndexedDB:", request.error);
      _opening = false;
      _notify();
    };
  }

  function subscribe(fn) {
    _subscribers.add(fn);
    return () => _subscribers.delete(fn);
  }

  function getState() {
    return { db: _db, ready: _ready };
  }

  async function save(id, photoData) {
    if (!_ready || !_db) return false;
    return new Promise((resolve) => {
      try {
        const tx = _db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const req = store.put({ id, data: photoData, timestamp: Date.now() });
        tx.oncomplete = () => resolve(true);
        req.onerror = () => {
          logger.error("[idb] save error:", req.error);
          resolve(false);
        };
        tx.onerror = () => {
          logger.error("[idb] save transaction error:", tx.error);
          resolve(false);
        };
        tx.onabort = () => {
          logger.error("[idb] save transaction aborted:", tx.error);
          resolve(false);
        };
      } catch (err) {
        logger.error("[idb] save transaction error:", err);
        resolve(false);
      }
    });
  }

  async function get(id) {
    if (!_ready || !_db) return null;
    return new Promise((resolve) => {
      try {
        const tx = _db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(id);
        req.onsuccess = () => resolve(req.result?.data ?? null);
        req.onerror = () => {
          logger.error("[idb] get error:", req.error);
          resolve(null);
        };
      } catch (err) {
        logger.error("[idb] get transaction error:", err);
        resolve(null);
      }
    });
  }

  async function getStrict(id) {
    if (!_ready || !_db) {
      const error = new Error("IndexedDB store is not ready");
      error.code = "IDB_NOT_READY";
      throw error;
    }
    return new Promise((resolve, reject) => {
      try {
        const tx = _db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(id);
        req.onsuccess = () => resolve(req.result?.data ?? null);
        req.onerror = () => reject(req.error ?? tx.error);
        tx.onabort = () =>
          reject(tx.error ?? new Error("IndexedDB read aborted"));
      } catch (error) {
        reject(error);
      }
    });
  }

  async function remove(id) {
    if (!_ready || !_db) return false;
    return new Promise((resolve) => {
      try {
        const tx = _db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(id);
        tx.oncomplete = () => resolve(true);
        req.onerror = () => {
          logger.error("[idb] remove error:", req.error);
          resolve(false);
        };
        tx.onerror = () => {
          logger.error("[idb] remove transaction error:", tx.error);
          resolve(false);
        };
        tx.onabort = () => {
          logger.error("[idb] remove transaction aborted:", tx.error);
          resolve(false);
        };
      } catch (err) {
        logger.error("[idb] remove transaction error:", err);
        resolve(false);
      }
    });
  }

  async function clear() {
    if (!_ready || !_db) return false;
    return new Promise((resolve) => {
      try {
        const tx = _db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const req = store.clear();
        tx.oncomplete = () => resolve(true);
        req.onerror = () => {
          logger.error("[idb] clear error:", req.error);
          resolve(false);
        };
        tx.onerror = () => {
          logger.error("[idb] clear transaction error:", tx.error);
          resolve(false);
        };
        tx.onabort = () => {
          logger.error("[idb] clear transaction aborted:", tx.error);
          resolve(false);
        };
      } catch (err) {
        logger.error("[idb] clear transaction error:", err);
        resolve(false);
      }
    });
  }

  async function listKeys() {
    if (!_ready || !_db) return [];
    return new Promise((resolve) => {
      try {
        const tx = _db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAllKeys();
        req.onsuccess = () => resolve(req.result ?? []);
        req.onerror = () => {
          logger.error("[idb] listKeys error:", req.error);
          resolve([]);
        };
      } catch (err) {
        logger.error("[idb] listKeys transaction error:", err);
        resolve([]);
      }
    });
  }

  async function listKeysStrict() {
    if (!_ready || !_db) {
      const error = new Error("IndexedDB store is not ready");
      error.code = "IDB_NOT_READY";
      throw error;
    }
    return new Promise((resolve, reject) => {
      try {
        const tx = _db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAllKeys();
        req.onsuccess = () => resolve(req.result ?? []);
        req.onerror = () => reject(req.error ?? tx.error);
        tx.onabort = () =>
          reject(tx.error ?? new Error("IndexedDB key listing aborted"));
      } catch (error) {
        reject(error);
      }
    });
  }

  return {
    open,
    subscribe,
    getState,
    save,
    get,
    getStrict,
    remove,
    clear,
    listKeys,
    listKeysStrict,
  };
}

// Keep backward-compatible named export for existing consumers
export const idb = createIdbStore("LeakTrackingDB", "photos", 1);
