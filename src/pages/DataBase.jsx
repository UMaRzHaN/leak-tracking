import { useState, useMemo } from "react";
import { exportToExcel } from "../utils/exportToExcel";
import { getDistanceMeters } from "../utils/getDistanceMeters";
import { usePhotoStorage } from "../hooks/usePhotoStorage";
import { useCamera } from "../hooks/useCamera";
import { deletePhotoFromFS } from "../services/photoService";

import EditTextField from "../components/EditTextField";
import LeakRow from "../components/LeakRow";
import SearchPanel from "../components/SearchPanel";

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

export default function DataBase({ data = [], setData, coords }) {
  const { isNative, takePhoto, pickFromBrowser } = useCamera();
  const [editId, setEditId] = useState(null);
  const [editRow, setEditRow] = useState({});
  const [search, setSearch] = useState("");
  const [searchField, setSearchField] = useState("all");
  const [sortByDistance, setSortByDistance] = useState(false);
  const { savePhoto, loadPhoto, clearPreview } = usePhotoStorage();
  /* ---------- helpers ---------- */
  const save = (updated) => {
    const forStorage = updated.map(({ photoPreview, ...rest }) => rest);
    setData(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(forStorage));
  };

  const startEdit = async (row) => {
    setEditId(row.id);

    let photoSrc = null;
    if (row.photo) {
      photoSrc = await loadPhoto(row.photo);
    }

    setEditRow({
      ...row,
      photoPreview: photoSrc,
    });
  };

  const saveEdit = async () => {
    let photo = editRow.photo;

    if (editRow._newPhoto) {
      photo = await savePhoto(editRow._newPhoto, editRow.leak_id);
    }

    const { photoPreview, _newPhoto, ...cleanEditRow } = editRow;

    const updated = data.map((r) =>
      r.id === editId
        ? {
            ...cleanEditRow,
            photo,
            photoUpdatedAt: Date.now(),
          }
        : r
    );

    save(updated);
    clearPreview();
    setEditId(null);
  };

  const remove = async (id) => {
    if (!window.confirm("Удалить запись?")) return;

    const row = data.find((r) => r.id === id);

    if (row?.photo) {
      await deletePhotoFromFS(row.photo); // ✅ ЧЁТКО по пути
    }

    const updated = data
      .filter((r) => r.id !== id)
      .map((r, i) => ({ ...r, index: i + 1 }));

    save(updated);
  };

  /* ---------- search ---------- */

  const filteredData = data.filter((row) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();

    if (searchField === "all") {
      return SEARCH_FIELDS.filter((f) => f.key !== "all").some(({ key }) =>
        row[key]?.toString().toLowerCase().includes(q)
      );
    }

    return row[searchField]?.toString().toLowerCase().includes(q);
  });

  /* ---------- render ---------- */
  const sortedData = useMemo(() => {
    const base = filteredData;

    if (!sortByDistance || !coords?.lat || !coords?.lon) {
      return base;
    }

    return [...base].sort((a, b) => {
      const da = getDistanceMeters(coords.lat, coords.lon, a.lat, a.lon);
      const db = getDistanceMeters(coords.lat, coords.lon, b.lat, b.lon);
      return da - db;
    });
  }, [filteredData, sortByDistance, coords]);

  // Edit PHOTO
  const handleEditPhoto = async (e) => {
    let photo;

    if (isNative) {
      // 📱 Mobile — делаем НОВОЕ фото
      photo = await takePhoto();
    } else {
      // 🌐 Web — выбираем файл
      const file = e.target.files?.[0];
      if (!file) return;
      photo = await pickFromBrowser(file);
    }

    setEditRow((prev) => ({
      ...prev,
      _newPhoto: photo, // 🔥 новое фото
      photoPreview: photo.webPath, // 👁 сразу обновляем preview
    }));
  };

  return (
    <div className="card">
      {/* Экспорт */}
      <button onClick={() => exportToExcel(filteredData)}>
        📥 Экспорт в Excel
      </button>
      <button
        onClick={() => setSortByDistance((v) => !v)}
        className={`sort-btn ${sortByDistance ? "active" : ""}`}
      >
        {sortByDistance ? "↩️ Обычный порядок" : "📍 Отсортировать по близости"}
      </button>
      {/* Поиск */}
      <SearchPanel
        search={search}
        setSearch={setSearch}
        searchField={searchField}
        setSearchField={setSearchField}
        fields={SEARCH_FIELDS}
        resultCount={filteredData.length}
      />

      {/* Список записей */}
      {sortedData.map((row) => (
        <div key={row.id} className="card" style={{ margin: "10px 0" }}>
          {editId === row.id ? (
            <>
              <EditTextField
                label="Индивидуальный номер утечки"
                value={editRow.leak_id}
                onChange={(value) => setEditRow({ ...editRow, leak_id: value })}
              />

              <EditTextField
                label="Видео"
                value={editRow.video}
                onChange={(value) => setEditRow({ ...editRow, video: value })}
              />
              <EditTextField
                label="Скорость утечки"
                value={editRow.leak_speed}
                onChange={(value) =>
                  setEditRow({ ...editRow, leak_speed: value })
                }
              />

              <EditTextField
                label="Температура"
                value={editRow.temperature}
                onChange={(value) =>
                  setEditRow({ ...editRow, temperature: value })
                }
              />

              <EditTextField
                label="Давление"
                value={editRow.pressure}
                onChange={(value) =>
                  setEditRow({ ...editRow, pressure: value })
                }
              />
              <EditTextField
                label="УМГ"
                value={editRow.field}
                onChange={(value) => setEditRow({ ...editRow, field: value })}
              />

              <EditTextField
                label="Компрессорная станция"
                value={editRow.station}
                onChange={(value) => setEditRow({ ...editRow, station: value })}
              />
              <EditTextField
                label="Локация"
                value={editRow.location}
                onChange={(value) =>
                  setEditRow({ ...editRow, location: value })
                }
              />

              <EditTextField
                label="Объект"
                value={editRow.object}
                onChange={(value) => setEditRow({ ...editRow, object: value })}
              />
              <EditTextField
                label="Компонент"
                value={editRow.component}
                onChange={(value) =>
                  setEditRow({ ...editRow, component: value })
                }
              />

              <EditTextField
                label="Описание утечки"
                value={editRow.leak_description}
                onChange={(value) =>
                  setEditRow({ ...editRow, leak_description: value })
                }
              />

              <EditTextField
                label="Причина утечки"
                value={editRow.leak_cause}
                onChange={(value) =>
                  setEditRow({ ...editRow, leak_cause: value })
                }
              />
              <EditTextField
                label="Технологическое решение"
                value={editRow.technological_solution}
                onChange={(value) =>
                  setEditRow({ ...editRow, technological_solution: value })
                }
              />

              <EditTextField
                label="Решение/ План устранения"
                value={editRow.repair_recommendation}
                onChange={(value) =>
                  setEditRow({ ...editRow, repair_recommendation: value })
                }
              />

              <EditTextField
                label="МТР ремонта (предполагаемый)"
                value={editRow.materials_equipment}
                onChange={(value) =>
                  setEditRow({ ...editRow, materials_equipment: value })
                }
              />
              <EditTextField
                label="Примечание"
                value={editRow.note}
                onChange={(value) => setEditRow({ ...editRow, note: value })}
              />
              {/* ===== ФОТО ===== */}
              <div className="field">
                <label>Фото утечки</label>

                {!isNative && (
                  <input
                    type="file"
                    accept="image/*"
                    id={`edit-photo-${row.id}`}
                    style={{ display: "none" }}
                    onChange={handleEditPhoto}
                  />
                )}

                <button
                  type="button"
                  onClick={() =>
                    isNative
                      ? handleEditPhoto() // 📱 камера
                      : document.getElementById(`edit-photo-${row.id}`).click()
                  }
                >
                  📷 Изменить фото
                </button>

                {/* ✅ ТОЛЬКО photoPreview */}
                {editRow.photoPreview && (
                  <img
                    src={editRow.photoPreview}
                    alt="Фото утечки"
                    style={{ maxWidth: 300, marginTop: 8 }}
                  />
                )}
              </div>

              <button onClick={saveEdit}>💾 Сохранить</button>
            </>
          ) : (
            <LeakRow
              key={row.id}
              row={row}
              onEdit={startEdit}
              onRemove={remove}
            />
          )}
        </div>
      ))}
    </div>
  );
}
