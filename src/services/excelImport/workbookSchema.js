import { PROJECTS } from "@/configs/projects";

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
  "gasPercentage",
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
    "индивидуальный номер утечки",
    "индивидуальный номер бирки",
    "individual leak number",
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
  gasPercentage: [
    "содержание газа в смеси",
    "содержание газа",
    "gas content",
    "gas percentage",
    "gasPercentage",
  ],
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

const MONITORING_HEADER_ALIASES = {
  index: ["№", "no", "n"],
  leak_id: ["бирка", "tag", "leak id", "leak_id", "id утечки"],
  roundNumber: ["обход", "round", "round number"],
  date: ["дата мониторинга", "monitoring date", "date"],
  time: ["время мониторинга", "monitoring time", "время", "time"],
  monitoredBy: ["кто мониторил", "monitored by", "inspector"],
  result: [
    "результат",
    "result",
    "утечка есть",
    "утечка есть?",
    "leak present",
    "is there a leak?",
  ],
  materials_equipment: ["мтр", "materials", "материалы"],
  comment: ["комментарий", "comment"],
  photo: ["фото мониторинга", "monitoring photo", "photo"],
  previousPhoto: [
    "предыдущее фото",
    "фото до обхода",
    "previous photo",
    "photo before round",
    "previousPhoto",
  ],
};

const HISTORY_HEADER_ALIASES = {
  leak_id: ["бирка", "tag", "leak id", "leak_id", "id утечки"],
  date: ["дата", "date"],
  time: ["время", "time"],
  action: ["действие", "action"],
  user: ["пользователь", "user", "кто", "who"],
  text: ["текст", "text", "комментарий", "comment"],
  to: ["статус", "to", "status"],
  changes: ["изменения json", "changes json", "changes", "изменения"],
};

export function normalizeHeader(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[_/\\()[\]{}:;.,'"`№%+-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildHeaderMap(projectType) {
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

export function buildMonitoringHeaderMap() {
  const entries = new Map();
  for (const [key, aliases] of Object.entries(MONITORING_HEADER_ALIASES)) {
    entries.set(normalizeHeader(key), key);
    aliases.forEach((alias) => entries.set(normalizeHeader(alias), key));
  }
  return entries;
}

export function buildHistoryHeaderMap() {
  const entries = new Map();
  for (const [key, aliases] of Object.entries(HISTORY_HEADER_ALIASES)) {
    entries.set(normalizeHeader(key), key);
    aliases.forEach((alias) => entries.set(normalizeHeader(alias), key));
  }
  return entries;
}

export function getCellDisplayValue(cell) {
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

export function getCellPhotoValue(cell) {
  const value = cell?.value;
  if (value && typeof value === "object" && "hyperlink" in value) {
    return value.hyperlink;
  }
  return getCellDisplayValue(cell);
}

export function findHeaderRow(sheet, headerMap) {
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

function isMonitoringSheet(sheet) {
  const name = normalizeHeader(sheet?.name);
  return name === "мониторинг" || name === "monitoring";
}

function isHistorySheet(sheet) {
  const name = normalizeHeader(sheet?.name);
  return name === "история" || name === "history" || name === "leak history";
}

export function findLeakSheet(workbook, headerMap) {
  let best = null;
  for (const sheet of workbook.worksheets) {
    if (!sheet.rowCount || isMonitoringSheet(sheet) || isHistorySheet(sheet)) {
      continue;
    }
    const header = findHeaderRow(sheet, headerMap);
    if (!header?.columns.some((column) => column.key === "leak_id")) continue;
    if (!best || header.recognized > best.header.recognized) {
      best = { sheet, header };
    }
  }
  return best?.sheet;
}

export function findMonitoringSheet(workbook) {
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

export function findHistorySheet(workbook) {
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
