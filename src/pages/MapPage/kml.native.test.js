import { beforeEach, describe, expect, it, vi } from "vitest";
import { translate } from "@/test/translate";

const writePublicFile = vi.hoisted(() => vi.fn());

vi.mock("@/utils/platform", () => ({ isNative: true }));
vi.mock("@/services/storage/publicFileWriter", () => ({ writePublicFile }));

const { saveLeaksKML } = await import("./kml");

describe("saveLeaksKML on Android", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    writePublicFile.mockResolvedValue({ path: "saved" });
  });

  it("writes KML to the project public Documents folder", async () => {
    const result = await saveLeaksKML(
      [{ leak_id: "A1", lat: 10, lng: 20, field: "North" }],
      "upstream",
      "alpha",
      translate,
    );

    expect(writePublicFile).toHaveBeenCalledWith({
      folder: "alpha/Leaks/kml",
      fileName: "leaks_map.kml",
      blob: expect.any(Blob),
      mimeType: "application/vnd.google-earth.kml+xml",
    });
    expect(result).toEqual({
      ok: true,
      fileName: "leaks_map.kml",
      path: "alpha/Leaks/kml/leaks_map.kml",
      message: "Saved to Documents/alpha/Leaks/kml/leaks_map.kml",
    });
  });

  it("uses the shared export folder when no project folder is available", async () => {
    const result = await saveLeaksKML([], "downstream", null, translate);

    expect(writePublicFile).toHaveBeenCalledWith(
      expect.objectContaining({ folder: "Leaks/kml" }),
    );
    expect(result.path).toBe("Leaks/kml/leaks_map.kml");
  });

  it("propagates public writer failures to the export controller", async () => {
    writePublicFile.mockRejectedValueOnce(new Error("storage unavailable"));

    await expect(
      saveLeaksKML([], "downstream", "alpha", translate),
    ).rejects.toThrow("storage unavailable");
  });
});
