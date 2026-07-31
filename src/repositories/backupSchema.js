const VALID_STATUSES = new Set(["open", "in_progress", "resolved"]);
const VALID_PROJECT_TYPES = new Set(["upstream", "midstream", "downstream"]);
const MAX_BACKUP_RECORDS = 100_000;
const MAX_COLLECTION_ITEMS = 20_000;
const MAX_NESTING_DEPTH = 20;
const MAX_STRING_LENGTH = 1_000_000;
const MAX_NODES_PER_RECORD = 50_000;

function getComplexityIssue(value, depth = 0, state = { nodes: 0 }) {
  state.nodes += 1;
  if (state.nodes > MAX_NODES_PER_RECORD) return "Record is too complex";
  if (depth > MAX_NESTING_DEPTH) return "Record nesting is too deep";
  if (typeof value === "string" && value.length > MAX_STRING_LENGTH) {
    return "String value is too long";
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_COLLECTION_ITEMS) return "Array is too large";
    for (const item of value) {
      const issue = getComplexityIssue(item, depth + 1, state);
      if (issue) return issue;
    }
    return null;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.length > MAX_COLLECTION_ITEMS) return "Object is too large";
    for (const [, nested] of entries) {
      const issue = getComplexityIssue(nested, depth + 1, state);
      if (issue) return issue;
    }
  }
  return null;
}

function isPlainObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isSafeZipPhotoPath(value) {
  if (!value.startsWith("zip:")) return false;
  const relativePath = value.slice("zip:".length);
  if (!relativePath.startsWith("photos/") || relativePath.includes("\\")) {
    return false;
  }
  const segments = relativePath.split("/");
  return segments.every(
    (segment) => segment.length > 0 && segment !== "." && segment !== "..",
  );
}

export function isValidPortablePhotoPath(value) {
  if (typeof value !== "string") return false;
  return (
    isSafeZipPhotoPath(value) ||
    /^data:image\/[a-z0-9.+-]+;base64,/i.test(value)
  );
}

function isValidPhotoPath(value) {
  return value == null || isValidPortablePhotoPath(value);
}

function pushIssue(issues, path, message) {
  issues.push({ path, message });
}

function validateLeakRecord(record, index) {
  const issues = [];

  if (!isPlainObject(record)) {
    pushIssue(issues, [index], "Expected object");
    return { ok: false, issues };
  }

  const complexityIssue = getComplexityIssue(record);
  if (complexityIssue) {
    pushIssue(issues, [index], complexityIssue);
    return { ok: false, issues };
  }

  if (!(typeof record.id === "string" || typeof record.id === "number")) {
    pushIssue(issues, [index, "id"], "Expected string or number");
  } else if (typeof record.id === "string" && record.id.length === 0) {
    pushIssue(
      issues,
      [index, "id"],
      "String must contain at least 1 character",
    );
  }

  if (record.lat != null && !isFiniteNumber(record.lat)) {
    pushIssue(issues, [index, "lat"], "Expected finite number");
  }

  if (record.lng != null && !isFiniteNumber(record.lng)) {
    pushIssue(issues, [index, "lng"], "Expected finite number");
  }

  if (record.status !== undefined && !VALID_STATUSES.has(record.status)) {
    pushIssue(
      issues,
      [index, "status"],
      "Invalid option: expected one of open|in_progress|resolved",
    );
  }

  if (
    record.leak_id !== undefined &&
    record.leak_id !== null &&
    typeof record.leak_id !== "string" &&
    typeof record.leak_id !== "number"
  ) {
    pushIssue(issues, [index, "leak_id"], "Expected string or number");
  }

  if (
    record.component !== undefined &&
    record.component !== null &&
    typeof record.component !== "string"
  ) {
    pushIssue(issues, [index, "component"], "Expected string");
  }

  if (
    record.leak_description !== undefined &&
    record.leak_description !== null &&
    typeof record.leak_description !== "string"
  ) {
    pushIssue(issues, [index, "leak_description"], "Expected string");
  }

  if (!isValidPhotoPath(record.photo)) {
    pushIssue(issues, [index, "photo"], "Недопустимый формат пути к фото");
  }

  if (!isValidPhotoPath(record.photo_after)) {
    pushIssue(
      issues,
      [index, "photo_after"],
      "Недопустимый формат пути к фото",
    );
  }

  if (!isValidPhotoPath(record.photo_repair)) {
    pushIssue(
      issues,
      [index, "photo_repair"],
      "Недопустимый формат пути к фото",
    );
  }

  for (const collectionName of ["monitoringRecords", "history"]) {
    const collection = record[collectionName];
    if (collection == null) continue;
    if (!Array.isArray(collection)) {
      pushIssue(issues, [index, collectionName], "Expected array");
      continue;
    }
    collection.forEach((item, itemIndex) => {
      if (!isPlainObject(item)) {
        pushIssue(
          issues,
          [index, collectionName, itemIndex],
          "Expected object",
        );
      }
    });
  }

  if (Array.isArray(record.monitoringRecords)) {
    record.monitoringRecords.forEach((monitoringRecord, monitoringIndex) => {
      if (
        isPlainObject(monitoringRecord) &&
        monitoringRecord.photo != null &&
        !isValidPortablePhotoPath(monitoringRecord.photo)
      ) {
        pushIssue(
          issues,
          [index, "monitoringRecords", monitoringIndex, "photo"],
          "Недопустимый формат пути к фото",
        );
      }
    });
  }

  if (issues.length) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    data: {
      ...record,
      status: record.status ?? "open",
    },
  };
}

function validateMetaProject(project) {
  const issues = [];

  if (!isPlainObject(project)) {
    pushIssue(issues, ["project"], "Expected object");
    return { ok: false, issues };
  }

  if (typeof project.name !== "string" || project.name.trim().length === 0) {
    pushIssue(issues, ["project", "name"], "Expected non-empty string");
  }

  if (!VALID_PROJECT_TYPES.has(project.type)) {
    pushIssue(
      issues,
      ["project", "type"],
      "Invalid option: expected one of upstream|midstream|downstream",
    );
  }

  if (
    project.folderName !== undefined &&
    typeof project.folderName !== "string"
  ) {
    pushIssue(issues, ["project", "folderName"], "Expected string");
  }

  if (
    project.syncId !== undefined &&
    (typeof project.syncId !== "string" || project.syncId.trim().length < 8)
  ) {
    pushIssue(issues, ["project", "syncId"], "Expected identifier string");
  }

  return issues.length ? { ok: false, issues } : { ok: true };
}

function formatIssues(prefix, issues) {
  const message = issues
    .slice(0, 3)
    .map((issue) => {
      const path = issue.path.length ? `[${issue.path.join(".")}]` : "корень";
      return `${path}: ${issue.message}`;
    })
    .join("; ");

  return `${prefix}: ${message}`;
}

export function validateBackup(parsed) {
  if (!Array.isArray(parsed)) {
    return { ok: false, error: "Ожидается массив JSON" };
  }
  if (parsed.length > MAX_BACKUP_RECORDS) {
    return {
      ok: false,
      error: `Backup contains more than ${MAX_BACKUP_RECORDS} records`,
    };
  }

  const normalized = [];
  const issues = [];
  const seenIds = new Set();

  parsed.forEach((record, index) => {
    const result = validateLeakRecord(record, index);
    if (result.ok) {
      const canonicalId = String(result.data.id);
      if (seenIds.has(canonicalId)) {
        pushIssue(
          issues,
          [index, "id"],
          `Duplicate canonical leak id "${canonicalId}"`,
        );
        return;
      }
      seenIds.add(canonicalId);
      normalized.push(result.data);
    } else {
      issues.push(...result.issues);
    }
  });

  if (issues.length) {
    return {
      ok: false,
      error: formatIssues("Невалидная структура backup", issues),
    };
  }

  return { ok: true, data: normalized };
}

export function validateBackupRecovery(parsed) {
  if (!Array.isArray(parsed)) {
    return { ok: false, error: "Ожидается массив recovery-записей" };
  }
  if (parsed.length > MAX_BACKUP_RECORDS) {
    return {
      ok: false,
      error: `Recovery payload contains more than ${MAX_BACKUP_RECORDS} records`,
    };
  }

  for (const [index, record] of parsed.entries()) {
    const complexityIssue = getComplexityIssue(record);
    if (complexityIssue) {
      return {
        ok: false,
        error: formatIssues("Невалидная структура recovery backup", [
          { path: [index], message: complexityIssue },
        ]),
      };
    }
  }

  return { ok: true, data: parsed };
}

export function validateProjectBackupMeta(parsed) {
  if (!isPlainObject(parsed)) {
    return {
      ok: false,
      error: "Невалидная структура project.json: [корень]: Expected object",
    };
  }

  const issues = [];

  if (
    parsed.schemaVersion !== undefined &&
    (!Number.isInteger(parsed.schemaVersion) || parsed.schemaVersion < 0)
  ) {
    pushIssue(issues, ["schemaVersion"], "Expected integer");
  }

  if (
    parsed.exportedAt !== undefined &&
    typeof parsed.exportedAt !== "string"
  ) {
    pushIssue(issues, ["exportedAt"], "Expected string");
  }

  const projectResult = validateMetaProject(parsed.project);
  if (!projectResult.ok) {
    issues.push(...projectResult.issues);
  }

  if (parsed.vars !== undefined && !isPlainObject(parsed.vars)) {
    pushIssue(issues, ["vars"], "Expected object");
  }

  if (parsed.settings !== undefined) {
    if (!isPlainObject(parsed.settings)) {
      pushIssue(issues, ["settings"], "Expected object");
    } else {
      if (
        parsed.settings.hiddenFields !== undefined &&
        (!Array.isArray(parsed.settings.hiddenFields) ||
          parsed.settings.hiddenFields.some(
            (key) => typeof key !== "string" || key.length === 0,
          ))
      ) {
        pushIssue(
          issues,
          ["settings", "hiddenFields"],
          "Expected string array",
        );
      }
      if (
        parsed.settings.excelMonitoringExportMode !== undefined &&
        !["full", "latest_per_round"].includes(
          parsed.settings.excelMonitoringExportMode,
        )
      ) {
        pushIssue(
          issues,
          ["settings", "excelMonitoringExportMode"],
          "Invalid Excel monitoring export mode",
        );
      }
      if (parsed.settings.photoRequirements !== undefined) {
        if (!isPlainObject(parsed.settings.photoRequirements)) {
          pushIssue(
            issues,
            ["settings", "photoRequirements"],
            "Expected object",
          );
        } else {
          for (const key of ["leakPhotoRequired", "monitoringPhotoRequired"]) {
            if (
              parsed.settings.photoRequirements[key] !== undefined &&
              typeof parsed.settings.photoRequirements[key] !== "boolean"
            ) {
              pushIssue(
                issues,
                ["settings", "photoRequirements", key],
                "Expected boolean",
              );
            }
          }
        }
      }
      if (
        parsed.settings.updatedAt !== undefined &&
        (!Number.isFinite(Number(parsed.settings.updatedAt)) ||
          Number(parsed.settings.updatedAt) < 0)
      ) {
        pushIssue(issues, ["settings", "updatedAt"], "Expected timestamp");
      }
    }
  }

  if (parsed.monitoringRound !== undefined) {
    if (!isPlainObject(parsed.monitoringRound)) {
      pushIssue(issues, ["monitoringRound"], "Expected object");
    } else {
      if (!parsed.monitoringRound.id) {
        pushIssue(issues, ["monitoringRound", "id"], "Expected non-empty id");
      }
      if (typeof parsed.monitoringRound.startedAt !== "string") {
        pushIssue(issues, ["monitoringRound", "startedAt"], "Expected string");
      }
      if (
        parsed.monitoringRound.completedAt !== undefined &&
        typeof parsed.monitoringRound.completedAt !== "string"
      ) {
        pushIssue(
          issues,
          ["monitoringRound", "completedAt"],
          "Expected string",
        );
      }
      if (
        parsed.monitoringRound.number !== undefined &&
        (!Number.isFinite(Number(parsed.monitoringRound.number)) ||
          Number(parsed.monitoringRound.number) <= 0)
      ) {
        pushIssue(
          issues,
          ["monitoringRound", "number"],
          "Expected positive number",
        );
      }
    }
  }

  if (parsed.sync !== undefined) {
    if (!isPlainObject(parsed.sync)) {
      pushIssue(issues, ["sync"], "Expected object");
    } else {
      if (
        parsed.sync.version !== undefined &&
        (!Number.isSafeInteger(Number(parsed.sync.version)) ||
          Number(parsed.sync.version) < 1 ||
          Number(parsed.sync.version) > 2)
      ) {
        pushIssue(issues, ["sync", "version"], "Expected version 1 or 2");
      }
      if (
        parsed.sync.generation !== undefined &&
        (!Number.isSafeInteger(Number(parsed.sync.generation)) ||
          Number(parsed.sync.generation) < 0)
      ) {
        pushIssue(
          issues,
          ["sync", "generation"],
          "Expected non-negative generation",
        );
      }
      if (
        parsed.sync.epochId !== undefined &&
        (typeof parsed.sync.epochId !== "string" ||
          !/^[a-z0-9][a-z0-9._:-]{5,127}$/i.test(parsed.sync.epochId.trim()))
      ) {
        pushIssue(issues, ["sync", "epochId"], "Expected epoch identifier");
      }
      if (
        parsed.sync.compactedAt !== undefined &&
        (!Number.isFinite(Number(parsed.sync.compactedAt)) ||
          Number(parsed.sync.compactedAt) < 0)
      ) {
        pushIssue(issues, ["sync", "compactedAt"], "Expected timestamp");
      }
      if (
        parsed.sync.varsUpdatedAt !== undefined &&
        (!Number.isFinite(Number(parsed.sync.varsUpdatedAt)) ||
          Number(parsed.sync.varsUpdatedAt) < 0)
      ) {
        pushIssue(issues, ["sync", "varsUpdatedAt"], "Expected timestamp");
      }
      if (
        parsed.sync.deleted !== undefined &&
        !isPlainObject(parsed.sync.deleted)
      ) {
        pushIssue(issues, ["sync", "deleted"], "Expected object");
      } else if (parsed.sync.deleted) {
        for (const [identity, deletedAt] of Object.entries(
          parsed.sync.deleted,
        )) {
          if (
            !identity ||
            !Number.isFinite(Number(deletedAt)) ||
            Number(deletedAt) <= 0
          ) {
            pushIssue(
              issues,
              ["sync", "deleted", identity],
              "Expected positive timestamp",
            );
          }
        }
      }
    }
  }

  if (issues.length) {
    return {
      ok: false,
      error: formatIssues("Невалидная структура project.json", issues),
    };
  }

  return { ok: true, data: parsed };
}
