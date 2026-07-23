import { beforeEach, describe, expect, it, vi } from "vitest";
import { assignTileSource, releaseTileResources } from "./tileLifecycle";

describe("map tile lifecycle", () => {
  beforeEach(() => {
    URL.revokeObjectURL = vi.fn();
  });

  it("releases a blob URL that resolves after its tile was removed", () => {
    const done = vi.fn();
    const tile = { _removed: true, src: "" };

    expect(
      assignTileSource(tile, "blob:late-tile", done, { blobUrl: true }),
    ).toBe(false);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:late-tile");
    expect(tile.src).toBe("");
    expect(done).not.toHaveBeenCalled();
  });

  it("aborts loading and releases an assigned blob URL on removal", () => {
    const abort = vi.fn();
    const tile = {
      _removed: false,
      _blobUrl: "blob:active-tile",
      _abortController: { abort },
      onload: vi.fn(),
      onerror: vi.fn(),
      src: "blob:active-tile",
    };

    releaseTileResources(tile);

    expect(abort).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:active-tile");
    expect(tile).toMatchObject({
      _removed: true,
      _blobUrl: null,
      _abortController: null,
      onload: null,
      onerror: null,
      src: "",
    });
  });
});
