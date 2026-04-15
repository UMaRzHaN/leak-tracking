import { Capacitor } from "@capacitor/core";

/**
 * Возвращает true, если приложение запущено как нативное (Android/iOS),
 * false — в браузере.
 *
 * Значение вычисляется один раз при запуске и не меняется во время сессии,
 * поэтому хук не использует useState.
 */
export function useIsNative() {
  return Capacitor.isNativePlatform();
}
