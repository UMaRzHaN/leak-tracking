/**
 * The on-disk shape of a web project copy: how an envelope is checksummed,
 * validated, versioned and ordered against another copy.
 *
 * Deliberately free of any storage knowledge — nothing here is aware of
 * IndexedDB, localStorage or which copy a value came from. That belongs to
 * webProjectEnvelopeStore.js, which reads and writes these envelopes.
 */

const WEB_ENVELOPE_VERSION = 1;

// Marks an envelope written before revisions existed, whose ordering against
// another copy therefore cannot be trusted.
export const LEGACY_WEB_ENVELOPE = Symbol("legacyWebEnvelope");

let lastIssuedWebRevision = 0;

function checksumWebPayload(data, deleted, syncState = null) {
  const value = JSON.stringify({
    deleted: Boolean(deleted),
    data,
    ...(syncState == null ? {} : { syncState }),
  });
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function normalizeWebEnvelope(value, source) {
  if (value == null) return null;

  // Backward compatibility for data written before mirrored revisions existed.
  if (Array.isArray(value)) {
    const envelope = {
      version: 0,
      revision: 0,
      updatedAt: 0,
      deleted: false,
      checksum: checksumWebPayload(value, false),
      data: value,
      syncState: null,
    };
    Object.defineProperty(envelope, LEGACY_WEB_ENVELOPE, {
      value: true,
    });
    return envelope;
  }

  const deleted = value.deleted === true;
  const data = deleted && value.data == null ? [] : value.data;
  const syncState = value.syncState ?? null;
  if (!Array.isArray(data)) {
    throw new TypeError(`Expected a data array in ${source}`);
  }

  const revision = Number(value.revision ?? value.timestamp ?? 0);
  const updatedAt = Number(value.updatedAt ?? value.timestamp ?? 0);
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw new TypeError(`Invalid revision in ${source}`);
  }
  if (!Number.isFinite(updatedAt) || updatedAt < 0) {
    throw new TypeError(`Invalid updatedAt in ${source}`);
  }

  const expectedChecksum = checksumWebPayload(data, deleted, syncState);
  if (value.checksum != null && value.checksum !== expectedChecksum) {
    throw new TypeError(`Checksum mismatch in ${source}`);
  }

  const envelope = {
    version: Number(value.version ?? 0),
    revision,
    updatedAt,
    deleted,
    checksum: expectedChecksum,
    data,
    syncState,
  };
  if (value.version == null && value.revision == null) {
    Object.defineProperty(envelope, LEGACY_WEB_ENVELOPE, { value: true });
  }
  return envelope;
}

// Takes the revisions themselves, not the envelopes carrying them: this is
// all the ordering needs, and asking for whole envelopes would oblige callers
// to read a project's entire payload to supply one number.
function nextWebRevision(previousRevisions = []) {
  const knownRevision = previousRevisions.reduce(
    (maximum, revision) => Math.max(maximum, revision ?? 0),
    0,
  );
  const clockRevision = Date.now() * 1000;
  lastIssuedWebRevision = Math.max(
    clockRevision,
    knownRevision + 1,
    lastIssuedWebRevision + 1,
  );
  return lastIssuedWebRevision;
}

export function createWebEnvelope(
  data,
  { deleted = false, previousRevisions = [], syncState = null } = {},
) {
  const revision = nextWebRevision(previousRevisions);
  const updatedAt = Date.now();
  return {
    version: WEB_ENVELOPE_VERSION,
    revision,
    updatedAt,
    deleted,
    checksum: checksumWebPayload(data, deleted, syncState),
    data,
    ...(syncState == null ? {} : { syncState }),
  };
}

export function compareWebEnvelopes(left, right) {
  if (left.revision !== right.revision) return left.revision - right.revision;
  if (left.updatedAt !== right.updatedAt)
    return left.updatedAt - right.updatedAt;
  return 0;
}

export function sameWebEnvelope(left, right) {
  return (
    left?.revision === right?.revision &&
    left?.deleted === right?.deleted &&
    left?.checksum === right?.checksum
  );
}
