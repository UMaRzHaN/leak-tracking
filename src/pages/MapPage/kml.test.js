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
          component: "Valve ]]> test",
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
    expect(kml).toContain("Field <North>");
    expect(kml).toContain("Valve ]]&gt; test");
    expect(kml).toContain("Скорость");
  });
});
