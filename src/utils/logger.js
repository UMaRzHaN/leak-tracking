const isDev = import.meta.env.DEV;
const isTest = import.meta.env.MODE === "test" || import.meta.env.VITEST;
const DIAGNOSTIC_KEY = "app:diagnostics_v1";
const MAX_ENTRIES = 100;

function redactText(value) {
  return String(value ?? "")
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, "[redacted-api-key]")
    .replace(/data:image\/[^;,]+;base64,[0-9A-Za-z+/=]+/g, "[redacted-image]")
    .replace(
      /\b-?\d{1,3}\.\d{4,}\s*[,;]\s*-?\d{1,3}\.\d{4,}\b/g,
      "[redacted-coordinates]",
    )
    .slice(0, 800);
}

export function redactDiagnosticValue(value) {
  if (value instanceof Error) {
    return {
      type: value.name,
      message: redactText(value.message),
      code: redactText(value.code ?? ""),
      stack: redactText(
        String(value.stack ?? "")
          .split("\n")
          .slice(0, 5)
          .join("\n"),
      ),
    };
  }
  if (typeof value === "string") return redactText(value);
  if (
    value == null ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (Array.isArray(value)) return `[array:${value.length}]`;
  if (typeof value === "object") {
    return { type: "object", keys: Object.keys(value).slice(0, 20) };
  }
  return `[${typeof value}]`;
}

function persistDiagnostic(level, args) {
  if (isTest || typeof localStorage === "undefined") return;
  try {
    const current = JSON.parse(localStorage.getItem(DIAGNOSTIC_KEY) || "[]");
    const entries = Array.isArray(current) ? current : [];
    entries.push({
      at: new Date().toISOString(),
      level,
      details: args.map(redactDiagnosticValue),
    });
    localStorage.setItem(
      DIAGNOSTIC_KEY,
      JSON.stringify(entries.slice(-MAX_ENTRIES)),
    );
  } catch {
    // Diagnostics must never interfere with the application error path.
  }
}

function emit(method, args) {
  if (!isTest && (method === "warn" || method === "error")) {
    persistDiagnostic(method, args);
  }
  if (isDev && !isTest) console[method](...args);
}

export function exportDiagnostics() {
  let entries = [];
  try {
    entries = JSON.parse(localStorage.getItem(DIAGNOSTIC_KEY) || "[]");
  } catch {
    entries = [];
  }
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      userAgent: redactText(globalThis.navigator?.userAgent ?? "unknown"),
      entries: Array.isArray(entries) ? entries : [],
    },
    null,
    2,
  );
}

export const logger = {
  log: (...args) => emit("log", args),
  warn: (...args) => emit("warn", args),
  error: (...args) => emit("error", args),
  exportDiagnostics,
};
