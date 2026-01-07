import LeakForm from "../components/LeakForm";
<<<<<<< Updated upstream

const STORAGE_KEY = "leaks_database_v1";

export default function AddLeak({ data, setData, coords }) {
=======
import { toNumber } from "../utils/calculations";
const STORAGE_KEY = "leaks_database_v1";

export default function AddLeak({
  data,
  setData,
  coords,
  voiceData,
  clearVoiceData,
}) {
>>>>>>> Stashed changes
  const handleAdd = (row) => {
    const updated = [
      ...data,
      {
        id: data.length + 1,
<<<<<<< Updated upstream
        latitude: coords?.lat ?? null,
        longitude: coords?.lon ?? null,
=======
        latitude: toNumber(coords?.lat),
        longitude: toNumber(coords?.lon),

>>>>>>> Stashed changes
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
