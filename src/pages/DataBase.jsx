import { useState } from "react";
import { exportToExcel } from "../utils/exportToExcel";

const STORAGE_KEY = "leaks_database_v1";

export default function Database({ data, setData }) {
  const [editId, setEditId] = useState(null);
  const [editRow, setEditRow] = useState({});
  const save = (updated) => {
    setData(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  };
  const startEdit = (row) => {
    setEditId(row.id);
    setEditRow(row);
  };

  const saveEdit = () => {
    setData((prev) => prev.map((r) => (r.id === editId ? editRow : r)));
    setEditId(null);
    save(data);
  };

  const remove = (id) => {
    const filtered = data
      .filter((r) => r.id !== id)
      .map((r, i) => ({ ...r, id: i + 1 })); // пересчёт id
    setData(filtered);
    save(data);
  };

  return (
    <div className="card">
      <button onClick={() => exportToExcel(data)}>📥 Выгрузить в Excel</button>

      {data.map((row) => (
        <div key={row.id} className="card" style={{ margin: "10px 0" }}>
          {editId === row.id ? (
            <>
              <input
                value={editRow.leak_id || ""}
                onChange={(e) =>
                  setEditRow({ ...editRow, leak_id: e.target.value })
                }
              />
              <input
                value={editRow.video_id || ""}
                onChange={(e) =>
                  setEditRow({ ...editRow, video_id: e.target.value })
                }
              />
              <input
                value={editRow.leak_speed || ""}
                onChange={(e) =>
                  setEditRow({ ...editRow, leak_speed: e.target.value })
                }
              />
              <input
                value={editRow.temperature || ""}
                onChange={(e) =>
                  setEditRow({ ...editRow, temperature: e.target.value })
                }
              />
              <input
                value={editRow.pressure || ""}
                onChange={(e) =>
                  setEditRow({ ...editRow, pressure: e.target.value })
                }
              />
              <input
                value={editRow.field || ""}
                onChange={(e) =>
                  setEditRow({ ...editRow, field: e.target.value })
                }
              />
              <input
                value={editRow.station || ""}
                onChange={(e) =>
                  setEditRow({ ...editRow, station: e.target.value })
                }
              />
              <textarea
                value={editRow.note || ""}
                onChange={(e) =>
                  setEditRow({ ...editRow, note: e.target.value })
                }
              />
              <input
                value={editRow.location || ""}
                onChange={(e) =>
                  setEditRow({ ...editRow, location: e.target.value })
                }
              />
              <input
                value={editRow.object || ""}
                onChange={(e) =>
                  setEditRow({ ...editRow, object: e.target.value })
                }
              />
              <input
                value={editRow.component || ""}
                onChange={(e) =>
                  setEditRow({ ...editRow, component: e.target.value })
                }
              />
              <input
                value={editRow.leak_description || ""}
                onChange={(e) =>
                  setEditRow({ ...editRow, leak_description: e.target.value })
                }
              />
              <input
                value={editRow.leak_cause || ""}
                onChange={(e) =>
                  setEditRow({ ...editRow, leak_cause: e.target.value })
                }
              />
              <input
                value={editRow.technological_solution || ""}
                onChange={(e) =>
                  setEditRow({
                    ...editRow,
                    technological_solution: e.target.value,
                  })
                }
              />
              <input
                value={editRow.repair_recommendation || ""}
                onChange={(e) =>
                  setEditRow({
                    ...editRow,
                    repair_recommendation: e.target.value,
                  })
                }
              />
              <input
                value={editRow.materials_equipment || ""}
                onChange={(e) =>
                  setEditRow({
                    ...editRow,
                    materials_equipment: e.target.value,
                  })
                }
              />

              <button onClick={saveEdit}>💾 Сохранить</button>
            </>
          ) : (
            <>
              <strong>#{row.id}</strong>
              <div>{row.station}</div>
              <div>
                {row.object} / {row.location}
              </div>
              <div>{row.component}</div>
              <div>{row.leak}</div>
              <div>{row.mode}</div>
              <div>{row.date}</div>

              <button onClick={() => startEdit(row)}>✏️ Изменить</button>
              <button onClick={() => remove(row.id)}>🗑 Удалить</button>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
