import { parseVoiceText } from "./voice/parseVoiceText";
import { normalizeSynonyms } from "./voice/normalizeSynonyms";

import { exportLeaksKML } from "./export/exportLeaksKML";
import { exportLeaksGeoJSON } from "./export/exportLeaksGeoJSON";

import {
  headers as EXCEL_HEADERS,
  keysOrder as EXCEL_KEYS_ORDER,
} from "./export/excelImportData";
import { NUMBER_FIELDS, COPYABLE_FIELDS, SEARCH_FIELDS } from "./constants";

import { STEPS } from "./steps";

import { cause, description, solutions, recommendations } from "./dictionaries";
export const VOICE_COMPRESSION = {
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
export const SEMANTIC_COMPRESSION = {
  leak_cause: cause,
  leak_description: description,
  technological_solution: solutions,
  repair_recommendation: recommendations,
};
export const SYSTEM_COMPRESSION = {
  numeric: NUMBER_FIELDS,
  copyable: COPYABLE_FIELDS,
  search: SEARCH_FIELDS,
  lossy: ["rawVoiceText", "note"],
};

export const EXPORT_COMPRESSION = {
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
export const STEP_COMPRESSION = {
  mode: "manual",
  steps: STEPS,
};
export const COMPRESSION_CONFIG = Object.freeze({
  steps: STEP_COMPRESSION,
  voice: VOICE_COMPRESSION,
  semantic: SEMANTIC_COMPRESSION,
  system: SYSTEM_COMPRESSION,
  export: EXPORT_COMPRESSION,
});
