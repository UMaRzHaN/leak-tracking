import { getRepairLog } from "@/domain/repairStages";

/**
 * «Журнал ремонтов»: всё, что было с ремонтом утечки, — начала, отметки
 * стадий из проверки и обхода ремонтов с бригадой и замечанием, приёмки и
 * возвраты в «ожидает МТР». То же, что вкладка «Ремонты» в карточке, но по
 * порядку времени: лист читают сверху вниз, как журнал.
 *
 * @param {any[]} orderedLeaks
 */
export function getRepairLogExportRows(orderedLeaks) {
  const rows = [];
  orderedLeaks.forEach((leak, leakIndex) => {
    for (const item of [...getRepairLog(leak)].reverse()) {
      rows.push({
        index: leak.index ?? leakIndex + 1,
        leak_id: leak.leak_id ?? "",
        dateRaw: item.date,
        event: item.stage ?? item.kind,
        brigade: item.brigade ?? "",
        materials_equipment: item.materials ?? "",
        note: item.note ?? "",
        user: item.user ?? "",
      });
    }
  });
  return rows;
}
