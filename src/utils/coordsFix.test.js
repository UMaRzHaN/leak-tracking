import { describe, expect, it } from "vitest";
import { hasCoordsFix, readCoordsFix, waitForCoordsFix } from "./coordsFix";

describe("чтение фикса приёмника", () => {
  it("округляет точность до метра", () => {
    // Доли метра приёмник не знает: показывать их значит выдавать шум за
    // измерение.
    expect(readCoordsFix({ lat: 41.3, lng: 69.2, accuracy: 12.47 })).toEqual({
      lat: 41.3,
      lng: 69.2,
      accuracy: 12,
    });
  });

  it("считает точность отсутствующей, когда приёмник её не сообщил", () => {
    expect(readCoordsFix({ lat: 41.3, lng: 69.2 }).accuracy).toBeNull();
    expect(readCoordsFix({ lat: 41.3, lng: 69.2, accuracy: "" }).accuracy).toBe(
      null,
    );
    // Отрицательный радиус — не «очень точно», а испорченное значение.
    expect(readCoordsFix({ accuracy: -5 }).accuracy).toBeNull();
  });

  it("не путает отсутствие точности с отсутствием координат", () => {
    expect(hasCoordsFix({ lat: 41.3, lng: 69.2 })).toBe(true);
    expect(hasCoordsFix({ accuracy: 5 })).toBe(false);
  });

  it("доносит точность вместе с дождавшимся фиксом", async () => {
    const ref = { current: { lat: null, lng: null } };
    setTimeout(() => {
      ref.current = { lat: 41.3, lng: 69.2, accuracy: 8.6 };
    }, 20);

    const fix = await waitForCoordsFix(ref, { timeoutMs: 500, pollMs: 10 });

    expect(fix).toEqual({ lat: 41.3, lng: 69.2, accuracy: 9 });
  });
});
