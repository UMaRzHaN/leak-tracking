import { deletePhotoFromFS } from "../../services/photoService";
import { save } from "../../utils/saveJSON";
import { Capacitor } from "@capacitor/core";

export function useDatabaseActions(data, setData) {
  const remove = async (id) => {
    if (!window.confirm("Удалить запись?")) return;

    const row = data.find((r) => r.id === id);

    // 🗑 Удаляем файл ТОЛЬКО на mobile и ТОЛЬКО если это FS-путь
    if (
      Capacitor.isNativePlatform() &&
      typeof row?.photo === "string" &&
      row.photo.startsWith("Documents/")
    ) {
      try {
        await deletePhotoFromFS(row.photo);
      } catch (e) {
        console.warn("Photo delete failed:", e);
      }
    }

    const updated = data
      .filter((r) => r.id !== id)
      .map((r, i) => ({ ...r, index: i + 1 }));

    save(updated, setData);
  };

  const saveLeak = (updatedLeak) => {
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

    save(updated, setData);
  };

  return { remove, saveLeak };
}
