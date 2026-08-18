import { createRecordId } from "@/utils/createRecordId";

/**
 * Rules for technological schemas — the P&ID sheets a walker consults while
 * filling in component cards.
 *
 * The app deliberately knows nothing about what is *drawn* on them: no
 * recognition, no hotspots, no link between a drawn position and a stored
 * record. A schema is an attachment. The connection back to a component stays
 * human — the card carries the tag copied off the drawing, and the operator
 * finds it on the sheet by eye.
 */

/** Rendered inside the app with pan and zoom. */
const IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/bmp",
  "image/tiff",
]);

const PDF_TYPE = "application/pdf";

const EXTENSION_TYPES = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  bmp: "image/bmp",
  tif: "image/tiff",
  tiff: "image/tiff",
  pdf: PDF_TYPE,
};

/**
 * A drawing this size is normal for A1 at plotting resolution, and the point
 * where a phone starts struggling to hold it in memory. Loading is still
 * allowed — refusing a drawing somebody needs is worse than a slow render —
 * but the operator is told before it happens rather than after.
 */
export const LARGE_SCHEMA_BYTES = 25 * 1024 * 1024;

export function getSchemaExtension(fileName) {
  const match = /\.([a-z0-9]+)$/i.exec(String(fileName ?? "").trim());
  return match ? match[1].toLowerCase() : "";
}

/**
 * Resolves the media type, preferring what the file itself reports and falling
 * back to its extension: Android's file picker hands back an empty type for
 * anything it does not recognise, which includes PDFs on some devices.
 */
export function resolveSchemaType(file) {
  const declared = String(file?.type ?? "").toLowerCase();
  if (IMAGE_TYPES.has(declared) || declared === PDF_TYPE) return declared;
  return EXTENSION_TYPES[getSchemaExtension(file?.name)] ?? "";
}

export function isImageSchema(schema) {
  return IMAGE_TYPES.has(String(schema?.type ?? "").toLowerCase());
}

export function isPdfSchema(schema) {
  return String(schema?.type ?? "").toLowerCase() === PDF_TYPE;
}

/** Whether the app can do anything useful with this file at all. */
export function isSupportedSchema(schema) {
  return isImageSchema(schema) || isPdfSchema(schema);
}

export function isLargeSchema(schema) {
  return Number(schema?.size ?? 0) > LARGE_SCHEMA_BYTES;
}

/**
 * Builds the index entry for a newly picked file.
 *
 * The original name is kept as the title because it is what the drawing is
 * called in the customer's own documentation — "Схема обвязки устья.pdf" says
 * more than any name the app could generate, and it is what lands in the
 * export folder later.
 */
/**
 * @param {any} file
 * @param {{location?: string, now?: number}} [options]
 */
export function createSchemaEntry(file, { location = "", now } = {}) {
  const timestamp = typeof now === "number" ? now : Date.now();
  return {
    id: createRecordId(),
    name: String(file?.name ?? "").trim() || "schema",
    type: resolveSchemaType(file),
    size: Number(file?.size ?? 0),
    addedAt: new Date(timestamp).toISOString(),
    // Purely a label for filtering the list. It creates no relation — the app
    // has no data-level knowledge of what the drawing depicts.
    location: String(location ?? "").trim(),
  };
}

/**
 * Makes a file name safe for a zip entry while keeping it recognisable, and
 * unique against names already used in the same archive folder.
 */
export function allocateSchemaFileName(name, usedNames = new Set()) {
  const raw = String(name ?? "").trim() || "schema";
  // Only the characters a filesystem actually refuses get replaced. Spaces
  // stay: "Схема обвязки устья.pdf" is what the drawing is called in the
  // customer's own documentation, and the export folder should read that way.
  const sanitized =
    raw
      // Control characters are invalid in file names on every platform.
      // eslint-disable-next-line no-control-regex
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
      .replace(/^\.+/, "")
      .replace(/[. ]+$/, "") || "schema";

  if (!usedNames.has(sanitized)) return sanitized;

  const dot = sanitized.lastIndexOf(".");
  const stem = dot > 0 ? sanitized.slice(0, dot) : sanitized;
  const extension = dot > 0 ? sanitized.slice(dot) : "";

  let counter = 2;
  let candidate = `${stem} (${counter})${extension}`;
  while (usedNames.has(candidate)) {
    counter += 1;
    candidate = `${stem} (${counter})${extension}`;
  }
  return candidate;
}

/** Human-readable size for the list and the large-file warning. */
export function formatSchemaSize(bytes) {
  const value = Number(bytes ?? 0);
  if (!Number.isFinite(value) || value <= 0) return "0 MB";
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
