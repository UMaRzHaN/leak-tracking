const getExcelJS = () => import("exceljs");
const getJSZip = () => import("jszip");

import { PROJECTS } from "@/configs/projects";
import { getPhotoSrc } from "@/hooks/photoService";
import { priorityFromSpeed } from "@/utils/priority";
import { inferMonitoringRound } from "@/utils/monitoringRound";
import { getLeakSyncIdentity } from "@/services/projectSyncState";
import { validateBackup } from "@/repositories/backupSchema";
import {
  assertArchiveLimits,
  assertImportFileSize,
} from "@/utils/importLimits";

const TECHNICAL_KEYS = [
  "index",
  "id",
  "created_at",
  "createdAt",
  "updatedAt",
  "date",
  "time",
  "status",
  "leak_id",
  "video_id",
  "detectedBy",
  "subdivision",
  "deposit",
  "field",
  "station",
  "district",
  "locality",
  "address",
  "location",
  "object",
  "category",
  "component",
  "pressure",
  "temperature",
  "temperature_K",
  "equipmentType",
  "serial_number",
  "uncertainty",
  "leak_speed",
  "leak_speed_kg_m",
  "leak_speed_kg_h",
  "flareShare",
  "utilShare",
  "Operating_mode",
  "weightedGWP",
  "Total_Annual_Methane_Loss_m3_y",
  "Total_Annual_Methane_Loss_kg_y",
  "Total_Annual_Methane_Loss_t_y",
  "Emissions_t_CO2eq_year",
  "Emissions_kg_CO2_eq_year",
  "GWP",
  "GWP_Minus",
  "gasType",
  "actuator_type",
  "connection_type",
  "installation_type",
  "lat",
  "lng",
  "leak_description",
  "leak_cause",
  "technological_solution",
  "repair_recommendation",
  "materials_equipment",
  "note",
  "photo",
  "photo_repair",
  "photo_after",
  "repairAt",
  "resolvedAt",
];

const HEADER_ALIASES = {
  index: ["№", "номер", "n", "no"],
  date: ["дата", "дата обнаружения", "date", "detected date"],
  time: ["время", "время обнаружения", "time", "detected time"],
  leak_id: [
    "id утечки",
    "ид утечки",
    "номер утечки",
    "бирка",
    "тег",
    "tag",
    "leak id",
    "leak_id",
  ],
  video_id: ["id видео", "video id", "video_id"],
  status: ["статус", "status", "состояние"],
  detectedBy: ["кто зафиксировал", "проверил", "detected by", "inspector"],
  subdivision: ["подразделение", "цех", "subdivision"],
  deposit: ["месторождение", "deposit"],
  field: ["участок", "field", "умг"],
  station: ["станция", "station", "кс"],
  district: ["район", "district"],
  locality: ["населенный пункт", "населённый пункт", "locality"],
  address: ["адрес", "address"],
  location: ["локация", "место", "location"],
  object: ["объект", "object"],
  category: ["категория", "category"],
  component: ["компонент", "component"],
  pressure: ["давление", "pressure"],
  temperature: ["температура", "temperature"],
  temperature_K: ["температура k", "temperature k", "temperature_k"],
  equipmentType: [
    "оборудование",
    "тип оборудования",
    "equipment",
    "equipment type",
  ],
  serial_number: ["серийный номер", "serial number", "serial_number"],
  uncertainty: ["погрешность", "uncertainty"],
  leak_speed: [
    "скорость утечки",
    "объем утечки",
    "объём утечки",
    "расход",
    "leak speed",
    "leak_speed",
  ],
  leak_speed_kg_m: ["кг/мин", "kg/min", "leak_speed_kg_m"],
  leak_speed_kg_h: ["кг/ч", "kg/h", "leak_speed_kg_h"],
  lat: ["широта", "latitude", "lat"],
  lng: ["долгота", "longitude", "lng", "lon"],
  leak_description: ["описание", "описание утечки", "description"],
  leak_cause: ["причина", "причина утечки", "cause"],
  technological_solution: ["техническое решение", "technological solution"],
  repair_recommendation: ["рекомендация", "repair recommendation"],
  materials_equipment: ["мтр и работы", "материалы", "materials"],
  note: ["комментарий", "примечание", "note", "comment"],
  photo: ["фото", "фото до", "photo"],
  photo_repair: ["фото в ремонте", "repair photo", "photo_repair"],
  repairAt: ["дата ремонта", "repair date", "repairAt"],
  photo_after: ["фото после", "after photo", "photo_after"],
  resolvedAt: ["дата устранения", "resolved date", "resolvedAt"],
};

const NUMERIC_KEYS = new Set([
  "index",
  "id",
  "createdAt",
  "updatedAt",
  "pressure",
  "temperature",
  "temperature_K",
  "uncertainty",
  "leak_speed",
  "leak_speed_kg_m",
  "leak_speed_kg_h",
  "flareShare",
  "utilShare",
  "Operating_mode",
  "weightedGWP",
  "Total_Annual_Methane_Loss_m3_y",
  "Total_Annual_Methane_Loss_kg_y",
  "Total_Annual_Methane_Loss_t_y",
  "Emissions_t_CO2eq_year",
  "Emissions_kg_CO2_eq_year",
  "GWP",
  "GWP_Minus",
  "lat",
  "lng",
]);

const DATE_KEYS = new Set(["date", "repairAt", "resolvedAt"]);
const DATE_TIME_KEYS = new Set(["createdAt", "updatedAt"]);
const PHOTO_KEYS = new Set(["photo", "photo_repair", "photo_after"]);

const MONITORING_HEADER_ALIASES = {
  index: ["№", "no", "n"],
  leak_id: ["бирка", "tag", "leak id", "leak_id", "id утечки"],
  roundNumber: ["обход", "round", "round number"],
  date: ["дата мониторинга", "monitoring date", "date"],
  time: ["время мониторинга", "monitoring time", "время", "time"],
  monitoredBy: ["кто мониторил", "monitored by", "inspector"],
  result: ["результат", "result"],
  materials_equipment: ["мтр", "materials", "материалы"],
  comment: ["комментарий", "comment"],
  photo: ["фото мониторинга", "monitoring photo", "photo"],
};

const HISTORY_HEADER_ALIASES = {
  leak_id: ["бирка", "tag", "leak id", "leak_id", "id утечки"],
  date: ["дата", "date", "время", "time"],
  action: ["действие", "action"],
  user: ["пользователь", "user", "кто", "who"],
  text: ["текст", "text", "комментарий", "comment"],
  to: ["статус", "to", "status"],
  changes: ["изменения json", "changes json", "changes", "изменения"],
};

function normalizeHeader(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[_/\\()[\]{}:;.,'"`№+-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildHeaderMap(projectType) {
  const config = PROJECTS[projectType]?.export?.excel;
  const entries = new Map();

  for (const key of TECHNICAL_KEYS) {
    entries.set(normalizeHeader(key), key);
  }

  if (config?.headers && config?.keysOrder) {
    config.headers.forEach((header, index) => {
      const key = config.keysOrder[index];
      if (key) entries.set(normalizeHeader(header), key);
    });
  }

  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
    aliases.forEach((alias) => entries.set(normalizeHeader(alias), key));
  }

  return entries;
}

function buildMonitoringHeaderMap() {
  const entries = new Map();
  for (const [key, aliases] of Object.entries(MONITORING_HEADER_ALIASES)) {
    entries.set(normalizeHeader(key), key);
    aliases.forEach((alias) => entries.set(normalizeHeader(alias), key));
  }
  return entries;
}

function buildHistoryHeaderMap() {
  const entries = new Map();
  for (const [key, aliases] of Object.entries(HISTORY_HEADER_ALIASES)) {
    entries.set(normalizeHeader(key), key);
    aliases.forEach((alias) => entries.set(normalizeHeader(alias), key));
  }
  return entries;
}

function getCellDisplayValue(cell) {
  if (!cell) return "";
  const value = cell.value;
  if (value == null) return "";
  if (value instanceof Date) return value;
  if (typeof value === "object") {
    if ("result" in value) return value.result;
    if ("hyperlink" in value && "text" in value) return value.text;
    if ("hyperlink" in value) return value.hyperlink;
    if ("text" in value) return value.text;
    if ("richText" in value)
      return value.richText.map((part) => part.text).join("");
  }
  return value;
}

function getCellPhotoValue(cell) {
  const value = cell?.value;
  if (value && typeof value === "object" && "hyperlink" in value) {
    return value.hyperlink;
  }
  return getCellDisplayValue(cell);
}

function findHeaderRow(sheet, headerMap) {
  let best = null;
  const maxRow = Math.min(sheet.rowCount, 30);

  for (let rowNumber = 1; rowNumber <= maxRow; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const columns = [];
    let recognized = 0;

    row.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
      const raw = getCellDisplayValue(cell);
      const key = headerMap.get(normalizeHeader(raw));
      if (key) {
        recognized += 1;
        columns.push({ columnNumber, key, header: String(raw ?? "").trim() });
      }
    });

    if (!best || recognized > best.recognized) {
      best = { rowNumber, recognized, columns };
    }
  }

  return best?.recognized >= 2 ? best : null;
}

function excelSerialToDate(value) {
  const epoch = Date.UTC(1899, 11, 30);
  return new Date(epoch + Number(value) * 24 * 60 * 60 * 1000);
}

function createCalendarDate(year, month, day) {
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
    ? date
    : null;
}

function parseDateValue(value, { calendarOnly = false } = {}) {
  if (value == null || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value > 25000 && value < 80000) return excelSerialToDate(value);
    if (value > 100000000000) return new Date(value);
  }

  const text = String(value).trim();
  if (!text) return null;
  const dotted = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (dotted) {
    const year =
      dotted[3].length === 2 ? Number(`20${dotted[3]}`) : Number(dotted[3]);
    return createCalendarDate(year, Number(dotted[2]), Number(dotted[1]));
  }

  if (calendarOnly) {
    const isoDate = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoDate) {
      return createCalendarDate(
        Number(isoDate[1]),
        Number(isoDate[2]),
        Number(isoDate[3]),
      );
    }
  }

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`;
}

function parseTimeValue(value) {
  if (value == null || value === "") return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return {
      hours: value.getHours(),
      minutes: value.getMinutes(),
      seconds: value.getSeconds(),
    };
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const fraction = ((value % 1) + 1) % 1;
    const totalSeconds = Math.round(fraction * 24 * 60 * 60) % (24 * 60 * 60);
    return {
      hours: Math.floor(totalSeconds / 3600),
      minutes: Math.floor((totalSeconds % 3600) / 60),
      seconds: totalSeconds % 60,
    };
  }

  const text = String(value).trim();
  const match = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3] ?? 0);
  if (hours > 23 || minutes > 59 || seconds > 59) return null;
  return { hours, minutes, seconds };
}

function formatTime(value) {
  const time = parseTimeValue(value);
  if (!time) return "";
  const pad = (part) => String(part).padStart(2, "0");
  return `${pad(time.hours)}:${pad(time.minutes)}:${pad(time.seconds)}`;
}

function combineDateAndTime(date, timeValue) {
  if (!date) return null;
  const time = parseTimeValue(timeValue);
  if (!time) return date;

  const combined = new Date(date.getTime());
  combined.setHours(time.hours, time.minutes, time.seconds, 0);
  return combined;
}

function parseNumberValue(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const normalized = String(value).trim().replace(/\s+/g, "").replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeStatus(value) {
  const text = normalizeHeader(value);
  if (!text) return "open";
  if (["open", "открыта", "открыто", "активна", "новая"].includes(text)) {
    return "open";
  }
  if (
    [
      "in progress",
      "in_progress",
      "в ремонте",
      "ремонт",
      "на ремонте",
    ].includes(text)
  ) {
    return "in_progress";
  }
  if (
    ["resolved", "устранена", "устранено", "закрыта", "закрыто"].includes(text)
  ) {
    return "resolved";
  }
  return "open";
}

function normalizeMonitoringResult(value) {
  const text = normalizeHeader(value);
  if (!text) return "still_leaking";
  if (
    [
      "still leaking",
      "still_leaking",
      "утечка сохраняется",
      "сохраняется",
      "open",
    ].includes(text)
  ) {
    return "still_leaking";
  }
  if (
    [
      "needs recheck",
      "needs_recheck",
      "leak under repair",
      "утечка в ремонте",
      "в ремонте",
    ].includes(text)
  ) {
    return "needs_recheck";
  }
  if (
    ["resolved", "утечка устранена", "устранена", "устранено"].includes(text)
  ) {
    return "resolved";
  }
  return "still_leaking";
}

function normalizeHistoryAction(value) {
  const text = normalizeHeader(value);
  if (!text) return "edited";
  if (["created", "запись создана", "создано", "создана"].includes(text)) {
    return "created";
  }
  if (
    ["edited", "data updated", "данные изменены", "изменено"].includes(text)
  ) {
    return "edited";
  }
  if (
    [
      "status_changed",
      "status changed",
      "статус изменен",
      "статус изменён",
    ].includes(text)
  ) {
    return "status_changed";
  }
  if (["comment", "комментарий"].includes(text)) return "comment";
  if (["monitoring", "мониторинг"].includes(text)) return "monitoring";
  return String(value ?? "").trim() || "edited";
}

function isValidPhotoPath(value) {
  return (
    typeof value === "string" &&
    (value.startsWith("idb://") ||
      value.startsWith("data://") ||
      value.startsWith("zip:") ||
      value.startsWith("photos/") ||
      value.startsWith("data:image/") ||
      value.startsWith("Documents/"))
  );
}

function normalizeCellValue(key, value) {
  if (key === "status") {
    const text = String(value ?? "").trim();
    return text ? normalizeStatus(text) : "";
  }
  if (NUMERIC_KEYS.has(key)) return parseNumberValue(value);
  if (DATE_KEYS.has(key)) {
    const date = parseDateValue(value, { calendarOnly: true });
    return date ? formatDate(date) : "";
  }
  if (DATE_TIME_KEYS.has(key)) {
    const date = parseDateValue(value);
    return date ? date.getTime() : parseNumberValue(value);
  }
  if (key === "time") return formatTime(value);
  if (PHOTO_KEYS.has(key)) {
    const text = String(value ?? "").trim();
    if (text.startsWith("photos/")) return `zip:${text}`;
    return isValidPhotoPath(text) ? text : "";
  }
  return String(value ?? "").trim();
}

function rowHasImportableData(row) {
  const meaningfulKeys = [
    "leak_id",
    "date",
    "object",
    "component",
    "location",
    "leak_speed",
    "lat",
    "lng",
  ];
  return meaningfulKeys.some((key) => {
    const value = row[key];
    return value != null && value !== "";
  });
}

function normalizeImportedLeak(row, rowNumber, sequence) {
  if (!rowHasImportableData(row)) return null;

  const now = Date.now();
  const parsedDate = parseDateValue(row.date);
  const parsedDateTime = combineDateAndTime(parsedDate, row.time);
  const persistedRow = { ...row };
  delete persistedRow.time;
  if (
    persistedRow.lat != null &&
    (!Number.isFinite(persistedRow.lat) ||
      persistedRow.lat < -90 ||
      persistedRow.lat > 90)
  ) {
    delete persistedRow.lat;
  }
  if (
    persistedRow.lng != null &&
    (!Number.isFinite(persistedRow.lng) ||
      persistedRow.lng < -180 ||
      persistedRow.lng > 180)
  ) {
    delete persistedRow.lng;
  }
  const createdAt =
    row.createdAt ?? parsedDateTime?.getTime() ?? now + rowNumber + sequence;
  const updatedAt =
    row.updatedAt ?? row.resolvedAt ?? row.repairAt ?? createdAt;
  const leakSpeed = parseNumberValue(row.leak_speed);
  const leakId = String(row.leak_id || row.index || `IMP-${rowNumber}`).trim();
  return {
    ...persistedRow,
    id: row.id ?? createdAt + sequence,
    created_at: String(row.created_at || createdAt),
    createdAt,
    updatedAt,
    index: row.index ?? sequence,
    date: row.date || formatDate(new Date(createdAt)),
    status: normalizeStatus(row.status),
    leak_id: leakId,
    leak_speed: leakSpeed,
    priority: row.priority || priorityFromSpeed(leakSpeed),
    history: [
      {
        action: "created",
        date: new Date(createdAt).toISOString(),
        user: row.detectedBy || "Excel import",
      },
    ],
  };
}

function isMonitoringSheet(sheet) {
  const name = normalizeHeader(sheet?.name);
  return name === "мониторинг" || name === "monitoring";
}

function isHistorySheet(sheet) {
  const name = normalizeHeader(sheet?.name);
  return name === "история" || name === "history" || name === "leak history";
}

function findLeakSheet(workbook, headerMap) {
  return (
    workbook.worksheets.find(
      (sheet) =>
        sheet.rowCount > 0 &&
        !isMonitoringSheet(sheet) &&
        !isHistorySheet(sheet),
    ) ??
    workbook.worksheets.find((sheet) => {
      if (!sheet.rowCount) return false;
      const header = findHeaderRow(sheet, headerMap);
      return Boolean(
        header?.columns.some((column) => column.key === "leak_id"),
      );
    })
  );
}

function findMonitoringSheet(workbook) {
  const monitoringHeaderMap = buildMonitoringHeaderMap();
  const byName = workbook.worksheets.find(
    (sheet) => sheet.rowCount > 0 && isMonitoringSheet(sheet),
  );
  if (byName && findHeaderRow(byName, monitoringHeaderMap)) return byName;

  return workbook.worksheets.find((sheet) => {
    if (!sheet.rowCount) return false;
    const header = findHeaderRow(sheet, monitoringHeaderMap);
    return Boolean(
      header?.columns.some((column) => column.key === "roundNumber") &&
      header?.columns.some((column) => column.key === "leak_id"),
    );
  });
}

function findHistorySheet(workbook) {
  const historyHeaderMap = buildHistoryHeaderMap();
  const byName = workbook.worksheets.find(
    (sheet) => sheet.rowCount > 0 && isHistorySheet(sheet),
  );
  if (byName && findHeaderRow(byName, historyHeaderMap)) return byName;

  return workbook.worksheets.find((sheet) => {
    if (!sheet.rowCount || isMonitoringSheet(sheet)) return false;
    const header = findHeaderRow(sheet, historyHeaderMap);
    return Boolean(
      header?.columns.some((column) => column.key === "action") &&
      header?.columns.some((column) => column.key === "leak_id"),
    );
  });
}

function normalizeMonitoringCellValue(key, value) {
  if (key === "roundNumber" || key === "index") return parseNumberValue(value);
  if (key === "date") {
    const date = parseDateValue(value);
    return date ? date.toISOString() : "";
  }
  if (key === "time") return formatTime(value);
  if (key === "result") return normalizeMonitoringResult(value);
  if (key === "photo") {
    const text = String(value ?? "").trim();
    if (text.startsWith("photos/")) return `zip:${text}`;
    return isValidPhotoPath(text) ? text : "";
  }
  return String(value ?? "").trim();
}

function parseMonitoringRecords(sheet) {
  const headerMap = buildMonitoringHeaderMap();
  const headerRow = findHeaderRow(sheet, headerMap);
  if (!headerRow) return { recordsByLeakId: new Map(), count: 0 };

  const recordsByLeakId = new Map();
  let count = 0;

  for (
    let rowNumber = headerRow.rowNumber + 1;
    rowNumber <= sheet.rowCount;
    rowNumber += 1
  ) {
    const row = sheet.getRow(rowNumber);
    const raw = {};

    for (const column of headerRow.columns) {
      const cell = row.getCell(column.columnNumber);
      const value =
        column.key === "photo"
          ? getCellPhotoValue(cell)
          : getCellDisplayValue(cell);
      const normalized = normalizeMonitoringCellValue(column.key, value);
      if (normalized != null && normalized !== "") raw[column.key] = normalized;
    }

    const leakId = String(raw.leak_id ?? "").trim();
    if (!leakId || !raw.date) continue;

    const monitoringDate = combineDateAndTime(
      parseDateValue(raw.date),
      raw.time,
    );
    if (!monitoringDate) continue;

    const roundNumber =
      Number(raw.roundNumber) > 0 ? Number(raw.roundNumber) : 1;
    const record = {
      id: `excel-${leakId}-round-${roundNumber}-${rowNumber}`,
      date: monitoringDate.toISOString(),
      roundId: `excel-round-${roundNumber}`,
      roundNumber,
      monitoredBy: raw.monitoredBy || "",
      result: raw.result || "still_leaking",
      materials_equipment: raw.materials_equipment || "",
      comment: raw.comment || "",
      ...(raw.photo ? { photo: raw.photo } : {}),
    };

    if (!recordsByLeakId.has(leakId)) recordsByLeakId.set(leakId, []);
    recordsByLeakId.get(leakId).push(record);
    count += 1;
  }

  return { recordsByLeakId, count };
}

function normalizeHistoryCellValue(key, value) {
  if (key === "date") {
    const date = parseDateValue(value);
    return date ? date.toISOString() : String(value ?? "").trim();
  }
  if (key === "action") return normalizeHistoryAction(value);
  if (key === "changes") {
    if (Array.isArray(value)) return value;
    const raw = String(value ?? "").trim();
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return String(value ?? "").trim();
}

function parseHistoryRecords(sheet) {
  const headerMap = buildHistoryHeaderMap();
  const headerRow = findHeaderRow(sheet, headerMap);
  if (!headerRow) return { recordsByLeakId: new Map(), count: 0 };

  const recordsByLeakId = new Map();
  let count = 0;

  for (
    let rowNumber = headerRow.rowNumber + 1;
    rowNumber <= sheet.rowCount;
    rowNumber += 1
  ) {
    const row = sheet.getRow(rowNumber);
    const raw = {};

    for (const column of headerRow.columns) {
      const cell = row.getCell(column.columnNumber);
      const normalized = normalizeHistoryCellValue(
        column.key,
        getCellDisplayValue(cell),
      );
      if (
        normalized != null &&
        normalized !== "" &&
        (!Array.isArray(normalized) || normalized.length > 0)
      ) {
        raw[column.key] = normalized;
      }
    }

    const leakId = String(raw.leak_id ?? "").trim();
    if (!leakId || !raw.date || !raw.action) continue;

    const record = {
      action: raw.action,
      date: raw.date,
      ...(raw.user ? { user: raw.user } : {}),
      ...(raw.text ? { text: raw.text } : {}),
      ...(raw.to ? { to: normalizeStatus(raw.to) } : {}),
      ...(Array.isArray(raw.changes) && raw.changes.length
        ? { changes: raw.changes }
        : {}),
    };

    if (!recordsByLeakId.has(leakId)) recordsByLeakId.set(leakId, []);
    recordsByLeakId.get(leakId).push(record);
    count += 1;
  }

  return { recordsByLeakId, count };
}

function parseEmbeddedBackup(workbook) {
  const sheet = workbook.getWorksheet("Project Backup");
  if (!sheet) return null;
  if (
    String(getCellDisplayValue(sheet.getRow(1).getCell(1))) !==
    "LEAK_TRACKER_EXCEL_BACKUP"
  ) {
    return null;
  }

  const chunks = [];
  for (let rowNumber = 3; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const index = Number(getCellDisplayValue(row.getCell(1)));
    const chunk = getCellDisplayValue(row.getCell(2));
    if (Number.isInteger(index) && index > 0 && typeof chunk === "string") {
      chunks.push({ index, chunk });
    }
  }
  chunks.sort((left, right) => left.index - right.index);
  if (!chunks.length) throw new Error("Project Backup sheet is empty");

  let payload;
  try {
    payload = JSON.parse(chunks.map((entry) => entry.chunk).join(""));
  } catch {
    throw new Error("Project Backup sheet contains invalid data");
  }

  const validation = validateBackup(payload?.leaks);
  if (!validation.ok) throw new Error(validation.error);
  const type = payload?.project?.type;
  const project = ["upstream", "midstream", "downstream"].includes(type)
    ? {
        name: String(payload.project.name ?? "").trim(),
        type,
        folderName: payload.project.folderName,
        syncId: payload.project.syncId,
      }
    : null;

  return {
    ...payload,
    project,
    leaks: validation.data,
  };
}

function isZipFile(file) {
  return (
    /\.zip$/i.test(file?.name ?? "") || String(file?.type ?? "").includes("zip")
  );
}

function getMimeFromPath(path) {
  const ext = String(path).split(".").pop()?.toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  return "image/jpeg";
}

async function dataUrlToBlob(dataUrl) {
  const match = String(dataUrl ?? "").match(/^data:([^;,]+);base64,(.*)$/);
  if (!match) return null;
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: match[1] });
}

function getLeakIdentity(leak) {
  return getLeakSyncIdentity(leak);
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

function getMonitoringIdentity(record, index) {
  if (record?.date) {
    return `date:${normalizeRecordDateIdentity(record.date)}|result:${String(record?.result ?? "")}`;
  }
  if (record?.id != null) return `id:${String(record.id)}`;
  return `index:${index}`;
}

async function resolveStoredPhotoBlob(path, getStoredPhoto) {
  if (!path) return null;
  if (path instanceof Blob) return path;
  if (String(path).startsWith("data:image/")) return dataUrlToBlob(path);

  if (String(path).startsWith("idb://")) {
    if (typeof getStoredPhoto !== "function") return null;
    const stored = await getStoredPhoto(String(path).replace("idb://", ""));
    if (stored instanceof Blob) return stored;
    if (String(stored ?? "").startsWith("data:image/")) {
      return dataUrlToBlob(stored);
    }
    return null;
  }

  const src = await getPhotoSrc(String(path));
  return String(src ?? "").startsWith("data:image/")
    ? dataUrlToBlob(src)
    : null;
}

async function blobsEqual(left, right) {
  if (!(left instanceof Blob) || !(right instanceof Blob)) return false;
  if (left.size !== right.size) return false;

  const [leftBytes, rightBytes] = await Promise.all([
    readBlobBytes(left),
    readBlobBytes(right),
  ]);
  const a = new Uint8Array(leftBytes);
  const b = new Uint8Array(rightBytes);
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return false;
  }
  return true;
}

function readBlobBytes(blob) {
  if (typeof blob.arrayBuffer === "function") return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsArrayBuffer(blob);
  });
}

async function fingerprintBlob(blob) {
  if (!(blob instanceof Blob)) return null;
  const buffer = await readBlobBytes(blob);
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", buffer);
    return [...new Uint8Array(digest)]
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");
  }

  let first = 2166136261;
  let second = 2246822519;
  for (const value of new Uint8Array(buffer)) {
    first = Math.imul(first ^ value, 16777619);
    second = Math.imul(second ^ value, 3266489917);
  }
  return `${blob.size}:${first >>> 0}:${second >>> 0}`;
}

async function buildReusablePhotoMap(existingLeaks, getStoredPhoto) {
  const paths = new Set();
  for (const leak of existingLeaks ?? []) {
    for (const key of PHOTO_KEYS) {
      if (leak?.[key]) paths.add(leak[key]);
    }
    for (const record of leak?.monitoringRecords ?? []) {
      if (record?.photo) paths.add(record.photo);
    }
  }

  const queue = [...paths];
  const reusable = new Map();
  let cursor = 0;
  async function worker() {
    while (cursor < queue.length) {
      const path = queue[cursor];
      cursor += 1;
      try {
        const blob = await resolveStoredPhotoBlob(path, getStoredPhoto);
        const fingerprint = await fingerprintBlob(blob);
        if (fingerprint && !reusable.has(fingerprint)) {
          reusable.set(fingerprint, path);
        }
      } catch {
        // Unreadable paths remain eligible for normal slot comparison.
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(8, queue.length) }, () => worker()),
  );
  return reusable;
}

async function reconcilePhotoValue(
  incomingPath,
  existingPath,
  getStoredPhoto,
  stats,
  field,
  reusablePhotos,
  preserveExisting,
) {
  if (!String(incomingPath ?? "").startsWith("data:image/")) {
    return incomingPath;
  }

  if (preserveExisting && existingPath) {
    stats.reused += 1;
    return existingPath;
  }

  try {
    const incomingBlob = await dataUrlToBlob(incomingPath);
    const fingerprint = await fingerprintBlob(incomingBlob);
    const reusablePath = fingerprint ? reusablePhotos.get(fingerprint) : null;
    if (reusablePath) {
      stats.reused += 1;
      return reusablePath;
    }

    if (!existingPath) {
      stats.added += 1;
      stats.addedByField[field] = (stats.addedByField[field] ?? 0) + 1;
      return incomingPath;
    }

    const existingBlob = await resolveStoredPhotoBlob(
      existingPath,
      getStoredPhoto,
    );
    if (await blobsEqual(incomingBlob, existingBlob)) {
      stats.reused += 1;
      return existingPath;
    }
    const reason = existingBlob ? "different" : "unreadable";
    stats.replacedByReason[reason] = (stats.replacedByReason[reason] ?? 0) + 1;
  } catch {
    // If the local photo cannot be read, keep the Excel photo as a replacement.
    stats.replacedByReason.unreadable =
      (stats.replacedByReason.unreadable ?? 0) + 1;
  }

  stats.replaced += 1;
  stats.replacedByField[field] = (stats.replacedByField[field] ?? 0) + 1;
  return incomingPath;
}

/**
 * Reuses local photo paths when an Excel photo has identical bytes.
 * Remaining data URLs are the only photos that need to be persisted.
 */
export async function reconcileExcelImportPhotos(
  existingLeaks,
  incomingLeaks,
  getStoredPhoto,
  options = {},
) {
  const existingByIdentity = new Map();
  const stats = {
    added: 0,
    reused: 0,
    replaced: 0,
    addedByField: {},
    replacedByField: {},
    replacedByReason: {},
  };

  for (const leak of existingLeaks ?? []) {
    const identity = getLeakIdentity(leak);
    if (identity) existingByIdentity.set(identity, leak);
  }
  const preserveExisting = options.preserveExisting === true;
  const reusablePhotos = preserveExisting
    ? new Map()
    : await buildReusablePhotoMap(existingLeaks, getStoredPhoto);

  const leaks = await Promise.all(
    (incomingLeaks ?? []).map(async (leak) => {
      const current = existingByIdentity.get(getLeakIdentity(leak));
      const copy = { ...leak };

      for (const key of PHOTO_KEYS) {
        copy[key] = await reconcilePhotoValue(
          leak[key],
          current?.[key],
          getStoredPhoto,
          stats,
          key,
          reusablePhotos,
          preserveExisting,
        );
      }

      if (Array.isArray(leak.monitoringRecords)) {
        const currentMonitoringRecords = current?.monitoringRecords ?? [];
        const currentRecords = new Map(
          currentMonitoringRecords.map((record, index) => [
            getMonitoringIdentity(record, index),
            record,
          ]),
        );
        copy.monitoringRecords = await Promise.all(
          leak.monitoringRecords.map(async (record, index) => {
            const recordAtSamePosition = currentMonitoringRecords[index];
            const currentRecord =
              preserveExisting &&
              currentMonitoringRecords.length === leak.monitoringRecords.length
                ? recordAtSamePosition
                : (currentRecords.get(getMonitoringIdentity(record, index)) ??
                  recordAtSamePosition);
            return {
              ...record,
              photo: await reconcilePhotoValue(
                record?.photo,
                currentRecord?.photo,
                getStoredPhoto,
                stats,
                "monitoring.photo",
                reusablePhotos,
                preserveExisting,
              ),
            };
          }),
        );
      }

      return copy;
    }),
  );

  return {
    leaks,
    photos: {
      ...stats,
      toSave: stats.added + stats.replaced,
      total: stats.added + stats.reused + stats.replaced,
    },
  };
}

async function zipPhotoToDataUrl(zip, path) {
  const relativePath = path.replace(/^zip:/, "");
  const file = zip.file(relativePath);
  if (!file) return null;
  const base64 = await file.async("base64");
  const mime = getMimeFromPath(relativePath);
  return `data:${mime};base64,${base64}`;
}

async function hydrateZipPhotos(result, zip) {
  let restoredPhotos = 0;
  const leaks = await Promise.all(
    result.leaks.map(async (leak) => {
      const copy = { ...leak };

      for (const key of PHOTO_KEYS) {
        if (!String(copy[key] ?? "").startsWith("zip:")) continue;
        const dataUrl = await zipPhotoToDataUrl(zip, copy[key]);
        if (dataUrl) {
          copy[key] = dataUrl;
          restoredPhotos += 1;
        }
      }

      if (Array.isArray(copy.monitoringRecords)) {
        copy.monitoringRecords = await Promise.all(
          copy.monitoringRecords.map(async (record) => {
            if (!String(record?.photo ?? "").startsWith("zip:")) return record;
            const dataUrl = await zipPhotoToDataUrl(zip, record.photo);
            if (!dataUrl) return record;
            restoredPhotos += 1;
            return { ...record, photo: dataUrl };
          }),
        );
      }

      return copy;
    }),
  );

  return {
    ...result,
    leaks,
    stats: {
      ...result.stats,
      restoredPhotos,
    },
  };
}

async function persistPhotoValue(
  value,
  savePhoto,
  storageKey,
  excludePaths = [],
) {
  if (!String(value ?? "").startsWith("data:image/")) return value;
  const blob = await dataUrlToBlob(value);
  const saved = await savePhoto(blob, storageKey, excludePaths, {
    cleanupOldVersions: false,
  });
  return saved ?? value;
}

export async function persistExcelImportPhotos(leaks, savePhoto) {
  if (typeof savePhoto !== "function") return leaks;

  return Promise.all(
    leaks.map(async (leak) => {
      const copy = { ...leak };
      const baseKey = String(leak.leak_id ?? leak.id);
      const savedPaths = [];

      for (const key of PHOTO_KEYS) {
        const suffix =
          key === "photo_after"
            ? "_after"
            : key === "photo_repair"
              ? "_repair"
              : "";
        const next = await persistPhotoValue(
          copy[key],
          savePhoto,
          `${baseKey}${suffix}`,
          savedPaths,
        );
        copy[key] = next;
        if (next && next !== leak[key]) savedPaths.push(next);
      }

      if (Array.isArray(copy.monitoringRecords)) {
        copy.monitoringRecords = await Promise.all(
          copy.monitoringRecords.map(async (record, index) => ({
            ...record,
            photo: await persistPhotoValue(
              record.photo,
              savePhoto,
              `${baseKey}_monitoring_${record.id ?? index + 1}`,
              savedPaths,
            ),
          })),
        );
      }

      return copy;
    }),
  );
}

function attachMonitoringRecords(leaks, recordsByLeakId) {
  if (!recordsByLeakId.size) return leaks;

  return leaks.map((leak) => {
    const records = recordsByLeakId.get(String(leak.leak_id));
    if (!records?.length) return leak;

    const monitoringRecords = [
      ...(Array.isArray(leak.monitoringRecords) ? leak.monitoringRecords : []),
      ...records,
    ].sort((left, right) => Date.parse(left.date) - Date.parse(right.date));

    const monitoringHistory = records.map((record) => ({
      action: "monitoring",
      date: record.date,
      to:
        record.result === "resolved"
          ? "resolved"
          : record.result === "needs_recheck"
            ? "in_progress"
            : "open",
      user: record.monitoredBy || "Excel import",
      text: record.comment || "",
    }));

    return {
      ...leak,
      monitoringRecords,
      history: [
        ...(Array.isArray(leak.history) ? leak.history : []),
        ...monitoringHistory,
      ].sort((left, right) => Date.parse(left.date) - Date.parse(right.date)),
      updatedAt: Math.max(
        Number(leak.updatedAt) || 0,
        ...records.map((record) => Date.parse(record.date) || 0),
      ),
    };
  });
}

function attachHistoryRecords(leaks, recordsByLeakId) {
  if (!recordsByLeakId.size) return leaks;

  return leaks.map((leak) => {
    const records = recordsByLeakId.get(String(leak.leak_id));
    if (!records?.length) return leak;
    const fallbackUser = leak.detectedBy || leak.monitoredBy || "Не указан";

    return {
      ...leak,
      history: [...records]
        .map((record) => ({
          ...record,
          user: record.user || fallbackUser,
        }))
        .sort((left, right) => Date.parse(left.date) - Date.parse(right.date)),
      updatedAt: Math.max(
        Number(leak.updatedAt) || 0,
        ...records.map((record) => Date.parse(record.date) || 0),
      ),
    };
  });
}

export async function parseExcelLeaks(file, { projectType = "upstream" } = {}) {
  assertImportFileSize(file);
  const ExcelJS = (await getExcelJS()).default;
  const workbook = new ExcelJS.Workbook();
  const buffer = await file.arrayBuffer();
  const JSZip = (await getJSZip()).default;
  const workbookArchive = await JSZip.loadAsync(buffer);
  assertArchiveLimits(workbookArchive);
  await workbook.xlsx.load(buffer);

  const embeddedBackup = parseEmbeddedBackup(workbook);
  if (embeddedBackup) {
    return {
      leaks: embeddedBackup.leaks,
      stats: {
        totalRows: embeddedBackup.leaks.length,
        imported: embeddedBackup.leaks.length,
        skipped: 0,
        exactBackup: true,
      },
      columns: [],
      sheetName: "Project Backup",
      monitoringRound: embeddedBackup.monitoringRound ?? null,
      project: embeddedBackup.project,
      vars: embeddedBackup.vars ?? null,
      settings: embeddedBackup.settings ?? null,
      sync: embeddedBackup.sync ?? null,
      portableArchive: true,
    };
  }

  const headerMap = buildHeaderMap(projectType);
  const sheet = findLeakSheet(workbook, headerMap);
  if (!sheet) {
    return {
      leaks: [],
      stats: { totalRows: 0, imported: 0, skipped: 0 },
      columns: [],
      sheetName: "",
    };
  }

  const headerRow = findHeaderRow(sheet, headerMap);
  if (!headerRow) {
    throw new Error("Не удалось найти строку заголовков Excel");
  }

  const leaks = [];
  const seenLeakTags = new Set();
  let totalRows = 0;
  let skipped = 0;
  let duplicateLeakIds = 0;

  for (
    let rowNumber = headerRow.rowNumber + 1;
    rowNumber <= sheet.rowCount;
    rowNumber += 1
  ) {
    const row = sheet.getRow(rowNumber);
    const raw = {};

    for (const column of headerRow.columns) {
      const cell = row.getCell(column.columnNumber);
      const value = PHOTO_KEYS.has(column.key)
        ? getCellPhotoValue(cell)
        : getCellDisplayValue(cell);
      const normalized = normalizeCellValue(column.key, value);
      if (normalized != null && normalized !== "") raw[column.key] = normalized;
    }

    if (!Object.keys(raw).length) continue;
    totalRows += 1;

    const leak = normalizeImportedLeak(raw, rowNumber, leaks.length + 1);
    if (!leak) {
      skipped += 1;
      continue;
    }

    const leakTag = String(leak.leak_id ?? "")
      .trim()
      .toLowerCase();
    if (leakTag && seenLeakTags.has(leakTag)) {
      skipped += 1;
      duplicateLeakIds += 1;
      continue;
    }
    if (leakTag) seenLeakTags.add(leakTag);
    leaks.push(leak);
  }

  const monitoringSheet = findMonitoringSheet(workbook);
  const monitoring = monitoringSheet
    ? parseMonitoringRecords(monitoringSheet)
    : { recordsByLeakId: new Map(), count: 0 };
  const historySheet = findHistorySheet(workbook);
  const history = historySheet
    ? parseHistoryRecords(historySheet)
    : { recordsByLeakId: new Map(), count: 0 };
  const leaksBeforeHistoryAttach = historySheet
    ? leaks.map((leak) => ({ ...leak, history: [] }))
    : leaks;
  const leaksWithMonitoring = attachMonitoringRecords(
    leaksBeforeHistoryAttach,
    monitoring.recordsByLeakId,
  );
  const leaksWithHistory = attachHistoryRecords(
    leaksWithMonitoring,
    history.recordsByLeakId,
  );
  const monitoringRound = inferMonitoringRound(leaksWithHistory);

  return {
    leaks: leaksWithHistory,
    stats: {
      totalRows,
      imported: leaksWithHistory.length,
      skipped,
      duplicateLeakIds,
      recognizedColumns: headerRow.columns.length,
      monitoringRecords: monitoring.count,
      historyRecords: history.count,
    },
    columns: headerRow.columns,
    sheetName: sheet.name,
    monitoringSheetName: monitoringSheet?.name ?? "",
    historySheetName: historySheet?.name ?? "",
    monitoringRound,
  };
}

export async function parseExcelImportFile(file, options = {}) {
  assertImportFileSize(file);
  if (!isZipFile(file)) {
    const parsed = await parseExcelLeaks(file, options);
    return { ...parsed, project: parsed.project ?? null };
  }

  const JSZip = (await getJSZip()).default;
  const zip = await JSZip.loadAsync(file);
  assertArchiveLimits(zip);
  let project = null;
  const projectEntry = zip.file("excel-project.json");
  if (projectEntry) {
    try {
      const manifest = JSON.parse(await projectEntry.async("string"));
      const type = manifest?.project?.type || manifest?.config;
      if (["upstream", "midstream", "downstream"].includes(type)) {
        project = {
          name: String(manifest?.project?.name ?? "").trim(),
          type,
        };
      }
    } catch {
      // Старые или повреждённые метаданные не блокируют импорт таблицы.
    }
  }
  const xlsxEntry = Object.values(zip.files).find(
    (entry) =>
      !entry.dir &&
      /\.xlsx$/i.test(entry.name) &&
      !entry.name.startsWith("__MACOSX/"),
  );

  if (!xlsxEntry) {
    throw new Error("В ZIP не найден Excel-файл .xlsx");
  }

  const buffer = await xlsxEntry.async("arraybuffer");
  const parsed = await parseExcelLeaks(
    { name: xlsxEntry.name, arrayBuffer: async () => buffer },
    { ...options, projectType: project?.type || options.projectType },
  );

  const hydrated = await hydrateZipPhotos(parsed, zip);
  return { ...hydrated, project: parsed.project ?? project };
}
