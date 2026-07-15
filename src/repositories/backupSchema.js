const VALID_STATUSES = new Set(["open", "in_progress", "resolved"]);
const VALID_PROJECT_TYPES = new Set(["upstream", "midstream", "downstream"]);

function isPlainObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isValidPhotoPath(value) {
  return (
    value == null ||
    (typeof value === "string" &&
      (value.startsWith("idb://") ||
        value.startsWith("data://") ||
        value.startsWith("zip:") ||
        value.startsWith("data:image/") ||
        value.startsWith("Documents/")))
  );
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

  if (typeof project.name !== "string" || project.name.length === 0) {
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

  const normalized = [];
  const issues = [];

  parsed.forEach((record, index) => {
    const result = validateLeakRecord(record, index);
    if (result.ok) {
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
