import { PROJECT_LOCATION_CONFIG } from "../../projectLocation.config";

const PROJECT = "upstream";

export function normalizeVoiceResult(raw) {
  if (!raw) return {};

  const config = PROJECT_LOCATION_CONFIG[PROJECT];
  if (!config) return raw;

  const result = { ...raw };

  /**
   * raw:
   *  - main      → верхний уровень (УМГ / район)
   *  - field     → объект проекта (семантический)
   *  - location  → произвольная локация
   *
   * midstream:
   *  main      → field
   *  field     → station
   *  location  → location
   */

  // 1️⃣ main → project.main (field)
  if (raw.main) {
    result[config.main] = raw.main; // field
    delete result.main;
  }

  // 2️⃣ field → project.field (station)
  if (raw.secondary) {
    result[config.secondary] = raw.secondary; // station
    delete result.secondary;
  }

  // 3️⃣ location → project.location (location)
  if (raw.last) {
    result[config.last] = raw.last;
    delete result.last;
  }

  return result;
}
