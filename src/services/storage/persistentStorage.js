import { globalScope } from "@/utils/globalScope";
let persistenceRequest = /** @type {Promise<boolean>|null} */ (null);

export async function requestPersistentStorage() {
  const storage = globalScope.navigator?.storage;
  if (!storage?.persist) {
    return { supported: false, persisted: false };
  }
  if (!persistenceRequest) {
    persistenceRequest = Promise.resolve(storage.persist()).then(Boolean);
  }
  const persisted = await persistenceRequest;
  let estimate = /** @type {StorageEstimate|null} */ (null);
  try {
    estimate = storage.estimate ? await storage.estimate() : null;
  } catch {
    // Persistence status remains useful even if quota estimation is blocked.
  }
  return { supported: true, persisted, estimate };
}

export function resetPersistentStorageRequestForTests() {
  persistenceRequest = null;
}
