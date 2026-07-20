import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/utils/platform", () => ({ isNative: false }));

const { exportLeaksKML, saveLeaksKML } = await import("./kml");

describe("KML web export", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("skips records without coordinates and groups unspecified locations", () => {
    const kml = exportLeaksKML(
      [
        { leak_id: "valid", lat: 10, lng: 20, component: "Valve" },
        { leak_id: "missing-lat", lng: 20 },
        { leak_id: "missing-lng", lat: 10 },
      ],
      "downstream",
      "en",
    );

    expect(kml).toContain("<name>Not specified</name>");
    expect(kml).toContain("<coordinates>20,10,0</coordinates>");
    expect(kml).not.toContain("missing-lat");
    expect(kml).not.toContain("missing-lng");
    expect(kml).toContain("No rate");
  });

  describe("saveLeaksKML", () => {
    beforeEach(() => {
      vi.stubGlobal("URL", {
        createObjectURL: vi.fn(() => "blob:kml"),
        revokeObjectURL: vi.fn(),
      });
    });

    it("downloads the document and releases its object URL", async () => {
      const click = vi
        .spyOn(HTMLAnchorElement.prototype, "click")
        .mockImplementation(() => {});

      const result = await saveLeaksKML(
        [{ leak_id: "A1", lat: 10, lng: 20, station: "S1" }],
        "midstream",
        "alpha",
        "en",
      );

      expect(result).toEqual({
        ok: true,
        fileName: "leaks_map.kml",
        path: "leaks_map.kml",
        message: "KML file downloaded successfully",
      });
      expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
      expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:kml");
      expect(click).toHaveBeenCalledOnce();
      click.mockRestore();
    });
  });
});
