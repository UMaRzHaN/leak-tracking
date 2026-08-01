import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const prepare = vi.fn();
const idbOpen = vi.fn();

vi.mock("@/utils/platform", () => ({
  isNative: true,
}));

vi.mock("@/app/project/ProjectContext", () => ({
  useProjectData: () => ({
    activeProject: { id: "proj-1", folderName: "project_one" },
  }),
}));

vi.mock("@/repositories/PhotoRepository", () => ({
  PhotoRepository: {
    prepare,
    save: vi.fn(),
    delete: vi.fn(),
    get: vi.fn(),
    gcOrphaned: vi.fn(),
  },
}));

vi.mock("@/repositories/idb", () => ({
  idb: {
    getState: vi.fn(() => ({ ready: false })),
    subscribe: vi.fn(),
    open: idbOpen,
  },
}));

const { usePhotoStorage } = await import("./usePhotoStorage");

describe("usePhotoStorage on Android", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prepare.mockResolvedValue(undefined);
  });

  it("becomes ready only after the project photo folder is available", async () => {
    const { result } = renderHook(() => usePhotoStorage());

    expect(result.current.ready).toBe(false);
    expect(result.current.status).toBe("initializing");
    expect(idbOpen).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(prepare).toHaveBeenCalledWith({ folderName: "project_one" });
      expect(result.current.ready).toBe(true);
      expect(result.current.status).toBe("ready");
    });
  });

  it("exposes native folder preparation failures", async () => {
    const error = new Error("filesystem unavailable");
    prepare.mockRejectedValueOnce(error);
    const { result } = renderHook(() => usePhotoStorage());

    await waitFor(() => {
      expect(result.current.ready).toBe(false);
      expect(result.current.status).toBe("error");
      expect(result.current.storageError).toBe(error);
    });
  });
});
