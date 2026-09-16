import { matchHumanDate } from "@/utils/humanDate";

/**
 * Чем опознают запись обхода, когда сверяют фото.
 *
 * Сверка ищет, что в местной записи стоит на том же месте, что и в приезжей, —
 * и до самих снимков дело доходит только после того, как места сопоставлены.
 * Утечки сопоставляет общее правило объединения — `matchIncomingLeaks`.
 *
 * Запись обхода опознаёт дата вместе с результатом. Дата приводится к общему
 * виду, потому что в книге она бывает и текстом «10.03.2026», и числом, и
 * настоящей датой — три записи одного дня иначе оказались бы тремя разными.
 */

/**
 * Дата записи, приведённая к тому, чем её сравнивают.
 *
 * Обещание в заголовке файла — «три записи одного дня иначе оказались бы тремя
 * разными» — выполняется наполовину. Человеческая дата сворачивается до дня, а
 * число, `Date` и ISO остаются мгновением: «10.03.2026» даёт `2026-3-10`, а
 * «2026-03-10T08:00» — миллисекунды. Один и тот же день в двух видах даёт два
 * разных опознавателя, и две записи одного дня в разное время — тоже.
 *
 * Вреда от этого показать не удалось: на живом пути обе стороны сверки несут
 * ISO — чтение книги приводит дату к нему, а выгрузка пишет в ячейку настоящую
 * дату, и обратно она возвращается тем же мгновением. Поэтому и не тронуто:
 * менять правило опознания без сценария, который на нём ломается, значит
 * менять поведение сверки фотографий вслепую.
 *
 * Оставлено здесь, чтобы следующий читатель не принял расхождение за замысел.
 * Если однажды снимок при импорте перезапишется вместо того, чтобы остаться на
 * месте, — смотреть сюда.
 */
function normalizeRecordDateIdentity(value) {
  if (value == null || value === "") return "";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return String(value.getTime());
  }

  const text = String(value).trim();
  const human = matchHumanDate(text);
  if (human) {
    return `${human.year}-${human.month}-${human.day}`;
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
