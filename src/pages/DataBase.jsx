import { useState, useMemo } from "react";
import { exportToExcel } from "../utils/exportToExcel";
import { getDistanceMeters } from "../utils/getDistanceMeters";
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
  console.log(data);

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
        photo: event.target.result, // base64
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
              <div className="field">
                <input
                  value={editRow.leak_id || ""}
                  onChange={(e) =>
                    setEditRow({ ...editRow, leak_id: Number(e.target.value) })
                  }
                  placeholder=" "
                />
                <label>Индивидуальный номер утечки</label>
              </div>

              <div className="field">
                <input
                  value={editRow.video_id || ""}
                  onChange={(e) =>
                    setEditRow({ ...editRow, video_id: Number(e.target.value) })
                  }
                  placeholder=" "
                />
                <label>Индивидуальный номер видео</label>
              </div>
              <div className="field">
                <input
                  value={editRow.leak_speed || ""}
                  onChange={(e) =>
                    setEditRow({
                      ...editRow,
                      leak_speed: Number(e.target.value),
                    })
                  }
                  placeholder=" "
                />
                <label>Скорость утечки</label>
              </div>

              <div className="field">
                <input
                  value={editRow.temperature || ""}
                  onChange={(e) =>
                    setEditRow({
                      ...editRow,
                      temperature: Number(e.target.value),
                    })
                  }
                  placeholder=" "
                />
                <label>Температура</label>
              </div>

              <div className="field">
                <input
                  value={editRow.pressure || ""}
                  onChange={(e) =>
                    setEditRow({ ...editRow, pressure: Number(e.target.value) })
                  }
                  placeholder=" "
                />
                <label>Давление</label>
              </div>
              <div className="field">
                <input
                  value={editRow.field || ""}
                  onChange={(e) =>
                    setEditRow({ ...editRow, field: e.target.value })
                  }
                  placeholder=" "
                />
                <label>УМГ</label>
              </div>

              <div className="field">
                <input
                  value={editRow.station || ""}
                  onChange={(e) =>
                    setEditRow({ ...editRow, station: e.target.value })
                  }
                  placeholder=" "
                />
                <label>Компрессорная станция</label>
              </div>
              <div className="field">
                <input
                  value={editRow.location || ""}
                  onChange={(e) =>
                    setEditRow({ ...editRow, location: e.target.value })
                  }
                  placeholder=" "
                />
                <label>Локация</label>
              </div>

              <div className="field">
                <input
                  value={editRow.object || ""}
                  onChange={(e) =>
                    setEditRow({ ...editRow, object: e.target.value })
                  }
                  placeholder=" "
                />
                <label>Объект</label>
              </div>
              <div className="field">
                <input
                  value={editRow.component || ""}
                  onChange={(e) =>
                    setEditRow({ ...editRow, component: e.target.value })
                  }
                  placeholder=" "
                />
                <label>Компонент</label>
              </div>

              <div className="field">
                <input
                  value={editRow.leak_description || ""}
                  onChange={(e) =>
                    setEditRow({ ...editRow, leak_description: e.target.value })
                  }
                  placeholder=" "
                />
                <label>Описание утечки</label>
              </div>

              <div className="field">
                <input
                  value={editRow.leak_cause || ""}
                  onChange={(e) =>
                    setEditRow({ ...editRow, leak_cause: e.target.value })
                  }
                  placeholder=" "
                />
                <label>Причина утечки</label>
              </div>
              <div className="field">
                <input
                  value={editRow.technological_solution || ""}
                  onChange={(e) =>
                    setEditRow({
                      ...editRow,
                      technological_solution: e.target.value,
                    })
                  }
                  placeholder=" "
                />
                <label>Технологическое решение</label>
              </div>

              <div className="field">
                <input
                  value={editRow.repair_recommendation || ""}
                  onChange={(e) =>
                    setEditRow({
                      ...editRow,
                      repair_recommendation: e.target.value,
                    })
                  }
                  placeholder=" "
                />
                <label>Решение / План устранения</label>
              </div>

              <div className="field">
                <input
                  value={editRow.materials_equipment || ""}
                  onChange={(e) =>
                    setEditRow({
                      ...editRow,
                      materials_equipment: e.target.value,
                    })
                  }
                  placeholder=" "
                />
                <label>МТР ремонта (предполагаемый)</label>
              </div>
              <div className="field">
                <textarea
                  value={editRow.note || ""}
                  onChange={(e) =>
                    setEditRow({ ...editRow, note: e.target.value })
                  }
                  placeholder=" "
                />
                <label>Примечание</label>
              </div>
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

                {editRow.photo && (
                  <img
                    src={editRow.photo}
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
                <div style={{ marginTop: 10 }}>
                  <b>Фото:</b>
                  <img
                    src={row.photo}
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
