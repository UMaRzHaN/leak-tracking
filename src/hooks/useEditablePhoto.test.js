import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  savePhoto: vi.fn(),
  deletePhoto: vi.fn(),
  pickFromBrowser: vi.fn(),
}));

vi.mock("./useCamera", () => ({
  useCamera: () => ({
    isNative: false,
    takePhoto: vi.fn(),
    pickFromGallery: vi.fn(),
    pickFromBrowser: mocks.pickFromBrowser,
  }),
}));

vi.mock("./usePhotoStorage", () => ({
  usePhotoStorage: () => ({
    savePhoto: mocks.savePhoto,
    deletePhoto: mocks.deletePhoto,
    ready: true,
  }),
}));

vi.mock("./usePhotoSrc", () => ({
  usePhotoSrc: (path) => path,
}));

const { useEditablePhoto } = await import("./useEditablePhoto");

describe("useEditablePhoto", () => {
  it("removes an uncommitted photo when the active leak changes", async () => {
    let finishSave;
    const savePending = new Promise((resolve) => {
      finishSave = resolve;
    });
    const raw = new Blob(["new-photo"], { type: "image/jpeg" });
    mocks.pickFromBrowser.mockResolvedValue({ raw, src: "blob:new" });
    mocks.savePhoto.mockReturnValue(savePending);
    const { result, rerender } = renderHook(
      ({ initialPath, leakId }) =>
        useEditablePhoto({ initialPath, leakId, version: 1 }),
      {
        initialProps: {
          initialPath: "idb://old-1",
          leakId: "leak-1",
        },
      },
    );

    await act(async () => {
      await result.current.changePhoto({ target: { files: [raw] } });
    });
    const savePromise = result.current.savePhoto();

    rerender({ initialPath: "idb://old-2", leakId: "leak-2" });
    let saveError;
    await act(async () => {
      finishSave("idb://uncommitted");
      try {
        await savePromise;
      } catch (error) {
        saveError = error;
      }
    });

    expect(saveError).toMatchObject({
      name: "AbortError",
      message: "Photo save was cancelled",
    });
    expect(mocks.deletePhoto).toHaveBeenCalledWith("idb://uncommitted");
  });

  it("removes an uncommitted photo after the editor unmounts", async () => {
    let finishSave;
    const savePending = new Promise((resolve) => {
      finishSave = resolve;
    });
    const raw = new Blob(["new-photo"], { type: "image/jpeg" });
    mocks.pickFromBrowser.mockResolvedValue({ raw, src: "blob:new" });
    mocks.savePhoto.mockReturnValue(savePending);
    const { result, unmount } = renderHook(() =>
      useEditablePhoto({
        initialPath: "idb://old",
        leakId: "leak-1",
        version: 1,
      }),
    );

    await act(async () => {
      await result.current.changePhoto({ target: { files: [raw] } });
    });
    const savePromise = result.current.savePhoto();

    unmount();
    let saveError;
    await act(async () => {
      finishSave("idb://uncommitted");
      try {
        await savePromise;
      } catch (error) {
        saveError = error;
      }
    });

    expect(saveError).toMatchObject({ name: "AbortError" });
    expect(mocks.deletePhoto).toHaveBeenCalledWith("idb://uncommitted");
  });

  it("keeps the persisted photo until the new record path is committed", async () => {
    const raw = new Blob(["new-photo"], { type: "image/jpeg" });
    mocks.pickFromBrowser.mockResolvedValue({ raw, src: "blob:new" });
    mocks.savePhoto.mockResolvedValue("idb://new");
    const { result } = renderHook(() =>
      useEditablePhoto({
        initialPath: "idb://old",
        leakId: "leak-1",
        version: 1,
        excludePaths: ["idb://after"],
      }),
    );

    await act(async () => {
      await result.current.changePhoto({ target: { files: [raw] } });
    });
    await act(async () => result.current.savePhoto());

    expect(mocks.savePhoto).toHaveBeenCalledWith(raw, "leak-1", [
      "idb://old",
      "idb://after",
    ]);
  });

  it("rejects a failed photo write and keeps the draft dirty", async () => {
    const raw = new Blob(["new-photo"], { type: "image/jpeg" });
    mocks.pickFromBrowser.mockResolvedValue({ raw, src: "blob:new" });
    mocks.savePhoto.mockResolvedValue(null);
    const { result } = renderHook(() =>
      useEditablePhoto({ initialPath: "idb://old", leakId: "leak-1" }),
    );

    await act(async () => {
      await result.current.changePhoto({ target: { files: [raw] } });
    });

    await expect(act(async () => result.current.savePhoto())).rejects.toThrow(
      "Photo storage did not return a saved path",
    );
    expect(result.current.isDirty).toBe(true);
  });
});
