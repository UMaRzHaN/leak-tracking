/**
 * Поправки к распознанной речи, заведённые на площадке.
 *
 * Распознаватель ошибается предсказуемо и по-своему на каждом объекте:
 * «место рождения» вместо «месторождение», «кран шаровый» там, где в книге
 * «Кран Шаровой». Встроенный словарь такие пары знает только те, что успели
 * попасть в код, — а находят их в поле, и до сих пор каждая новая требовала
 * релиза.
 *
 * Замена идёт по целой фразе и до разбора: дальше по конвейеру текст уже
 * режется на поля, и подменять там пришлось бы в трёх местах сразу.
 */

/** Больше двухсот пар — это уже не поправки, а словарь, и архив от них пухнет. */
export const MAX_VOICE_CORRECTIONS = 200;

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Приводит список к хранимому виду.
 *
 * Пустые и односторонние пары выбрасываются: замена «ни на что» стирала бы
 * сказанное молча. Совпадающие по левой части схлопываются — побеждает
 * последняя, так поправка правится повторным вводом, а не поиском старой.
 *
 * @param {unknown} value
 * @returns {{from: string, to: string}[]}
 */
export function normalizeVoiceCorrections(value) {
  if (!Array.isArray(value)) return [];

  const byFrom = new Map();
  for (const item of value) {
    const from = String(item?.from ?? "")
      .trim()
      .replace(/\s+/gu, " ");
    const to = String(item?.to ?? "")
      .trim()
      .replace(/\s+/gu, " ");
    if (!from || !to || from.toLowerCase() === to.toLowerCase()) continue;
    byFrom.set(from.toLowerCase(), { from, to });
  }

  return [...byFrom.values()].slice(0, MAX_VOICE_CORRECTIONS);
}

/**
 * Применяет поправки к распознанному тексту.
 *
 * Одним проходом, а не правилом за правилом. Последовательные замены видят
 * результат предыдущих: пара «кран шаровый» → «Кран Шаровой» срабатывала, а
 * следом за ней «кран» → «Кран Шаровой» находила слово в её же результате, и
 * из компонента получался «Кран Шаровой Шаровой». Единый проход смотрит на
 * исходный текст и заменённого больше не касается.
 *
 * Длинные фразы стоят в шаблоне первыми: чередование в регулярном выражении
 * выбирает первое подходящее, и без этого от «кран шаровый» осталась бы
 * половина. Границы слова обязательны — иначе «кран» заменялся бы внутри
 * «кранового».
 *
 * @param {unknown} text
 * @param {{from: string, to: string}[]} [corrections]
 */
export function applyVoiceCorrections(text, corrections = []) {
  const source = String(text ?? "");
  if (!source.trim() || corrections.length === 0) return source;

  const ordered = [...corrections].sort(
    (left, right) => right.from.length - left.from.length,
  );
  const replacements = new Map(
    ordered.map(({ from, to }) => [from.toLowerCase(), to]),
  );

  const pattern = new RegExp(
    `(^|[^\\p{L}\\p{N}])(${ordered
      .map(({ from }) => escapeRegExp(from))
      .join("|")})(?=$|[^\\p{L}\\p{N}])`,
    "giu",
  );

  return source.replace(
    pattern,
    (match, prefix, phrase) =>
      `${prefix}${replacements.get(String(phrase).toLowerCase()) ?? phrase}`,
  );
}
