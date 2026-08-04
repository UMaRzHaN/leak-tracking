import { fieldLabel } from "@/utils/fieldLabels";
import { formatLeakDate, getIntlLocale } from "@/utils/locale";

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
  return new Date(iso).toLocaleString(getIntlLocale(lang), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function relativeTime(iso, t) {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return null;
  if (diff < 60_000) return t("leakDetails.relativeTime.justNow");
  if (diff < 3_600_000) {
    return t("leakDetails.relativeTime.minutesAgo", {
      count: Math.floor(diff / 60_000),
    });
  }
  if (diff < 86_400_000) {
    return t("leakDetails.relativeTime.hoursAgo", {
      count: Math.floor(diff / 3_600_000),
    });
  }
  if (diff < 7 * 86_400_000) {
    return t("leakDetails.relativeTime.daysAgo", {
      count: Math.floor(diff / 86_400_000),
    });
  }
  return null;
}

export function formatHistoryValue(key, value, kind, t, lang) {
  if (kind === "photo") {
    return value ? t("leakDetails.hasPhoto") : t("leakDetails.photo.noPhoto");
  }
  if (value == null || value === "") return t("leakDetails.valueEmpty");
  if (value === "[changed]") return t("leakDetails.valueChanged");
  if (key === "date") return formatLeakDate(value, {}, lang);
  if (IDENTIFIER_KEYS.has(key)) return String(value);
  if (typeof value === "number") {
    return value.toLocaleString(getIntlLocale(lang));
  }
  return String(value);
}

export function getHistoryChangeLabel(change, fields, localeTexts, t) {
  if (change.key === "photo") return localeTexts.photo.before;
  if (change.key === "photo_after") return localeTexts.photo.after;
  if (change.key === "photo_repair") return localeTexts.photo.repair;
  if (change.key === "priority") return localeTexts.priority;
  if (change.key === "materials_equipment") {
    return t("leakDetails.materials");
  }
  const field = fields.find((item) => item.key === change.key);
  return fieldLabel(change.key, t, field?.label ?? change.key);
}
