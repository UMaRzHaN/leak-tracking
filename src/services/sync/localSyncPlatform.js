import { Capacitor } from "@capacitor/core";

/**
 * Local sync is an Android-only feature: it needs the LocalSync plugin for the
 * TLS listener and the ML Kit scanner for the handshake, and neither exists in
 * a browser. Both halves of the feature — the archive transfer and the QR
 * handshake — ask the same question, which is why it lives apart from either.
 */
export function isNativeAndroid() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

export function assertNativeAndroid() {
  if (!isNativeAndroid()) {
    throw new Error(
      "Локальная синхронизация доступна только в Android-приложении",
    );
  }
}
