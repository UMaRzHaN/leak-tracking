import { getLeakMergeIdentity } from "@/services/sync/projectSyncState";

/**
 * Чем опознают утечку и запись обхода, когда сверяют фото.
 *
 * Сверка ищет, что в местной записи стоит на том же месте, что и в приезжей, —
 * и до самих снимков дело доходит только после того, как места сопоставлены.
 *
 * Утечку опознаёт её номер: он проставлен человеком и переживает выгрузку в
 * Excel и обратно, чего не делает внутренний идентификатор. Без номера
 * остаётся общее правило слияния.
 *
 * Запись обхода опознаёт дата вместе с результатом. Дата приводится к общему
 * виду, потому что в книге она бывает и текстом «10.03.2026», и числом, и
 * настоящей датой — три записи одного дня иначе оказались бы тремя разными.
 */

export function getLeakIdentity(leak) {
  const leakTag = String(leak?.leak_id ?? "").trim();
  if (leakTag) return `tag:${leakTag}`;
  return getLeakMergeIdentity(leak);
}

function normalizeRecordDateIdentity(value) {
  if (value == null || value === "") return "";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return String(value.getTime());
  }

  const text = String(value).trim();
  const dotted = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (dotted) {
    const year = dotted[3].length === 2 ? `20${dotted[3]}` : dotted[3];
    return `${year}-${Number(dotted[2])}-${Number(dotted[1])}`;
  }
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? String(parsed) : text;
}

export function getMonitoringIdentity(record, index) {
  if (record?.date) {
    return `date:${normalizeRecordDateIdentity(record.date)}|result:${String(record?.result ?? "")}`;
  }
  if (record?.id != null) return `id:${String(record.id)}`;
  return `index:${index}`;
}
