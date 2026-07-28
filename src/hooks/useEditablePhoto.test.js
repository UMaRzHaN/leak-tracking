import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  savePhoto: vi.fn(),
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
    ready: true,
  }),
}));

vi.mock("./usePhotoSrc", () => ({
  usePhotoSrc: (path) => path,
}));

const { useEditablePhoto } = await import("./useEditablePhoto");

describe("useEditablePhoto", () => {
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
