import { useState, useMemo } from "react";
import SearchPanel from "../components/SearchPanel/SearchPanel";
import LeakCardCompact from "../components/LeakCardCompact/LeakCardCompact";
import { PhotoModal } from "../components/PhotoModal/PhotoModal";
import LeakDetailsSheet from "../components/LeakDetailsSheet/LeakDetailsSheet";
import { getDistanceMeters } from "../utils/getDistanceMeters";
import { deletePhotoFromFS } from "../services/photoService";

const STORAGE_KEY = "leaks_database_v1";

/* Поля для поиска */
const SEARCH_FIELDS = [
  { key: "all", label: "По всем полям" },
  { key: "leak_id", label: "Индивидуальный номер утечки (бирка)" },
  { key: "video_id", label: "Индивидуальный номер видео" },
  { key: "station", label: "Компрессорная станция" },
  { key: "location", label: "Локация" },
  { key: "object", label: "Объект" },
  { key: "component", label: "Компонент" },
  { key: "leak_description", label: "Описание утечки" },
  { key: "leak_cause", label: "Причина утечки" },
  { key: "technological_solution", label: "Технологическое решение" },
  { key: "repair_recommendation", label: "Решение / План устранения" },
  { key: "materials_equipment", label: "МТР ремонта" },
  { key: "note", label: "Примечание" },
];

export default function DataBase({
  data = [],
  setData,
  clearDatabase,
  coords,
}) {
  const [search, setSearch] = useState("");
  const [searchField, setSearchField] = useState("all");
  const [sortByDistance, setSortByDistance] = useState(false);
  const [activeLeak, setActiveLeak] = useState(null);
  const [photoItem, setPhotoItem] = useState(null);
  const [photoOpen, setPhotoOpen] = useState(false);

  const save = (updated) => {
    setData(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  };

  const remove = async (id) => {
    if (!window.confirm("Удалить запись?")) return;

    const row = data.find((r) => r.id === id);

    // 🗑 удаляем фото из файловой системы
    if (row?.photo) {
      try {
        await deletePhotoFromFS(row.photo);
      } catch (e) {
        console.warn("Не удалось удалить фото:", e);
      }
    }

    // 🗑 удаляем запись из базы
    const updated = data
      .filter((r) => r.id !== id)
      .map((r, i) => ({ ...r, index: i + 1 }));

    save(updated);
  };

  /* ---------- search ---------- */

  const filteredData = useMemo(() => {
    if (!search.trim()) return data;

    const q = search.toLowerCase();

    return data.filter((row) => {
      if (searchField === "all") {
        return SEARCH_FIELDS.filter((f) => f.key !== "all").some(({ key }) =>
          row[key]?.toString().toLowerCase().includes(q),
        );
      }

      return row[searchField]?.toString().toLowerCase().includes(q);
    });
  }, [data, search, searchField]);
  /* ---------- sort by distance ---------- */
  const sortedData = useMemo(() => {
    if (!sortByDistance || !coords?.lat || !coords?.lon) {
      return filteredData;
    }

    return [...filteredData].sort((a, b) => {
      const da = getDistanceMeters(coords.lat, coords.lon, a.lat, a.lon);
      const db = getDistanceMeters(coords.lat, coords.lon, b.lat, b.lon);
      return da - db;
    });
  }, [filteredData, sortByDistance, coords]);
  return (
    <div className="card">
      <SearchPanel
        search={search}
        setSearch={setSearch}
        searchField={searchField}
        setSearchField={setSearchField}
        fields={SEARCH_FIELDS}
        resultCount={sortedData.length}
        setSortByDistance={setSortByDistance}
        sortByDistance={sortByDistance}
        clearDatabase={clearDatabase}
        filteredData={filteredData}
        coords={coords}
      />

      {sortedData.map((row) => (
        <LeakCardCompact
          key={row.id}
          leak={row}
          onRemove={remove}
          onOpenDetails={setActiveLeak}
          onOpenPhoto={(item) => {
            setPhotoItem(item);
            setPhotoOpen(true);
          }}
        />
      ))}

      {activeLeak && (
        <LeakDetailsSheet
          leak={activeLeak}
          onClose={() => setActiveLeak(null)}
          onSave={(updatedLeak) => {
            const updated = data.map((r) =>
              r.id === updatedLeak.id ? updatedLeak : r,
            );
            save(updated);
            setActiveLeak(null);
          }}
        />
      )}

      <PhotoModal
        open={photoOpen}
        item={photoItem}
        onClose={() => setPhotoOpen(false)}
      />
    </div>
  );
}
