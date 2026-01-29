import { normalizeVoiceResult } from "./voice/normalizeVoiceResult";
import { normalizeSynonyms } from "./voice/normalizeSynonyms";
import { parseVoiceText } from "../voice/parseVoiceText";

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
  connection_type,
  installation_type,
  actuator_type,
} from "./data/dictionaries";
export const VOICE_MIDSTREAM = {
  input: "rawVoiceText",

  pipeline: [parseVoiceText, normalizeVoiceResult, normalizeSynonyms],

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
    "actuator_type",
    "connection_type",
    "installation_type",
  ],
};
export const SEMANTIC_MIDSTREAM = {
  leak_cause: cause,
  leak_description: description,
  technological_solution: solutions,
  repair_recommendation: recommendations,
  actuator_type: actuator_type,
  installation_type: installation_type,
  connection_type: connection_type,
};
export const SYSTEM_MIDSTREAM = {
  numeric: NUMBER_FIELDS,
  copyable: COPYABLE_FIELDS,
  search: SEARCH_FIELDS,
  lossy: ["rawVoiceText", "note"],
  fields: FIELDS,
};

export const EXPORT_MIDSTREAM = {
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
export const STEP_MIDSTREAM = {
  mode: "manual",
  steps: STEPS,
};
export const MIDSTREAM_CONFIG = Object.freeze({
  steps: STEP_MIDSTREAM,
  voice: VOICE_MIDSTREAM,
  semantic: SEMANTIC_MIDSTREAM,
  system: SYSTEM_MIDSTREAM,
  export: EXPORT_MIDSTREAM,
});

export default MIDSTREAM_CONFIG;
