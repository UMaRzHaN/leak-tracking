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
