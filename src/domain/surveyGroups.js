import { normalizeLocationValue } from "@/utils/locationFilter";

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
    .map((group) => ({
      id: String(group.id ?? group.name),
      name: String(group.name).trim(),
      checked: toCount(group.checked),
      estimate: toCount(group.estimate),
    }));
  return { slice, groups, updatedAt: value.updatedAt ?? null };
}

/**
 * Разбивка по группам (4b): проверено, оценка, утечки в группе и частота на
 * осмотренный объект. Утечки считаются по тому же полю разреза.
 */
export function summarizeSurvey(survey, leaks, field) {
  const counts = new Map();
  for (const leak of Array.isArray(leaks) ? leaks : []) {
    const key = norm(leak?.[field]);
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const groups = survey.groups.map((group) => {
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
