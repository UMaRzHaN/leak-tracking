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

  it("is ready immediately and prewarms the project photo folder", async () => {
    const { result } = renderHook(() => usePhotoStorage());

    expect(result.current.ready).toBe(true);
    expect(idbOpen).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(prepare).toHaveBeenCalledWith({ folderName: "project_one" });
    });
  });
});
