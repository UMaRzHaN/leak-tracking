/**
 * Имя проекта, каким его написала выгрузка.
 *
 * Файл называется «!Database_Бузахур.zip» или «!Inventorization_Бузахур.zip»:
 * приставку ставит приложение, чтобы архивы различались в папке, и предлагать
 * её человеку как название проекта — значит заставлять его стирать её руками.
 *
 * Живёт отдельно от экранов потому, что имя из файла нужно обоим входам:
 * первому экрану, где проект заводится руками, и настройкам, где архив
 * инвентаризации заводит проект сам.
 *
 * @param {string} fileName
 * @returns {string}
 */
export function projectNameFromFile(fileName) {
  return (
    String(fileName)
      .replace(/\.(?:xlsx|zip)$/i, "")
      .replace(/^!?(?:Database|Inventorization)[_-]?/i, "")
      .trim() || String(fileName).replace(/\.(?:xlsx|zip)$/i, "")
  );
}
