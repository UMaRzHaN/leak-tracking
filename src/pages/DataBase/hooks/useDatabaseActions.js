import { Capacitor } from "@capacitor/core";
import { deletePhotoFromFS } from "../../../services/photoService";
import { useIndexedDB } from "../../../hooks/useIndexedDB";

/*
 * Данные сохраняются через `setData` (= save из useProjectData),
 * который уже содержит правильную логику записи.
 * Прямые вызовы saveProjectData убраны — они использовали устаревший путь.
 */
export function useDatabaseActions(data, setData) {
  const { ready, deletePhoto: deleteFromIndexedDB } = useIndexedDB();

  /* =========================
     PHOTO DELETE
  ========================= */
  const deletePhoto = async (photo) => {
    if (typeof photo !== "string") return;

    // IndexedDB (web)
    if (photo.startsWith("idb://")) {
      if (!ready) return;
      await deleteFromIndexedDB(photo.replace("idb://", ""));
      return;
    }

    // Private FS (new: data://)
    if (Capacitor.isNativePlatform() && photo.startsWith("data://")) {
      await deletePhotoFromFS(photo);
      return;
    }

    // Legacy public FS (Documents/)
    if (Capacitor.isNativePlatform() && photo.startsWith("Documents/")) {
      await deletePhotoFromFS(photo);
    }
  };

  /* =========================
     REMOVE
  ========================= */
  const remove = async (id, { confirm = true } = {}) => {
    if (confirm && !window.confirm("Удалить запись?")) return;

    const row = data.find((r) => r.id === id);
    if (!row) return;

    try { await deletePhoto(row.photo); } catch {}

    const updated = data
      .filter((r) => r.id !== id)
      .map((r, i) => ({ ...r, index: i + 1 }));

    await setData(updated);
  };

  /* =========================
     SAVE / UPDATE
  ========================= */
  const saveLeak = async (updatedLeak) => {
    const updated = data.map((r) => {
      if (r.id !== updatedLeak.id) return r;
      return {
        ...r,
        ...updatedLeak,
        photo: updatedLeak.photo !== undefined ? updatedLeak.photo : r.photo,
      };
    });

    await setData(updated);
  };

  return { remove, saveLeak };
}
