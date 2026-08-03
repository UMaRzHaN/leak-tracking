import { afterEach, describe, expect, it, vi } from "vitest";
import {
  requestPersistentStorage,
  resetPersistentStorageRequestForTests,
} from "./persistentStorage";

describe("requestPersistentStorage", () => {
  afterEach(() => {
    resetPersistentStorageRequestForTests();
    vi.unstubAllGlobals();
  });

  it("requests persistence once and returns quota information", async () => {
    const persist = vi.fn().mockResolvedValue(true);
    vi.stubGlobal("navigator", {
      storage: {
        persist,
        estimate: vi.fn().mockResolvedValue({ usage: 10, quota: 100 }),
      },
    });

    await expect(requestPersistentStorage()).resolves.toEqual({
      supported: true,
      persisted: true,
      estimate: { usage: 10, quota: 100 },
    });
    await requestPersistentStorage();
    expect(persist).toHaveBeenCalledOnce();
  });
});
