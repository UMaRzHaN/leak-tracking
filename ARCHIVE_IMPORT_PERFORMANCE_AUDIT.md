# Аудит: производительность импорта архивов и структура `src/services`

**Дата:** 2026-08-03
**Область:** импорт XLSX/ZIP (`src/services/excelImportService.js`, `src/services/excelImport/*`), импорт полного backup-архива проекта (`src/services/projectBackup/*`), плоская структура `src/services`.

Этот документ дополняет `PROJECT_REFACTORING_PLAN.md` (там уже описана целевая архитектура `services/import|export|backup|sync|maps`). Ниже — конкретные строки кода, из-за которых импорт архивов работает медленнее, чем должен, и порядок исправлений.

---

## 1. Главная находка: архив распаковывается дважды

Каждый импорт (и Excel+ZIP, и полный backup ZIP) проходит через `verifyArchiveLimits()`:

```
src/utils/importLimits.js:426-444  verifyArchiveLimits()
src/utils/importLimits.js:376-419  streamArchiveEntry()
```

Эта функция последовательно, одним `for`-циклом без параллелизма, вызывает `entry.internalStream("uint8array")` **для каждого файла в архиве** и построчно суммирует байты — то есть полностью распаковывает каждую фотографию и лист Excel только для того, чтобы посчитать размер.

Дальше по коду тот же самый файл распаковывается **второй раз**, уже для реального использования:

- `src/services/excelImportService.js:82` — `workbook.xlsx.load(buffer)`
- `src/services/excelImportService.js:342` — `xlsxEntry.async("arraybuffer")`
- `src/services/projectBackup/archiveParser.js:94` — `jsonFile.async("string")`
- `src/services/projectBackup/photoArchive.js:268` — `photoFile.async("blob")` (на каждое фото)
- `src/services/excelImport/photoPipeline.js:316` — `file.async("blob")` (на каждое фото)

Итог: для архива с фотографиями (самый частый и самый тяжёлый случай импорта) CPU тратится на распаковку одного и того же содержимого **дважды**, последовательно, на главном потоке. Это и есть основная причина, почему импорт архивов ощущается медленным — особенно на Android с большим количеством фото.

**Рекомендация (P0, наибольший эффект):**
`assertArchiveLimits()` (`src/utils/importLimits.js:356-374`) уже дёшево проверяет объявленные в ZIP-заголовке размеры (`entry._data.uncompressedSize`) без распаковки — этого достаточно как быстрой защиты от zip-бомб. Полную побайтовую верификацию (`verifyArchiveLimits`) стоит не гонять заранее по всем файлам, а либо:

1. убрать отдельный проход и проверять реальный размер прямо в момент первого чтения каждого файла (совместить проверку с уже существующим вызовом `.async(...)`), либо
2. если нужна проверка "до старта импорта" — оставить её только для файлов, чей заявленный `uncompressedSize` отсутствует/подозрителен, а не для всех подряд.

Любой из вариантов убирает один полный проход по архиву — на архивах с большим числом фото это, скорее всего, самое заметное ускорение из всех перечисленных здесь.

---

## 2. `hydrateZipPhotos` читает фото последовательно, а не параллельно

```
src/services/excelImport/photoPipeline.js:321-385
```

Все остальные операции с фото в проекте используют `mapWithConcurrency` (`src/services/projectBackup/runtime.js:15-50`) — кроме этой функции. Здесь `for (const leak of result.leaks)` со сложенным `await readPhoto(...)` внутри, то есть фотографии из ZIP извлекаются одна за другой.

**Рекомендация (P0):** обернуть цикл в `mapWithConcurrency(result.leaks, N, ...)` по аналогии с `reconcileExcelImportPhotos` в том же файле (строки 244-300).

---

## 3. Параллелизм чтения/записи фото захардкожен на 3

```
src/services/excelImport/photoPipeline.js:13-14   DEFAULT_PHOTO_RECONCILE_CONCURRENCY = 3, DEFAULT_REUSABLE_PHOTO_CONCURRENCY = 3
src/services/excelImport/photoPipeline.js:387     DEFAULT_PHOTO_PERSIST_CONCURRENCY = 3
src/services/projectBackup/constants.js:19        IMPORT_CONCURRENCY = 3
```

Значение `3` нигде не обосновано измерениями. В `restorePhotosFromZip` (`src/services/projectBackup/photoArchive.js:251-261`) уже есть неплохая адаптивная логика (уменьшение параллелизма при больших фото), но базовое значение всё равно низкое.

**Рекомендация (P0/P1):** прогнать `performance/large-dataset.perf.spec.js` (уже есть в проекте) с параллелизмом 3 / 5 / 8 и зафиксировать оптимальное значение per-platform (web vs Android IndexedDB/Filesystem обычно выдерживают больше параллельных операций). Не менять "на глаз" без замера — это единственный пункт в списке, требующий бенчмарка перед мержем.

---

## 4. Сравнение фото побайтово вместо использования уже посчитанного хеша

```
src/services/excelImport/photoPipeline.js:100-114  blobsEqual()
src/services/excelImport/photoPipeline.js:189-196  вызов blobsEqual внутри reconcilePhotoValue
```

`blobsEqual` читает оба Blob в память и сравнивает побайтово в JS-цикле (`for (let index = 0; index < a.length; index++)`). Рядом уже есть `fingerprintBlob` (SHA-256 через `crypto.subtle`, `src/utils/blobHash.js`), который в этом же потоке используется для поиска переиспользуемых фото. Дешевле посчитать хеш существующего фото и сравнить строки, чем гонять побайтовое сравнение больших изображений в интерпретируемом JS-цикле.

**Рекомендация (P0):** заменить `blobsEqual` на сравнение `fingerprintBlob(existingBlob) === fingerprint`, используя уже переданный `fingerprintCache`.

---

## 5. У импорта, в отличие от экспорта, нет Web Worker и точек `yield`

Экспорт (`src/pages/DataBase/excelExportWorkerClient.js`, `src/services/excelExport/*`) выполняется в отдельном Web Worker и вставляет `yieldToMainThread()` каждые `EXPORT_YIELD_EVERY = 25` записей (`src/services/projectBackup/constants.js:17`, `src/services/projectBackup/photoArchive.js:78`).

У импорта такого нет:

- `parseExcelLeaks` (`src/services/excelImportService.js:150-245`) построчно разбирает лист Excel синхронно, без единого `await`/yield внутри цикла — на большой таблице (тысячи строк) это блокирует главный поток целиком.
- `JSZip.loadAsync`, `ExcelJS.load`, `verifyArchiveLimits`, разбор строк, обработка фото — всё это вызывается напрямую из UI-хуков (`useSettingsPage.js`, `ProjectSetupScreen.jsx`, `backup.js`) на главном потоке, без воркера.

Из-за этого импорт не только медленнее по сумме CPU-работы (см. п.1), но и **ощущается** медленнее — UI подвисает и не показывает прогресс.

**Рекомендация:**

- P0 (дёшево): добавить `yieldToMainThread()` каждые ~50-100 строк в цикл `parseExcelLeaks`, по аналогии с экспортом.
- P1 (дороже, но самый заметный эффект для пользователя): вынести связку JSZip + ExcelJS + разбор строк в отдельный Web Worker, зеркально `excelExportWorkerClient.js`. IndexedDB доступен и из воркера, так что сохранение фото можно делать там же или пересылать `Blob`/`ArrayBuffer` обратно в основной поток через transferable objects.

---

## 6. Второстепенное: побайтовый CRC32 при экспорте архива

```
src/services/zipStoreStream.js:19-25  updateCrc32()
```

Не относится к импорту напрямую, но раз речь про архивы в целом: CRC32 считается в ручном JS-цикле `for (const byte of bytes)`. Для больших фото при экспорте это тоже лишняя нагрузка на главный поток. Не приоритет сейчас, но стоит учесть, если экспорт больших проектов тоже жалуются на скорость.

---

## 7. Сводка по приоритетам (импорт архивов)

| #   | Проблема                                                    | Файл                                             | Приоритет           | Эффект                             |
| --- | ----------------------------------------------------------- | ------------------------------------------------ | ------------------- | ---------------------------------- |
| 1   | Двойная распаковка архива (verify + реальное использование) | `utils/importLimits.js`                          | P0                  | Наибольший                         |
| 2   | `hydrateZipPhotos` без параллелизма                         | `services/excelImport/photoPipeline.js:321`      | P0                  | Средний-высокий                    |
| 3   | Побайтовое сравнение фото вместо хеша                       | `services/excelImport/photoPipeline.js:100`      | P0                  | Средний                            |
| 4   | Нет `yield` в парсинге строк Excel                          | `services/excelImportService.js:150`             | P0                  | Средний (отзывчивость UI)          |
| 5   | Захардкоженный параллелизм = 3 везде                        | `photoPipeline.js`, `projectBackup/constants.js` | P1 (нужен бенчмарк) | Средний                            |
| 6   | Импорт без Web Worker                                       | весь путь импорта                                | P1                  | Наибольший для восприятия скорости |
| 7   | CRC32 побайтово при экспорте                                | `services/zipStoreStream.js`                     | P2                  | Низкий (не импорт)                 |

Пункты 1-4 не меняют формат архива и не требуют миграций — их можно сделать отдельными небольшими PR без риска для обратной совместимости, в соответствии с ограничениями `PROJECT_REFACTORING_PLAN.md` (раздел 3).

---

## 8. Структура `src/services` — не как "плоская `sevices`"

Сейчас в `src/services/` уже есть четыре тематические подпапки (`excelImport/`, `excelExport/`, `projectBackup/`, `maps/`), но 15 файлов-оркестраторов и вспомогательных модулей лежат прямо в корне `services/`, вперемешку:

```
src/services/
├── archivePaths.js
├── excelImportService.js
├── excelImportTransaction.js
├── importOperationJournal.js
├── leakFieldVersions.js
├── localSyncService.js
├── nativePhotoSourceCache.js
├── persistentStorage.js
├── projectBackupService.js
├── projectCleanup.js
├── projectIntegrityService.js
├── projectSyncState.js
├── publicFileWriter.js
├── syncClock.js
├── zipStoreStream.js
├── excelImport/   (уже подпапка)
├── excelExport/    (уже подпапка)
├── projectBackup/  (уже подпапка)
└── maps/           (уже подпапка)
```

Это и есть источник жалобы "не как сейчас в папке services": оркестратор (`excelImportService.js`) лежит рядом с деталями реализации импорта (`excelImport/photoPipeline.js` и т.д.), но не внутри одной папки с ними.

Целевая структура уже зафиксирована в `PROJECT_REFACTORING_PLAN.md` (раздел 4, `services/import`, `services/export`, `services/backup`, `services/sync`, `services/maps`). Конкретное распределение файлов из корня:

| Файл сейчас                                                                                        | Куда переносить                                            |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `excelImportService.js`, `excelImportTransaction.js`, `importOperationJournal.js`                  | `services/import/` (объединить с текущим `excelImport/`)   |
| `zipStoreStream.js`, `archivePaths.js`                                                             | `services/archive/` (общее для import и export)            |
| `projectBackupService.js`, `projectCleanup.js`, `projectIntegrityService.js`                       | `services/backup/` (объединить с текущим `projectBackup/`) |
| `localSyncService.js`, `projectSyncState.js`, `syncClock.js`                                       | `services/sync/`                                           |
| `persistentStorage.js`, `publicFileWriter.js`, `nativePhotoSourceCache.js`, `leakFieldVersions.js` | `services/storage/`                                        |
| `maps/`                                                                                            | без изменений                                              |

**Как переносить, не ломая проект (важно для правил из `PROJECT_REFACTORING_PLAN.md`, раздел 3 — "не смешивать переезд файлов с изменением поведения"):**

1. Один PR = один переезд файлов, без изменения логики внутри них (только обновление импортов).
2. Переносить по одному кластеру (сначала import, потом backup, потом sync, потом storage) — не всё за один PR.
3. После каждого переноса — `npm run lint && npm run typecheck && npm run test:coverage`, чтобы алиасы (`@/services/...`) не разъехались молча.
4. Обновить `src/services/index.js` (единая точка реэкспорта, если используется) и barrel-файлы в подпапках.

---

## 9. Что делать дальше

1. Начать с пунктов 1-4 из раздела 7 — это чистые оптимизации без изменения формата данных, дают основной прирост скорости импорта архивов.
2. Прогнать `npm run test:perf` до и после, чтобы иметь цифры (в проекте уже есть `performance/large-dataset.perf.spec.js` — использовать его как baseline).
3. Отдельным PR — перенос файлов `services/*.js` в подпапки (раздел 8), без изменения поведения.
4. Web Worker для импорта (пункт 6) — отдельная, более крупная задача; делать после того, как стабилизируются пункты 1-4, чтобы не путать источники прироста производительности.
