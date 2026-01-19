import LeakForm from "../components/LeakForm/LeakForm";
import { usePhotoStorage } from "../hooks/usePhotoStorage";

import { toNumber } from "../utils/toNumber";
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
  const { savePhoto } = usePhotoStorage();
  const handleAdd = async (row) => {
    const id = Date.now();

    let photoPath = null;

    if (row._newPhoto) {
      photoPath = await savePhoto(row._newPhoto, row.leak_id); // ✅ теперь работает и web и native
    }

    const { _newPhoto, photoPreview, ...cleanRow } = row;

    const newRow = {
      id,
      lat: toNumber(coords?.lat),
      lon: toNumber(coords?.lon),
      index: data.length + 1,
      ...cleanRow,
      photo: photoPath,
    };

    setData((prev) => {
      const updated = [...prev, newRow];
      localStorage.setItem("leaks_database_v1", JSON.stringify(updated));
      return updated;
    });
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
      coords={coords}
    />
  );
}
