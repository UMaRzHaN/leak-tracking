export const LANGUAGE_STORAGE_KEY = "app_language";
const DEFAULT_LANGUAGE = "ru";

const INTL_LOCALES = {
  ru: "ru-RU",
  en: "en-US",
};

const SPEECH_LOCALES = {
  ru: "ru-RU",
  en: "en-US",
};

const RELATIVE_TIME_DEFAULTS = {
  ru: {
    justNow: "только что",
  },
  en: {
    justNow: "just now",
  },
};

function normalizeLanguage(language) {
  const candidate = String(language ?? "")
    .trim()
    .toLowerCase()
    .split("-")[0];

  return candidate && INTL_LOCALES[candidate] ? candidate : DEFAULT_LANGUAGE;
}

export function readStoredLanguage() {
  return normalizeLanguage(localStorage.getItem(LANGUAGE_STORAGE_KEY));
}

export function getAppLanguage(language) {
  return normalizeLanguage(language ?? readStoredLanguage());
}

export function getIntlLocale(language) {
  return INTL_LOCALES[getAppLanguage(language)];
}

export function getSpeechLocale(language) {
  return SPEECH_LOCALES[getAppLanguage(language)];
}

export function formatNumber(value, options = {}, language) {
  return new Intl.NumberFormat(getIntlLocale(language), options).format(
    Number(value),
  );
}

export function formatCompactNumber(value, options = {}, language) {
  return formatNumber(
    value,
    {
      notation: "compact",
      ...options,
    },
    language,
  );
}

export function formatDate(value, options = {}, language) {
  if (!value) return "";

  return new Intl.DateTimeFormat(getIntlLocale(language), options).format(
    new Date(value),
  );
}

function parseStoredDate(value) {
  if (value == null) return null;

  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null;
  }

  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  }

  const raw = String(value).trim();
  if (!raw) return null;

  const direct = new Date(raw);
  if (Number.isFinite(direct.getTime())) return direct;

  const match = raw.match(
    /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:[ T](\d{1,2}):(\d{2}))?$/,
  );
  if (!match) return null;

  const [, day, month, year, hours = "0", minutes = "0"] = match;
  const parsed = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hours),
    Number(minutes),
  );

  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

export function formatLeakDate(value, options = {}, language) {
  const parsed = parseStoredDate(value);
  if (!parsed) return value == null ? "" : String(value);

  return new Intl.DateTimeFormat(getIntlLocale(language), options).format(
    parsed,
  );
}

export function formatRelativeTime(
  value,
  { language, maxDays = 7, now = Date.now() } = {},
) {
  if (!value) return null;

  const target = new Date(value).getTime();
  if (!Number.isFinite(target)) return null;

  const diff = target - now;
  if (diff > 0) return null;

  const abs = Math.abs(diff);
  const dayMs = 86_400_000;
  if (abs >= maxDays * dayMs) return null;

  const lang = getAppLanguage(language);
  if (abs < 60_000) {
    return RELATIVE_TIME_DEFAULTS[lang].justNow;
  }

  const rtf = new Intl.RelativeTimeFormat(getIntlLocale(lang), {
    numeric: "always",
    style: "short",
  });

  if (abs < 3_600_000) {
    return rtf.format(-Math.floor(abs / 60_000), "minute");
  }

  if (abs < dayMs) {
    return rtf.format(-Math.floor(abs / 3_600_000), "hour");
  }

  return rtf.format(-Math.floor(abs / dayMs), "day");
}
