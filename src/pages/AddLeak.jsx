import LeakForm from "../components/LeakForm";
import { toNumber } from "../utils/calculations";
const STORAGE_KEY = "leaks_database_v1";

export default function AddLeak({
  data,
  setData,
  coords,
  voiceData,
  clearVoiceData,
}) {
  const handleAdd = (row) => {
    const updated = [
      ...data,
      {
        id: data.length + 1,
        latitude: toNumber(coords?.lat),
        longitude: toNumber(coords?.lon),

        ...row,
      },
    ];

    setData(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  };

  return (
    <LeakForm
      onAdd={handleAdd}
      voiceData={voiceData}
      clearVoiceData={clearVoiceData}
    />
  );
}
