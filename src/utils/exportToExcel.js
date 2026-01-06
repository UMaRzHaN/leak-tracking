import * as XLSX from "xlsx";

export const exportToExcel = (rows) => {
  const prepared = rows.map((r) => ({
    id: r.id,
    date: r.date,
    x_coordinate: r.lat,
    y_coordinate: r.lon,
    field: r.field,
    station: r.station,
    location: r.location,
    object: r.object,
    component: r.component,
    leak_id: r.leak_id,
    video_id: r.video_id,
    leak_description: r.leak_description,
    leak_cause: r.leak_cause,
    technological_solution: r.technological_solution,
    repair_recommendation: r.repair_recommendation,
    materials_equipment: r.materials_equipment,
    note: r.note,
    temperature: r.temperature,
    pressure: r.pressure,
    leak_speed: r.leak_speed,
  }));

  const ws = XLSX.utils.json_to_sheet(prepared, {
    header: [
      "id",
      "date",
      "field",
      "station",
      "location",
      "object",
      "component",
      "leak_id",
      "video_id",
      "leak_description",
      "leak_cause",
      "technological_solution",
      "repair_recommendation",
      "materials_equipment",
      "note",
      "leak_speed",
      "x_coordinate",
      "y_coordinate",
    ],
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Утечки");
  XLSX.writeFile(wb, "leaks.xlsx");
};
