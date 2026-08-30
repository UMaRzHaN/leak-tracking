import {
  nextSyncTimestamp,
  observeSyncTimestamp,
} from "@/services/sync/syncClock";

/**
 * Удалённая технологическая схема.
 *
 * То же, что у карточек реестра, и по той же причине. Список схем ездит в
 * архиве вместе с проектом, и до сих пор приём умел только добавлять: схема,
 * удалённая на одном телефоне, возвращалась с другого при первом же обмене —
 * молча, потому что для второго телефона она просто есть. Человек удалял её
 * снова, и она возвращалась снова.
 *
 * Поэтому удаление — не исчезновение записи из списка, а запись о том, что
 * схему удалили. Надгробие остаётся на месте записи и ездит вместе с ней.
 *
 * Опознаются схемы не по `id`: он выдаётся на устройстве, и у одного и того же
 * чертежа на двух телефонах он разный. Опознаёт пара «имя и размер» — то же,
 * чем приём отличал уже известные схемы от новых.
 *
 * Надгробие несёт минимум: имя, размер и момент удаления. Ни типа, ни места:
 * они описывают чертёж, которого больше нет.
 */

/** Сколько надгробий список несёт с собой, прежде чем начнёт забывать старые. */
export const MAX_SCHEMA_TOMBSTONES = 500;

export function isSchemaTombstone(record) {
  return record?.deleted === true;
}

export function isLiveSchema(record) {
  return Boolean(record) && !isSchemaTombstone(record);
}

/** Только чертежи — то, что показывают и выгружают. */
export function liveSchemas(records = []) {
  return Array.isArray(records) ? records.filter(isLiveSchema) : [];
}

export function schemaTombstones(records = []) {
  return Array.isArray(records) ? records.filter(isSchemaTombstone) : [];
}

/**
 * Чем схема опознаётся между устройствами.
 *
 * @param {Record<string, any>} schema
 * @returns {string|null}
 */
export function schemaIdentity(schema) {
  const name = String(schema?.name ?? "").trim();
  if (!name) return null;
  return `${name}:${Number(schema?.size ?? 0)}`;
}

/**
 * Читает метку и заодно двигает по ней логические часы устройства: сведение
 * спрашивает время у обеих сторон, и здесь телефон узнаёт чужие метки.
 */
function toTime(value) {
  const time = typeof value === "string" ? Date.parse(value) : Number(value);
  if (!Number.isFinite(time) || time <= 0) return 0;
  return observeSyncTimestamp(time);
}

/**
 * Когда запись в последний раз что-то о себе сообщила: чертёж — когда его
 * добавили, надгробие — когда схему удалили. По этому числу сведение и решает,
 * что из двух свежее.
 */
export function schemaChangedAt(record) {
  return isSchemaTombstone(record)
    ? toTime(record.deletedAt)
    : toTime(record?.addedAt);
}

/** Надгробие на месте чертежа. */
export function tombstoneForSchema(schema, deletedAt) {
  const at = toTime(deletedAt) || nextSyncTimestamp();
  return {
    id: schema?.id,
    // Имя и размер остаются: по ним схема опознаётся на другом устройстве, и
    // по имени человек понимает, какой чертёж он удалил.
    name: String(schema?.name ?? "").trim(),
    size: Number(schema?.size ?? 0),
    deleted: true,
    deletedAt: at,
  };
}

/**
 * Добавляет чертёж в список, убирая надгробие того же чертежа.
 *
 * Надгробие уходит потому, что чертёж добавили обратно и спорить больше не о
 * чем. Остальные надгробия остаются: список пишется целиком, и потерять их
 * здесь значило бы снова отдать удаление на откуп соседнему телефону.
 */
export function withSchemaAdded(records, schema) {
  const identity = schemaIdentity(schema);
  return [
    ...(Array.isArray(records) ? records : []).filter(
      (record) => isLiveSchema(record) || schemaIdentity(record) !== identity,
    ),
    schema,
  ];
}

/** Заменяет чертёж надгробием, оставляя список на месте. */
export function withSchemaRemoved(records, id, deletedAt) {
  return (Array.isArray(records) ? records : []).map((record) =>
    record?.id === id && isLiveSchema(record)
      ? tombstoneForSchema(record, deletedAt)
      : record,
  );
}

/**
 * Сводит два списка схем.
 *
 * Правило то же, что у реестра: побеждает то, что случилось позже, а на
 * равенстве — удаление. Человек, чьё решение мы не можем упорядочить, скорее
 * переживёт лишний раз добавленный чертёж, чем тот, что он удалил и который
 * вернулся.
 *
 * @param {Record<string, any>[]} local
 * @param {Record<string, any>[]} incoming
 * @returns {Record<string, any>[]}
 */
export function mergeSchemaLists(local = [], incoming = []) {
  const byIdentity = new Map();

  for (const record of [...local, ...incoming]) {
    const identity = schemaIdentity(record);
    if (!identity) continue;

    const current = byIdentity.get(identity);
    if (!current) {
      byIdentity.set(identity, record);
      continue;
    }
    const currentAt = schemaChangedAt(current);
    const recordAt = schemaChangedAt(record);
    if (recordAt > currentAt) byIdentity.set(identity, record);
    else if (recordAt === currentAt && isSchemaTombstone(record)) {
      byIdentity.set(identity, record);
    }
  }

  return compactSchemaTombstones([...byIdentity.values()]);
}

/**
 * Оставляет свежие надгробия, когда их накопилось слишком много.
 *
 * Список схем — не обход: чертежей у проекта единицы, и предел здесь стоит не
 * ради размера, а чтобы список не рос без границы у проекта, который годами
 * перебирают.
 */
export function compactSchemaTombstones(
  records = [],
  limit = MAX_SCHEMA_TOMBSTONES,
) {
  const graves = schemaTombstones(records);
  if (graves.length <= limit) return records;

  const kept = new Set(
    [...graves]
      .sort((left, right) => schemaChangedAt(right) - schemaChangedAt(left))
      .slice(0, limit)
      .map(schemaIdentity),
  );
  return records.filter(
    (record) => isLiveSchema(record) || kept.has(schemaIdentity(record)),
  );
}
