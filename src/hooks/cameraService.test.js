import { beforeEach, describe, expect, it, vi } from "vitest";

const camera = vi.hoisted(() => ({
  getPhoto: vi.fn(),
  requestPermissions: vi.fn(),
}));

vi.mock("@/utils/platform", () => ({ isNative: true }));
vi.mock("@capacitor/camera", () => ({
  Camera: camera,
  CameraResultType: { DataUrl: "dataUrl", Uri: "uri" },
  CameraSource: { Camera: "camera", Photos: "photos" },
}));

const { MAX_PHOTO_INPUT_BYTES, pickPhotoFromGallery, takePhotoFromCamera } =
  await import("./cameraService");
const { isPhotoPrepared } = await import("../utils/photoPreparation");

describe("native camera service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    camera.requestPermissions.mockResolvedValue({ camera: "granted" });
    camera.getPhoto.mockResolvedValue({
      webPath: "capacitor://localhost/photo.jpg",
      format: "jpeg",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        blob: vi
          .fn()
          .mockResolvedValue(new Blob(["photo"], { type: "image/jpeg" })),
      }),
    );
  });

  it("loads a bounded camera photo through its URI", async () => {
    const result = await takePhotoFromCamera();

    expect(camera.getPhoto).toHaveBeenCalledWith({
      quality: 80,
      width: 1280,
      source: "camera",
      resultType: "uri",
    });
    expect(fetch).toHaveBeenCalledWith("capacitor://localhost/photo.jpg");
    expect(result.src).toBe("capacitor://localhost/photo.jpg");
    expect(result.raw).toBeInstanceOf(Blob);
    expect(isPhotoPrepared(result.raw)).toBe(true);
  });

  it("also accepts a data URL camera result", async () => {
    camera.getPhoto.mockResolvedValueOnce({
      dataUrl: "data:image/jpeg;base64,cGhvdG8=",
      format: "jpeg",
    });

    const result = await takePhotoFromCamera();

    expect(result.src).toBe("data:image/jpeg;base64,cGhvdG8=");
    expect(result.raw).toBeInstanceOf(Blob);
  });

  it("uses the same URI path for gallery photos", async () => {
    await pickPhotoFromGallery();

    expect(camera.getPhoto).toHaveBeenCalledWith({
      quality: 70,
      width: 1280,
      source: "photos",
      resultType: "uri",
    });
  });

  it("does not open the camera when permission is denied", async () => {
    camera.requestPermissions.mockResolvedValueOnce({ camera: "denied" });

    await expect(takePhotoFromCamera()).rejects.toThrow(
      "Camera permission denied",
    );
    expect(camera.getPhoto).not.toHaveBeenCalled();
  });

  it("rejects camera results without a readable URI", async () => {
    camera.getPhoto.mockResolvedValueOnce({ format: "jpeg" });

    await expect(takePhotoFromCamera()).rejects.toThrow(
      "Camera did not return a photo URI",
    );
  });

  it("rejects invalid camera data URLs", async () => {
    camera.getPhoto.mockResolvedValueOnce({ dataUrl: "not-a-data-url" });

    await expect(takePhotoFromCamera()).rejects.toThrow(
      "Camera returned an invalid photo",
    );
  });

  it("rejects non-image data URLs and oversized native photos", async () => {
    camera.getPhoto.mockResolvedValueOnce({
      dataUrl: "data:text/plain;base64,cGhvdG8=",
    });
    await expect(takePhotoFromCamera()).rejects.toThrow(
      "Camera returned an invalid photo",
    );

    const oversized = new Blob(["photo"], { type: "image/jpeg" });
    Object.defineProperty(oversized, "size", {
      value: MAX_PHOTO_INPUT_BYTES + 1,
    });
    fetch.mockResolvedValueOnce({
      ok: true,
      blob: vi.fn().mockResolvedValue(oversized),
    });
    await expect(takePhotoFromCamera()).rejects.toThrow(
      "Photo is larger than 32 MB",
    );
  });

  it("reports an unreadable temporary camera file", async () => {
    fetch.mockResolvedValueOnce({ ok: false });

    await expect(takePhotoFromCamera()).rejects.toThrow(
      "Unable to read the selected photo",
    );
  });
});
