# Project backup service modules

`projectBackupService.js` is the stable public facade. Keep application imports pointed at that file.

- `archiveParser.js` — ZIP validation, metadata parsing, project type detection and archive preview.
- `backupExport.js` — ordinary, project and streaming ZIP export pipelines.
- `backupImport.js` — new-project import, merge, overwrite, sync and rollback orchestration.
- `photoArchive.js` — photo serialization, restoration, hashing and archive paths.
- `merge.js` — leak, monitoring, history and field-version merge rules plus merge preview.
- `componentArchive.js` — the component registry as `components.json`, and merging it back in.
- `componentPhotoArchive.js` — component photographs: out into a folder of their own, back into local storage.
- `schemaArchive.js` — technological drawings under their own file names.
- `projectMeta.js` — project metadata, variables, timestamps and recalculation helpers.
- `runtime.js` — concurrency, yielding and lazy JSZip loading.
- `constants.js` — shared archive constants and project type signatures.

Refactors inside this directory must preserve the exports of `../projectBackupService.js` unless a deliberate API migration is made.
