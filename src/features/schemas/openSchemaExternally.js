import { isNative } from "@/utils/platform";
import { logger } from "@/utils/logger";

/**
 * Hands a PDF drawing to whatever the device already uses to read PDFs.
 *
 * The app does not render PDF itself: a renderer weighs 350–400 KB against a
 * 360 KB per-chunk budget, so bundling one would cost the whole allowance to
 * reproduce, worse, what the phone can already do. The trade is one hop out of
 * the app in exchange for a viewer with real page navigation and text search.
 *
 * On the web a blob URL in a new tab is enough — every desktop browser renders
 * PDF inline. On a device the file already sits in app storage, so it is passed
 * by URI through the share sheet, from which the user picks a reader.
 *
 * `targetWindow` is how the web side stops being blocked. A browser only lets
 * a tab open while it is still handling the tap; reading the drawing out of
 * storage takes longer than that, so by the time the bytes arrived the
 * permission was gone and every PDF reported "the browser blocked the new
 * tab". The caller now opens an empty tab in the tap itself and hands it over
 * here to be pointed at the file.
 */
export async function openSchemaExternally(
  project,
  schema,
  blob,
  { targetWindow = null } = {},
) {
  if (isNative) {
    // A tab opened in hope is closed again: the share sheet is the way out on
    // a device, and leaving a blank tab behind would be a second thing to
    // dismiss.
    targetWindow?.close();
    return openWithSystemViewer(project, schema);
  }
  return openInNewTab(blob, targetWindow);
}

function openInNewTab(blob, targetWindow) {
  const url = URL.createObjectURL(blob);
  // Revoking immediately would break the tab that is still loading; a minute
  // is well past any reasonable load and keeps the blob from leaking for the
  // rest of the session.
  const scheduleRevoke = () =>
    setTimeout(() => URL.revokeObjectURL(url), 60_000);

  if (targetWindow && !targetWindow.closed) {
    targetWindow.location.replace(url);
    scheduleRevoke();
    return true;
  }

  const opened = window.open(url, "_blank", "noopener");
  scheduleRevoke();

  if (!opened) {
    const error = new Error("The browser blocked the new tab");
    error.code = "SCHEMA_OPEN_BLOCKED";
    throw error;
  }
  return true;
}

async function openWithSystemViewer(project, schema) {
  try {
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([
      import("@capacitor/filesystem"),
      import("@capacitor/share"),
    ]);

    const { getNativeSchemaPath } = await import("@/repositories/schemaPaths");
    const { uri } = await Filesystem.getUri({
      path: getNativeSchemaPath(project?.folderName ?? project?.id, schema),
      directory: Directory.Data,
    });

    await Share.share({ title: schema.name, files: [uri] });
    return true;
  } catch (error) {
    // A cancelled share sheet is a normal outcome, not a failure worth
    // shouting about.
    if (/cancel/i.test(String(error?.message ?? error))) return false;
    logger.error("[schemas] failed to hand the drawing to a viewer:", error);
    const failure = new Error("No app on this device can open the drawing");
    failure.code = "SCHEMA_OPEN_FAILED";
    throw failure;
  }
}
