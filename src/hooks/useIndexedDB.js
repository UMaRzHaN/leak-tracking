import { useEffect, useState, useCallback } from "react";

const DB_NAME = "LeakTrackingDB";
const STORE_NAME = "photos";
const DB_VERSION = 1;

/* ── Module-level singleton ──────────────────────────────────────────────
 * One IDB connection for the entire app lifetime.
 * Components subscribe/unsubscribe; cleanup NEVER calls db.close().
 * ─────────────────────────────────────────────────────────────────────── */
let _db = null;
let _ready = false;
let _opening = false;
const _subscribers = new Set();

function _notify() {
  for (const fn of _subscribers) fn(_db, _ready);
}

function _openSingleton() {
  if (_db || _opening || typeof indexedDB === "undefined") return;
  _opening = true;

  let request;
  try {
    request = indexedDB.open(DB_NAME, DB_VERSION);
  } catch (err) {
    console.warn("[useIndexedDB] indexedDB.open threw:", err);
    _opening = false;
    return;
  }

  request.onupgradeneeded = (event) => {
    const db = event.target.result;
    if (!db.objectStoreNames.contains(STORE_NAME)) {
      db.createObjectStore(STORE_NAME, { keyPath: "id" });
    }
  };

  request.onsuccess = () => {
    _db = request.result;
    _ready = true;
    _opening = false;

    // If the browser closes the connection unexpectedly, reopen.
    _db.onclose = () => {
      _db = null;
      _ready = false;
      _opening = false;
      _notify();
      _openSingleton();
    };

    _db.onerror = (event) => {
      console.error("[useIndexedDB] Unexpected IDB error:", event.target?.error);
    };

    _notify();
  };

  request.onerror = () => {
    console.warn("[useIndexedDB] Failed to open IndexedDB:", request.error);
    _opening = false;
    _notify();
  };
}

/* ── Hook ────────────────────────────────────────────────────────────── */

export function useIndexedDB() {
  const [db, setDb] = useState(() => _db);
  const [ready, setReady] = useState(() => _ready);

  useEffect(() => {
    // Sync with current singleton state immediately in case it opened
    // between the initial render and this effect.
    setDb(_db);
    setReady(_ready);

    const sub = (d, r) => {
      setDb(d);
      setReady(r);
    };
    _subscribers.add(sub);
    _openSingleton();

    // Cleanup only removes the subscription — never closes the connection.
    return () => {
      _subscribers.delete(sub);
    };
  }, []);

  const savePhoto = useCallback(async (id, photoData) => {
    if (!_ready || !_db) return false;
    return new Promise((resolve) => {
      try {
        const tx = _db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const req = store.put({ id, data: photoData, timestamp: Date.now() });
        req.onsuccess = () => resolve(true);
        req.onerror = () => {
          console.error("[useIndexedDB] savePhoto error:", req.error);
          resolve(false);
        };
      } catch (err) {
        console.error("[useIndexedDB] savePhoto transaction error:", err);
        resolve(false);
      }
    });
  }, []);

  const getPhoto = useCallback(async (id) => {
    if (!_ready || !_db) return null;
    return new Promise((resolve) => {
      try {
        const tx = _db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(id);
        req.onsuccess = () => resolve(req.result?.data ?? null);
        req.onerror = () => {
          console.error("[useIndexedDB] getPhoto error:", req.error);
          resolve(null);
        };
      } catch (err) {
        console.error("[useIndexedDB] getPhoto transaction error:", err);
        resolve(null);
      }
    });
  }, []);

  const deletePhoto = useCallback(async (id) => {
    if (!_ready || !_db) return false;
    return new Promise((resolve) => {
      try {
        const tx = _db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(id);
        req.onsuccess = () => resolve(true);
        req.onerror = () => {
          console.error("[useIndexedDB] deletePhoto error:", req.error);
          resolve(false);
        };
      } catch (err) {
        console.error("[useIndexedDB] deletePhoto transaction error:", err);
        resolve(false);
      }
    });
  }, []);

  const clearAll = useCallback(async () => {
    if (!_ready || !_db) return false;
    return new Promise((resolve) => {
      try {
        const tx = _db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const req = store.clear();
        req.onsuccess = () => resolve(true);
        req.onerror = () => {
          console.error("[useIndexedDB] clearAll error:", req.error);
          resolve(false);
        };
      } catch (err) {
        console.error("[useIndexedDB] clearAll transaction error:", err);
        resolve(false);
      }
    });
  }, []);

  const listKeys = useCallback(async () => {
    if (!_ready || !_db) return [];
    return new Promise((resolve) => {
      try {
        const tx = _db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAllKeys();
        req.onsuccess = () => resolve(req.result ?? []);
        req.onerror = () => {
          console.error("[useIndexedDB] listKeys error:", req.error);
          resolve([]);
        };
      } catch (err) {
        console.error("[useIndexedDB] listKeys transaction error:", err);
        resolve([]);
      }
    });
  }, []);

  return { ready, savePhoto, getPhoto, deletePhoto, clearAll, listKeys };
}
