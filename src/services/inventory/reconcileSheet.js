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
import {
  EXCEL_MONITORING_EXPORT_MODE,
  keepLatestPerRound,
} from "@/utils/excelExportMode";

/**
 * «Сверка» — обходы инвентаризации листом: строка на каждый осмотр
 * компонента, с номером обхода, в котором его осмотрели.
 *
 * Отдельно от «Истории», как у утечек обход отделён от журнала: история —
 * кто и что менял в карточке, сверка — что нашли на площадке и когда. В
 * режиме «последняя в обходе» на компонент в каждом обходе остаётся один
 * осмотр; осмотры без номера (до того, как его стали писать) — все.
 */

const RECONCILE_TABLE_THEME = "TableStyleMedium7";

const KEYS = [
  "round",
  "date",
  "time",
  "component_uid",
  "scheme_tag",
  "component",
  "object",
  "to",
  "user",
];

/**
 * @param {Record<string, any>[]} components
 * @param {Record<string, any>} texts
 * @param {string} [mode] режим листа: все осмотры или последний в обходе
 */
export function buildReconcileRows(components, texts, mode) {
  const rows = (components ?? []).flatMap((component, index) =>
    (Array.isArray(component?.history) ? component.history : [])
      .filter((entry) => entry?.action === COMPONENT_HISTORY_ACTIONS.INSPECTED)
      .map((entry) => ({
        index,
        dateRaw: entry.date,
        round: Number.isFinite(entry.roundNumber) ? entry.roundNumber : "",
        roundNumber: entry.roundNumber,
        date: parseTimestamp(entry.date) ?? "",
        time: parseTimestamp(entry.date) ?? "",
        component_uid: component.component_uid ?? "",
        scheme_tag: component.scheme_tag ?? "",
        component: component.component ?? "",
        object: component.object ?? "",
        to: entry.to ?? "",
        user: entry.user ?? texts.unknownUser ?? "",
      })),
  );
  const kept =
    mode === EXCEL_MONITORING_EXPORT_MODE.LATEST_PER_ROUND
      ? keepLatestPerRound(rows, {
          keyOf: (row) => row.index,
          roundOf: (row) => row.roundNumber,
          timeOf: (row) => Date.parse(String(row.dateRaw ?? "")),
        })
      : rows;
  // По времени, как журнал: лист читают сверху вниз, обход за обходом.
  return [...kept].sort(
    (left, right) =>
      Date.parse(String(left.dateRaw ?? "")) -
      Date.parse(String(right.dateRaw ?? "")),
  );
}

/**
 * @param {any} workbook
 * @param {{components: Record<string, any>[], texts?: Record<string, any>, mode?: string}} spec
 */
export async function buildReconcileSheet(workbook, spec) {
  const { components, texts = {}, mode } = spec ?? {};
  const rows = buildReconcileRows(components, texts, mode);
  // Пустой вкладки нет: компоненты ещё ни разу не осматривали.
  if (rows.length === 0) return;

  const sheet = workbook.addWorksheet(texts.sheet ?? "Сверка");
  const headers = KEYS.map((key) => texts.headers?.[key] ?? key);

  addStructuredTable(sheet, {
    name: "ComponentReconcile",
    headers,
    rows: rows.map((row) => KEYS.map((key) => toExcelCellValue(key, row[key]))),
    theme: RECONCILE_TABLE_THEME,
  });
  styleHeaderRow(sheet, "FF4BACC6");
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
