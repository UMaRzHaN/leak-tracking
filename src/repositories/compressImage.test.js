import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { compressImage } from "./compressImage";

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
