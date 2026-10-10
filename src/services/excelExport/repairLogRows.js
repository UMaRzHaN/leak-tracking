import { getRepairLog } from "@/domain/repairStages";
import { getLeakEvents } from "@/domain/leakEvents";
import { EVENT_PHOTO_FIELDS } from "@/utils/photoFields";
import { getEventPhotoMapKey } from "./photoIdentity";
import {
  EXCEL_MONITORING_EXPORT_MODE,
  keepLatestPerRound,
} from "@/utils/excelExportMode";

/**
 * Ключ снимка в карте книги по его пути.
 *
 * Снимок строки — снимок её события, а «до» — чей-то прежний: другой
 * проверки, осмотра или самой записи. Своих файлов у них нет: сборщик
 * архива уже завёл каждому файл или ключ-псевдоним под местом в ленте (или
 * под колонкой «Фото» записи), и по тому же месту их здесь и находят.
 *
 * @param {any} leak
 * @param {number} leakIndex
 * @returns {(path: any) => string|null}
 */
function photoMapKeyByPath(leak, leakIndex) {
  const keys = new Map();
  getLeakEvents(leak).forEach((event, eventIndex) => {
    for (const field of EVENT_PHOTO_FIELDS) {
      const path = event?.[field];
      if (path && !keys.has(String(path))) {
        keys.set(
          String(path),
          getEventPhotoMapKey(leakIndex, eventIndex, field),
        );
      }
    }
  });
  if (leak?.photo && !keys.has(String(leak.photo))) {
    keys.set(String(leak.photo), `${leakIndex}:photo`);
  }
  return (path) => (path ? (keys.get(String(path)) ?? null) : null);
}

/**
 * «Журнал ремонтов»: всё, что было с ремонтом утечки, — начала, отметки
 * стадий из проверки и обхода ремонтов с бригадой и замечанием, приёмки и
 * возвраты в «ожидает МТР». То же, что вкладка «Ремонты» в карточке, но по
 * порядку времени: лист читают сверху вниз, как журнал.
 *
 * У строки со снимком — и снимок «до», как у осмотра в листе обходов
 * (см. `getRepairLog`).
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
    const mapKeyOf = photoMapKeyByPath(leak, leakIndex);
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
        roundNumber: item.roundNumber ?? "",
        physicalTag: item.physicalTag,
        fiction: item.fiction,
        previousPhoto: item.previousPhoto ?? "",
        previousPhotoMapKey: mapKeyOf(item.previousPhoto),
        photo: item.photo ?? "",
        photoMapKey: mapKeyOf(item.photo),
      });
    }
  });
  return rows;
}
