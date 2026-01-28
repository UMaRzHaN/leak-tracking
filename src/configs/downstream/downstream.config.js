import { parseVoiceText } from "./voice/parseVoiceText";
import { normalizeSynonyms } from "./voice/normalizeSynonyms";

import { exportLeaksKML } from "./export/exportLeaksKML";
import { exportLeaksGeoJSON } from "./export/exportLeaksGeoJSON";
import { FIELDS } from "./data/fields";

import {
  headers as EXCEL_HEADERS,
  keysOrder as EXCEL_KEYS_ORDER,
} from "./export/excelImportData";
import {
  NUMBER_FIELDS,
  COPYABLE_FIELDS,
  SEARCH_FIELDS,
} from "./data/constants";

import { STEPS } from "./data/steps";

import {
  cause,
  description,
  solutions,
  recommendations,
} from "./data/dictionaries";
export const VOICE_DOWNSTREAM = {
  input: "rawVoiceText",

  pipeline: [parseVoiceText, normalizeSynonyms],

  outputFields: [
    "field",
    "station",
    "location",
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
  ],
};
export const SEMANTIC_DOWNSTREAM = {
  leak_cause: cause,
  leak_description: description,
  technological_solution: solutions,
  repair_recommendation: recommendations,
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