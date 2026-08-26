/**
 * `Object.fromEntries` без самого `Object.fromEntries`.
 *
 * Метод появился в Chrome 73, и двадцать два вызова держали на нём пол
 * поддержки приложения. Понизить его сборкой нельзя: `build.target` работает
 * с синтаксисом, а это метод — на старом WebView он даёт не ошибку сборки, а
 * `TypeError` посреди работы.
 *
 * Принимает то же, что и оригинал: любой перебираемый источник пар, включая
 * `Map` и результат `Object.entries`.
 *
 * Сигнатура намеренно повторяет платформенную (`Iterable<readonly any[]>` в
 * lib.es2019.object.d.ts), а не описывает пары кортежем. Кортеж строже
 * оригинала: `keys.map((key) => [key, value])` выводится как массив, а не как
 * пара, и десяток мест перестал бы проходить typecheck на замене, которая
 * задумана как дословная.
 *
 * @param {Iterable<readonly any[]>} entries
 * @returns {Record<string, any>}
 */
export function fromEntries(entries) {
  /** @type {Record<string, any>} */
  const result = {};
  for (const [key, value] of entries) result[String(key)] = value;
  return result;
}
