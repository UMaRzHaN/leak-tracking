import { isNative } from "@/utils/platform";

/**
 * Исход сохранения одним типом, а не парой «успех | отказ». Размеченное
 * объединение здесь читалось бы точнее, но `tsconfig.check.json` живёт с
 * выключенной strictNullChecks, а без неё сужения по `ok` не происходит и
 * `error` не виден даже внутри ветки отказа.
 *
 * `path` заполняется только на телефоне: в браузере приложение не знает, куда
 * менеджер загрузок положил файл.
 *
 * @typedef {{ok: boolean, fileName?: string, path?: string, error?: unknown}} SaveResult
 */

/**
 * Сохранение файла, который приложение собрало для человека на аварийном
 * экране: копия непрочитанного списка проектов и буфер диагностики.
 *
 * Оба сохранялись кликом по `<a download>`. В браузере это вся история, а на
 * Android — ничего: WebView не регистрирует DownloadListener, и ссылка молча
 * оказывалась пустышкой. Кнопка не работала ровно там, где сохранить данные
 * важнее всего, и без единого признака отказа. Остальные выгрузки — xlsx, kml,
 * zip, инвентаризация — ветвятся на `isNative` и пишут через `writePublicFile`;
 * эти две ветки не имели.
 *
 * Функция возвращает исход, а не бросает: обе вызывающие стороны — экраны
 * поломки, и исключению оттуда некуда идти.
 *
 * @param {{fileName: string, text: string, mimeType?: string}} request
 * @returns {Promise<SaveResult>}
 */
export async function saveRecoveryFile({
  fileName,
  text,
  mimeType = "application/json",
}) {
  const blob = new Blob([text], { type: `${mimeType};charset=utf-8` });

  if (!isNative) {
    try {
      // Ничего не ждём до клика намеренно: после `await` клик оказывается вне
      // жеста человека, а там браузер вправе отказать в скачивании.
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      return { ok: true, fileName };
    } catch (error) {
      return { ok: false, error };
    }
  }

  try {
    // Динамическим импортом, потому что аварийный экран лежит в начальном
    // чанке, а нативная запись нужна одному клику из всей сессии.
    const [{ writePublicFile }, { RECOVERY_EXPORT_DIR }] = await Promise.all([
      import("@/services/storage/publicFileWriter"),
      import("@/services/storage/exportFolders"),
    ]);
    const safeName = safeFileName(fileName);
    await writePublicFile({
      folder: RECOVERY_EXPORT_DIR,
      fileName: safeName,
      blob,
      mimeType,
    });
    return {
      ok: true,
      fileName: safeName,
      path: `${RECOVERY_EXPORT_DIR}/${safeName}`,
    };
  } catch (error) {
    return { ok: false, error };
  }
}

/**
 * Имя файла складывается из названия проекта, а оно приходит от человека и
 * может содержать разделитель пути: на диске это увело бы файл в подкаталог
 * или мимо него. Правило короче, чем у сегментов переносимого архива, потому
 * что и задача уже: форму имени задаёт вызывающая сторона, свободна только
 * середина.
 */
function safeFileName(fileName) {
  const sanitized = String(fileName ?? "")
    .replace(/[/\\:*?"<>|]/g, "-")
    .replace(/\.{2,}/g, ".")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.\s]+/, "")
    .replace(/[-\s]+$/, "")
    .slice(0, 120);
  return sanitized || "recovery.json";
}
