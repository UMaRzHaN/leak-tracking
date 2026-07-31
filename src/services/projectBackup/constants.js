export const PHOTO_KEYS = ["photo", "photo_after", "photo_repair"];
export const MONITORING_PHOTO_KEY = "photo";
export const RECOVERY_RECORDS_FILE = "recovery-invalid-records.json";

export const TYPE_SIGNATURES = {
  midstream: ["station", "field"],
  upstream: ["subdivision", "deposit"],
  downstream: ["district", "locality", "address"],
};

export const EXPORT_YIELD_EVERY = 25;
export const EXPORT_CONCURRENCY = 8;
export const IMPORT_CONCURRENCY = 3;
