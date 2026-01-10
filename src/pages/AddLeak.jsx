import LeakForm from "../components/LeakForm";
import { savePhoto } from "../services/cameraService";
import { toNumber } from "../utils/toNumber";
const STORAGE_KEY = "leaks_database_v1";

export default function AddLeak({
  data,
  setData,
  coords,
  voiceData,
  clearVoiceData,
  startVoiceInput,
  stopVoiceInput,
  photo,
  setPhoto,
}) {
  const handleAdd = async (row) => {
    const id = Date.now();

    let photo = null;

    if (row.photoPreview) {
      photo = await savePhoto(row.photoPreview, id);
    }

    const newRow = {
      id,
      latitude: toNumber(coords?.lat),
      longitude: toNumber(coords?.lon),
      index: data.length + 1,
      ...row,
      photo, // ✅ путь к файлу
      photoPreview: undefined, // ❌ не храним preview
    };

    const updated = [...data, newRow];

    setData(updated);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(updated.map(({ photoPreview, ...r }) => r))
    );
  };

  return (
    <LeakForm
      onAdd={handleAdd}
      voiceData={voiceData}
      clearVoiceData={clearVoiceData}
      startVoiceInput={startVoiceInput}
      stopVoiceInput={stopVoiceInput}
      photo={photo}
      setPhoto={setPhoto}
    />
  );
}
