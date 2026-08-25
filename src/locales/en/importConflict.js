export const importConflict = {
  title: "Project already exists",
  description: '"{{project}}" already exists in the app',
  source: "in archive",

  // English selects only `one` and `other`; the remaining forms exist so the
  // key sets stay identical across languages.
  records: {
    one: "record",
    few: "records",
    many: "records",
    other: "records",
  },

  preview: {
    added: "Added",
    updated: "Updated",
    skipped: "Skipped",
    photosAdded: "New photos",
    photosReplaced: "Replaced photos",
    photosReused: "Reused photos",
    archivePhotos: "Archive photos",
    registryGroup: "Component registry",
    componentsAdded: "Components added",
    componentsUpdated: "Components updated",
    componentsRemoved: "Components removed",
    componentPhotos: "Component photos",
    changedFields: "Changed fields",
  },

  diagnostics: {
    summary: "Difference details",
    photo: "photo",
    unreadable: "local photo could not be read",
    different: "photo content differs",
    monitoringRecords: "Monitoring history",
    history: "Change history",
  },

  actions: {
    overwrite: "Overwrite",
    merge: "Merge",
    copy: "Create copy",
    cancel: "Cancel",
  },
};
