import { renderHook, act } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";

/* ── mocks ─────────────────────────────────────────────── */

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => false },
}));

// Component cards hold photos too; the collector has to see them or it declares
// every one an orphan on the first idle sweep after a reload.
vi.mock("@/repositories/ComponentRepository", () => ({
  ComponentRepository: { load: vi.fn(async () => componentCards.current) },
}));

const componentCards = vi.hoisted(() => ({ current: [] }));

vi.mock("@capacitor/filesystem", () => ({
  Filesystem: {},
  Directory: { Data: "DATA" },
}));

const mockIdbSave = vi.fn();
const mockIdbDelete = vi.fn();
const mockIdbGet = vi.fn();
const mockListKeys = vi.fn();
const mockGetState = vi.fn();
const mockCompressImage = vi.hoisted(() => vi.fn(async (blob) => blob));

vi.mock("../repositories/idb", () => ({
  idb: {
    getState: mockGetState,
    subscribe: vi.fn(() => vi.fn()),
    open: vi.fn(),
    save: mockIdbSave,
    remove: mockIdbDelete,
    get: mockIdbGet,
    listKeys: mockListKeys,
  },
}));

vi.mock("../app/project/ProjectContext", () => ({
  useProject: () => ({
    activeProject: { id: "proj-1", folderName: "TestProject" },
  }),
  useProjectData: () => ({
    activeProject: { id: "proj-1", folderName: "TestProject" },
  }),
}));

vi.mock("../repositories/compressImage", () => ({
  compressImage: mockCompressImage,
}));

/* ── import after mocks ────────────────────────────────── */
const { usePhotoStorage } = await import("./usePhotoStorage");
const { markPhotoPrepared } = await import("../utils/photoPreparation");

/* ── helpers ───────────────────────────────────────────── */
const makeBlob = (type = "image/jpeg") => new Blob(["data"], { type });

/* ── tests ─────────────────────────────────────────────── */

beforeEach(() => {
  vi.clearAllMocks();
  mockGetState.mockReturnValue({ ready: true });
  mockIdbSave.mockResolvedValue(true);
  mockIdbDelete.mockResolvedValue(undefined);
  mockIdbGet.mockResolvedValue(null);
  mockListKeys.mockResolvedValue([]);
});

describe("savePhoto (web path)", () => {
  it("saves blob and returns idb:// path", async () => {
    const { result } = renderHook(() => usePhotoStorage());
    let path;
    await act(async () => {
      path = await result.current.savePhoto(makeBlob(), "leak-42");
    });
    expect(path).toMatch(/^idb:\/\/photo_proj-1_leak-42_\d+$/);
    expect(mockIdbSave).toHaveBeenCalledOnce();
    expect(mockCompressImage).toHaveBeenCalledOnce();
  });

  it("does not recompress a photo already prepared by the native camera", async () => {
    const { result } = renderHook(() => usePhotoStorage());
    await act(async () => {
      await result.current.savePhoto(markPhotoPrepared(makeBlob()), "leak-43");
    });

    expect(mockIdbSave).toHaveBeenCalledOnce();
    expect(mockCompressImage).not.toHaveBeenCalled();
  });

  it("returns null when blob is missing", async () => {
    const { result } = renderHook(() => usePhotoStorage());
    let path;
    await act(async () => {
      path = await result.current.savePhoto(null, "leak-1");
    });
    expect(path).toBeNull();
    expect(mockIdbSave).not.toHaveBeenCalled();
  });

  it("returns null when leakId is missing", async () => {
    const { result } = renderHook(() => usePhotoStorage());
    let path;
    await act(async () => {
      path = await result.current.savePhoto(makeBlob(), null);
    });
    expect(path).toBeNull();
  });

  it("returns null when idbSave fails", async () => {
    mockIdbSave.mockResolvedValue(false);
    const { result } = renderHook(() => usePhotoStorage());
    let path;
    await act(async () => {
      path = await result.current.savePhoto(makeBlob(), "leak-1");
    });
    expect(path).toBeNull();
  });

  it("deletes old versions of the same leak photo", async () => {
    const oldKey = "photo_proj-1_leak-99_111";
    mockListKeys.mockResolvedValue([oldKey, "photo_other_project_leak-99_222"]);
    const { result } = renderHook(() => usePhotoStorage());
    await act(async () => {
      await result.current.savePhoto(makeBlob(), "leak-99");
    });
    expect(mockIdbDelete).toHaveBeenCalledWith(oldKey);
    expect(mockIdbDelete).not.toHaveBeenCalledWith(
      "photo_other_project_leak-99_222",
    );
  });

  it("does not delete when no old versions exist", async () => {
    mockListKeys.mockResolvedValue(["photo_proj-1_other-leak_111"]);
    const { result } = renderHook(() => usePhotoStorage());
    await act(async () => {
      await result.current.savePhoto(makeBlob(), "leak-7");
    });
    expect(mockIdbDelete).not.toHaveBeenCalled();
  });

  it("skips the old-version scan for a new leak", async () => {
    const { result } = renderHook(() => usePhotoStorage());
    await act(async () => {
      await result.current.savePhoto(makeBlob(), "new-leak", [], {
        cleanupOldVersions: false,
      });
    });
    expect(mockIdbSave).toHaveBeenCalledOnce();
    expect(mockListKeys).not.toHaveBeenCalled();
  });
});

describe("deletePhoto (web path)", () => {
  it("deletes idb:// photo by id", async () => {
    const { result } = renderHook(() => usePhotoStorage());
    await act(async () => {
      await result.current.deletePhoto("idb://photo_proj-1_leak-1_123");
    });
    expect(mockIdbDelete).toHaveBeenCalledWith("photo_proj-1_leak-1_123");
  });

  it("does nothing for null path", async () => {
    const { result } = renderHook(() => usePhotoStorage());
    await act(async () => {
      await result.current.deletePhoto(null);
    });
    expect(mockIdbDelete).not.toHaveBeenCalled();
  });

  it("ignores data:// paths on web (no native FS)", async () => {
    const { result } = renderHook(() => usePhotoStorage());
    await act(async () => {
      await result.current.deletePhoto(
        "data://LeakReports/TestProject/photos/photo_1.jpg",
      );
    });
    expect(mockIdbDelete).not.toHaveBeenCalled();
  });
});

describe("gcOrphanedPhotos (web path)", () => {
  it("deletes keys not referenced by any leak", async () => {
    mockListKeys.mockResolvedValue([
      "photo_proj-1_leak-1_111",
      "photo_proj-1_leak-2_222",
      "photo_proj-1_orphan_333",
    ]);
    const leaks = [
      { id: 1, photo: "idb://photo_proj-1_leak-1_111" },
      { id: 2, photo: "idb://photo_proj-1_leak-2_222" },
    ];
    const { result } = renderHook(() => usePhotoStorage());
    await act(async () => {
      await result.current.gcOrphanedPhotos(leaks);
    });
    expect(mockIdbDelete).toHaveBeenCalledWith("photo_proj-1_orphan_333");
    expect(mockIdbDelete).not.toHaveBeenCalledWith("photo_proj-1_leak-1_111");
    expect(mockIdbDelete).not.toHaveBeenCalledWith("photo_proj-1_leak-2_222");
  });

  it("keeps a photo that only a component card references", async () => {
    // The thumbnail used to survive until the app restarted and then vanish:
    // the sweep saw only leaks and called every component photo an orphan.
    componentCards.current = [{ id: "c1", photo: "idb://photo_proj-1_c1_111" }];
    mockListKeys.mockResolvedValue([
      "photo_proj-1_c1_111",
      "photo_proj-1_orphan_333",
    ]);

    const { result } = renderHook(() => usePhotoStorage());
    await act(async () => {
      await result.current.gcOrphanedPhotos([]);
    });

    expect(mockIdbDelete).toHaveBeenCalledWith("photo_proj-1_orphan_333");
    expect(mockIdbDelete).not.toHaveBeenCalledWith("photo_proj-1_c1_111");
    componentCards.current = [];
  });

  it("deletes nothing when all keys are referenced", async () => {
    mockListKeys.mockResolvedValue(["photo_proj-1_leak-1_111"]);
    const leaks = [{ id: 1, photo: "idb://photo_proj-1_leak-1_111" }];
    const { result } = renderHook(() => usePhotoStorage());
    await act(async () => {
      await result.current.gcOrphanedPhotos(leaks);
    });
    expect(mockIdbDelete).not.toHaveBeenCalled();
  });

  it("handles photo_after field as well", async () => {
    mockListKeys.mockResolvedValue(["photo_proj-1_leak-1_after_555"]);
    const leaks = [
      {
        id: 1,
        photo: null,
        photo_after: "idb://photo_proj-1_leak-1_after_555",
      },
    ];
    const { result } = renderHook(() => usePhotoStorage());
    await act(async () => {
      await result.current.gcOrphanedPhotos(leaks);
    });
    expect(mockIdbDelete).not.toHaveBeenCalled();
  });

  it("deletes all keys when leaks list is empty", async () => {
    mockListKeys.mockResolvedValue([
      "photo_proj-1_leak-1_111",
      "photo_proj-1_leak-2_222",
    ]);
    const { result } = renderHook(() => usePhotoStorage());
    await act(async () => {
      await result.current.gcOrphanedPhotos([]);
    });
    expect(mockIdbDelete).toHaveBeenCalledTimes(2);
  });
});
