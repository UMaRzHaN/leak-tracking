import { logger } from "@/utils/logger";
import {
  asOutOfSpaceError,
  isOutOfSpaceError,
} from "@/services/storage/outOfSpace";

export function createIdbStore(dbName, storeName, version) {
  const DB_NAME = dbName;
  const STORE_NAME = storeName;
  const DB_VERSION = version;

  // Каждый метод после своей проверки захватывает соединение в `db`:
  // `onclose` обнуляет `_db`, и между проверкой и колбэком оно успевает
  // исчезнуть — обращение к нему упало бы уже внутри транзакции.
  let _db = /** @type {IDBDatabase|null} */ (null);
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

    // Соседняя вкладка ещё держит базу прежней версии. Ждать здесь можно
    // сколько угодно: запрос останется открытым и сам продолжится, когда та
    // вкладка отпустит, а всё, что ходит в этот стор, до тех пор отвечает
    // «не готово», а не виснет. Единственное, чего не должно случиться, — это
    // молчания в диагностике.
    request.onblocked = () => {
      logger.warn(
        `[idb] "${DB_NAME}" is blocked by another open connection; the store stays unavailable until it closes.`,
      );
    };

    request.onsuccess = () => {
      const db = request.result;
      _db = db;
      _ready = true;
      _opening = false;

      db.onclose = () => {
        _db = null;
        _ready = false;
        _opening = false;
        _notify();
        open();
      };

      // Схему обновляет соседняя вкладка, и открытое соединение — ровно то,
      // что её держит. Закрываемся и, в отличие от `onclose`, не открываемся
      // заново: обратно поднявшись, мы бы заблокировали её снова. Стор ждёт
      // следующего `open()` — то есть перезагрузки страницы на новую версию.
      db.onversionchange = () => {
        logger.warn(
          `[idb] closing "${DB_NAME}": another tab is upgrading the schema.`,
        );
        _db?.close();
        _db = null;
        _ready = false;
        _opening = false;
        _notify();
      };

      db.onerror = (event) => {
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

  /**
   * `false` — «не сохранилось», и вызывающая сторона показывает общий отказ.
   * Для кончившегося места этого мало: там другое действие, а не повтор,
   * поэтому такой отказ уходит исключением с кодом. Остальные ошибки ведут
   * себя как раньше — иначе пришлось бы переписывать всех вызывающих.
   */
  async function save(id, photoData) {
    if (!_ready || !_db) return false;
    const db = _db;
    return new Promise((resolve, reject) => {
      const fail = (scope, error) => {
        if (isOutOfSpaceError(error)) {
          logger.warn(`[idb] ${scope}: хранилище переполнено`, error);
          reject(asOutOfSpaceError(error));
          return;
        }
        logger.error(`[idb] ${scope}:`, error);
        resolve(false);
      };

      try {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const req = store.put({ id, data: photoData, timestamp: Date.now() });
        tx.oncomplete = () => resolve(true);
        req.onerror = () => fail("save error", req.error);
        tx.onerror = () => fail("save transaction error", tx.error);
        tx.onabort = () => fail("save transaction aborted", tx.error);
      } catch (err) {
        fail("save transaction error", err);
      }
    });
  }

  async function get(id) {
    if (!_ready || !_db) return null;
    const db = _db;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, "readonly");
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
    const db = _db;
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(STORE_NAME, "readonly");
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
    const db = _db;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, "readwrite");
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
    const db = _db;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, "readwrite");
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
    const db = _db;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, "readonly");
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
    const db = _db;
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(STORE_NAME, "readonly");
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
