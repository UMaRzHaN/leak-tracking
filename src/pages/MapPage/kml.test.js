import { describe, expect, it } from "vitest";
import { exportLeaksKML } from "./kml";

describe("exportLeaksKML", () => {
  it("escapes XML tag values and keeps description content readable", () => {
    const kml = exportLeaksKML(
      [
        {
          id: "1",
          leak_id: "A&B<1>",
          station: "КС & 5",
          field: "Field <North>",
          component: '<img src="https://tracker.test/pixel"> ]]> test',
          leak_speed: 12,
          lat: 51.5,
          lng: 71.4,
        },
      ],
      "midstream",
      "ru",
    );

    expect(kml).toContain("<name>A&amp;B&lt;1&gt;</name>");
    expect(kml).toContain("<name>КС &amp; 5</name>");
    expect(kml).toContain("Field &lt;North&gt;");
    expect(kml).toContain(
      "&lt;img src=&quot;https://tracker.test/pixel&quot;&gt; ]]&gt; test",
    );
    expect(kml).not.toContain('<img src="https://tracker.test/pixel">');
    expect(kml).toContain("Скорость");
  });

  it("omits placemarks with out-of-range coordinates", () => {
    const kml = exportLeaksKML(
      [
        { leak_id: "VALID", station: "A", lat: 0, lng: 0 },
        { leak_id: "INVALID", station: "A", lat: 999, lng: 0 },
      ],
      "midstream",
    );

    expect(kml).toContain("<name>VALID</name>");
    expect(kml).not.toContain("<name>INVALID</name>");
  });
});
