import LeakForm from "../components/LeakForm/LeakForm";
import { usePhotoStorage } from "../hooks/usePhotoStorage";
import { toNumber } from "../utils/voice/toNumber";
import { useProject } from "../app/settings/ProjectContext";
import { saveProjectData } from "../services/saveProjectData";

export default function AddLeak({
  data,
  setData,
  coords,
  voiceData,
  clearVoiceData,
  startVoiceInput,
  stopVoiceInput,
  setPage,
}) {
  const { savePhoto } = usePhotoStorage();
  const { project } = useProject();

  const handleAdd = async (row) => {
    try {
      const id = Date.now();

      /* =========================
         SAVE PHOTO (OPTIONAL)
      ========================= */
      let photoPath = null;
      if (row.photo?.raw) {
        photoPath = await savePhoto(row.photo.raw, row.leak_id);
      }

      const { photo, ...cleanRow } = row;

      const newRow = {
        id,
        lat: toNumber(coords?.lat),
        lng: toNumber(coords?.lng),
        index: data.length + 1,
        ...cleanRow,
        photo: photoPath,
      };

      const updated = [...data, newRow];

      /* =========================
         UPDATE UI + PERSIST
      ========================= */
      setData(updated);
      await saveProjectData(project, updated);

      setPage(""); // возврат назад
    } catch (err) {
      console.error("Error adding new leak:", err);
    }
  };

  return (
    <LeakForm
      onAdd={handleAdd}
      voiceData={voiceData}
      clearVoiceData={clearVoiceData}
      startVoiceInput={startVoiceInput}
      stopVoiceInput={stopVoiceInput}
      coords={coords}
      setPage={setPage}
      lastItem={data.at(-1)}
    />
  );
}
