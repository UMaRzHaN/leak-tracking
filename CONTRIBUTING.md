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
- do not lower the coverage, bundle or maintainability budgets to make CI pass;
- do not change the record key of an existing dataset — the key _is_ the
  migration, and a dataset that moves is a dataset that can be lost. Leaks stay
  under the bare project id for exactly this reason;
- do not collect photo owners before `PhotoRepository.gcOrphaned` lists what is
  stored. The sweep takes a collector, not a list, precisely so the listing
  happens first: anything saved after it cannot be in that list, and so cannot
  be deleted. Handing it a ready-made array puts that race back, silently.

## Build budgets

`npm run check:bundle` fails the build; it does not warn. There are two limits
and both sit around 3.4 KB of headroom:

- **`nonExcelChunkBytes` (368 640) is a per-chunk ceiling**, and the index chunk
  is at 99.1 % of it. This one is **not** in the warning list — warnings are
  printed for four summary metrics only — so it stays silent right up until it
  fails a build. Measure it directly: `ls -l dist/assets/index-*.js`.
- **`initialGzip` (128 000)**: about 3.4 KB left. In raw bytes the entry graph
  looks far roomier (14 KB), which makes the two easy to confuse.

What follows from that:

- any new **static** dependency in the entry graph will fail CI. Everything
  heavy is behind `await import` and loads only on the screen that needs it:
  equipment dictionaries, `exceljs`, `jszip`, locales, the map;
- the component registry follows the same rule — `config.components` is lazy,
  and so is `ComponentRepository`: every caller reaches it through an
  `await import`, which is what keeps the Capacitor bridge out of the entry
  chunk. The cards themselves come from `ComponentRegistryContext`; the header
  reads them through `useRegistryLocationSource`, the map through
  `useMapComponents`. `hasComponentRegistry` lives apart from the rest of
  `projectAdapter` for the same reason: it is asked from the entry graph, the
  leak-field helpers beside it are not;
- splitting a module is not free: the last three splits cost about 130 bytes of
  gzip between them. Measure with `npm run build:analyze` rather than guessing.

## Release verification

`npm run verify:release` runs the whole local gate: lint, formatting, types,
maintainability, coverage plus its ratchet, the analyzed build, bundle budgets,
licences, SBOM and checksums. It requires a clean worktree.

Two things it cannot cover, both only reachable in CI: the Android emulator on
API 24 (`minSdkVersion`) and API 35, and WebKit. Release signing is configured
and verified through `npm run android:release`.

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

**Component registry.** A type carries one only if its config declares a
`components` block, and only `upstream` does today — that is the whole feature
flag, and a type without the block simply has no registry tab. Adding one to a
second type needs its own equipment dictionaries and export columns, which come
from the customer rather than from us.

Note that the inventory archive carries neither a project name nor a type, so
the first-run screen infers the type as the only one that declares a registry
(`componentRegistryProjectTypes()`). The moment a second type declares one the
inference stops being unambiguous and the import fails with
`MISSING_PROJECT_TYPE` — deliberately loud, because the screen will then have
to ask.

## Decisions not to re-litigate

Not tasks. Written down so nobody overturns them without knowing the reason.

- **CRC32 on export is not getting faster.** Slice-by-8 buys 41 → 32 ms on
  16 MB (1.28×) at the price of eight tables and an unrolled loop inside the
  function archive integrity depends on. If export speed is ever the actual
  complaint, move CRC into the worker instead of speeding up the loop.
- **The project installs two TypeScripts, and that is deliberate.**
  `typescript` stays on 6 because ESLint needs it: `@eslint-react` reaches
  TypeScript through `ts-api-utils`, which reads `ts.TypeFlags` at module load.
  In TypeScript 7 the root import returns only the version — the compiler API
  moved under `typescript/unstable/*` — so that read throws and takes the whole
  lint run down with it, before a single rule has been considered. The
  `typescript-next` alias holds 7 and is what `npm run typecheck` runs: the
  gate checks against the newer compiler, the linter parses with the older one,
  and neither knows about the other. Collapse this back to one dependency once
  `ts-api-utils` accepts TypeScript 7 — `npm view ts-api-utils peerDependencies`
  still caps it at `<7`, release candidate included.
- **Бюджет сложности ограничивает всё, а не список.** Раньше
  `maintainability-budget.json` перечислял пятнадцать файлов вручную: что в
  списке — расти не могло, а чего в списке нет — не ограничивалось ничем. За
  его пределами оказались пятьдесят пять файлов длиннее трёхсот строк, включая
  самые новые. Теперь наоборот: `maxLines` действует на весь `src` (без
  тестов), а превышение требует строки в `exceptions` — то есть решения, а не
  умолчания. Храповик работает в обе стороны: когда файл опускается под общий
  потолок, запись обязана уйти, иначе она молча вернёт ему право расти
  обратно. `stricter` — для модулей, которым потолок задан жёстче общего
  намеренно. Файлы перечисляются обходом файловой системы, а не через
  `git ls-files`: неотслеженный модуль оставался бы без потолка ровно до
  коммита. Скрипты и тесты пока вне бюджета — там свои основания для длины.
- **`strictNullChecks` включена на весь `src`, и список `include` может только
  расти.** Включали по каталогам, снизу вверх: разом она давала около восьмисот
  ошибок, а столько не разбирают за раз — и в итоге не включают никогда.
  Каталог тянет за собой то, на что опирается, поэтому `app/` и не удалось взять
  отдельно: он идёт последним, а не следующим. Подробности каждой ступени и что
  на ней нашлось — в шапке `tsconfig.strict.json`. Сверх неё закручены
  `strictFunctionTypes`, `noUnusedLocals` и `useUnknownInCatchVariables`;
  `noImplicitAny` (3612 ошибок) и тесты под строгой проверкой (1976) не взяты
  намеренно. Обычный `npm run typecheck` остаётся нестрогим и покрывает весь
  `src` — это два разных гейта, а не замена одного другим.
- **The leak report does not carry the inventory.** Two archives for two
  different recipients: emissions on one side, whoever owns the equipment on
  the other. The ZIP backup still carries everything — it moves a project, it
  is not a report.
- **The registry shares SQLite with the leaks.** The plugin table keys rows by
  project and `id` and never looks inside the payload; that is where the
  transactionality comes from, and why two datasets in one file cannot collide.
  A separate database would buy nothing. Locked down by
  `LeakDatabaseStoreInstrumentedTest`.
- **Component numbers are not guaranteed unique.** Ranges are not handed out
  (the customer's decision) and another device's numbers are invisible. A
  duplicate warns but never blocks; a collision from another device is resolved
  when the two are merged.
- **The GPS wait on save is not getting shorter.** Fifteen seconds is the price
  of the record not falling off the map, and asking somebody standing at a
  wellhead is worse than waiting. E2E supplies a fix through configuration
  rather than routing around the code.
- **A leak never takes the card's photograph.** The card shows the component;
  a leak needs a photograph of the leak. Substituting one for the other passes
  a picture of working hardware off as evidence of a leak.
- **A card's coordinates are used only when the leak has none.** Its own fix is
  evidence — found here means found here. But a leak without coordinates drops
  off the map entirely, and the hardware's position beats nothing.
- **Picking a card sorts by distance, it does not filter by radius.** Under a
  canopy and between tanks the fix wanders by tens of metres, and a hard radius
  would hide exactly the card somebody walked over to find. The distance is
  printed on every row, so a wrong one is obvious.
- **The registry offers the whole leak naming dictionary, lines included.**
  "Входная линия", "Байпасная линия" and the other seven arrive in the card
  along with everything else. Deliberate: a line carries a tag on the drawing
  and is inventoried like any valve, so do not filter `line_types` out.
- **Equipment names have one source.** `component_names` is derived from
  `fieldDictionary.components` and only extended with hardware the leak
  dictionary does not know. The `component` field is shared between a card and
  a leak so that linking one to the other stays a straight copy; two
  independent lists drifted into naming the same valve two ways.
  `componentDictionary.test.js` keeps them from drifting again.

## Обновление зависимостей

Журнал решений по dependabot: что взято, что закрыто и при каком условии
закрытое можно открыть обратно. Пишется потому, что предложение приходит
каждую неделю, а причина отказа живёт в чужой голове ровно до следующего раза.

**Группа принимается целиком или не принимается.** Dependabot складывает
обновления в `npm-production` и `npm-development` и не умеет предлагать их по
частям. Если один участник группы негоден, ветка пересобирается руками: слить
предложение, откатить одну строку в `package.json`, пересобрать замок через
`npm install`, потом проверить `npm ci` с нуля — иначе замок останется
несогласованным с тем, что объявлено.

**Проверять — значит собрать и прогнать, а не прочитать дифф.** Для правок
`package.json` это полный набор ворот; для `android/` — то же, что гоняет CI,
с теми же переменными окружения:

```
cd android && ANDROID_VERSION_CODE=1 ANDROID_VERSION_NAME=1.0.0-probe \
  ./gradlew test lintDebug assembleDebug lintRelease assembleRelease
```

Без переменных сборка падает на собственной защите проекта, и это не про
зависимости.

**Обёртку Gradle поднимать задачей, а не правкой файла.**
`./gradlew wrapper --gradle-version <версия> --distribution-type all`
пересобирает `gradle-wrapper.jar` самим Gradle, а не берёт его из чужой ветки —
для файла, который скачивает и запускает сборку, происхождение важнее удобства.
Флаг `--distribution-type all` обязателен: по умолчанию задача переключает
дистрибутив на `-bin`, а в `-all` едут исходники, по которым IDE показывает
документацию.

### Закрыто в `.github/dependabot.yml`

| Что              | Предел           | Условие снятия                                                     |
| ---------------- | ---------------- | ------------------------------------------------------------------ |
| `typescript`     | мажорные закрыты | цепочка eslint примет седьмую — см. запись про два TypeScript выше |
| `gradle-wrapper` | `>=9.6` закрыто  | поднят Android Gradle Plugin выше 8.13.0                           |

Граница по Gradle проверена с обеих сторон, а не взята из сообщения об ошибке:
на 9.7.1 падает даже `./gradlew help` — AGP 8.13.0 опирается на
`InternalProblems`, удалённый в Gradle 9.6.0; на 9.5.0 проходит весь набор CI.
Записи не глушат обновления, а сдвигают их в проверенные пределы: после них
dependabot предлагает самое свежее из разрешённого.

## Commit message convention

```
feat: add new project type "newtype"
fix: correct GPS filter threshold in DataBase
chore: update eslint config
test: add LeakRepository unit tests
```
