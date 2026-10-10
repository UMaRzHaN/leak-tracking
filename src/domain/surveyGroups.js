import { normalizeLocationValue } from "@/utils/locationFilter";
import { isLocationScoped } from "@/utils/locationTree";

/**
 * «Обследовано без утечек» (4a–4c): сколько объектов осмотрено в каждой
 * группе и сколько их всего. Без этого охват считается только по объектам с
 * утечками — осмотренное без находок следа в данных не оставляет.
 *
 * Группа — значение поля разреза (категория объекта, компонент или
 * локация). «Всего» оператор ставит оценкой, поэтому везде оно с «~».
 */
export const SLICE = Object.freeze({
  CATEGORY: "category",
  COMPONENT: "component",
  LOCATION: "location",
});

/** Поле записи, по которому режет разрез. Локация — нижний уровень места. */
export function sliceField(slice, levelKeys = []) {
  if (slice === SLICE.COMPONENT) return "component";
  if (slice === SLICE.LOCATION)
    return levelKeys[levelKeys.length - 1] ?? "location";
  return "category";
}

const norm = (value) => normalizeLocationValue(value).toLocaleLowerCase();

/** Что встречается в записях по полю разреза — подсказки для новых групп. */
export function sliceValues(leaks, field) {
  const seen = new Map();
  for (const leak of Array.isArray(leaks) ? leaks : []) {
    const value = normalizeLocationValue(leak?.[field]);
    if (value && !seen.has(norm(value))) seen.set(norm(value), value);
  }
  return [...seen.values()].sort((left, right) => left.localeCompare(right));
}

/**
 * Место группы — путь в дереве мест, как у выбора в шапке: подразделение,
 * месторождение, локация. Пустой путь — группа на весь проект.
 */
function normalizePlace(value) {
  if (!Array.isArray(value)) return [];
  const place = value.map((part) => normalizeLocationValue(part));
  // Путь не может прерываться: «место» без родителя не выбирается в шапке.
  const gap = place.indexOf("");
  return gap === -1 ? place : place.slice(0, gap);
}

/** Место для подписи: «ПУ №1 › Карачаганакское». */
export function placeLabel(place) {
  return Array.isArray(place) ? place.join(" › ") : "";
}

/** Одно ли это место — для групп с одинаковым именем в разных местах. */
export function samePlace(left = [], right = []) {
  return (
    left.length === right.length &&
    left.every((part, depth) => norm(part) === norm(right[depth]))
  );
}

/** Лежит ли место `place` внутри выбранного пути `path` (или совпадает). */
export function placeWithin(place, path) {
  if (!Array.isArray(place) || !Array.isArray(path)) return false;
  if (place.length < path.length) return false;
  return path.every((part, depth) => norm(part) === norm(place[depth]));
}

/** Записи, лежащие в месте `place`; пустое место — все записи. */
export function leaksInPlace(leaks, place, levelKeys = []) {
  const list = Array.isArray(leaks) ? leaks : [];
  return place?.length
    ? list.filter((leak) => leakInPlace(leak, place, levelKeys))
    : list;
}

function leakInPlace(leak, place, levelKeys) {
  return place.every(
    (part, depth) =>
      levelKeys[depth] !== undefined &&
      norm(leak?.[levelKeys[depth]]) === norm(part),
  );
}

function toCount(value) {
  const number = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0;
}

export function emptySurvey(slice = SLICE.CATEGORY) {
  return { slice, groups: [], updatedAt: null };
}

export function normalizeSurvey(value) {
  if (!value || typeof value !== "object") return emptySurvey();
  const slice = Object.values(SLICE).includes(value.slice)
    ? value.slice
    : SLICE.CATEGORY;
  const groups = (Array.isArray(value.groups) ? value.groups : [])
    .filter((group) => group && String(group.name ?? "").trim())
    .map((group) => {
      const place = normalizePlace(group.place);
      return {
        id: String(group.id ?? group.name),
        name: String(group.name).trim(),
        checked: toCount(group.checked),
        estimate: toCount(group.estimate),
        ...(place.length ? { place } : {}),
      };
    });
  return { slice, groups, updatedAt: value.updatedAt ?? null };
}

/**
 * Группы обследования для выбранного в шапке места.
 *
 * Без выбора — все группы. При выбранном месте — только группы с местом
 * внутри него: охват по месту. Если ни у одной группы место не указано,
 * обследование целиком «по всему проекту», и тогда так и считается, с
 * пометкой `projectWide`. Несколько папок разом (`path === null`) в одно
 * место не сводятся — тоже «по всему проекту».
 *
 * @param {{ slice: string, groups: any[], updatedAt?: any }} survey
 * @param {string[]|null|undefined} path
 */
export function surveyForPlace(survey, path) {
  if (!isLocationScoped(path)) return { survey, projectWide: false };
  const placed = survey.groups.some((group) => group.place?.length);
  // Пустое обследование ни к какому месту не относится — и помечать нечего.
  if (!Array.isArray(path) || !placed)
    return { survey, projectWide: survey.groups.length > 0 };
  return {
    survey: {
      ...survey,
      groups: survey.groups.filter((group) => placeWithin(group.place, path)),
    },
    projectWide: false,
  };
}

/**
 * Разбивка по группам (4b): проверено, оценка, утечки в группе и частота на
 * осмотренный объект. Утечки считаются по тому же полю разреза, а у группы с
 * местом — только утечки этого места: «Компрессоры» двух месторождений —
 * две разные группы.
 */
export function summarizeSurvey(survey, leaks, field, levelKeys = []) {
  const list = Array.isArray(leaks) ? leaks : [];
  const countIn = (rows) => {
    const counts = new Map();
    for (const leak of rows) {
      const key = norm(leak?.[field]);
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  };
  const projectCounts = countIn(list);
  const groups = survey.groups.map((group) => {
    const counts = group.place?.length
      ? countIn(leaksInPlace(list, group.place, levelKeys))
      : projectCounts;
    const leakCount = counts.get(norm(group.name)) ?? 0;
    const total = Math.max(group.estimate, group.checked);
    return {
      ...group,
      total,
      leaks: leakCount,
      rate: group.checked > 0 ? leakCount / group.checked : null,
      percent: total > 0 ? Math.round((group.checked / total) * 100) : 0,
    };
  });
  const checked = groups.reduce((sum, group) => sum + group.checked, 0);
  const total = groups.reduce((sum, group) => sum + group.total, 0);
  return {
    groups,
    checked,
    total,
    percent: total > 0 ? Math.round((checked / total) * 100) : 0,
  };
}

/** Строка охвата на главной: по введённому, если ввод есть. */
export function surveyCoverage(survey) {
  if (!survey?.groups?.length) return null;
  const checked = survey.groups.reduce((sum, group) => sum + group.checked, 0);
  const total = survey.groups.reduce(
    (sum, group) => sum + Math.max(group.estimate, group.checked),
    0,
  );
  return {
    surveyed: checked,
    total,
    percent: total > 0 ? Math.round((checked / total) * 100) : 0,
    estimated: true,
  };
}

/**
 * Группы, введённые в «Обследовано» вручную, — в варианты автокомплита того
 * поля, по которому режет разрез: заведённую там категорию не приходится
 * набирать в карточке утечки заново. Свои варианты поля остаются первыми.
 */
export function withSurveyOptions(steps, survey, levelKeys = []) {
  const groups = survey?.groups ?? [];
  if (!groups.length) return steps;
  const field = sliceField(survey.slice, levelKeys);
  return steps.map((step) => ({
    ...step,
    fields: step.fields.map((item) => {
      if (item.type !== "autocomplete" || item.key !== field) return item;
      const options = item.options ?? [];
      const known = new Set(
        options.map((option) =>
          norm(typeof option === "string" ? option : option?.value),
        ),
      );
      const extra = [];
      for (const { name } of groups) {
        if (known.has(norm(name))) continue;
        known.add(norm(name));
        extra.push(name);
      }
      return extra.length ? { ...item, options: [...options, ...extra] } : item;
    }),
  }));
}
