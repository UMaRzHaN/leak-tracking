import { describe, expect, it } from "vitest";
import { filterComponentMarkers, toComponentMarkers } from "./componentMarkers";

const card = (extra = {}) => ({
  id: "c1",
  component_uid: "4242",
  lat: 38.4,
  lng: 66.1,
  ...extra,
});

describe("component cards as map pins", () => {
  it("labels the pin with the number written on the equipment", () => {
    expect(toComponentMarkers([card()])[0]).toMatchObject({
      kind: "component",
      leak_id: "4242",
    });
  });

  it("falls back to the drawing tag when no number was assigned", () => {
    expect(
      toComponentMarkers([card({ component_uid: null, scheme_tag: "ЗД32" })])[0]
        .leak_id,
    ).toBe("ЗД32");
  });

  it("leaves a card without a fix off the map rather than at zero", () => {
    expect(toComponentMarkers([card({ lat: null, lng: null })])).toHaveLength(
      0,
    );
  });

  it("reads coordinates that arrived as text", () => {
    const [marker] = toComponentMarkers([card({ lat: "38.4", lng: "66.1" })]);
    expect(marker.lat).toBe(38.4);
  });
});

describe("filters that mean something for equipment", () => {
  const markers = toComponentMarkers([
    card({ id: "near", deposit: "Бузахур" }),
    card({ id: "far", deposit: "Бузахур", lat: 39.4, lng: 67.1 }),
  ]);

  it("keeps everything when nothing is filtering", () => {
    expect(filterComponentMarkers(markers, {})).toHaveLength(2);
  });

  it("honours the place chosen in the header", () => {
    const filtered = filterComponentMarkers(markers, {
      sharedFilters: {
        locationFilter: { key: "deposit", values: ["Мессояха"] },
      },
    });
    expect(filtered).toHaveLength(0);
  });

  it("drops what is out of the chosen radius", () => {
    const filtered = filterComponentMarkers(markers, {
      nearbyOnly: true,
      nearbyRadius: 1000,
      coords: { lat: 38.4, lng: 66.1 },
    });
    expect(filtered.map((marker) => marker.id)).toEqual(["near"]);
  });

  it("ignores the radius when there is no fix to measure from", () => {
    const filtered = filterComponentMarkers(markers, {
      nearbyOnly: true,
      nearbyRadius: 1000,
      coords: null,
    });
    expect(filtered).toHaveLength(2);
  });
});
