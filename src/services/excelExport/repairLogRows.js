import { getRepairLog } from "@/domain/repairStages";
import {
  EXCEL_MONITORING_EXPORT_MODE,
  keepLatestPerRound,
} from "@/utils/excelExportMode";

/**
 * «Журнал ремонтов»: всё, что было с ремонтом утечки, — начала, отметки
 * стадий из проверки и обхода ремонтов с бригадой и замечанием, приёмки и
 * возвраты в «ожидает МТР». То же, что вкладка «Ремонты» в карточке, но по
 * порядку времени: лист читают сверху вниз, как журнал.
 *
 * «Последняя в обходе» оставляет на ремонт одну запись в каждом обходе —
 * итог его проверки; записи без номера обхода остаются все.
 *
 * @param {any[]} orderedLeaks
 * @param {string} [mode] режим выгрузки листа
 */
export function getRepairLogExportRows(orderedLeaks, mode) {
  const rows = [];
  orderedLeaks.forEach((leak, leakIndex) => {
    const log = [...getRepairLog(leak)].reverse();
    const items =
      mode === EXCEL_MONITORING_EXPORT_MODE.LATEST_PER_ROUND
        ? keepLatestPerRound(log, {
            keyOf: () => leakIndex,
            roundOf: (item) => item.roundNumber,
            timeOf: (item) => Date.parse(item.date),
          })
        : log;
    for (const item of items) {
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
