import { registerPlugin } from "@capacitor/core";

/**
 * The Android SQLite store, as the web side sees it.
 *
 * One plugin, two datasets. Its table holds records keyed by a project key and
 * an id, and it never looks inside the payload — the leaks were simply its
 * first tenant. The component registry keeps its rows under a project key of
 * its own, which is why this handle and the "is it there at all" probe live
 * apart from the leak storage that used to own them.
 */
export const NativeLeakStorage = registerPlugin("NativeLeakStorage");

/**
 * True when the failure means the plugin itself is absent — an older build, a
 * browser, a test — rather than the data being wrong. Only these are worth
 * falling back on; anything the store rejected on its merits must surface.
 */
export function isSqlitePluginUnavailable(error) {
  const code = String(error?.code ?? "").toUpperCase();
  const message = String(error?.message ?? error).toLowerCase();
  return (
    code === "UNIMPLEMENTED" ||
    code === "NOT_IMPLEMENTED" ||
    message.includes("not implemented") ||
    message.includes("unimplemented") ||
    message.includes("plugin is not available") ||
    message.includes("plugin not available")
  );
}
