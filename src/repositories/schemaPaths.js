import { getSchemaExtension } from "@/domain/technologicalSchemas";

/**
 * Where a schema file sits in the app's private storage on a device.
 *
 * Shared by SchemaRepository, which writes it, and the external-viewer handoff,
 * which needs the same path as a URI. Kept in its own module so the two cannot
 * drift apart — a viewer pointed at a path nothing was written to fails only in
 * the field, with the drawing already needed.
 */
export function getSchemaDir(folderName) {
  return `LeakReports/${folderName}/schemas`;
}

export function getNativeSchemaPath(folderName, schema) {
  const extension = getSchemaExtension(schema?.name);
  return `${getSchemaDir(folderName)}/${schema.id}${
    extension ? `.${extension}` : ""
  }`;
}

export function getNativeSchemaIndexPath(folderName) {
  return `${getSchemaDir(folderName)}/index.json`;
}
