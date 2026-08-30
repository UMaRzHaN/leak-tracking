const normalizeProjectName = (value) =>
  String(value ?? "")
    .trim()
    .toLocaleLowerCase();

function makeCopyName(baseName, projects) {
  const occupied = new Set(
    (projects ?? []).map((project) => normalizeProjectName(project?.name)),
  );
  let candidate = `${baseName} (Excel)`;
  let index = 2;
  while (occupied.has(normalizeProjectName(candidate))) {
    candidate = `${baseName} (Excel ${index})`;
    index += 1;
  }
  return candidate;
}

export function resolvePortableExcelArchiveRoute({
  result,
  projects = /** @type {any[]} */ ([]),
  activeProject,
}) {
  const archiveProject = result?.portableArchive ? result.project : null;
  const archiveName = String(archiveProject?.name ?? "").trim();
  if (!archiveName || !archiveProject?.type) {
    return { action: "current" };
  }

  const existing = projects.find(
    (project) =>
      normalizeProjectName(project?.name) === normalizeProjectName(archiveName),
  );
  if (!existing) {
    return { action: "create", name: archiveName, archiveProject };
  }
  if (
    existing.id === activeProject?.id &&
    existing.type === archiveProject.type
  ) {
    return { action: "current", existing, archiveProject };
  }
  return {
    action: "create",
    name: makeCopyName(archiveName, projects),
    archiveProject,
    existing,
  };
}
