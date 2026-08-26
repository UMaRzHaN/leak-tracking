import { STORAGE_KEYS } from "@/app/project/storageKeys";
import { globalScope } from "@/utils/globalScope";

function createOperationId() {
  return (
    globalScope.crypto?.randomUUID?.() ??
    `import-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
  );
}

export function readImportOperation(projectId) {
  if (!projectId) return null;
  const raw = localStorage.getItem(
    STORAGE_KEYS.PROJECT_IMPORT_OPERATION(projectId),
  );
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed?.projectId === projectId ? parsed : null;
  } catch {
    return null;
  }
}

export function beginImportOperation(projectId) {
  if (!projectId) return null;
  const operation = {
    operationId: createOperationId(),
    projectId,
    phase: "preparing",
    createdPhotoPaths: [],
    updatedAt: Date.now(),
  };
  localStorage.setItem(
    STORAGE_KEYS.PROJECT_IMPORT_OPERATION(projectId),
    JSON.stringify(operation),
  );
  return operation;
}

export function updateImportOperation(operation, changes) {
  if (!operation?.projectId) return null;
  const next = { ...operation, ...changes, updatedAt: Date.now() };
  localStorage.setItem(
    STORAGE_KEYS.PROJECT_IMPORT_OPERATION(operation.projectId),
    JSON.stringify(next),
  );
  return next;
}

export function completeImportOperation(operation) {
  if (!operation?.projectId) return;
  localStorage.removeItem(
    STORAGE_KEYS.PROJECT_IMPORT_OPERATION(operation.projectId),
  );
}
