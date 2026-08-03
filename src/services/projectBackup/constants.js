import {
  LEAK_PHOTO_FIELDS,
  MONITORING_PHOTO_FIELDS,
} from "@/utils/photoFields";

export const PHOTO_KEYS = LEAK_PHOTO_FIELDS;
export const MONITORING_PHOTO_KEYS = MONITORING_PHOTO_FIELDS;
export const MONITORING_PHOTO_KEY = MONITORING_PHOTO_FIELDS[0];
export const RECOVERY_RECORDS_FILE = "recovery-invalid-records.json";

export const TYPE_SIGNATURES = {
  midstream: ["station", "field"],
  upstream: ["subdivision", "deposit"],
  downstream: ["district", "locality", "address"],
};

export const EXPORT_YIELD_EVERY = 25;
// Higher than EXPORT_YIELD_EVERY because the unit of work is different:
// export yields between whole photos, import yields between spreadsheet rows,
// which are far cheaper. Yielding as often as the export does would cost more
// in scheduling than it buys back in responsiveness.
export const IMPORT_ROW_YIELD_EVERY = 100;
export const EXPORT_CONCURRENCY = 8;
export const IMPORT_CONCURRENCY = 3;
