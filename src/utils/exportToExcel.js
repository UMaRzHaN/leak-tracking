import * as XLSX from "xlsx";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Capacitor } from "@capacitor/core";
import { calculations } from "../utils/calculations";
import { headers, keysOrder, normalizeRow } from "../utils/calculations";

export const exportToExcel = async (rows) => {
  const FOLDER_NAME = "LeakReports";

  if (!rows || rows.length === 0) {
    alert("Нет данных для выгрузки");
    return;
  }

  /* ---------- подготовка данных ---------- */
<<<<<<< Updated upstream
  const prepared = rows.map((r) => {
    const leakSpeed = Number(r.leak_speed) || 0;

    const annualVolume = leakSpeed * 525.6;
    const annualMass = annualVolume * 0.0007168;
    const emissionFactor =
      percentage_gas_to_flare * 28 +
      percentage_gas_to_utilization * 25.25;

    return {
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

      leak_speed_m3_h: leakSpeed,
      leak_speed_kg_h: leakSpeed * density,

      percentage_gas_to_flare,
      percentage_gas_to_utilization,

      Total_Annual_Methane_Loss_m3_y: annualVolume,
      Total_Annual_Methane_Loss_t_y: annualMass,

      Emissions_tCO2eq_year: annualMass * emissionFactor,
      Emissions_kg_CO2eq_year: annualMass * emissionFactor * 1000,

      GWP,
    };
  });

  /* ---------- Excel ---------- */
  const ws = XLSX.utils.json_to_sheet(prepared);
=======
  const prepared = rows.map((rows) => calculations(rows));

  const preparedOrdered = prepared.map((r) =>
    Object.fromEntries(keysOrder.map((k) => [k, normalizeRow(r)[k]]))
  );
  const ws = XLSX.utils.json_to_sheet(preparedOrdered);
>>>>>>> Stashed changes
  const wb = XLSX.utils.book_new();

  XLSX.utils.sheet_add_aoa(ws, [headers], { origin: "A1" });
  XLSX.utils.book_append_sheet(wb, ws, "Утечки");

  const fileName = `leaks_${Date.now()}.xlsx`;
<<<<<<< Updated upstream

  /* ---------- Mobile (Capacitor) ---------- */
=======
  console.log(preparedOrdered);
>>>>>>> Stashed changes
  if (Capacitor.isNativePlatform()) {
    try {
      await Filesystem.mkdir({
        path: FOLDER_NAME,
        directory: Directory.Documents,
        recursive: true,
      });
    } catch (_) {
      // папка уже существует
    }

    const base64 = XLSX.write(wb, {
      bookType: "xlsx",
      type: "base64",
    });

    await Filesystem.writeFile({
      path: `${FOLDER_NAME}/${fileName}`,
      data: base64,
      directory: Directory.Documents,
      encoding: Encoding.BASE64,
    });

    alert(
      `Файл сохранён:\nDocuments/${FOLDER_NAME}/${fileName}`
    );
  }
  /* ---------- Browser ---------- */
  else {
    XLSX.writeFile(wb, fileName);
  }
};
