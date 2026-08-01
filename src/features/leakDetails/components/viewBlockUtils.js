import { formatLeakDate } from "@/utils/locale";

export const ACTION_ICONS = {
  created: "✦",
  status_changed: "⇄",
  edited: "✎",
  comment: "💬",
  monitoring: "M",
};

export const STATUS_COLORS = {
  open: "var(--c-open)",
  in_progress: "var(--c-progress)",
  resolved: "var(--c-resolved)",
};

export const IDENTIFIER_KEYS = new Set(["leak_id", "video_id"]);

export function fmtDate(iso, lang) {
  if (!iso) return "";
  return new Date(iso).toLocaleString(lang === "ru" ? "ru-RU" : "en-US", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function relativeTime(iso, lang) {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return null;
  if (diff < 60_000) return lang === "ru" ? "только что" : "just now";
  if (diff < 3_600_000) {
    const n = Math.floor(diff / 60_000);
    return lang === "ru" ? `${n} мин назад` : `${n} min ago`;
  }
  if (diff < 86_400_000) {
    const n = Math.floor(diff / 3_600_000);
    return lang === "ru" ? `${n} ч назад` : `${n} h ago`;
  }
  if (diff < 7 * 86_400_000) {
    const n = Math.floor(diff / 86_400_000);
    return lang === "ru" ? `${n} дн назад` : `${n} d ago`;
  }
  return null;
}

export function translateFieldLabel(key, fallbackLabel, t, lang) {
  const explicitLabels = {
    date: lang === "ru" ? "Дата" : "Date",
    lat: lang === "ru" ? "Широта (X)" : "Latitude (X)",
    lng: lang === "ru" ? "Долгота (Y)" : "Longitude (Y)",
  };
  return t(`addLeak.fields.${key}.label`, {
    defaultValue: explicitLabels[key] ?? fallbackLabel,
  });
}

export function formatHistoryValue(key, value, kind, lang) {
  if (kind === "photo") {
    return value
      ? lang === "ru"
        ? "фото есть"
        : "photo"
      : lang === "ru"
        ? "нет фото"
        : "no photo";
  }
  if (value == null || value === "") return lang === "ru" ? "пусто" : "empty";
  if (value === "[changed]") return lang === "ru" ? "изменено" : "changed";
  if (key === "date") return formatLeakDate(value, {}, lang);
  if (IDENTIFIER_KEYS.has(key)) return String(value);
  if (typeof value === "number") {
    return value.toLocaleString(lang === "ru" ? "ru-RU" : "en-US");
  }
  return String(value);
}

export function getHistoryChangeLabel(change, fields, localeTexts, t, lang) {
  if (change.key === "photo") return localeTexts.photo.before;
  if (change.key === "photo_after") return localeTexts.photo.after;
  if (change.key === "photo_repair") return localeTexts.photo.repair;
  if (change.key === "priority") return localeTexts.priority;
  if (change.key === "materials_equipment") {
    return lang === "ru" ? "МТР" : "Materials and equipment";
  }
  const field = fields.find((item) => item.key === change.key);
  return translateFieldLabel(change.key, field?.label ?? change.key, t, lang);
}
