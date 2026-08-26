/**
 * `String.prototype.matchAll` без самого `matchAll`.
 *
 * Метод появился в Chrome 73. Замена на `exec` в цикле выглядит очевидной и
 * ровно поэтому опасна: `matchAll` работает по своей копии регулярного
 * выражения и `lastIndex` исходного не трогает, а `exec` — трогает. В
 * `parseVoiceText` регулярки лежат в модульной таблице и переиспользуются
 * между вызовами, так что общий `lastIndex` пережил бы вызов и следующий
 * разбор начался бы с середины строки. Поэтому здесь всегда своя копия.
 *
 * Флаг `g` добавляется, если его нет: без него цикл не двигался бы вовсе.
 * Совпадение нулевой длины сдвигает позицию руками — иначе цикл вечный; в
 * оригинале эта защита встроена.
 *
 * @param {string} text
 * @param {RegExp} regex
 * @returns {RegExpExecArray[]}
 */
export function matchAll(text, regex) {
  const flags = regex.flags.includes("g") ? regex.flags : `${regex.flags}g`;
  const scanner = new RegExp(regex.source, flags);
  /** @type {RegExpExecArray[]} */
  const matches = [];
  let match = scanner.exec(text);
  while (match) {
    matches.push(match);
    if (match[0] === "") scanner.lastIndex += 1;
    match = scanner.exec(text);
  }
  return matches;
}
