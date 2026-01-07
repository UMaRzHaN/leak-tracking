import * as XLSX from "xlsx";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Capacitor } from "@capacitor/core";
import {
  density,
  GWP,
  percentage_gas_to_flare,
  percentage_gas_to_utilization,
} from "../data/variables";

export const exportToExcel = async (rows) => {
  const FOLDER_NAME = "LeakReports";
  if (!rows || rows.length === 0) {
    alert("Нет данных для выгрузки");
    return;
  }

  /* ---------- подготовка данных ---------- */
  const prepared = rows.map((r) => ({
    id: r.id,
    date: r.date,
    x_coordinate: r.latitude,
    y_coordinate: r.longitude,
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
    leak_speed_kg: r.leak_speed * density,
    percentage_gas_to_flare,
    percentage_gas_to_utilization,
    Total_Annual_Methane_Loss_m3_y: r.leak_speed * 525.6,
    Total_Annual_Methane_Loss_t_y: r.leak_speed * 525.6 * 0.0007168,
    Emissions_tCO2eq_year:
      r.leak_speed *
      525.6 *
      0.0007168 *
      (percentage_gas_to_flare * 28 + percentage_gas_to_utilization * 25.25),
    Emissions_kg_CO2_eq_year:
      r.leak_speed *
      5256000 *
      0.0007168 *
      (percentage_gas_to_flare * 28 + percentage_gas_to_utilization * 25.25),
    GWP,
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Утечки");

  const fileName = `leaks_${Date.now()}.xlsx`;
  if (Capacitor.isNativePlatform()) {
    // 1️⃣ создаём папку в Download / Documents
    try {
      await Filesystem.mkdir({
        path: FOLDER_NAME,
        directory: Directory.Documents,
        recursive: true,
      });
    } catch (e) {
      // папка уже есть — нормально
    }

    // 2️⃣ Excel → base64
    const base64 = XLSX.write(wb, {
      bookType: "xlsx",
      type: "base64",
    });

    // 3️⃣ сохраняем файл
    await Filesystem.writeFile({
      path: `${FOLDER_NAME}/${fileName}`,
      data: base64,
      directory: Directory.Documents,
      encoding: Encoding.BASE64,
    });

    alert(`Файл сохранён: Download/${FOLDER_NAME}/${fileName}`);
  } else {
    XLSX.writeFile(wb, fileName);
  }
};
