/**
 * Ошибка, которую увидит пользователь, и её перевод.
 *
 * Приём не новый: нативный плагин синхронизации давно помечает каждый отказ
 * стабильным кодом, а `localSyncErrorText` переводит код и держит текст
 * ошибки запасным вариантом. Здесь то же самое, но для ошибок, которые
 * бросает JS.
 *
 * Их было около сорока, и все несли русский текст прямо в `new Error(...)`.
 * Страж локалей их не видел — он сканирует только `*.jsx`, — а на экран они
 * попадали через `${t("settings.importError")}: ${error.message}`. Английский
 * интерфейс показывал «Import error: QR-код создан для другого проекта».
 *
 * Текст остаётся в коде запасным вариантом, а не заменяется кодом: до экрана
 * ошибка доходит десятками путей, и на пути, который забыли перевести, русский
 * текст — это сегодняшнее поведение, а голый `QR_OTHER_PROJECT` — новая
 * поломка. Ту же роль текст играет в диагностике, которую читают из отчёта об
 * ошибке.
 */

/**
 * @param {string} code стабильный код, ключ в неймспейсе `errors`
 * @param {string} message русский текст на случай непереведённого пути
 * @param {Record<string, unknown>} [params] подстановки для перевода
 * @returns {Error}
 */
export function appError(code, message, params) {
  const error = new Error(message);
  error.code = code;
  if (params) error.params = params;
  return error;
}

/**
 * Текст ошибки на языке интерфейса.
 *
 * Коды ищутся в двух неймспейсах: `errors` — то, что бросает JS, `syncErrors` —
 * то, что присылает нативный плагин. Ошибка без кода приходит из браузера, из
 * exceljs или от плагина старой сборки; переводить в ней нечего, отдаётся как
 * есть.
 *
 * @param {any} error
 * @param {(key: string, params?: any) => string} t
 * @returns {string}
 */
export function errorText(error, t) {
  const code = error?.code;
  if (code) {
    for (const namespace of ["errors", "syncErrors"]) {
      const key = `${namespace}.${code}`;
      const translated = t(key, error.params ?? undefined);
      // Отсутствующий перевод i18next отдаёт самим ключом, но при некоторых
      // настройках — и `undefined`. Проверять только на «не ключ» мало:
      // тогда наружу уходило бы `undefined` вместо запасного текста.
      if (typeof translated === "string" && translated !== key) {
        return translated;
      }
    }
  }
  // Код в последнюю очередь, но раньше пустой строки: непереведённый
  // `SOMETHING_NEWER` на экране бесполезен читателю, но узнаваем в отчёте об
  // ошибке, а пустое место не даёт вообще ничего.
  return error?.message ?? code ?? "";
}
