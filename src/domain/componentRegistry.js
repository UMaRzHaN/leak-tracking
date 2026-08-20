import { createRecordId } from "@/utils/createRecordId";

/**
 * Rules for the component registry.
 *
 * The registry is a discovery process: nobody knows how many valves, gauges
 * and manifolds are on the field until the walk is done. The card is therefore
 * expected to be incomplete, and the identity number is expected to be unique
 * *by agreement between the people walking*, never by construction — the app
 * does not hand out ranges and cannot see another device's numbers.
 *
 * That distinction drives everything here: uniqueness is checked and reported,
 * but never enforced. A duplicate must survive as two records so a human can
 * resolve it later; silently merging or overwriting would lose a card that
 * somebody walked out to a wellhead to write.
 */

/** Digits only — the agreed format for the individual component number. */
const UID_PATTERN = /^\d+$/;

export function isValidComponentUid(value) {
  return UID_PATTERN.test(String(value ?? "").trim());
}

/**
 * Parses a uid for comparison and sorting. Returns null for anything that is
 * not a plain run of digits, so a stray value can never win a max() and push
 * the suggested number into nonsense.
 */
export function parseComponentUid(value) {
  const raw = String(value ?? "").trim();
  if (!UID_PATTERN.test(raw)) return null;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

/**
 * Records already carrying this uid, excluding the one being edited.
 *
 * Used to warn, never to block: the operator is standing in front of the
 * equipment and must be able to save regardless of what the app thinks of the
 * number.
 */
export function findComponentUidConflicts(components = [], uid, selfId = null) {
  const target = String(uid ?? "").trim();
  if (!target) return [];
  return components.filter(
    (component) =>
      component?.id !== selfId &&
      String(component?.component_uid ?? "").trim() === target,
  );
}

/** Numeric ordering, so 9 sorts before 10 instead of after 1. */
export function compareComponentsByUid(a, b) {
  const left = parseComponentUid(a?.component_uid);
  const right = parseComponentUid(b?.component_uid);
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left - right;
}

function normalizeNumeric(value) {
  if (value == null || value === "") return null;
  const parsed =
    typeof value === "number" ? value : Number(String(value).trim());
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Приводит карточку к нынешней форме полей.
 *
 * «Компонент» и «Наименование компонента» описывали одно и то же и разъезжались
 * бы порознь, поэтому слились в одно поле под ключом утечки (`component`).
 * Карточки, заведённые до слияния, несут `component_name` и без этого
 * показываются как «Без наименования» — данные на месте, но не там, где их
 * ищут.
 *
 * Применяется при чтении, а не только при записи: иначе старая карточка
 * оставалась бы безымянной до тех пор, пока её кто-нибудь не откроет и не
 * сохранит, — то есть ровно до того момента, когда это уже поздно заметить.
 *
 * `component_name_en` не трогается: это действующее поле английской колонки, а
 * не наследство.
 */
export function migrateComponentShape(component) {
  if (!component || typeof component !== "object") return component;
  if (!("component_name" in component)) return component;

  const { component_name: legacyName, ...rest } = component;
  const current = String(rest.component ?? "").trim();
  // Заполненное нынешнее поле весомее: старый ключ мог остаться от импорта
  // архива, где сосуществовали оба.
  return current ? rest : { ...rest, component: legacyName };
}

/**
 * Brings a card into storable shape.
 *
 * Missing values stay missing — an unreadable plate is the normal case, not an
 * error, and a card is saved with two thirds of its fields empty all the time.
 * Only identity is manufactured here: `id` is the UUID the rest of the app
 * references, kept separate from `component_uid` precisely because tags get
 * re-stamped and mistyped numbers get corrected.
 *
 * @param {any} component
 * @param {{numericKeys?: string[], now?: number}} [options]
 */
export function normalizeComponent(component, { numericKeys = [], now } = {}) {
  const timestamp = typeof now === "number" ? now : Date.now();
  const migrated = migrateComponentShape(component);
  const normalized = { ...migrated };

  normalized.id = migrated?.id ?? createRecordId();
  normalized.component_uid = String(migrated?.component_uid ?? "").trim();
  normalized.date = migrated?.date ?? new Date(timestamp).toISOString();
  normalized.updatedAt = timestamp;

  // The inspection date is when somebody stood in front of the equipment and
  // filled the card in — the app already knows that, so it is never typed.
  // Set once and left alone: correcting a typo months later must not move the
  // date the equipment was actually looked at.
  normalized.inspected_at = migrated?.inspected_at ?? normalized.date;

  for (const key of numericKeys) {
    if (key === "component_uid") continue;
    if (key in normalized) normalized[key] = normalizeNumeric(normalized[key]);
  }

  for (const key of ["lat", "lng"]) {
    if (key in normalized) normalized[key] = normalizeNumeric(normalized[key]);
  }

  return normalized;
}

/**
 * Which required fields a card is still missing.
 * Everything outside this list is allowed to be blank indefinitely.
 */
export function missingRequiredFields(component, required = []) {
  return required.filter((key) => {
    const value = component?.[key];
    return value == null || String(value).trim() === "";
  });
}
