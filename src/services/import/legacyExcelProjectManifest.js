import { readArchiveEntry } from "@/utils/importLimits";

/**
 * Проект из файла рядом с книгой.
 *
 * Тип и имя проекта лежали в `excel-project.json` рядом с таблицей, пока их не
 * перенесли в служебный лист внутри самой книги. Выгрузка этот файл больше не
 * пишет — чтение остаётся ради архивов, которые люди уже унесли на диски и в
 * почту.
 *
 * Старые или повреждённые метаданные импорт таблицы не блокируют: без них он
 * просто не знает типа проекта и спрашивает его у человека.
 *
 * @param {any} zip
 * @returns {Promise<{name: string, type: string}|null>}
 */
export async function readLegacyExcelProjectManifest(zip) {
  const entry = zip.file("excel-project.json");
  if (!entry) return null;

  try {
    const manifest = JSON.parse(await readArchiveEntry(zip, entry, "string"));
    const type = manifest?.project?.type || manifest?.config;
    if (!["upstream", "midstream", "downstream"].includes(type)) return null;
    return { name: String(manifest?.project?.name ?? "").trim(), type };
  } catch {
    return null;
  }
}
