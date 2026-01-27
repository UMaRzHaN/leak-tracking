import { deletePhotoFromFS } from "../../../services/photoService";
import { save } from "../../../services/saveJSON";
import { Capacitor } from "@capacitor/core";
import { useProject } from "../../../app/settings/ProjectContext";
import { useIndexedDB } from "../../../hooks/useIndexedDB";

export function useDatabaseActions(data, setData) {
  const { project } = useProject();
  const { deletePhoto: deleteFromIndexedDB } = useIndexedDB();

  const remove = async (id) => {
    if (!window.confirm("Удалить запись?")) return;

    const row = data.find((r) => r.id === id);

    // 🗑 Удаляем фото
    if (typeof row?.photo === "string") {
      // Удаляем из IndexedDB
      if (row.photo.startsWith("idb://")) {
        const photoId = row.photo.replace("idb://", "");
        await deleteFromIndexedDB(photoId);
      }
      // Удаляем из Mobile FS
      else if (
        Capacitor.isNativePlatform() &&
        row.photo.startsWith("Documents/")
      ) {
        try {
          await deletePhotoFromFS(row.photo);
        } catch (e) {
          console.warn("Photo delete failed:", e);
        }
      }
    }

    const updated = data
      .filter((r) => r.id !== id)
      .map((r, i) => ({ ...r, index: i + 1 }));

    save(updated, setData, project).catch(err => 
      console.error("Error saving after delete:", err)
    );
  };

  const saveLeak = async (updatedLeak) => {
    const updated = data.map((r) => {
      if (r.id !== updatedLeak.id) return r;

      return {
        ...r,
        ...updatedLeak,
        // 🔒 защита от потери фото
        photo:
          updatedLeak.photo !== undefined ? updatedLeak.photo : r.photo,
      };
    });

    await save(updated, setData, project).catch(err => 
      console.error("Error saving leak:", err)
    );
  };

  return { remove, saveLeak };
}
