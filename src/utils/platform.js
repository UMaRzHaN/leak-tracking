import { Capacitor } from "@capacitor/core";

/**
 * Evaluated once at startup — never changes during a session.
 * Import this instead of calling Capacitor.isNativePlatform() directly,
 * so a platform strategy change requires editing only this file.
 */
export const isNative = Capacitor.isNativePlatform();
