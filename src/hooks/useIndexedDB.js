import { useEffect, useState } from "react";

const DB_NAME = "LeakTrackingDB";
const STORE_NAME = "photos";
const DB_VERSION = 1;

export function useIndexedDB() {
  const [db, setDb] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error("IndexedDB open error:", request.error);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => {
      setDb(request.result);
      setReady(true);
    };

    return () => {
      if (db) {
        db.close();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const savePhoto = async (id, photoData) => {
    if (!ready || !db) return false;

    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);

      const request = store.put({
        id,
        data: photoData,
        timestamp: Date.now(),
      });

      request.onsuccess = () => resolve(true);
      request.onerror = () => resolve(false);
    });
  };

  const getPhoto = async (id) => {
    if (!ready || !db) return null;

    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(id);

      request.onsuccess = () => {
        resolve(request.result?.data ?? null);
      };

      request.onerror = () => resolve(null);
    });
  };

  const deletePhoto = async (id) => {
    if (!ready || !db) return false;

    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => resolve(true);
      request.onerror = () => resolve(false);
    });
  };

  const clearAll = async () => {
    if (!ready || !db) return false;

    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => resolve(true);
      request.onerror = () => resolve(false);
    });
  };

  return {
    ready,       // 👈 ключевая часть
    savePhoto,
    getPhoto,
    deletePhoto,
    clearAll,
  };
}
