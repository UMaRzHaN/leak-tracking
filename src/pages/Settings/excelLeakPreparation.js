import { matchIncomingLeaks } from "@/services/backup/leakMatching";

/**
 * Утечки, прочитанные из книги, — к записи в проект: внутренний `id`,
 * порядковый номер и отметка импорта.
 *
 * При слиянии строка получает `id` своей местной утечки, и пару ей ищет то
 * же правило, что и объединению ZIP (`matchIncomingLeaks`). Раньше пары
 * искались по словарю «номер → утечка»: номер не уникален, у двух утечек с
 * одним номером в словаре оставалась последняя, и обе строки книги получали
 * её `id` — слияние склеивало две утечки в одну.
 *
 * @param {any[]} existing утечки проекта
 * @param {any[]} leaks утечки из книги
 * @param {{ mode?: "append"|"merge"|"overwrite"|"copy", now?: number }} [options]
 */
export function prepareExcelLeaks(
  existing,
  leaks,
  { mode = "append", now = Date.now() } = {},
) {
  const matches =
    mode === "merge"
      ? matchIncomingLeaks(existing, leaks, { source: "excel" })
      : [];

  return leaks.map((leak, index) => {
    const match = matches[index] ?? -1;
    const local = match >= 0 ? existing[match] : null;

    return {
      ...leak,
      id: local?.id ?? now + index,
      index:
        mode === "overwrite" || mode === "copy"
          ? index + 1
          : (local?.index ?? existing.length + index + 1),
      importedFromExcel: true,
      importedAt: now,
    };
  });
}
