import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPhoto: vi.fn(),
  getPhotoSrc: vi.fn(),
  isNative: false,
  ready: true,
}));

vi.mock("@/utils/platform", () => ({
  get isNative() {
    return mocks.isNative;
  },
}));
vi.mock("./photoService", () => ({
  getPhotoSrc: mocks.getPhotoSrc,
}));
vi.mock("./useIndexedDB", () => ({
  useIndexedDB: () => ({
    ready: mocks.ready,
    getPhoto: mocks.getPhoto,
  }),
}));

import { usePhotoSrc } from "./usePhotoSrc";

describe("usePhotoSrc", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isNative = false;
    mocks.ready = true;
    URL.createObjectURL = vi.fn(() => "blob:photo-preview");
    URL.revokeObjectURL = vi.fn();
  });

  it("creates and releases an object URL for an IndexedDB blob", async () => {
    const blob = new Blob(["photo"], { type: "image/jpeg" });
    mocks.getPhoto.mockResolvedValue(blob);
    const { result, rerender, unmount } = renderHook(
      ({ path }) => usePhotoSrc(path, 3),
      { initialProps: { path: "idb://photo-1" } },
    );

    await waitFor(() => expect(result.current).toBe("blob:photo-preview"));
    expect(mocks.getPhoto).toHaveBeenCalledWith("photo-1");
    expect(URL.createObjectURL).toHaveBeenCalledWith(blob);

    rerender({ path: "data:image/jpeg;base64,next" });
    expect(result.current).toBe("data:image/jpeg;base64,next");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:photo-preview");

    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
  });

  it("ignores a stale IndexedDB read after the active path changes", async () => {
    let resolveOld;
    mocks.getPhoto.mockReturnValue(
      new Promise((resolve) => {
        resolveOld = resolve;
      }),
    );
    const { result, rerender } = renderHook(
      ({ path }) => usePhotoSrc(path, 4),
      { initialProps: { path: "idb://old" } },
    );

    rerender({ path: "/photos/current.jpg" });
    expect(result.current).toBe("/photos/current.jpg?v=4");

    await act(async () => resolveOld(new Blob(["old"])));
    expect(result.current).toBe("/photos/current.jpg?v=4");
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("waits for IndexedDB readiness and handles legacy data URLs", async () => {
    mocks.ready = false;
    const { result, rerender } = renderHook(
      ({ readyVersion }) => {
        mocks.ready = readyVersion > 0;
        return usePhotoSrc("idb://legacy", readyVersion);
      },
      { initialProps: { readyVersion: 0 } },
    );

    expect(result.current).toBeNull();
    expect(mocks.getPhoto).not.toHaveBeenCalled();

    mocks.getPhoto.mockResolvedValue("data:image/jpeg;base64,legacy");
    rerender({ readyVersion: 1 });
    await waitFor(() =>
      expect(result.current).toBe("data:image/jpeg;base64,legacy"),
    );
  });

  it("resolves native paths and clears the preview on read failure", async () => {
    mocks.isNative = true;
    mocks.getPhotoSrc.mockResolvedValue("data:image/jpeg;base64,native");
    const { result, rerender } = renderHook(
      ({ path }) => usePhotoSrc(path, 2),
      { initialProps: { path: "data://LeakReports/photo.jpg" } },
    );

    await waitFor(() =>
      expect(result.current).toBe("data:image/jpeg;base64,native"),
    );

    mocks.getPhotoSrc.mockRejectedValue(new Error("filesystem unavailable"));
    rerender({ path: "data://LeakReports/missing.jpg" });
    await waitFor(() => expect(result.current).toBeNull());
  });
});
