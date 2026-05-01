import { distanceMeters, findNearbyLeak, filterNearbyLeaks } from "./geoUtils";

describe("distanceMeters", () => {
  it("returns 0 for identical points", () => {
    expect(distanceMeters(55.75, 37.61, 55.75, 37.61)).toBe(0);
  });

  it("calculates ~111km per degree of latitude", () => {
    const d = distanceMeters(0, 0, 1, 0);
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_000);
  });

  it("is symmetric", () => {
    const d1 = distanceMeters(55.75, 37.61, 59.93, 30.32);
    const d2 = distanceMeters(59.93, 30.32, 55.75, 37.61);
    expect(d1).toBeCloseTo(d2, 0);
  });

  it("returns Infinity for NaN coordinates", () => {
    expect(distanceMeters(NaN, 37.61, 55.75, 37.61)).toBe(Infinity);
  });

  it("returns Infinity for undefined coordinates", () => {
    expect(distanceMeters(undefined, undefined, 55.75, 37.61)).toBe(Infinity);
  });

  it("handles string coordinates (coerces to number)", () => {
    const d = distanceMeters("55.75", "37.61", "55.76", "37.61");
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThan(2000);
  });
});

describe("findNearbyLeak", () => {
  const leaks = [
    { id: "a", lat: 55.7510, lng: 37.6120 }, // ~111м от базы
    { id: "b", lat: 55.7600, lng: 37.6100 }, // ~1км от базы
    { id: "c", lat: 55.7501, lng: 37.6101 }, // ~10м от базы
  ];
  const baseLat = 55.75;
  const baseLng = 37.61;

  it("finds the closest leak within threshold", () => {
    const result = findNearbyLeak(leaks, baseLat, baseLng, 50);
    expect(result?.leak.id).toBe("c");
  });

  it("returns null when no leak is within threshold", () => {
    const result = findNearbyLeak(leaks, baseLat, baseLng, 5);
    expect(result).toBeNull();
  });

  it("returns null when lat/lng are missing", () => {
    expect(findNearbyLeak(leaks, null, baseLng)).toBeNull();
    expect(findNearbyLeak(leaks, baseLat, null)).toBeNull();
  });

  it("skips leaks without coordinates", () => {
    const withBadLeak = [{ id: "x" }, ...leaks];
    const result = findNearbyLeak(withBadLeak, baseLat, baseLng, 50);
    expect(result?.leak.id).toBe("c");
  });

  it("includes rounded distance in result", () => {
    const result = findNearbyLeak(leaks, baseLat, baseLng, 50);
    expect(typeof result?.distance).toBe("number");
    expect(Number.isInteger(result?.distance)).toBe(true);
  });

  it("returns null for empty list", () => {
    expect(findNearbyLeak([], baseLat, baseLng)).toBeNull();
  });
});

describe("filterNearbyLeaks", () => {
  const leaks = [
    { id: "near",   lat: 55.7501, lng: 37.6101 }, // ~10м
    { id: "medium", lat: 55.7540, lng: 37.6150 }, // ~500м
    { id: "far",    lat: 55.7700, lng: 37.6300 }, // >2км
  ];
  const baseLat = 55.75;
  const baseLng = 37.61;

  it("filters leaks within radius", () => {
    const result = filterNearbyLeaks(leaks, baseLat, baseLng, 500);
    const ids = result.map((l) => l.id);
    expect(ids).toContain("near");
    expect(ids).not.toContain("far");
  });

  it("sorts by distance ascending", () => {
    const result = filterNearbyLeaks(leaks, baseLat, baseLng, 1000);
    for (let i = 1; i < result.length; i++) {
      expect(result[i]._nearbyDist).toBeGreaterThanOrEqual(result[i - 1]._nearbyDist);
    }
  });

  it("adds _nearbyDist as rounded integer", () => {
    const result = filterNearbyLeaks(leaks, baseLat, baseLng, 1000);
    result.forEach((l) => {
      expect(typeof l._nearbyDist).toBe("number");
      expect(Number.isInteger(l._nearbyDist)).toBe(true);
    });
  });

  it("returns empty array when lat/lng are missing", () => {
    expect(filterNearbyLeaks(leaks, null, baseLng)).toEqual([]);
    expect(filterNearbyLeaks(leaks, baseLat, null)).toEqual([]);
  });

  it("skips leaks without coordinates", () => {
    const withBadLeak = [{ id: "x" }, ...leaks];
    const result = filterNearbyLeaks(withBadLeak, baseLat, baseLng, 500);
    expect(result.find((l) => l.id === "x")).toBeUndefined();
  });

  it("returns empty array for empty list", () => {
    expect(filterNearbyLeaks([], baseLat, baseLng)).toEqual([]);
  });
});
