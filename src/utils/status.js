import i18n from "@/i18n";

export const STATUS = {
  OPEN: "open",
  IN_PROGRESS: "in_progress",
  RESOLVED: "resolved",
};

export const STATUS_META = {
  open: {
    color: "var(--c-open)",
    bg: "var(--c-open-bg)",
    border: "var(--c-open-border)",
  },
  in_progress: {
    color: "var(--c-progress)",
    bg: "var(--c-progress-bg)",
    border: "var(--c-progress-border)",
  },
  resolved: {
    color: "var(--c-resolved)",
    bg: "var(--c-resolved-bg)",
    border: "var(--c-resolved-border)",
  },
};

export const STATUS_ORDER = [STATUS.OPEN, STATUS.IN_PROGRESS, STATUS.RESOLVED];

const STATUS_LABEL_DEFAULTS = {
  ru: {
    open: "Открыта",
    in_progress: "В работе",
    resolved: "Устранена",
  },
  en: {
    open: "Open",
    in_progress: "In progress",
    resolved: "Resolved",
  },
};

const STATUS_ACTION_DEFAULTS = {
  ru: {
    open: "Взять в работу",
    in_progress: "Устранено",
    resolved: "Переоткрыть",
    fallback: "Изменить статус",
  },
  en: {
    open: "Start progress",
    in_progress: "Mark resolved",
    resolved: "Reopen",
    fallback: "Change status",
  },
};

function getCurrentLanguage() {
  return (i18n.resolvedLanguage ?? i18n.language ?? "ru").split("-")[0];
}

function translateOrDefault(t, key, defaultValue) {
  return (t ?? i18n.t.bind(i18n))(key, { defaultValue });
}

export function getStatusLabel(status, t) {
  const lang = getCurrentLanguage();
  const normalized = status ?? STATUS.OPEN;

  return translateOrDefault(
    t,
    `leakDetails.statuses.${normalized}`,
    STATUS_LABEL_DEFAULTS[lang]?.[normalized] ??
      STATUS_LABEL_DEFAULTS.ru[normalized] ??
      normalized,
  );
}

/**
 * Production-level transition map.
 * open -> in_progress -> resolved -> open (re-open).
 * No skipping: open cannot jump to resolved directly.
 */
export const STATUS_TRANSITIONS = {
  [STATUS.OPEN]: { next: STATUS.IN_PROGRESS },
  [STATUS.IN_PROGRESS]: { next: STATUS.RESOLVED },
  [STATUS.RESOLVED]: { next: STATUS.OPEN },
};

/** Next status following the strict production workflow */
export function nextStatus(current) {
  return STATUS_TRANSITIONS[current ?? STATUS.OPEN]?.next ?? STATUS.IN_PROGRESS;
}

/** Label for the transition action button */
export function transitionLabel(current, t) {
  const lang = getCurrentLanguage();
  const normalized = current ?? STATUS.OPEN;
  const fallback =
    STATUS_ACTION_DEFAULTS[lang]?.[normalized] ??
    STATUS_ACTION_DEFAULTS.ru[normalized] ??
    STATUS_ACTION_DEFAULTS[lang]?.fallback ??
    STATUS_ACTION_DEFAULTS.ru.fallback;

  return translateOrDefault(t, `statusActions.${normalized}`, fallback);
}

export function getStatusMeta(status, t) {
  const normalized = status ?? STATUS.OPEN;
  const meta = STATUS_META[normalized] ?? STATUS_META.open;

  return {
    ...meta,
    label: getStatusLabel(normalized, t),
    short: getStatusLabel(normalized, t),
  };
}
