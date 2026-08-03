# План инженерного улучшения Leak Tracking

**Статус документа:** рабочее техническое задание  
**Проект:** `leak-tracking`  
**Цель:** повысить сопровождаемость, надежность хранения данных и готовность к backend без переписывания приложения с нуля.

---

## 1. Исходное состояние

Проект уже является полноценным offline-first приложением и содержит:

- React 19 + Vite;
- Capacitor Android;
- локальное хранение данных и фотографий;
- импорт и экспорт XLSX/ZIP;
- резервные копии, восстановление и объединение проектов;
- локальную синхронизацию между устройствами;
- карты и offline tile cache;
- unit-, component-, E2E-, offline- и performance-тесты;
- контроль coverage, bundle size, licenses, SBOM и release evidence.

Текущие показатели сохраненного coverage-отчета:

| Метрика | Значение |
|---|---:|
| Lines | 79,82% |
| Statements | 77,31% |
| Functions | 70,71% |
| Branches | 63,39% |

Крупнейшие производственные файлы:

| Файл | Строк |
|---|---:|
| `src/pages/Settings/hooks/useSettingsPage.js` | 829 |
| `src/repositories/LeakRepository.js` | 817 |
| `src/pages/Monitoring/hooks/useMonitoringPage.js` | 784 |
| `src/services/maps/tileCache.js` | 601 |
| `src/services/projectBackup/backupImport.js` | 546 |
| `src/app/hooks/useAppBootstrap.js` | 539 |
| `src/repositories/backupSchema.js` | 520 |
| `src/services/projectSyncState.js` | 515 |
| `src/services/localSyncService.js` | 508 |
| `src/pages/Settings/hooks/useLocalSync.js` | 508 |

Основная проблема проекта — не отсутствие функций, а рост сложности в критических слоях:

1. хранение данных;
2. backup/import/merge;
3. локальная синхронизация;
4. Settings и Monitoring;
5. слабая статическая типизация;
6. хранение всего проекта одним массивом;
7. отсутствие формальной модели изменений для будущего backend.

---

## 2. Главный принцип изменений

Проект **не переписывать с нуля**.

Все изменения выполнять постепенно, с сохранением:

- существующих пользовательских данных;
- совместимости старых JSON-, XLSX- и ZIP-архивов;
- текущих путей фотографий;
- работы web и Android;
- offline-first поведения;
- восстановления после повреждения данных;
- существующих сценариев merge и overwrite;
- возможности отката миграций;
- текущих release-проверок.

---

## 3. Обязательные ограничения

При выполнении задач запрещено:

- менять формат архива без увеличения `schemaVersion`;
- удалять поддержку старых архивов;
- выполнять необратимую миграцию без backup;
- хранить backend-вызовы непосредственно в React-компонентах;
- смешивать UI, filesystem, merge и validation в одном модуле;
- массово переводить весь проект на TypeScript одним PR;
- менять пути фотографий без отдельной миграции;
- уменьшать существующие coverage/bundle/maintainability бюджеты ради прохождения CI;
- скрывать ошибки чтения и записи данных;
- перезаписывать проект после неуспешного импорта;
- удалять старую реализацию до прохождения миграционных тестов.

---

# 4. Целевая архитектура

```text
src/
├── domain/
│   ├── leak/
│   │   ├── leak.types.ts
│   │   ├── leak.schema.ts
│   │   ├── leak.normalization.ts
│   │   └── leakLifecycle.ts
│   ├── project/
│   │   ├── project.types.ts
│   │   ├── project.schema.ts
│   │   └── projectVersion.ts
│   ├── monitoring/
│   └── sync/
├── repositories/
│   ├── project/
│   │   ├── ProjectRepository.ts
│   │   ├── WebProjectStorage.ts
│   │   ├── AndroidProjectStorage.ts
│   │   ├── ProjectRecovery.ts
│   │   └── ProjectWriteQueue.ts
│   ├── photos/
│   └── migrations/
├── services/
│   ├── import/
│   ├── export/
│   ├── backup/
│   ├── sync/
│   └── maps/
├── application/
│   ├── projects/
│   ├── leaks/
│   ├── monitoring/
│   └── settings/
└── pages/
```

React-страницы должны:

- получать подготовленное состояние;
- вызывать application use cases;
- отображать ошибки;
- не знать деталей IndexedDB, Filesystem, ZIP, XLSX и TLS.

---

# 5. План выполнения

## Этап 0. Зафиксировать стабильную базовую версию

### Задачи

- [ ] Создать отдельную ветку:

```bash
git checkout -b refactor/architecture-hardening
```

- [ ] Убедиться, что рабочее дерево чистое.
- [ ] Зафиксировать текущие результаты тестов и размеры bundle.
- [ ] Создать контрольный backup-пакет минимум для:
  - upstream;
  - midstream;
  - downstream;
  - проекта с фото;
  - проекта с monitoring;
  - проекта со старыми полями;
  - проекта с поврежденной основной копией и рабочим backup.
- [ ] Добавить fixtures старых архивов в тесты.
- [ ] Не использовать переданный полный архив с `node_modules`.
- [ ] Передавать исходники через:

```bash
npm run pack:source
```

### Проверка

```bash
npm ci
npm run lint
npm run format:check
npm run typecheck
npm run test:coverage
npm run build:analyze
npm run check:bundle
npm run check:licenses
```

### Критерий готовности

- Все текущие проверки проходят.
- Создана таблица baseline-метрик.
- Старые архивы используются как immutable fixtures.
- Исходный ZIP воспроизводимо собирается на чистой машине.

---

## Этап 1. Усилить доменную типизацию

### Цель

Перенести критические контракты данных из неявных JS-объектов в TypeScript-типы без массового переписывания UI.

### Уже существующая база

В проекте уже есть:

```text
src/types/domain.ts
src/types/runtime.d.ts
```

И типы:

- `ProjectType`;
- `LeakStatus`;
- `ProjectMetadata`;
- `MonitoringRecord`;
- `LeakRecord`;
- `WebDataEnvelope`;
- `ImportOperation`.

Их следует расширять, а не создавать параллельную несовместимую систему.

### Задачи

- [ ] Разделить `src/types/domain.ts` по предметным областям.
- [ ] Удалить индексные типы `[field: string]: unknown` из критических внутренних моделей.
- [ ] Оставить расширяемые поля только в импортной модели.
- [ ] Ввести отдельные типы:

```ts
type ProjectId = string;
type LeakId = string;
type MonitoringRecordId = string;
type DeviceId = string;
type OperationId = string;
type EpochId = string;
type PhotoPath = string;
type UnixTimestampMs = number;
```

- [ ] Разделить модели:

```ts
interface RawImportedLeak {}
interface NormalizedLeak {}
interface StoredLeak {}
interface LeakViewModel {}
```

- [ ] Добавить discriminated union для результатов операций:

```ts
type RepositoryResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: RepositoryError };
```

- [ ] Типизировать:
  - import preview;
  - merge preview;
  - merge result;
  - backup manifest;
  - sync state;
  - sync session;
  - photo descriptor;
  - migration result;
  - recovery result.

- [ ] Включать строгие настройки постепенно:

```json
{
  "strictNullChecks": true,
  "noImplicitReturns": true,
  "noFallthroughCasesInSwitch": true,
  "noUncheckedIndexedAccess": true
}
```

- [ ] Не включать полный `"strict": true` до типизации repository/import/sync.

### Рекомендуемый порядок миграции файлов

1. `src/types/domain.ts`;
2. `src/repositories/backupSchema.js`;
3. `src/services/projectSyncState.js`;
4. `src/services/projectBackup/*`;
5. `src/repositories/LeakRepository.js`;
6. hooks Settings/Monitoring;
7. UI-компоненты.

### Критерий готовности

- Критические сервисы не используют `any`.
- Разница между imported, normalized и stored data формализована.
- Ошибки формата обнаруживаются до записи в repository.
- `npm run typecheck` проверяет production-код со строгими null-checks.

---

## Этап 2. Разделить крупные оркестраторы

### 2.1. `useSettingsPage.js`

Разделить на:

```text
useSettingsPage.ts
useProjectSettings.ts
useImportSettings.ts
useBackupSettings.ts
useExportSettings.ts
useMapSettings.ts
useStorageSettings.ts
useSettingsNotifications.ts
```

`useSettingsPage` должен только объединять результаты специализированных hooks.

### 2.2. `useMonitoringPage.js`

Разделить на:

```text
useMonitoringPage.ts
useMonitoringFilters.ts
useMonitoringRecords.ts
useMonitoringPhotos.ts
useMonitoringDraft.ts
useMonitoringPersistence.ts
```

### 2.3. `LeakRepository.js`

Разделить ответственность:

```text
ProjectRepository
WebProjectStorage
AndroidProjectStorage
ProjectDataValidator
ProjectRecovery
ProjectWriteQueue
ProjectRevisionService
```

### 2.4. `tileCache.js`

Разделить на:

```text
TileCacheRepository
TileDownloadQueue
TileQuotaManager
TileCacheCleanup
TileCacheManifest
```

### Правила декомпозиции

- [ ] Один модуль — одна причина для изменения.
- [ ] Pure functions не должны обращаться к storage.
- [ ] Filesystem adapter не должен содержать бизнес-merge.
- [ ] UI hook не должен создавать ZIP.
- [ ] Все побочные эффекты должны быть явно вызываемыми.
- [ ] Для каждого выделенного модуля добавить unit-тест.
- [ ] Не менять публичное поведение в одном PR с декомпозицией.

### Критерий готовности

- Производственные файлы не превышают согласованный maintainability budget.
- Critical orchestration functions не превышают 80–120 строк.
- Pure merge/validation functions тестируются без DOM и Capacitor.
- Repository adapters можно тестировать независимо.

---

## Этап 3. Ввести последовательную запись и защиту от гонок

### Проблема

При одновременных autosave, import, monitoring и photo-операциях возможны:

- потерянные обновления;
- запись устаревшего массива поверх нового;
- несогласованный revision;
- сохранение данных до завершения фотооперации;
- частично завершенный импорт.

### Решение

Добавить `ProjectWriteQueue` с последовательным выполнением операций для каждого проекта.

```ts
interface ProjectWriteCommand {
  operationId: OperationId;
  projectId: ProjectId;
  expectedRevision?: number;
  execute(context: ProjectWriteContext): Promise<ProjectWriteResult>;
}
```

### Задачи

- [ ] Создать одну очередь записи на `projectId`.
- [ ] Каждая запись получает `operationId`.
- [ ] Перед commit проверять `expectedRevision`.
- [ ] При конфликте не выполнять silent overwrite.
- [ ] Фото сначала сохранять во временное расположение.
- [ ] Данные и фото подтверждать одной логической операцией.
- [ ] При ошибке удалять созданные временные файлы.
- [ ] Добавить idempotency для повторного запуска операции.
- [ ] Импорт и merge выполнять через ту же очередь.
- [ ] Добавить журнал незавершенных операций.

### Тесты

- [ ] Два последовательных autosave не теряют изменения.
- [ ] Import не перезаписывается поздним autosave.
- [ ] Ошибка сохранения фото откатывает данные.
- [ ] Повтор `operationId` не дублирует запись.
- [ ] Crash между prepare и commit восстанавливается при запуске.
- [ ] Revision conflict возвращает понятную ошибку.

### Критерий готовности

- Нет параллельной прямой записи одного проекта.
- Любая мутация проходит через единую write queue.
- Незавершенные операции можно диагностировать и восстановить.

---

## Этап 4. Перейти от полного массива к хранилищу записей

### Важно

Не удалять текущий формат сразу. Ввести `Storage V2` параллельно с миграцией.

### Целевая модель

```text
projects
leaks
monitoring_records
history_entries
photo_metadata
project_settings
sync_operations
migrations
```

### Минимальные поля записи

```ts
interface StoredEntityMeta {
  id: string;
  projectId: string;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  revision: number;
  deviceId: string;
}
```

### Задачи

- [ ] Добавить `storageSchemaVersion`.
- [ ] Создать migration `V1ArrayToV2Records`.
- [ ] Перед миграцией создавать backup.
- [ ] Сделать миграцию повторяемой и idempotent.
- [ ] Реализовать read compatibility:
  - сначала V2;
  - если V2 отсутствует — прочитать V1;
  - выполнить миграцию;
  - проверить checksum/count;
  - переключить active version.
- [ ] Не удалять V1 до успешной верификации.
- [ ] Добавить tombstone через `deletedAt`.
- [ ] Перенести monitoring в отдельные записи.
- [ ] Хранить metadata фото отдельно от бинарных файлов.
- [ ] Добавить индексы:
  - `projectId`;
  - `status`;
  - `updatedAt`;
  - `deletedAt`;
  - `leakId`;
  - `monitoringDate`.

### Для Android

Рекомендуемые варианты:

1. SQLite через Capacitor plugin;
2. собственный SQLite adapter;
3. временно — per-record JSON, если SQLite пока невозможно внедрить.

Предпочтительный вариант — SQLite с транзакциями.

### Для Web

Использовать IndexedDB object stores, не один envelope с полным массивом.

### Обязательные проверки миграции

```text
count(V1 leaks) == count(V2 active leaks)
count(V1 monitoring) == count(V2 monitoring)
all photo references resolved
all leak IDs preserved
all project metadata preserved
checksum logical data matches
```

### Критерий готовности

- Изменение одной утечки не сериализует весь проект.
- Удаление хранится как tombstone.
- Старые проекты автоматически открываются.
- Миграция не удаляет исходные данные до проверки.
- Можно откатиться к V1 backup.

---

## Этап 5. Подготовить модель синхронизации к backend

### Цель

Подготовить проект к серверной синхронизации, не реализуя backend внутри UI.

### Добавить в модель

```ts
interface SyncMetadata {
  deviceId: string;
  operationId: string;
  entityRevision: number;
  updatedAt: number;
  deletedAt: number | null;
  syncState: "local" | "pending" | "synced" | "conflict";
}
```

### Outbox

Каждое локальное изменение создает запись:

```ts
interface OutboxEvent {
  id: OperationId;
  projectId: ProjectId;
  entityType: "leak" | "monitoring" | "photo" | "project";
  entityId: string;
  operation: "create" | "update" | "delete";
  baseRevision: number;
  payload: unknown;
  createdAt: number;
  attempts: number;
}
```

### Задачи

- [ ] Добавить стабильный `deviceId`.
- [ ] Добавить UUID всем сущностям, где еще используются нестабильные ID.
- [ ] Ввести `updatedAt` и `deletedAt`.
- [ ] Ввести entity-level revision.
- [ ] Добавить outbox.
- [ ] Добавить sync cursor.
- [ ] Добавить photo hash.
- [ ] Убрать зависимость merge только от времени файла.
- [ ] Формализовать conflict policy.

### Рекомендуемая политика конфликтов

| Данные | Политика |
|---|---|
| Независимые поля | field-level merge |
| Статус утечки | domain rule + журнал |
| Фото | сохранять обе версии |
| Monitoring | append/merge по UUID |
| Удаление против изменения | пользовательский конфликт |
| Project metadata | explicit conflict |

### API boundary

UI должен работать через интерфейс:

```ts
interface SyncGateway {
  push(events: OutboxEvent[]): Promise<PushResult>;
  pull(cursor?: string): Promise<PullResult>;
}
```

Локальная синхронизация и будущий backend должны использовать одну доменную модель событий.

### Критерий готовности

- Offline-изменения записываются в outbox.
- Повторная отправка idempotent.
- Удаления синхронизируются tombstone, а не физическим отсутствием.
- Local Sync и backend sync не требуют разных форматов сущностей.

---

## Этап 6. Усилить защиту локальных данных

### Задачи

- [ ] Классифицировать данные:
  - координаты;
  - фотографии;
  - описание оборудования;
  - пользовательские данные;
  - служебные журналы.
- [ ] Для Android использовать ключ из Android Keystore.
- [ ] Шифровать чувствительные локальные данные.
- [ ] Не хранить ключ рядом с ciphertext.
- [ ] Добавить опциональное шифрование экспортного ZIP.
- [ ] Пароль не записывать в preferences/logs.
- [ ] Исключить чувствительные данные из error telemetry.
- [ ] Добавить очистку временных файлов после:
  - успешной операции;
  - ошибки;
  - перезапуска приложения.
- [ ] Проверить Android backup/exported components.
- [ ] Добавить проверку свободного места до большого импорта.
- [ ] Добавить redaction логов.

### Важно

Шифрование внедрять только после стабилизации Storage V2, иначе одновременно изменятся:

- структура данных;
- способ записи;
- формат файлов;
- recovery;
- migration.

### Критерий готовности

- Потеря физического файла не раскрывает чувствительное содержимое без ключа.
- Recovery и backup работают с зашифрованным хранилищем.
- Экспорт с паролем имеет тест на неверный пароль и поврежденный архив.

---

## Этап 7. Закрыть критические тестовые пробелы

### Приоритет P0

- [ ] Повреждение primary data и восстановление backup.
- [ ] Повреждение primary и backup одновременно.
- [ ] Недостаток свободного места.
- [ ] Сбой после записи temp, но до commit.
- [ ] Сбой после перемещения backup.
- [ ] Revision conflict.
- [ ] Одновременный autosave и import.
- [ ] Прерывание Local Sync.
- [ ] Повторная передача одного sync operation.
- [ ] Импорт архива с отсутствующими фото.
- [ ] Импорт архива с дублирующими photo paths.
- [ ] Миграция V1 → V2.
- [ ] Повторный запуск миграции.
- [ ] Откат после неуспешной миграции.

### Приоритет P1

- [ ] Отказ GPS permission.
- [ ] Устаревшие координаты.
- [ ] Координаты вне диапазона.
- [ ] Offline map quota.
- [ ] Отмена загрузки tile cache.
- [ ] Поврежденное изображение.
- [ ] Удаление фото во время просмотра.
- [ ] Очень длинные пользовательские значения.
- [ ] 10 000 утечек с monitoring и фото metadata.
- [ ] Старый XLSX без project type.
- [ ] XLSX с неоднозначными заголовками.

### Модули с низким coverage, требующие внимания

- `useLeakActions`;
- `useMainPageActions`;
- `useGeolocation`;
- `offlineMap`;
- `LeakDetails` components;
- `useLeakDetailsPersistence`;
- `viewBlockUtils`.

### Критерий готовности

Не повышать coverage искусственно тестами констант. Основной показатель — покрытие отказов и ветвей критической логики.

Целевые значения после завершения этапов:

| Метрика | Минимум |
|---|---:|
| Lines | 82% |
| Statements | 80% |
| Functions | 75% |
| Branches | 70% |
| Critical repository/import/sync branches | 85% |

---

## Этап 8. Улучшить процесс разработки

### Git

Использовать формат:

```text
type(scope): краткое описание
```

Примеры:

```text
refactor(repository): extract Android storage adapter
fix(import): preserve project name from Excel ZIP
test(sync): cover interrupted archive transfer
feat(storage): add V1 to V2 migration
```

Не использовать:

```text
smth
little fix
fixed problem
```

### Pull Request

Каждый PR должен содержать:

- описание проблемы;
- список измененных контрактов;
- риски потери данных;
- обратную совместимость;
- миграцию;
- rollback;
- тесты;
- ручные проверки Android;
- влияние на bundle;
- список измененных файлов.

### Размер PR

Рекомендуется:

- до 500 измененных производственных строк;
- одна архитектурная цель;
- без одновременного редизайна UI;
- тесты в том же PR.

### CI

Обязательный pipeline:

```bash
npm ci
npm run lint
npm run format:check
npm run typecheck
npm run check:maintainability
npm run test:coverage
npm run check:coverage-ratchet
npm run build:analyze
npm run check:bundle
npm run check:licenses
npm run generate:sbom
```

Отдельно:

```bash
npm run test:e2e
npm run test:e2e:offline
npm run test:e2e:cross-browser
npm run test:perf
```

Для Android release:

```bash
npm run android:release
```

---

# 6. Предлагаемое разбиение на PR

## PR-01 — Baseline и fixtures

- добавить immutable архивы старых версий;
- зафиксировать baseline;
- проверить `pack:source`;
- добавить документ восстановления.

## PR-02 — Domain types

- разделить `domain.ts`;
- типизировать backup manifest и sync state;
- включить `strictNullChecks`.

## PR-03 — Repository adapters

- выделить web и Android storage;
- сохранить старый публичный API;
- добавить contract tests.

## PR-04 — Write queue

- последовательная запись;
- revision checks;
- operation journal;
- race-condition tests.

## PR-05 — Settings decomposition

- разделить `useSettingsPage`;
- не менять UI;
- перенести side effects в services.

## PR-06 — Monitoring decomposition

- разделить draft, persistence, photos и filters;
- добавить тесты прерываний.

## PR-07 — Storage V2 web

- IndexedDB stores;
- миграция;
- compatibility read;
- rollback.

## PR-08 — Storage V2 Android

- SQLite adapter;
- транзакции;
- migration;
- recovery.

## PR-09 — Sync metadata и outbox

- deviceId;
- operationId;
- tombstones;
- cursor;
- event model.

## PR-10 — Security hardening

- Keystore;
- шифрование;
- encrypted export;
- log redaction.

---

# 7. Definition of Done для каждой задачи

Задача считается завершенной только если:

- [ ] код проходит lint;
- [ ] форматирование проходит;
- [ ] typecheck проходит;
- [ ] unit-тесты проходят;
- [ ] coverage ratchet не ухудшен;
- [ ] bundle budget не ухудшен без обоснования;
- [ ] старые архивы открываются;
- [ ] фото сохраняются и восстанавливаются;
- [ ] Android-сценарий проверен;
- [ ] web-сценарий проверен;
- [ ] rollback описан;
- [ ] документация обновлена;
- [ ] нет прямой записи в storage в обход repository;
- [ ] нет новых `any` в критическом коде;
- [ ] ошибки не подавляются без уведомления;
- [ ] изменены только необходимые файлы.

---

# 8. Порядок приоритетов

## P0 — выполнить до новых крупных функций

1. baseline и fixtures;
2. repository adapters;
3. write queue;
4. critical race/failure tests;
5. domain type contracts.

## P1 — выполнить до backend

1. Storage V2;
2. UUID и tombstones;
3. outbox;
4. entity revisions;
5. sync cursor;
6. photo hashes.

## P2 — выполнить перед промышленным масштабированием

1. encryption at rest;
2. encrypted backup;
3. centralized audit;
4. роли и авторизация;
5. серверная синхронизация;
6. remote recovery.

---

# 9. Что не следует делать сейчас

Не рекомендуется прямо сейчас:

- переписывать весь проект на TypeScript;
- менять React на другой framework;
- менять все UI-компоненты;
- удалять существующий Repository;
- внедрять backend до появления entity-level storage;
- строить сложный event sourcing;
- переводить все фото в base64;
- сохранять фото непосредственно в XLSX;
- объединять миграцию storage и шифрование одним релизом;
- менять archive schema без compatibility reader.

---

# 10. Ожидаемый результат

После выполнения плана проект должен:

- надежно работать с 2 000–10 000+ утечек;
- не перезаписывать весь проект при изменении одной записи;
- безопасно переживать сбои во время записи;
- восстанавливаться после незавершенного импорта;
- хранить удаление через tombstone;
- иметь формализованную модель конфликтов;
- быть готовым к backend-синхронизации;
- сохранять offline-first режим;
- поддерживать старые архивы;
- иметь понятные границы между UI, domain, storage и sync;
- допускать развитие несколькими разработчиками без резкого роста регрессий.

---

# 11. Финальная команда проверки

После каждого законченного этапа:

```bash
npm run lint \
  && npm run format:check \
  && npm run typecheck \
  && npm run check:maintainability \
  && npm run test:coverage \
  && npm run check:coverage-ratchet \
  && npm run build:analyze \
  && npm run check:bundle \
  && npm run check:licenses
```

Перед web release:

```bash
npm run verify:release
```

Перед передачей исходников:

```bash
npm run pack:source
```

Перед Android release:

```bash
npm run android:release
```

---

## Итоговое решение

Ключевая стратегия — сохранить текущую сильную offline-first основу, но постепенно заменить крупные оркестраторы и полное сохранение массива на:

1. строгие доменные контракты;
2. независимые storage adapters;
3. последовательную очередь записи;
4. entity-level storage;
5. UUID, revisions и tombstones;
6. outbox для синхронизации;
7. совместимые миграции;
8. усиленную защиту данных.

Это позволит развивать существующий проект без опасного и дорогостоящего переписывания с нуля.
