import { useState, useMemo } from "react";
import { exportToExcel } from "../utils/exportToExcel";
import { getDistanceMeters } from "../utils/getDistanceMeters";
import EditTextField from "../components/EditTextField";
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
  const [editId, setEditId] = useState(null);
  const [editRow, setEditRow] = useState({});
  const [search, setSearch] = useState("");
  const [searchField, setSearchField] = useState("all");
  const [sortByDistance, setSortByDistance] = useState(false);

  /* ---------- helpers ---------- */

  const save = (updated) => {
    setData(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  };

  const startEdit = (row) => {
    setEditId(row.id);
    setEditRow(row);
  };

  const saveEdit = () => {
    const updated = data.map((r) => (r.id === editId ? editRow : r));
    save(updated);
    setEditId(null);
    console.log(data);
  };

  const remove = (id) => {
    if (!window.confirm("Удалить запись?")) return;

    const updated = data
      .filter((r) => r.id !== id)
      .map((r, i) => ({ ...r, id: i + 1 }));

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
    if (!sortByDistance || !coords?.lat || !coords?.lon) {
      return filteredData;
    }

    return [...filteredData].sort((a, b) => {
      const da = getDistanceMeters(coords.lat, coords.lon, a.lat, a.lon);
      const db = getDistanceMeters(coords.lat, coords.lon, b.lat, b.lon);
      return da - db;
    });
  }, [filteredData, sortByDistance, coords]);
  // Edit PHOTO
  const handleEditPhoto = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Выберите изображение");
      return;
    }

    const reader = new FileReader();

    reader.onloadend = (event) => {
      setEditRow((prev) => ({
        ...prev,
        photoPreview: event.target.result, // base64
      }));
    };
    reader.readAsDataURL(file);
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
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="field">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder=" "
          />
          <label>🔍 Поиск</label>
        </div>

        <div className="field field-select">
          <label>Искать по</label>
          <select
            value={searchField}
            onChange={(e) => setSearchField(e.target.value)}
          >
            {SEARCH_FIELDS.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
        </div>

        <div style={{ fontSize: 13, color: "#546e7a" }}>
          Найдено записей: {filteredData.length}
        </div>
      </div>

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

                <input
                  type="file"
                  accept="image/*"
                  id={`edit-photo-${row.id}`}
                  style={{ display: "none" }}
                  onChange={handleEditPhoto}
                />

                <button
                  type="button"
                  onClick={() =>
                    document.getElementById(`edit-photo-${row.id}`).click()
                  }
                  style={{
                    background: "#e3f2fd",
                    color: "#0d47a1",
                    border: "1px solid #90caf9",
                    marginBottom: 8,
                  }}
                >
                  📷 Изменить фото
                </button>

                {editRow.photoPreview && (
                  <img
                    src={editRow.photoPreview}
                    alt="Фото утечки"
                    style={{
                      width: "100%",
                      maxWidth: 300,
                      marginTop: 6,
                      borderRadius: 8,
                      border: "1px solid #e0e0e0",
                    }}
                  />
                )}
              </div>

              <button onClick={saveEdit}>💾 Сохранить</button>
            </>
          ) : (
            <>
              <strong>#{row.index}</strong>
              <div>
                <b> X/Y:</b> {row.latitude}/{row.longitude}
              </div>
              <div>
                <b> Дата:</b> {row.date}
              </div>
              <div>
                <b>Бирка / видео:</b> {row.leak_id} / {row.video_id}
              </div>
              <div>
                <b>Станция:</b> {row.station}
              </div>
              <div>
                <b>Локация / объект:</b> {row.location} / {row.object}
              </div>
              <div>
                <b>Компонент:</b> {row.component}
              </div>
              <div>
                <b>Описание утечки:</b> {row.leak_description}
              </div>
              <div>
                <b>Причина утечки:</b> {row.leak_cause}
              </div>
              <div>
                <b>Технологическое решение:</b> {row.technological_solution}
              </div>
              <div>
                <b>Решение / План устранения</b> {row.repair_recommendation}
              </div>
              <div>
                <b>МТР ремонта (предполагаемый)</b> {row.materials_equipment}
              </div>
              <div>
                <b>Примечание:</b> {row.note}
              </div>
              {row.photo && (
                <div
                  style={{
                    marginTop: 20,
                  }}
                >
                  <p>
                    <b>Фото:</b>
                  </p>
                  <img
                    src={row.photoPreview}
                    alt="Фото утечки"
                    style={{
                      width: "100%",
                      maxWidth: 300,
                      marginTop: 6,
                      borderRadius: 8,
                      border: "1px solid #e0e0e0",
                    }}
                  />
                </div>
              )}
              <button onClick={() => startEdit(row)}>✏️ Изменить</button>
              <button onClick={() => remove(row.id)}>🗑 Удалить</button>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
