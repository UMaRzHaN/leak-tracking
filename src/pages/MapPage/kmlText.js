/**
 * Текст внутри KML: экранирование и подписи.
 *
 * KML читают чужие программы, и незакрытая скобка или голый амперсанд роняют
 * им разбор целиком. Поэтому всё, что попадает в файл из данных, проходит
 * здесь, а не собирается строкой на месте.
 */
export function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function cdataText(value) {
  return String(value ?? "").replace(/]]>/g, "]]&gt;");
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function safeDescriptionText(value) {
  return cdataText(escapeHtml(value));
}

// The exported file speaks the language of the interface that asked for it,
// so `t` comes in from the caller rather than the module reaching for a
// global i18n instance.
/**
 * Строка про точность для выгрузки — только когда радиус записан.
 *
 * Пустой строкой «Точность: не указано» описание не засоряется: записи,
 * заведённые до появления поля, — обычный случай, а не пробел в данных, и
 * пометка о нём в каждой второй карточке ГИС ничего не сообщает.
 */
export function accuracyLine(record, t) {
  const value = Number(record?.coords_accuracy);
  if (!Number.isFinite(value) || value <= 0) return "";
  const label = safeDescriptionText(t("map.popup.accuracy"));
  const metres = safeDescriptionText(
    t("map.popup.accuracyValue", { count: Math.round(value) }),
  );
  return `<br/><b>${label}:</b> ${metres}`;
}
