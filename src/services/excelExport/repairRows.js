import { getLeakEvents, getRepairIterations } from "@/domain/leakEvents";
import { getEventPhotoMapKey } from "./photoPipeline";

const HOUR = 60 * 60 * 1000;

/**
 * Ремонты книги: строка на попытку, а не на утечку.
 *
 * До ленты событий починка жила на записи одиночными полями, и в книгу
 * попадала одна — последняя. Утечка, которую чинили трижды, выглядела
 * починенной один раз, и сколько ни смотри в выгрузку, вопрос «а этот ремонт
 * помог?» ответа там не находил.
 *
 * Длительность считается в часах числом, а не текстом: в книге её сортируют и
 * складывают, а «3 дн 4 ч» ни к тому, ни к другому не годится.
 */
export function getRepairExportRows(orderedLeaks) {
  const rows = [];

  orderedLeaks.forEach((leak, leakIndex) => {
    // Ключ снимка выводится из места события в ленте — там же его считал
    // сборщик фотографий, и другого способа их свести нет.
    const eventIndexById = new Map(
      getLeakEvents(leak).map((event, index) => [event?.id, index]),
    );
    const photoMapKey = (event) => {
      const index = eventIndexById.get(event?.id);
      return index == null || !event?.photo
        ? null
        : getEventPhotoMapKey(leakIndex, index, "photo");
    };

    getRepairIterations(leak).forEach(({ started, done }, attemptIndex) => {
      const startedAt = Date.parse(String(started?.date ?? ""));
      const doneAt = Date.parse(String(done?.date ?? ""));
      const measurable = Number.isFinite(startedAt) && Number.isFinite(doneAt);

      rows.push({
        index: leak.index ?? leakIndex + 1,
        leak_id: leak.leak_id ?? "",
        attempt: attemptIndex + 1,
        repairAt: started?.date ?? "",
        repairTime: started?.date ?? "",
        resolvedAt: done?.date ?? "",
        resolvedTime: done?.date ?? "",
        durationHours: measurable
          ? Math.round(((doneAt - startedAt) / HOUR) * 100) / 100
          : "",
        user: started?.user ?? done?.user ?? "",
        repairPhoto: started?.photo ?? "",
        repairPhotoMapKey: photoMapKey(started),
        donePhoto: done?.photo ?? "",
        donePhotoMapKey: photoMapKey(done),
      });
    });
  });

  return rows;
}
