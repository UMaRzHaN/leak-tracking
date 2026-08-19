import { toNullableNumber } from "@/utils/normalize/toNullableNumber";

/**
 * Waiting for the receiver to answer, once, at the moment of saving.
 *
 * A record without coordinates is dropped from the map, and both the leak form
 * and the component card used to save that way in silence. Asking first would
 * be a decision put to somebody standing at a wellhead; instead the receiver
 * is switched on and given a moment, because the common case is simply GPS
 * left off. Where there is no sky — a basement, a shop floor — no amount of
 * waiting helps, so the caller saves anyway and says what was lost.
 */

export const COORDS_WAIT_MS = 15000;
export const COORDS_POLL_MS = 200;

/** The current fix, as numbers, with anything unusable read as absent. */
export function readCoordsFix(coords) {
  return {
    lat: toNullableNumber(coords?.lat),
    lng: toNullableNumber(coords?.lng),
  };
}

export function hasCoordsFix(coords) {
  const { lat, lng } = readCoordsFix(coords);
  return lat != null && lng != null;
}

/**
 * Polls a ref until it holds a usable fix.
 *
 * A ref rather than a value: the wait happens inside the save, and a fix that
 * arrives during it must be seen — a captured prop would stay stale for the
 * whole fifteen seconds.
 *
 * @param {{current: any}} coordsRef
 * @param {{timeoutMs?: number, pollMs?: number}} [options]
 * @returns {Promise<{lat: number, lng: number}|null>}
 */
export async function waitForCoordsFix(
  coordsRef,
  { timeoutMs = COORDS_WAIT_MS, pollMs = COORDS_POLL_MS } = {},
) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const fix = readCoordsFix(coordsRef?.current);
    if (fix.lat != null && fix.lng != null) {
      return /** @type {{lat: number, lng: number}} */ (fix);
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  return null;
}
