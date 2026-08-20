import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_PHOTO_WIDTH,
  compressImage,
  isWithinPhotoBudget,
} from "./compressImage";

describe("compressImage", () => {
  let image;
  let canvas;
  let createElement;

  beforeEach(() => {
    vi.stubGlobal(
      "Image",
      class MockImage {
        constructor() {
          image = this;
        }
      },
    );
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:input"),
      revokeObjectURL: vi.fn(),
    });
    canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ drawImage: vi.fn() })),
      toBlob: vi.fn(),
    };
    createElement = vi
      .spyOn(document, "createElement")
      .mockImplementation((tag) =>
        tag === "canvas" ? canvas : document.createElement(tag),
      );
  });

  afterEach(() => {
    createElement.mockRestore();
    vi.unstubAllGlobals();
  });

  it("scales wide images and returns the encoded JPEG", async () => {
    const input = new Blob(["input"], { type: "image/png" });
    const output = new Blob(["output"], { type: "image/jpeg" });
    canvas.toBlob.mockImplementation((callback) => callback(output));

    const result = compressImage(input, { maxWidth: 1000, quality: 0.6 });
    image.naturalWidth = 2000;
    image.naturalHeight = 1000;
    image.onload();

    await expect(result).resolves.toBe(output);
    expect(canvas).toMatchObject({ width: 1000, height: 500 });
    expect(canvas.toBlob).toHaveBeenCalledWith(
      expect.any(Function),
      "image/jpeg",
      0.6,
    );
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:input");
  });

  it("returns the original blob when decoding or canvas setup fails", async () => {
    const input = new Blob(["input"]);
    const decodeFailure = compressImage(input);
    image.onerror();
    await expect(decodeFailure).resolves.toBe(input);

    canvas.getContext.mockReturnValue(null);
    const canvasFailure = compressImage(input);
    image.naturalWidth = 100;
    image.naturalHeight = 50;
    image.onload();
    await expect(canvasFailure).resolves.toBe(input);
  });

  it("returns the original blob when an object URL cannot be created", async () => {
    const input = new Blob(["input"]);
    URL.createObjectURL.mockImplementation(() => {
      throw new Error("unsupported");
    });

    await expect(compressImage(input)).resolves.toBe(input);
  });
});

describe("isWithinPhotoBudget", () => {
  function jpegOfWidth(width, { bytes = 1024, type = "image/jpeg" } = {}) {
    const header = [
      0xff,
      0xd8,
      0xff,
      0xc0,
      0x00,
      0x0b,
      8,
      0x00,
      0x64,
      width >> 8,
      width & 0xff,
      3,
    ];
    const padding = new Uint8Array(Math.max(0, bytes - header.length));
    return new Blob([new Uint8Array(header), padding], { type });
  }

  it("accepts a JPEG already inside the width and size budget", async () => {
    await expect(
      isWithinPhotoBudget(jpegOfWidth(MAX_PHOTO_WIDTH)),
    ).resolves.toBe(true);
  });

  it("rejects a JPEG wider than the budget", async () => {
    await expect(
      isWithinPhotoBudget(jpegOfWidth(MAX_PHOTO_WIDTH + 1)),
    ).resolves.toBe(false);
  });

  it("rejects a JPEG heavier than the budget despite its width", async () => {
    await expect(
      isWithinPhotoBudget(jpegOfWidth(640, { bytes: 1024 * 1024 + 1 })),
    ).resolves.toBe(false);
  });

  it("rejects formats that compression exists to convert", async () => {
    await expect(
      isWithinPhotoBudget(jpegOfWidth(640, { type: "image/png" })),
    ).resolves.toBe(false);
    await expect(isWithinPhotoBudget(null)).resolves.toBe(false);
  });

  it("rejects a JPEG whose header does not state a size", async () => {
    await expect(
      isWithinPhotoBudget(
        new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0x00, 0x02])], {
          type: "image/jpeg",
        }),
      ),
    ).resolves.toBe(false);
  });
});
