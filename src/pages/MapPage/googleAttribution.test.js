import { beforeEach, describe, expect, it, vi } from "vitest";

const google = vi.hoisted(() => ({ fetchGoogleCopyright: vi.fn() }));
vi.mock("@/services/maps/googleTiles", () => google);

const { attachGoogleAttribution } = await import("./googleAttribution");

function evented() {
  const handlers = {};
  return {
    on: vi.fn((name, handler) => (handlers[name] = handler)),
    fire: (name) => handlers[name]?.(),
  };
}

function setup() {
  const map = {
    ...evented(),
    attributionControl: {
      addAttribution: vi.fn(),
      removeAttribution: vi.fn(),
    },
    getBounds: () => ({
      getNorth: () => 44,
      getSouth: () => 43,
      getEast: () => 58,
      getWest: () => 57,
    }),
    getZoom: () => 18.4,
  };
  const layer = evented();
  attachGoogleAttribution(map, layer);
  return { map, layer, control: map.attributionControl };
}

describe("подпись Google на карте", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    google.fetchGoogleCopyright.mockResolvedValue("Imagery ©2026 <Airbus>");
  });

  it("не появляется, пока тайлов Google на карте нет", () => {
    const { control } = setup();

    expect(control.addAttribution).not.toHaveBeenCalled();
    expect(google.fetchGoogleCopyright).not.toHaveBeenCalled();
  });

  it("появляется с первым тайлом Google и подтягивает правообладателей", async () => {
    const { layer, control } = setup();

    layer.fire("googletile");
    await vi.waitFor(() =>
      expect(control.addAttribution).toHaveBeenCalledTimes(2),
    );

    expect(control.addAttribution).toHaveBeenNthCalledWith(
      1,
      "Imagery &copy; Google",
    );
    // Строка от Google идёт в innerHTML подписи — экранируем.
    expect(control.addAttribution).toHaveBeenLastCalledWith(
      "Google · Imagery ©2026 &lt;Airbus&gt;",
    );
    expect(control.removeAttribution).toHaveBeenCalledWith(
      "Imagery &copy; Google",
    );
    expect(google.fetchGoogleCopyright).toHaveBeenCalledWith(
      { north: 44, south: 43, east: 58, west: 57 },
      18,
    );
  });

  it("обновляется после сдвига карты, но не на каждый тайл", async () => {
    const { map, layer } = setup();

    layer.fire("googletile");
    layer.fire("googletile");
    await vi.waitFor(() =>
      expect(google.fetchGoogleCopyright).toHaveBeenCalledTimes(1),
    );

    map.fire("moveend");
    map.fire("moveend");
    await vi.advanceTimersByTimeAsync(500);

    expect(google.fetchGoogleCopyright).toHaveBeenCalledTimes(2);
  });

  it("оставляет прежнюю подпись, если Google не ответил", async () => {
    google.fetchGoogleCopyright.mockResolvedValue(null);
    const { layer, control } = setup();

    layer.fire("googletile");
    await vi.waitFor(() =>
      expect(google.fetchGoogleCopyright).toHaveBeenCalled(),
    );

    expect(control.addAttribution).toHaveBeenCalledTimes(1);
  });
});
