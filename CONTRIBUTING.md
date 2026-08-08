# Contributing

## Branch naming

| Prefix           | Use for                         |
| ---------------- | ------------------------------- |
| `feature/<name>` | New features                    |
| `fix/<name>`     | Bug fixes                       |
| `chore/<name>`   | Tooling, deps, config, refactor |

## Where things live

The placement rules below apply equally to hooks, services, and utils.

| Consumer count | Placement                                                                         |
| -------------- | --------------------------------------------------------------------------------- |
| **1**          | Move into that consumer's folder (co-locate)                                      |
| **2+**         | Keep in the nearest shared ancestor (`src/hooks/`, `src/utils/`, `src/services/`) |
| **0**          | Verify, then **delete** (dead code)                                               |

### Hook placement

A hook belongs to the `hooks/` folder of the nearest component that is its
sole consumer — regardless of nesting depth.

```
features/leakForm/
├── LeakForm.jsx
└── hooks/
    ├── useLeakForm.js        ← only LeakForm uses this
    └── useStepValidation.js  ← only LeakForm uses this
```

`src/hooks/` keeps **only** hooks used in 2+ unrelated features/pages.

### Service placement

```
services/maps/tileCache.js   ← 3 consumers → stays in src/services/maps/
pages/DataBase/excel.js      ← 1 consumer (DataBase) → lives next to it
hooks/cameraService.js       ← 1 consumer (useCamera) → lives next to it
```

### Util placement

Same rule. Example: `features/search/Autocomplete/smartFilter.js` lives
alongside `Autocomplete.jsx` because only that component uses it.

### Subsystem layout under `services/`

One directory per subsystem, no loose files at the top level:

```
services/
├── archive/      # zipStoreStream, archivePaths — shared by import and export
├── backup/       # projectBackupService facade + merge/import/export parts
├── excelExport/  # Workbook building, runs in a Web Worker
├── import/       # excelImportService facade + XLSX/ZIP parsing parts
├── maps/         # tileCache — offline tile storage
├── storage/      # persistentStorage, publicFileWriter, leakFieldVersions
└── sync/         # localSyncService, projectSyncState, syncClock
```

Two naming decisions worth knowing before adding a directory here:

- `archive/` and `storage/` exist because their files are shared across
  subsystems and belong to none of them individually.
- the folder is `excelExport/`, not `export/`: KML export lives in
  `pages/MapPage/`, so the generic name would be misleading.

### Layering

React pages receive prepared state, call services, and render errors. A page
must not know the details of IndexedDB, Filesystem, ZIP, XLSX or TLS — reach
for a service instead. Data access goes through `src/repositories/` only, so
that the web (IndexedDB) and Android (SQLite plugin) backends stay
interchangeable.

Do not mix UI, filesystem access, merge logic and validation in one module,
and do not put backend calls directly into React components.

## Data compatibility constraints

The app stores field data that cannot be re-collected, and archives created by
older versions stay in circulation. These rules are not negotiable in a
refactor:

- do not change the archive format without bumping `schemaVersion`;
- do not drop support for older archives;
- do not run an irreversible migration without a backup;
- do not change photo paths without a separate migration;
- do not overwrite a project after a failed import;
- do not delete an old implementation before its migration tests pass;
- do not swallow read/write errors — a silent failure loses data;
- do not lower the coverage, bundle or maintainability budgets to make CI pass.

## Running the project

```bash
npm run dev            # Start dev server
npm test               # Run all tests (vitest)
npm run test:coverage  # Run tests + generate coverage report in /coverage
npm run lint           # Check for ESLint errors/warnings
npm run lint:fix       # Auto-fix ESLint issues
npm run format         # Prettier-format all src/ files
npm run format:check   # Check formatting without writing
```

## Before committing

The pre-commit hook runs automatically via Husky and applies
`eslint --fix` + `prettier --write` to staged `src/**/*.{js,jsx}` files.

To run the same checks manually:

```bash
npm run lint:fix && npm run format
```

## Adding a new project type

Project types (upstream / midstream / downstream) live in `src/configs/`.

```
src/configs/
├── index.js                   ← barrel: exports PROJECT_CONFIGS
├── projects.js                ← PROJECTS map + PROJECT_META
├── projectAdapter.js          ← capability helpers (getProjectFields, etc.)
├── projectLocation.config.js  ← location label config per type
├── shared/                    ← fields and steps shared across all types
├── upstream/
│   ├── index.js               ← barrel
│   ├── upstream.config.js     ← UPSTREAM_CONFIG (frozen object)
│   └── data/
│       ├── fields.js          ← FIELDS, NUMBER_FIELDS, COPY_FIELDS
│       └── steps.js           ← STEPS (form step definitions)
├── midstream/  (same shape)
└── downstream/ (same shape)
```

**Steps to add a new type `newtype`:**

1. Create `src/configs/newtype/` mirroring the `upstream/` structure.
2. Export a `NEWTYPE_CONFIG` frozen object with the same shape
   (`steps`, `voice`, `semantic`, `system`, `export`).
3. Register it in `src/configs/projects.js`:
   ```js
   import newtype from "./newtype/newtype.config";
   export const PROJECTS = { upstream, midstream, downstream, newtype };
   ```
4. Add its metadata to `PROJECT_META` in the same file.
5. Add location config to `src/configs/projectLocation.config.js`.
6. Add field/step data under `src/configs/newtype/data/`.

The rest of the app (LeakForm, voice recognition, export) picks up the
new type automatically through `projectAdapter.js`.

## Commit message convention

```
feat: add new project type "newtype"
fix: correct GPS filter threshold in DataBase
chore: update eslint config
test: add LeakRepository unit tests
```
