import { useEffect, useState, useCallback } from "react";
import { idb } from "@/repositories/idb";

export function useIndexedDB() {
  const [ready, setReady] = useState(() => idb.getState().ready);

  useEffect(() => {
    setReady(idb.getState().ready);
    const unsub = idb.subscribe((_, r) => setReady(r));
    idb.open();
    return unsub;
  }, []);

  const savePhoto = useCallback((id, photoData) => idb.save(id, photoData), []);
  const getPhoto = useCallback((id) => idb.get(id), []);
  const deletePhoto = useCallback((id) => idb.remove(id), []);
  const clearAll = useCallback(() => idb.clear(), []);
  const listKeys = useCallback(() => idb.listKeys(), []);

  return { ready, savePhoto, getPhoto, deletePhoto, clearAll, listKeys };
}
