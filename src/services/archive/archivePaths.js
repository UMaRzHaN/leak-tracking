const MAX_ARCHIVE_SEGMENT_LENGTH = 120;

const WINDOWS_RESERVED_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;
const FORBIDDEN_FILENAME_CHARACTERS = new Set([
  "<",
  ">",
  ":",
  '"',
  "/",
  "\\",
  "|",
  "?",
  "*",
]);

const PHOTO_FILE_STEMS = {
  photo: "before",
  photo_after: "after",
  photo_repair: "repair",
};

const IMAGE_EXTENSION_ALIASES = {
  jpeg: "jpg",
  "svg+xml": "svg",
  "x-icon": "ico",
  "vnd.microsoft.icon": "ico",
};

function isControlCharacter(character) {
  const codePoint = character.codePointAt(0);
  return codePoint <= 31 || codePoint === 127;
}

function trimUnsafeEdges(value) {
  return value.replace(/^\.+/, "").replace(/[. ]+$/, "");
}

function limitSegmentWithSuffix(base, suffix) {
  const safeSuffix = String(suffix);
  const availableLength = Math.max(
    1,
    MAX_ARCHIVE_SEGMENT_LENGTH - safeSuffix.length,
  );
  const limitedBase = trimUnsafeEdges(base.slice(0, availableLength)) || "leak";
  return `${limitedBase}${safeSuffix}`;
}

function foldArchiveSegment(value) {
  return String(value).normalize("NFKC").toLowerCase();
}

export function sanitizePortableArchiveSegment(value) {
  const source = String(value ?? "").trim();
  let sanitized = "";

  for (const character of source) {
    sanitized +=
      isControlCharacter(character) ||
      FORBIDDEN_FILENAME_CHARACTERS.has(character)
        ? "-"
        : character;
  }

  sanitized = trimUnsafeEdges(sanitized.replace(/\.{2,}/g, "."))
    .replace(/-{2,}/g, "-")
    .slice(0, MAX_ARCHIVE_SEGMENT_LENGTH);
  sanitized = trimUnsafeEdges(sanitized);

  if (!sanitized || sanitized === "." || sanitized === "..") return null;
  if (WINDOWS_RESERVED_NAME.test(sanitized)) {
    sanitized = `_${sanitized}`.slice(0, MAX_ARCHIVE_SEGMENT_LENGTH);
  }
  return sanitized;
}

export function allocateUniqueLeakArchiveSegments(
  leaks,
  // `identity` exists for the component registry: its records are numbered by
  // `component_uid`, not `leak_id`, and the collision handling below — folding,
  // the `~id` suffix, the length limit — is the same problem either way.
  {
    prefix = "leak",
    reservedSegments = [],
    identity = (leak) => leak?.leak_id,
  } = {},
) {
  const usedSegments = new Set(
    reservedSegments.map((segment) => foldArchiveSegment(segment)),
  );

  return (Array.isArray(leaks) ? leaks : []).map((leak, index) => {
    const baseSegment =
      sanitizePortableArchiveSegment(identity(leak)) ||
      `${prefix}-${index + 1}`;
    let candidate = baseSegment;

    if (!usedSegments.has(foldArchiveSegment(candidate))) {
      usedSegments.add(foldArchiveSegment(candidate));
      return candidate;
    }

    const stableIdentity = (
      sanitizePortableArchiveSegment(leak?.id) || String(index + 1)
    ).slice(0, 48);
    const identitySuffix = `~${stableIdentity}`;
    candidate = limitSegmentWithSuffix(baseSegment, identitySuffix);

    let duplicateNumber = 2;
    while (usedSegments.has(foldArchiveSegment(candidate))) {
      candidate = limitSegmentWithSuffix(
        baseSegment,
        `${identitySuffix}-${duplicateNumber}`,
      );
      duplicateNumber += 1;
    }

    usedSegments.add(foldArchiveSegment(candidate));
    return candidate;
  });
}

export function normalizeImageExtension(value) {
  const subtype = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^image\//, "");
  const aliased = IMAGE_EXTENSION_ALIASES[subtype] || subtype;
  const normalized = aliased.replace(/[^a-z0-9]/g, "").slice(0, 10);
  return normalized || "jpg";
}

export function parseDataImageUri(value) {
  if (typeof value !== "string") return null;
  const match = value.match(
    /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i,
  );
  if (!match) return null;

  return {
    mime: match[1].toLowerCase(),
    base64: match[2].replace(/\s+/g, ""),
    ext: normalizeImageExtension(match[1]),
  };
}

export function buildLeakPhotoArchivePath(leakSegment, photoKey, extension) {
  const fileStem = PHOTO_FILE_STEMS[photoKey];
  if (!fileStem) throw new Error(`Unsupported leak photo field: ${photoKey}`);
  return `photos/${leakSegment}/${fileStem}.${normalizeImageExtension(extension)}`;
}

export function buildMonitoringPhotoArchivePath(
  leakSegment,
  recordIndex,
  extension,
  photoKey = "photo",
) {
  const suffix = photoKey === "photo" ? "" : `-${photoKey}`;
  return `photos/${leakSegment}/monitoring/record-${recordIndex + 1}${suffix}.${normalizeImageExtension(extension)}`;
}

export function getImageMimeTypeFromExtension(extension) {
  const normalized = normalizeImageExtension(extension);
  const mimeByExtension = {
    avif: "image/avif",
    bmp: "image/bmp",
    gif: "image/gif",
    heic: "image/heic",
    heif: "image/heif",
    ico: "image/x-icon",
    jpg: "image/jpeg",
    png: "image/png",
    svg: "image/svg+xml",
    tif: "image/tiff",
    tiff: "image/tiff",
    webp: "image/webp",
  };
  return mimeByExtension[normalized] || "image/jpeg";
}
