/**
 * Finds the best match for a voice-recognized string among a list of canonical options.
 * Options may contain "/" separators like "Компрессорная станция/КС" — both parts are checked.
 *
 * Returns the matched canonical string, or null when the phrase does not
 * clearly point to one option.
 */
// Длина общего начала, после которой два слова считаются одним и тем же в
// разных падежах: «запорной» и «запорная» расходятся на седьмой букве, и
// сравнение по началу строки их не сводило — сказанное после «тип компонента»
// почти всегда стоит в родительном падеже. Четыре буквы, а не пять: «стали»
// и «сталь» расходятся уже на пятой. Ложные основы вроде «работ» в «не
// работает» отсекает не длина, а требование большинства слов ниже.
const STEM_LENGTH = 4;
// Сравнение по основе — только для слов длиннее неё: иначе четырёхбуквенное
// слово целиком совпадало бы с началом любого другого.
const STEM_MIN_WORD = 5;
// Короче трёх букв начало слова ничего не значит: «не» — начало
// «Нержавеющей стали», «в» — «В работе», и подстановка выходила из частицы.
const MIN_PREFIX_LENGTH = 3;

// Предлоги и союзы не несут смысла значения и не должны мешать большинству:
// «кран на входе» — всё ещё про кран. Отрицание сюда не входит намеренно:
// «не работает» — противоположность «В работе», а не она же.
const STOP_WORDS = new Set([
  "в",
  "во",
  "на",
  "по",
  "из",
  "с",
  "со",
  "у",
  "к",
  "ко",
  "о",
  "об",
  "от",
  "до",
  "за",
  "и",
  "а",
  "для",
  "при",
  "под",
  "над",
]);

const NEGATIONS = new Set(["не", "нет", "без"]);

const hasDigit = (word) => /\d/u.test(word);

function tokenize(text) {
  return String(text)
    .toLowerCase()
    .replace(/ё/gu, "е")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word && !STOP_WORDS.has(word));
}

function sameWord(left, right) {
  if (left === right) return true;
  // Числа и марки с цифрами — «20», «40х», «09г2с» — только целиком:
  // «Сталь 40Х» и «Сталь 10» — не «Сталь 20».
  if (hasDigit(left) || hasDigit(right)) return false;
  const shorter = Math.min(left.length, right.length);
  if (shorter < MIN_PREFIX_LENGTH) return false;
  if (left.startsWith(right) || right.startsWith(left)) return true;
  if (shorter < STEM_MIN_WORD) return false;
  return left.slice(0, STEM_LENGTH) === right.slice(0, STEM_LENGTH);
}

/**
 * Насколько фраза похожа на вариант. Ноль — не похожа вовсе: совпало меньше
 * половины значимых слов фразы или числа в них разные.
 */
function scoreOption(inputWords, option) {
  const optionWords = tokenize(option);
  if (!optionWords.length) return null;

  const optionNumbers = optionWords.filter(hasDigit);
  const numbersConflict =
    optionNumbers.length > 0 &&
    inputWords.some((word) => hasDigit(word) && !optionNumbers.includes(word));
  if (numbersConflict) return null;

  // «Не работает» делит с «В работе» корень, но значит обратное.
  const negationLost = inputWords.some(
    (word) => NEGATIONS.has(word) && !optionWords.includes(word),
  );
  if (negationLost) return null;

  const hits = inputWords.filter((word) =>
    optionWords.some((candidate) => sameWord(candidate, word)),
  ).length;
  const covered = optionWords.filter((candidate) =>
    inputWords.some((word) => sameWord(candidate, word)),
  ).length;
  // Совпасть должно большинство значимых слов фразы: «Газовый конденсат»
  // делит с «Сырым газом» одно слово из двух — это другая среда, а не она же.
  // Исключение — вариант, сказанный целиком внутри более длинной фразы:
  // словарь утечки разворачивает «задвижку» в «Задвижку механическую
  // стальную», а в списке реестра она просто «Задвижка».
  if (hits * 2 <= inputWords.length && covered < optionWords.length)
    return null;

  return { hits, coverage: covered / optionWords.length };
}

function canonical(option) {
  const parts = option.split("/");
  const afterSlash = parts[parts.length - 1].trim();
  const isAbbrev = parts.length > 1 && !/[а-яёa-z]/.test(afterSlash);
  return isAbbrev ? parts.slice(0, -1).join("/").trim() : option;
}

export function fuzzyMatchOption(input, options) {
  if (!input || !options?.length) return null;
  const inputWords = tokenize(input);
  if (!inputWords.length) return null;

  let best = /** @type {string|null} */ (null);
  let bestScore = /** @type {{hits:number, coverage:number}|null} */ (null);
  let tied = false;

  for (const opt of options) {
    const score = scoreOption(inputWords, opt);
    if (!score) continue;
    const result = canonical(opt);
    if (
      !bestScore ||
      score.hits > bestScore.hits ||
      (score.hits === bestScore.hits && score.coverage > bestScore.coverage)
    ) {
      best = result;
      bestScore = score;
      tied = false;
    } else if (
      score.hits === bestScore.hits &&
      score.coverage === bestScore.coverage &&
      result !== best
    ) {
      tied = true;
    }
  }

  // Ничья — фраза подходит к двум вариантам одинаково: «сталь» — это и
  // «Сталь 20», и «Сталь 09Г2С». Угадывать первый в списке нельзя: в поле
  // встанет значение, которого человек не говорил.
  return tied ? null : best;
}

const VOICE_FILLER_WORDS =
  "(?:это|равно|составляет|будет|такой|такая|такое|номер)\\s+";

export function buildVoiceFieldMarkers(config) {
  return Object.values(config)
    .map(({ markers }) => markers)
    .join("|");
}

export function createVoiceValueRegex(marker, fieldMarkers) {
  return new RegExp(
    `(?:${marker})\\s+(?:${VOICE_FILLER_WORDS})?(?<value>.+?)(?=\\s+(?:${fieldMarkers})|$)`,
    "gu",
  );
}

export function createVoiceNumberRegex(marker) {
  return new RegExp(
    `(?:${marker})\\s*(?:${VOICE_FILLER_WORDS})?(?<value>-?[\\d.,\\s]+)`,
    "gu",
  );
}

export function createVoiceIntegerRegex(marker) {
  return new RegExp(`(?:${marker})\\s*(?<value>\\d+)`, "gu");
}
