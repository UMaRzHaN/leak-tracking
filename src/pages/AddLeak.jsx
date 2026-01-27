import LeakForm from "../components/LeakForm/LeakForm";
import { usePhotoStorage } from "../hooks/usePhotoStorage";
import { toNumber } from "../utils/toNumber";
import { useProject } from "../app/settings/ProjectContext";
import { save } from "../utils/saveJSON";

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
    const id = Date.now();

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
    await save(updated, setData, project).catch(err => 
      console.error("Error saving new leak:", err)
    );

    setPage(""); // если нужно вернуться назад
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
