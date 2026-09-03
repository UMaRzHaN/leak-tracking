const REQUIRED_EXCEL_FIELDS = [
  {
    key: "time",
    header: "Время",
    after: "date",
  },
  {
    key: "detectedBy",
    header: "Кто зафиксировал",
    after: "video_id",
  },
  {
    key: "equipmentType",
    header: "Оборудование для замера объёма утечки",
    after: "temperature_K",
  },
  {
    key: "serial_number",
    header: "Серийный номер оборудования",
    after: "equipmentType",
  },
  {
    key: "uncertainty",
    header: "Погрешность",
    after: "serial_number",
  },
  {
    key: "gasPercentage",
    header: "Содержание газа в смеси, %",
    after: "uncertainty",
  },
  {
    // Сразу за координатами: читают её вместе с ними, и в стороне от них она
    // превращается в число без объяснения, что оно значит.
    key: "coords_accuracy",
    header: "Точность координат, м",
    after: "lng",
  },
  {
    key: "photo_repair",
    header: "Фото в ремонте",
    after: "status",
  },
  {
    key: "repairAt",
    header: "Дата ремонта",
    after: "photo_repair",
  },
];

const HARMONIZED_EXCEL_ORDER = [
  "index",
  "date",
  "time",
  "subdivision",
  "deposit",
  "field",
  "station",
  "locality",
  "district",
  "address",
  "location",
  "object",
  "category",
  "leak_id",
  "component",
  "video_id",
  "detectedBy",
  "pressure",
  "temperature",
  "temperature_K",
  "equipmentType",
  "serial_number",
  "uncertainty",
  "gasPercentage",
  "leak_speed",
  "leak_speed_kg_h",
  "flareShare",
  "utilShare",
  "Operating_mode",
  "weightedGWP",
  "Total_Annual_Methane_Loss_m3_y",
  "Total_Annual_Methane_Loss_t_y",
  "Emissions_t_CO2eq_year",
  "Emissions_kg_CO2_eq_year",
  "actuator_type",
  "connection_type",
  "installation_type",
  "lat",
  "lng",
  "coords_accuracy",
  "leak_description",
  "leak_cause",
  "technological_solution",
  "repair_recommendation",
  "materials_equipment",
  "note",
  "status",
  "photo",
  "photo_repair",
  "repairAt",
  "photo_after",
  "resolvedAt",
];

function insertAfter(list, value, after) {
  const next = [...list];
  const anchorIndex = next.indexOf(after);
  const insertIndex = anchorIndex >= 0 ? anchorIndex + 1 : next.length;
  next.splice(insertIndex, 0, value);
  return next;
}

export function validateExcelColumns(headers, keysOrder) {
  if (headers.length !== keysOrder.length) {
    throw new Error(
      `Excel config mismatch: ${headers.length} headers for ${keysOrder.length} keys`,
    );
  }

  const seen = new Set();
  const duplicates = keysOrder.filter((key) => {
    if (!seen.has(key)) {
      seen.add(key);
      return false;
    }
    return true;
  });

  if (duplicates.length > 0) {
    throw new Error(
      `Excel config has duplicate keys: ${[...new Set(duplicates)].join(", ")}`,
    );
  }
}

export function splitExcelColumns(columns) {
  const headers = columns.map((column) => column.header);
  const keysOrder = columns.map((column) => column.key);

  validateExcelColumns(headers, keysOrder);

  return { headers, keysOrder };
}

function harmonizeExcelFields(headers, keysOrder) {
  validateExcelColumns(headers, keysOrder);

  const headerByKey = new Map(
    keysOrder.map((key, index) => [key, headers[index]]),
  );
  const orderedKeys = [
    ...HARMONIZED_EXCEL_ORDER.filter((key) => headerByKey.has(key)),
    ...keysOrder.filter((key) => !HARMONIZED_EXCEL_ORDER.includes(key)),
  ];

  return {
    headers: orderedKeys.map((key) => headerByKey.get(key)),
    keysOrder: orderedKeys,
  };
}

export function withRequiredExcelFields(headers, keysOrder) {
  validateExcelColumns(headers, keysOrder);

  let nextHeaders = [...headers];
  let nextKeys = [...keysOrder];

  for (const field of REQUIRED_EXCEL_FIELDS) {
    if (nextKeys.includes(field.key)) continue;

    nextKeys = insertAfter(nextKeys, field.key, field.after);
    const keyIndex = nextKeys.indexOf(field.key);
    nextHeaders.splice(keyIndex, 0, field.header);
  }

  return harmonizeExcelFields(nextHeaders, nextKeys);
}

export function withRequiredExcelColumns(columns) {
  const { headers, keysOrder } = splitExcelColumns(columns);

  return withRequiredExcelFields(headers, keysOrder);
}
