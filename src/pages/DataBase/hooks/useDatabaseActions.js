import { Capacitor } from "@capacitor/core";
import { deletePhotoFromFS } from "../../../services/photoService";
import { saveProjectData } from "../../../services/saveProjectData";
import { useProject } from "../../../app/settings/ProjectContext";
import { useIndexedDB } from "../../../hooks/useIndexedDB";

/* =========================
   HOOK
========================= */
export function useDatabaseActions(data, setData) {
  const { project } = useProject();
  const { ready, deletePhoto: deleteFromIndexedDB } = useIndexedDB();

  /* =========================
     HELPERS
  ========================= */
  const deletePhoto = async (photo) => {
    if (typeof photo !== "string") return;

    // IndexedDB
    if (photo.startsWith("idb://")) {
      const photoId = photo.replace("idb://", "");

      if (!ready) {
        console.warn("IndexedDB not ready, skip photo delete:", photoId);
        return;
      }

      await deleteFromIndexedDB(photoId);
      return;
    }

    // Mobile FS
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
    if (!row) {
      console.warn(`[useDatabaseActions] Row not found: ${id}`);
      return;
    }

    try {
      await deletePhoto(row.photo);
    } catch (e) {
      console.warn("Photo delete failed:", e);
    }

    const updated = data
      .filter((r) => r.id !== id)
      .map((r, i) => ({ ...r, index: i + 1 }));

    setData(updated);
    await saveProjectData(project, updated);
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
        // 🔒 защита от потери фото
        photo: updatedLeak.photo !== undefined ? updatedLeak.photo : r.photo,
      };
    });

    setData(updated);
    await saveProjectData(project, updated);
  };

  return {
    remove,
    saveLeak,
  };
}
