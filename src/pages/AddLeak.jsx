import LeakForm from "../components/LeakForm";
const STORAGE_KEY = "leaks_database_v1";
export default function AddLeak({ data, setData, coords }) {
  const handleAdd = (row) => {
    const updated = [
      ...data,
      {
        id: data.length + 1,
        latitude: coords.lat ?? null,
        longitude: coords.lon ?? null,
        ...row,
      },
    ];

    setData(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  };

  return <LeakForm onAdd={handleAdd} />;
}
