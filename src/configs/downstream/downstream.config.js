import { exportLeaksKML } from "./export/exportLeaksKML";
import { exportLeaksGeoJSON } from "./export/exportLeaksGeoJSON";
import { FIELDS } from "./data/fields";

import {
  headers as EXCEL_HEADERS,
  keysOrder as EXCEL_KEYS_ORDER,
} from "./export/excelImportData";
import { COPYABLE_FIELDS, SEARCH_FIELDS } from "./data/constants";
import { NUMBER_FIELDS } from "../data/constants";

import { STEPS } from "./data/steps";

import {
  cause,
  description,
  solutions,
  recommendations,
  connection_type,
  installation_type,
  actuator_type,
  categories_down,
  addresses,
} from "../../data/dictionaries";

export const VOICE_DOWNSTREAM = {
  input: "rawVoiceText",

  outputFields: [
    "district",
    "locality",
    "address",

    "object",
    "component",
    "leak_id",
    "video_id",
    "leak_speed",
    "pressure",
    "temperature",
    "leak_description",
    "leak_cause",
    "technological_solution",
    "repair_recommendation",
    "materials_equipment",
    "note",
    "actuator_type",
    "connection_type",
    "installation_type",
  ],
  synonymsFields: [
    "repair_recommendation",
    "leak_description",
    "component",
    "actuator_type",
    "connection_type",
    "installation_type",
  ],
};
export const SEMANTIC_DOWNSTREAM = {
  leak_cause: cause,
  leak_description: description,
  technological_solution: solutions,
  repair_recommendation: recommendations,
  actuator_type: actuator_type,
  installation_type: installation_type,
  connection_type: connection_type,
  category: categories_down,
  address: addresses,
};
export const SYSTEM_DOWNSTREAM = {
  numeric: NUMBER_FIELDS,
  copyable: COPYABLE_FIELDS,
  search: SEARCH_FIELDS,
  lossy: ["rawVoiceText", "note"],
  fields: FIELDS,
};

export const EXPORT_DOWNSTREAM = {
  geojson: {
    format: "GeoJSON",
    handler: exportLeaksGeoJSON,
  },

  kml: {
    format: "KML",
    handler: exportLeaksKML,
  },
  excel: {
    format: "XLSX",
    purpose: "table",
    direction: ["import", "export"],
    handler: null,
    headers: EXCEL_HEADERS,
    keysOrder: EXCEL_KEYS_ORDER,
  },
};
export const STEP_DOWNSTREAM = {
  mode: "manual",
  steps: STEPS,
};
export const DOWNSTREAM_CONFIG = Object.freeze({
  steps: STEP_DOWNSTREAM,
  voice: VOICE_DOWNSTREAM,
  semantic: SEMANTIC_DOWNSTREAM,
  system: SYSTEM_DOWNSTREAM,
  export: EXPORT_DOWNSTREAM,
});

export default DOWNSTREAM_CONFIG;
