import { describe, expect, it, vi } from "vitest";

const camera = vi.hoisted(() => ({
  getPhoto: vi.fn(),
  requestPermissions: vi.fn(),
}));

vi.mock("@/utils/platform", () => ({ isNative: false }));
vi.mock("@capacitor/camera", () => ({
  Camera: camera,
  CameraResultType: { Uri: "uri" },
  CameraSource: { Camera: "camera", Photos: "photos" },
}));

const {
  MAX_PHOTO_INPUT_BYTES,
  pickPhotoFromGallery,
  readPhotoFromFile,
  takePhotoFromCamera,
} = await import("./cameraService");

describe("browser camera service", () => {
  it("rejects native camera and gallery entry points", async () => {
    await expect(takePhotoFromCamera()).rejects.toThrow(
      "Camera is available only on mobile",
    );
    await expect(pickPhotoFromGallery()).rejects.toThrow(
      "Gallery is available only on mobile",
    );
    expect(camera.getPhoto).not.toHaveBeenCalled();
  });

  it("reads a browser File without replacing the original Blob", async () => {
    const file = new File(["photo"], "photo.jpg", { type: "image/jpeg" });

    const result = await readPhotoFromFile(file);

    expect(result.raw).toBe(file);
    expect(result.src).toMatch(/^data:image\/jpeg;base64,/);
  });

  it("rejects values that did not come from a file input", async () => {
    await expect(readPhotoFromFile(new Blob(["photo"]))).rejects.toThrow(
      "Expected File from input",
    );
  });

  it("rejects non-image and oversized browser files before reading them", async () => {
    await expect(
      readPhotoFromFile(
        new File(["not a photo"], "notes.txt", { type: "text/plain" }),
      ),
    ).rejects.toThrow("Selected file is not an image");

    const oversized = new File(["photo"], "photo.jpg", {
      type: "image/jpeg",
    });
    Object.defineProperty(oversized, "size", {
      value: MAX_PHOTO_INPUT_BYTES + 1,
    });
    await expect(readPhotoFromFile(oversized)).rejects.toThrow(
      "Photo is larger than 32 MB",
    );
  });
});
