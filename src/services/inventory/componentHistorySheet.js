import {
  applyColumnFormats,
  parseTimestamp,
  toExcelCellValue,
} from "@/services/excelExport/cellValues";
import {
  addStructuredTable,
  getColumnWidth,
  styleBodyRows,
  styleHeaderRow,
} from "@/services/excelExport/sheetLayout";
import { COMPONENT_HISTORY_ACTIONS } from "@/domain/componentHistory";

/**
 * Кто и когда трогал карточку — листом, как у утечек.
 *
 * Реестр — это утверждения о железе, и у каждого есть автор: заведена такого
 * числа таким-то, номер на схеме исправлен тогда-то, осмотрена тогда-то и
 * найдена в таком состоянии. В приложении эта история есть у каждой карточки,
 * а в выгрузке её не было — тот, кто получал архив, видел итог и не мог
 * спросить, откуда он взялся.
 *
 * Отличие от листа утечек одно, и оно намеренное: изменения записаны словами —
 * «Инвентаризационный номер на схеме: ЗД1 → ЗД99», — а не выгружены как JSON.
 * Лист читают глазами, а машине хватает `components.json`, который лежит
 * рядом и несёт историю целиком.
 */

const HISTORY_TABLE_THEME = "TableStyleMedium9";

const KEYS = [
  "index",
  "component_uid",
  "date",
  "time",
  "action",
  "user",
  "to",
  "changes",
];

function actionLabel(action, texts) {
  return (
    {
      [COMPONENT_HISTORY_ACTIONS.CREATED]: texts.actions?.created,
      [COMPONENT_HISTORY_ACTIONS.EDITED]: texts.actions?.edited,
      [COMPONENT_HISTORY_ACTIONS.INSPECTED]: texts.actions?.inspected,
    }[action] ?? action
  );
}

function describeChanges(changes, labelOf, texts) {
  if (!Array.isArray(changes) || changes.length === 0) return "";
  const empty = texts.emptyValue ?? "—";

  return changes
    .map((change) => {
      const from = String(change?.from ?? "").trim() || empty;
      const to = String(change?.to ?? "").trim() || empty;
      return `${labelOf(change?.key)}: ${from} → ${to}`;
    })
    .join("; ");
}

/**
 * @param {object[]} components в том же порядке, что и лист реестра
 * @param {{key: string, label: string}[]} fields объявление реестра — для подписей
 * @param {object} texts
 */
export function buildComponentHistoryRows(components, fields, texts) {
  const labelOf = (key) =>
    fields.find((field) => field.key === key)?.label ?? key;

  return (components ?? []).flatMap((component, index) =>
    (Array.isArray(component?.history) ? component.history : []).map(
      (entry) => ({
        index: index + 1,
        component_uid: component.component_uid ?? "",
        date: parseTimestamp(entry?.date) ?? "",
        time: parseTimestamp(entry?.date) ?? "",
        action: actionLabel(entry?.action, texts),
        // Подпись обязательна при записи, но архив может прийти и из сборки,
        // которая её ещё не требовала.
        user: entry?.user ?? texts.unknownUser ?? "",
        to: entry?.to ?? "",
        changes: describeChanges(entry?.changes, labelOf, texts),
      }),
    ),
  );
}

/**
 * @param {any} workbook
 * @param {{components: object[], fields?: object[], texts?: object}} spec
 */
export async function buildComponentHistorySheet(workbook, spec) {
  const { components, fields = [], texts = {} } = spec ?? {};
  const rows = buildComponentHistoryRows(components, fields, texts);
  // Пустой вкладки нет: обход, в котором ещё ничего не правили и не осматривали,
  // историей не беден — её просто пока нет.
  if (rows.length === 0) return;

  const sheet = workbook.addWorksheet(texts.sheet ?? "История");
  const headers = KEYS.map((key) => texts.headers?.[key] ?? key);

  addStructuredTable(sheet, {
    name: "ComponentHistory",
    headers,
    rows: rows.map((row) => KEYS.map((key) => toExcelCellValue(key, row[key]))),
    theme: HISTORY_TABLE_THEME,
  });
  styleHeaderRow(sheet, "FF8064A2");
  await styleBodyRows(sheet, rows.length);
  applyColumnFormats(sheet, KEYS);

  KEYS.forEach((key, index) => {
    sheet.getColumn(index + 1).width = getColumnWidth(
      headers[index],
      key,
      rows,
    );
  });
}
