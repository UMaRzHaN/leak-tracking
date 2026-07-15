import { beforeEach, describe, expect, it, vi } from "vitest";

const camera = vi.hoisted(() => ({
  getPhoto: vi.fn(),
  requestPermissions: vi.fn(),
}));

vi.mock("@/utils/platform", () => ({ isNative: true }));
vi.mock("@capacitor/camera", () => ({
  Camera: camera,
  CameraResultType: { Uri: "uri" },
  CameraSource: { Camera: "camera", Photos: "photos" },
}));

const { pickPhotoFromGallery, takePhotoFromCamera } =
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

  it("uses the same URI path for gallery photos", async () => {
    await pickPhotoFromGallery();

    expect(camera.getPhoto).toHaveBeenCalledWith({
      quality: 70,
      width: 1280,
      source: "photos",
      resultType: "uri",
    });
  });
});
