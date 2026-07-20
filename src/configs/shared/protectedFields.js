import { SYSTEM_FIELD_KEYS } from "./fieldRegistry";

const PHOTO_FIELD_KEYS = ["photo", "photo_repair", "photo_after"];

export const PROTECTED_FIELD_KEYS = new Set([
  ...SYSTEM_FIELD_KEYS,
  ...PHOTO_FIELD_KEYS,
]);
