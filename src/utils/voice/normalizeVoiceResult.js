import { PROJECT_LOCATION_CONFIG } from "../../configs/projectLocation.config";

export function normalizeVoiceResult(raw, PROJECT) {
  if (!raw) return {};

  const config = PROJECT_LOCATION_CONFIG[PROJECT];
  if (!config) return raw;

  const result = { ...raw };

  // 1️⃣ main → project.main (field)
  if (raw.main) {
    result[config.main] = raw.main;
    delete result.main;
  }

  // 2️⃣ field → project.field (station)
  if (raw.secondary) {
    result[config.secondary] = raw.secondary;
    delete result.secondary;
  }

  // 3️⃣ location → project.location (location)
  if (raw.last) {
    result[config.last] = raw.last;
    delete result.last;
  }

  return result;
}
