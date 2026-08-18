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
 */
export async function openSchemaExternally(project, schema, blob) {
  if (isNative) return openWithSystemViewer(project, schema);
  return openInNewTab(blob);
}

function openInNewTab(blob) {
  const url = URL.createObjectURL(blob);
  const opened = window.open(url, "_blank", "noopener");
  // Revoking immediately would break the tab that is still loading; a minute
  // is well past any reasonable load and keeps the blob from leaking for the
  // rest of the session.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);

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
