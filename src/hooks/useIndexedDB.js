import { useEffect, useState } from "react";

const DB_NAME = "LeakTrackingDB";
const STORE_NAME = "photos";

export function useIndexedDB() {
  const [db, setDb] = useState(null);

  useEffect(() => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onerror = () => {
      console.error("IndexedDB error:", request.error);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => {
      setDb(request.result);
    };
  }, []);

  const savePhoto = async (id, photoData) => {
    if (!db) {
      console.error("IndexedDB not initialized");
      return false;
    }

    return new Promise((resolve) => {
      const transaction = db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put({ id, data: photoData, timestamp: Date.now() });

      request.onsuccess = () => resolve(true);
      request.onerror = () => resolve(false);
    });
  };

  const getPhoto = async (id) => {
    if (!db) {
      console.error("IndexedDB not initialized");
      return null;
    }

    return new Promise((resolve) => {
      const transaction = db.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result?.data || null);
      request.onerror = () => resolve(null);
    });
  };

  const deletePhoto = async (id) => {
    if (!db) {
      console.error("IndexedDB not initialized");
      return false;
    }

    return new Promise((resolve) => {
      const transaction = db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => resolve(true);
      request.onerror = () => resolve(false);
    });
  };

  const clearAll = async () => {
    if (!db) {
      console.error("IndexedDB not initialized");
      return false;
    }

    return new Promise((resolve) => {
      const transaction = db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => resolve(true);
      request.onerror = () => resolve(false);
    });
  };

  return { savePhoto, getPhoto, deletePhoto, clearAll };
}
