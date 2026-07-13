const REQUIRED_EXCEL_FIELDS = [
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

function harmonizeExcelFields(headers, keysOrder) {
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
