import { deletePhotoFromFS } from "../../services/photoService";
import { save } from "../../utils/saveJSON";

export function useDatabaseActions(data, setData) {
  const remove = async (id) => {
    if (!window.confirm("Удалить запись?")) return;

    const row = data.find((r) => r.id === id);

    if (row?.photo) {
      try {
        await deletePhotoFromFS(row.photo);
      } catch {}
    }

    const updated = data
      .filter((r) => r.id !== id)
      .map((r, i) => ({ ...r, index: i + 1 }));

    save(updated, setData);
  };

  const saveLeak = (updatedLeak) => {
    const updated = data.map((r) =>
      r.id === updatedLeak.id ? updatedLeak : r
    );
    save(updated, setData);
  };

  return { remove, saveLeak };
}
