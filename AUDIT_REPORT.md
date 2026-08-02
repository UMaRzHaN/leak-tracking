# Полный аудит проекта Leak Tracking

**Дата аудита:** 2 августа 2026 года  
**Ветка:** `codex/local-wifi-sync`  
**Коммит:** `de2407d`  
**Режим:** read-only аудит исходного кода, конфигурации, зависимостей, тестов и сборки

## Резюме

Проект заметно зрелее среднего: реализовано отказоустойчивое локальное хранение,
есть большой набор unit/integration/E2E-тестов, ограничения для импортируемых
архивов и защищённая локальная синхронизация устройств.

При этом выпуск текущей версии в production не рекомендуется до устранения
блокирующих дефектов. Обнаружены:

- 9 подтверждённых P1-дефектов;
- ряд P2-рисков целостности данных, приватности, импорта и release engineering;
- P3-задачи по hardening и сопровождаемости.

P0-дефектов не обнаружено. До создания этого отчёта tracked worktree был чистым.

## Статус реализации — 2 августа 2026 года

После аудита выполнен первый production-hardening этап:

- устранены все девять P1-дефектов в коде; для legacy-конфликта и degraded web
  storage включён read-only recovery mode с выгрузкой обеих/доступной копии;
- фильтрованный Excel больше не включает скрытые записи и фотографии, а
  Monitoring/History, ZIP merge и integrity используют канонический `leak_id`;
- расчёты отклоняют отрицательный расход и некорректные Pink Bag параметры,
  формируют `leak_speed_kg_h` и не создают `NaN`/`Infinity` derived-поля;
- import journal разделён по фазам; ошибки `begin/update/complete` и rollback
  покрыты тестами `QuotaExceededError`/`SecurityError`;
- release Android требует явные `ANDROID_VERSION_CODE/NAME`; Gradle release-задачи
  также отклоняют отсутствующую/некорректную версию;
- закрыты P2-01, P2-02, P2-03, P2-06—P2-13, P2-16 и web/CI-часть P2-18—P2-20:
  диапазоны координат, strict status picker/domain API, KML/ZIP hardening,
  дедупликация audit events, bounded/cached photo hydration, полный offline
  precache, persistent storage request, modal stack, production E2E и локальный
  redacted diagnostic log;
- GPS теперь выключен по умолчанию и включается только явным persisted opt-in.
- данные проекта и sync-tombstones фиксируются одним versioned payload с
  восстановлением sync-зеркала после сбоя; карта использует общий GPS-поток без
  второго watcher;
- `checkJs` включён для всей JS/JSX/TS/TSX-реализации в `src`, добавлены runtime
  declarations и официальные типы React/Leaflet.

Проверка после реализации: ESLint, форматирование, полный JS/TS typecheck, 1268
unit/integration-тестов, production build, bundle budget, 24 production E2E и
offline E2E — успешно. Android Gradle локально не запускался: на машине не найден
Java Runtime; Android CI расширен до API 24 и API 35.

Остаются внешние или требующие отдельного продуктового решения задачи:

- encrypted/password backup и политика хранения публичных архивов (P2-15);
- расширение обязательности имени пользователя на все legacy UI paths (остаток
  P2-04), а также P3 hardening.

## Шкала приоритетов

| Приоритет | Значение                                                                      |
| --------- | ----------------------------------------------------------------------------- |
| P0        | Критический дефект: непосредственная компрометация или массовая потеря данных |
| P1        | Блокер релиза: существенная потеря, утечка или искажение данных               |
| P2        | Значимый риск, который следует устранить до широкого production-внедрения     |
| P3        | Hardening, техдолг, документация или улучшение процесса                       |

## P1 — блокеры релиза

### P1-01. Фильтрованный Excel-отчёт включает всю базу и все фотографии

Видимая часть отчёта строится по отфильтрованному `displayed`, но в скрытый
backup передаётся полный массив `data`:

- [`useDataBaseExport.js`](src/pages/DataBase/hooks/useDataBaseExport.js#L106)
- [`excel.js`](src/pages/DataBase/excel.js#L301)
- [`backupSheet.js`](src/services/excelExport/backupSheet.js#L62)

Полная база сериализуется в скрытые колонки workbook, а все фотографии
добавляются во внешний ZIP. Тест прямо подтверждает включение записи `HIDDEN`,
которой нет в видимом отчёте:
[`excel.test.js`](src/pages/DataBase/excel.test.js#L350).

**Последствие:** получатель фильтрованной выборки может извлечь исключённые
записи, координаты, историю, sync-метаданные и фотографии.

**Рекомендация:** физически разделить фильтрованный отчёт и полный backup.
Обычный отчёт должен содержать только `displayed` и связанные с ним фотографии.
Полный backup должен быть отдельным явно названным действием с подтверждением
количества записей и фотографий.

### P1-02. ZIP-восстановление нового проекта теряет recovery/invalid records

Импорт восстанавливает и передаёт `preservedRecords`:
[`backupImport.js`](src/services/projectBackup/backupImport.js#L118), но `save()`
деструктурирует только `optimistic` и игнорирует этот параметр:
[`useProjectData.js`](src/app/hooks/useProjectData.js#L102).

**Последствие:** после импорта нового проекта, перезагрузки или повторного
экспорта невалидные recovery-записи исчезают. Восстановленные для них фотографии
также могут стать orphaned.

**Рекомендация:** сделать `preservedRecords` частью формального save-контракта,
сохранять их атомарно вместе с основными данными и добавить E2E-регрессионный
сценарий export → import as new project → reload → export.

### P1-03. Расчёты допускают физически невозможные значения

Валидация шага формы проверяет только заполненность:
[`useStepValidation.js`](src/features/leakForm/hooks/useStepValidation.js#L12).
Числовой parser допускает отрицательные значения, а расчёты не проверяют
диапазоны и конечность результата:
[`calculations.js`](src/utils/calculations/calculations.js#L60).

Подтверждённые сценарии:

- отрицательная скорость создаёт отрицательные годовые выбросы;
- Pink Bag без давления или температуры создаёт `NaN`;
- температура `-273.15 °C` создаёт `Infinity`;
- после JSON-сериализации `NaN/Infinity` превращаются в `null`.

Давление и температура при этом необязательны в конфигурации формы:
[`steps.js`](src/configs/upstream/data/steps.js#L78).

**Рекомендация:** централизовать `validateMeasurement`, задать физические
диапазоны, сделать давление/температуру условно обязательными для Pink Bag и
отклонять любой не-`Number.isFinite` результат до сохранения.

### P1-04. Гонка при переключении проектов

Загрузки всех проектов используют общий `loadGenerationRef`:
[`useProjectData.js`](src/app/hooks/useProjectData.js#L37). Старый callback
сохранения может увеличить generation после переключения проекта и опубликовать
данные предыдущего проекта без проверки текущего `activeProjectId`:
[`useProjectData.js`](src/app/hooks/useProjectData.js#L117).

Загрузка нового проекта после этого отбрасывается как устаревшая, а вычисляемый
`dataLoaded` может остаться ложным без повторного запуска эффекта.

**Рекомендация:** использовать project-scoped load/write epochs; перед каждой
публикацией проверять active project и generation; добавить тест с поздним save
старого проекта после начала загрузки нового.

### P1-05. Excel может посчитать Monitoring/History импортированными, но не прикрепить их

Основные `leak_id` дедуплицируются без учёта регистра:
[`excelImportService.js`](src/services/excelImportService.js#L226). Карты
Monitoring/History используют исходное значение, а attach выполняет точное
сравнение:

- [`sheetRecordParsers.js`](src/services/excelImport/sheetRecordParsers.js#L55)
- [`recordMerge.js`](src/services/excelImport/recordMerge.js#L39)

Статистика при этом показывает записи импортированными. Сценарий `TAG-1` в
основном листе и `tag-1` во вспомогательном листе приводит к тихой потере связей.

**Рекомендация:** ввести единую `normalizeLeakTag` и использовать её во всех
формах, импортерах, merge, sync и integrity-check. Статистика должна считать
только реально прикреплённые записи.

### P1-06. Колонка `кг/ч` в новых отчётах остаётся пустой

Расчёт создаёт только `leak_speed_kg_m`:
[`calculations.js`](src/utils/calculations/calculations.js#L66), тогда как все
конфигурации Excel экспортируют `leak_speed_kg_h`, например:
[`upstream.config.js`](src/configs/upstream/upstream.config.js#L54).

Excel читает поле напрямую из строки и не выполняет преобразование:
[`excel.js`](src/pages/DataBase/excel.js#L123).

**Рекомендация:** определить каноническую единицу, вычислять `кг/ч` из `кг/мин`
с явным коэффициентом 60 и добавить проверку единиц во все три конфигурации.

### P1-07. Android release молча получает `versionCode=1`

При отсутствии release-переменных Gradle подставляет `versionCode=1` и
`versionName=1.0.0`:
[`android/app/build.gradle`](android/app/build.gradle#L23).

Release verifier проверяет только четыре signing-переменные:
[`verify-android-signing.mjs`](scripts/verify-android-signing.mjs#L3), а README
не требует `ANDROID_VERSION_CODE/NAME`:
[`README.md`](README.md#L470).

**Последствие:** следующий подписанный релиз по документированному процессу
соберётся, но не сможет быть установлен или опубликован как обновление.

**Рекомендация:** сделать обе version-переменные обязательными для release,
валидировать положительный integer и формировать версию из release tag либо
централизованного источника.

### P1-08. Legacy-миграция может уничтожить более свежую localStorage-копию

При нормализации старого формата обычный localStorage-массив получает
`revision: 0` и `updatedAt: 0`:
[`LeakRepository.js`](src/repositories/LeakRepository.js#L368). Legacy-объект из
IndexedDB, напротив, получает revision из `timestamp`:
[`LeakRepository.js`](src/repositories/LeakRepository.js#L389).

Затем `getAll()` выбирает копию с большей revision и автоматически ремонтирует
второе хранилище выбранными данными:
[`LeakRepository.js`](src/repositories/LeakRepository.js#L522).

Подтверждённый сценарий:

```text
IndexedDB: idb-old
localStorage: local-new

Результат загрузки: idb-old
localStorage после восстановления: idb-old
```

Такое состояние возможно, если в предыдущей версии запись IndexedDB завершилась
ошибкой, а fallback-запись в localStorage сохранила более свежие данные. После
обновления timestamp старой IndexedDB-копии считается надёжнее localStorage без
метаданных, и более свежая копия перезаписывается.

**Последствие:** тихий откат проекта и потеря последних полевых изменений при
первом запуске после миграции web-хранилища.

**Рекомендация:** при двух различающихся legacy-копиях без сопоставимых revision
нельзя автоматически выбирать победителя. Нужно сохранить обе версии в recovery
и выполнить предметный merge либо запросить явный выбор. До repair необходимо
создать резервные копии обеих версий и добавить regression-тест
`IndexedDB: old / localStorage: new`.

### P1-09. Ошибка import journal может прервать compensating rollback

Excel-import обновляет journal перед выполнением rollback:
[`excelImportTransaction.js`](src/services/excelImportTransaction.js#L31).
Journal-функции напрямую вызывают `localStorage.setItem()` и
`localStorage.removeItem()`:
[`importOperationJournal.js`](src/services/importOperationJournal.js#L24).

Если переход journal в `rolling_back` выбросит `QuotaExceededError` или
`SecurityError`, выполнение прервётся до:

- `rollbackState()`;
- удаления созданных фотографий;
- восстановления предыдущих данных;
- сбора вторичных rollback-ошибок.

Подтверждённый сценарий:

```text
Ошибка журнала: quota
rollbackState вызван: 0 раз
deletePhoto вызван: 0 раз
```

Отдельная проблема — `completeImportOperation()` находится внутри основного
`try`:
[`excelImportTransaction.js`](src/services/excelImportTransaction.js#L26). Если
commit уже завершён, но очистка journal не удалась, успешный commit ошибочно
попадает в общий rollback-flow.

`beginImportOperation()` выполняется до любых мутаций. Его отказ безопасно
останавливает импорт и должен оставаться fail-closed: начинать изменяющую данные
операцию без durable journal не следует.

**Последствие:** частично сохранённые данные и orphaned-фотографии после ошибки
импорта либо ненужный откат уже успешно завершённого commit из-за сбоя очистки
journal.

**Рекомендация:** разделить ошибки основной транзакции и journal по фазам:

1. `beginImportOperation()` должен быть обязательным и завершать импорт до
   мутаций, если journal недоступен.
2. Ошибка перехода в `committing` должна отменять подготовленные фотографии, но
   не запускать commit.
3. При ошибке commit сначала всегда выполнять `rollbackState()` и удаление фото;
   запись фазы `rolling_back` оборачивать отдельно и не позволять её ошибке
   остановить compensating actions или заменить исходную ошибку.
4. Ошибка очистки journal после успешного commit не должна сама по себе откатывать
   durable данные; её следует сохранить как отдельное диагностическое/recovery
   состояние и показать пользователю.
5. Добавить тесты `QuotaExceededError`/`SecurityError` для `begin`, `update` и
   `complete` с проверкой порядка rollback-вызовов и сохранения исходной ошибки.

## P2 — существенные риски

### P2-01. Нет единой канонической идентичности `leak_id`

Ручное добавление считает регистр незначимым, но ZIP merge и integrity-check —
нет:

- [`AddLeak.jsx`](src/pages/AddLeak/AddLeak.jsx#L210)
- [`leakMergeEngine.js`](src/services/projectBackup/leakMergeEngine.js#L20)
- [`projectIntegrityService.js`](src/services/projectIntegrityService.js#L82)

Merge может создать одновременно `TAG-1` и `tag-1`, хотя UI запрещает такой
дубликат.

### P2-02. Координаты проверяются только на конечность

Backup принимает значения за пределами `lat [-90, 90]` и `lng [-180, 180]`:
[`backupSchema.js`](src/repositories/backupSchema.js#L95). Integrity-check также
считает `lat=999` корректной:
[`projectIntegrityService.js`](src/services/projectIntegrityService.js#L15).

Нужен один общий coordinate validator для формы, backup, repository, map, KML и
integrity-check.

### P2-03. Строгий lifecycle обходится UI и доменным API

Код объявляет последовательность `open → in_progress → resolved → open`:
[`status.js`](src/utils/status.js#L74), но status picker показывает все статусы,
кроме текущего:
[`StatusPickerModal.jsx`](src/features/status/StatusPickerModal/StatusPickerModal.jsx#L7).

Переходы могут оставлять старые `repairAt`, `photo_repair` или `photo_after`.
State machine должна применяться внутри доменного API, а не только описываться в
utility.

### P2-04. Часть audit history создаётся без пользователя

Профиль позволяет сохранить пустое имя:
[`UserProfileSheet.jsx`](src/components/ui/UserProfileSheet/UserProfileSheet.jsx#L42).
Детальный редактор корректно блокирует действие, но Main Page и bulk paths
продолжают с `user: undefined`:

- [`useMainPageActions.js`](src/pages/MainPage/hooks/useMainPageActions.js#L31)
- [`useBulkActions.js`](src/pages/DataBase/hooks/useBulkActions.js#L39)

Требование пользователя должно быть единым доменным инвариантом.

### P2-05. Данные и sync-tombstone сохраняются неатомарно

Сначала изменяются данные, затем отдельно записывается tombstone:
[`useProjectData.js`](src/app/hooks/useProjectData.js#L178). Если localStorage
недоступен, используется память; ошибка IndexedDB преобразуется в `false`, который
вызывающий код не проверяет:
[`projectSyncState.js`](src/services/projectSyncState.js#L269).

При сбое между операциями удалённая запись может воскреснуть после следующей
синхронизации.

### P2-06. Monitoring создаёт противоречивое состояние

При `resolved → needs_recheck` Monitoring переводит запись в `in_progress`, но
может оставить старое `photo_after`:
[`monitoringDomain.js`](src/pages/Monitoring/monitoringDomain.js#L175). Обычный
reopen/repair переносит фотографию и очищает старое поле.

### P2-07. Merge может схлопнуть разные события аудита

Identity Excel-history не включает пользователя, а ZIP/sync identity не включает
пользователя и полный набор изменений:

- [`recordMerge.js`](src/services/excelImport/recordMerge.js#L9)
- [`recordArrayMerge.js`](src/services/projectBackup/recordArrayMerge.js#L15)

Два события с одинаковым timestamp/action/to/text могут стать одним, даже если
они выполнены разными пользователями.

### P2-08. Excel выбирает первый непустой лист

Первый лист, не названный Monitoring/History, выбирается до проверки заголовков:
[`workbookSchema.js`](src/services/excelImport/workbookSchema.js#L281). Если первым
идёт README или обложка, валидный второй лист не рассматривается.

### P2-09. Reference amplification при распаковке фотографий

Excel ZIP-import использует вложенные `Promise.all`, не дедуплицирует одинаковые
ZIP-path и не ограничивает параллелизм:
[`photoPipeline.js`](src/services/excelImport/photoPipeline.js#L289).

Один 24-МБ entry можно сослать тысячи раз и одновременно материализовать в памяти.
Нужны cache по canonical path, лимит количества ссылок и bounded concurrency,
аналогичный backup importer.

### P2-10. Небезопасные имена ZIP entry при экспорте

Имя проекта сохраняется без path sanitation:
[`ProjectContext.jsx`](src/app/project/ProjectContext.jsx#L112) и напрямую попадает
в `zip.file()`:
[`excel.js`](src/pages/DataBase/excel.js#L364).

Проверка подтвердила raw entry вида `!Database_../../../escape.xlsx`. Выход за
каталог зависит от внешнего распаковщика. Следует использовать фиксированное
`report.xlsx` либо строгую portable filename sanitation.

### P2-11. KML HTML injection

`cdataText` защищает только завершение CDATA, но не HTML:
[`kml.js`](src/pages/MapPage/kml.js#L32). Импортированные location/component values
входят в HTML description без escaping:
[`kml.js`](src/pages/MapPage/kml.js#L95).

В HTML-rendering viewer `<img src="https://…">` может создать privacy beacon.
Нужно экранировать динамические значения либо использовать plain-text
`ExtendedData`. Группировку через `{}` следует заменить на `Map` для безопасной
обработки ключей `constructor` и `__proto__`.

### P2-12. Не все сценарии доступны при первом offline-запуске

Приложение заявлено полностью офлайн, но Excel/JSZip chunks исключены из precache:
[`vite.config.mjs`](vite.config.mjs#L14). Offline-тест намеренно проверяет их
отсутствие:
[`offline.spec.js`](e2e/offline.spec.js#L99).

При первом использовании без сети backup/restore и Excel могут быть недоступны.
Нужно либо precache критические workflow, либо честно ограничить offline-claim и
показывать состояние доступности в UI.

### P2-13. Web/PWA не запрашивает persistent storage

Основные данные и фотографии хранятся в IndexedDB:
[`PhotoRepository.js`](src/repositories/PhotoRepository.js#L199), но приложение не
использует `navigator.storage.persist()` и не показывает quota status.

Для field/PWA deployment это создаёт риск browser eviction. Нужны запрос
persistent storage после пользовательского действия, мониторинг quota и явные
backup reminders.

### P2-14. GPS включён по умолчанию и запускает два watcher

GPS включается при каждом старте:
[`useAppState.js`](src/app/hooks/useAppState.js#L57). Native permission запрашивается
сразу, после чего запускается continuous high-accuracy watch:
[`useGeolocation.js`](src/hooks/useGeolocation.js#L98). Карта создаёт дополнительный
watcher:
[`offlineMap.js`](src/pages/MapPage/offlineMap.js#L374).

Рекомендуется persisted opt-in, just-in-time permission, единый watcher и остановка
в background или вне требующих GPS экранов.

### P2-15. Backup и report не шифруются

Полные архивы с координатами, sync/meta и фотографиями пишутся в публичный Android
Documents:

- [`useBackupActions.js`](src/pages/Settings/hooks/useBackupActions.js#L126)
- [`PublicFileWriterPlugin.java`](android/app/src/main/java/com/leak/tracking/PublicFileWriterPlugin.java#L144)

Действие явное, но файл может быть доступен file manager, cloud backup и другим
приложениям с соответствующими разрешениями. Нужны encrypted backup/password
option, SAF/share sheet и явное предупреждение.

### P2-16. Вложенные модалки конфликтуют по Escape

Каждый открытый dialog устанавливает собственный document-level handler:
[`useModalDialog.js`](src/hooks/useModalDialog.js#L18). Leak Details одновременно
рендерит дочерние status/resolve/reopen/photo dialogs:
[`LeakDetailsSheet.jsx`](src/features/leakDetails/LeakDetailsSheet.jsx#L287).

Escape может закрыть и дочернюю модалку, и весь detail sheet. Нужен modal stack, в
котором Escape и focus trap принадлежат только верхнему dialog.

### P2-17. Typecheck не проверяет реализацию приложения

Конфигурация содержит `allowJs: true`, но `checkJs: false`, а `include` ограничен
`src/types/**/*.ts`:
[`tsconfig.check.json`](tsconfig.check.json#L3).

Зелёный `npm run typecheck` не проверяет props, аргументы, storage payloads и
возвращаемые значения в основных JS/JSX-файлах. Критические repositories,
services и domain modules следует постепенно перевести на TS либо покрыть JSDoc
с `checkJs`.

### P2-18. Runtime и Android coverage не соответствуют заявленной поддержке

Основные E2E запускаются против Vite dev, а не production bundle:
[`playwright.config.mjs`](playwright.config.mjs#L31). Production охвачен одним
offline-сценарием.

Android instrumentation выполняется только на API 35 при `minSdkVersion=24`:
[`ci.yml`](.github/workflows/ci.yml#L160). Нужна матрица минимум API 24 + API 35 и
production-preview E2E.

### P2-19. В production нет диагностического следа

Production logger полностью отключён:
[`logger.js`](src/utils/logger.js#L1). ErrorBoundary поэтому не сохраняет даже
локальный crash record.

Для air-gapped deployment нужен ограниченный, redacted on-device log с build
version/correlation id и пользовательским экспортом диагностического архива.

### P2-20. Degraded fallback может перезаписать актуальную IndexedDB-копию

`getAll()` корректно не ремонтирует IndexedDB старой fallback-копией, если чтение
IndexedDB завершилось ошибкой:
[`LeakRepository.js`](src/repositories/LeakRepository.js#L560). Однако вызывающий
код получает localStorage-данные как обычный актуальный массив без признака
`degraded/recovery mode`.

Если пользователь изменит эти данные, `saveAll()` повторно читает хранилища,
создаёт новую clock-based revision и записывает показанный fallback обратно в обе
копии:
[`LeakRepository.js`](src/repositories/LeakRepository.js#L577).

Сценарий:

1. IndexedDB содержит актуальную revision N.
2. localStorage содержит старую revision N-1.
3. Чтение IndexedDB временно падает.
4. UI показывает старые данные localStorage без предупреждения.
5. Пользователь изменяет запись.
6. Новая revision становится выше N и перезаписывает актуальную IndexedDB.

**Последствие:** временная ошибка чтения превращается в устойчивый откат данных,
который выглядит как обычное успешное редактирование.

**Рекомендация:** возвращать вместе с данными состояние источника и запрещать
обычную запись в degraded mode до повторной успешной сверки хранилищ. Возможные
варианты: read-only recovery UI, обязательное повторное чтение IndexedDB перед
save, сохранение изменения как conflict-copy либо merge с неизвестной
IndexedDB-версией. Добавить тест временной недоступности IndexedDB при устаревшем
localStorage.

## P3 — hardening и техдолг

- README документирует iOS build, но `@capacitor/ios` и каталог `ios/` отсутствуют:
  [`README.md`](README.md#L422).
- Coverage gate допускает 72 файла с нулевым покрытием, включая Leak Details,
  Local Sync UI, speech и несколько Settings-компонентов.
- Browser E2E проверяет только desktop/mobile Chromium; Firefox и WebKit не
  покрыты.
- Gradle wrapper не содержит `distributionSha256Sum`; отсутствуют dependency
  locks и verification metadata:
  [`gradle-wrapper.properties`](android/gradle/wrapper/gradle-wrapper.properties#L1).
- CSP разрешает `connect-src` и `img-src` с любого HTTPS-origin; фактические
  server-side headers неизвестны:
  [`index.html`](index.html#L7).
- Native local sync допускает 256 МБ, тогда как WebView/import limit равен 96 МБ:
  [`LocalSyncPlugin.java`](android/app/src/main/java/com/leak/tracking/LocalSyncPlugin.java#L64).
- Main chunk занимает 91.13% лимита, но per-chunk budget не выдаёт раннее
  предупреждение.
- Performance budgets существенно выше текущей базы и допускают многократную
  деградацию до падения gate.
- Нет release/CD workflow, подписанного AAB/APK, checksum, SBOM/provenance и
  формализованного rollback.
- В репозитории отслеживается локальный
  [`.claude/settings.local.json`](.claude/settings.local.json#L1) с workstation
  path и широкими разрешениями.
- Заголовок `Emissions_kg_CO2_eq_year` одновременно указывает килограммы и тонны:
  [`upstream.config.js`](src/configs/upstream/upstream.config.js#L67).
- Default Esri tile provider получает координаты запрошенных тайлов. Риск
  документирован, но sensitive deployment должен принудительно использовать
  одобренный или self-hosted provider.

## Результаты автоматических проверок

| Проверка               | Результат                                             |
| ---------------------- | ----------------------------------------------------- |
| `npm run lint`         | Успешно                                               |
| `npm run format:check` | Успешно                                               |
| `npm run typecheck`    | Успешно, но охват ограничен декларативными TS-файлами |
| Unit/integration       | 154/154 test-файла, 1230/1230 тестов                  |
| Coverage statements    | 74.73%                                                |
| Coverage branches      | 60.61%                                                |
| Coverage functions     | 67.16%                                                |
| Coverage lines         | 77.09%                                                |
| Основные E2E           | 24 успешно                                            |
| Production offline E2E | 1 успешно                                             |
| Performance suite      | 6/6 успешно                                           |
| `npm audit`            | 0 известных уязвимостей, 600 зависимостей             |
| Production build       | Успешно                                               |
| Bundle budget          | Успешно                                               |

Измерения performance suite на 10 000 записей:

- cold start: 863 мс;
- открытие базы: около 405 мс;
- поиск: 793 мс;
- XLSX export: 4.07 с;
- import preview: 1.18 с.

Production bundle:

- initial raw: 368 980 / 419 840 байт;
- initial gzip: 112 114 / 128 000 байт;
- app graph JS: 2 213 901 / 2 560 000 байт;
- Excel worker JS: 964 356 / 1 126 400 байт;
- total JS: 3 178 257 байт;
- main chunk: 335 935 байт, 91.13% лимита 360 KiB.

## Подтверждённые сильные стороны

- Native data writes используют temp/main/backup и сохраняют последнюю рабочую
  копию:
  [`LeakRepository.js`](src/repositories/LeakRepository.js#L209).
- Web-зеркала IndexedDB/localStorage имеют revision, checksum и tombstone;
  автоматическое восстановление надёжно работает для сопоставимых современных
  envelope, но legacy-конфликты и degraded write требуют исправления:
  [`LeakRepository.js`](src/repositories/LeakRepository.js#L368).
- Невалидные записи при обычной загрузке отделяются и сохраняются для recovery,
  а не уничтожаются.
- ZIP-import ограничен по размеру файла, количеству entries, фактически
  распакованным байтам, single-entry и общей сложности:
  [`importLimits.js`](src/utils/importLimits.js#L1).
- Импортные транзакции имеют journal и rollback фотографий, но ошибки journal
  пока не изолированы от compensating rollback.
- Local sync использует TLS 1.2/1.3, ephemeral Android Keystore certificate,
  SHA-256 pinning, session expiry, код, явное подтверждение peer, deadlines и hash
  verification:
  [`LocalSyncPlugin.java`](android/app/src/main/java/com/leak/tracking/LocalSyncPlugin.java#L757).
- Android запрещает cleartext traffic и OS backup; release включает R8 и resource
  shrinking.
- GitHub Actions закреплены полными SHA; Dependabot настроен для npm, Gradle и
  Actions.
- В текущем tracked content не обнаружены `.env`, keystore,
  `google-services.json`, private keys, `dangerouslySetInnerHTML`, `eval` или
  `new Function`.

## Приоритетный план исправлений

### Немедленно

1. Исправить порядок journal/commit/rollback и гарантировать compensating cleanup.
2. Запретить автоматический выбор победителя при конфликте legacy-копий.
3. Убрать полный backup из фильтрованного Excel-отчёта.
4. Заблокировать отрицательные, бесконечные и неполные расчёты.

### До следующего релиза

1. Исправить сохранение recovery records.
2. Устранить project-switch race.
3. Ввести единую нормализацию `leak_id` для Excel, ZIP, sync и integrity-check.
4. Исправить поле `кг/ч` и проверить единицы всех расчётных колонок.
5. Сделать Android version обязательной.
6. Ввести degraded/recovery mode при недоступности одной web-копии данных.
7. Добавить regression-тесты для каждого P1-сценария, journal quota и stale
   fallback.

### Следующий этап

1. Централизовать coordinate/measurement validation и lifecycle state machine.
2. Сделать project data + sync metadata одной транзакционной операцией.
3. Ограничить concurrency и reference amplification при импорте.
4. Исправить KML/ZIP sanitation и modal stack.
5. Пересмотреть GPS/privacy и offline durability.
6. Расширить typecheck, production E2E и Android API matrix.

### Hardening

1. Добавить локальную диагностику и формализованный release runbook/CD.
2. Включить Gradle dependency verification, wrapper checksum и SBOM/provenance.
3. Расширить browser coverage и сделать performance thresholds ближе к baseline.
4. Уточнить iOS-статус, CSP/hosting headers и политику хранения backup.

## Ограничения аудита

- Android Gradle tests, lint и APK/AAB локально не запускались из-за отсутствия
  JDK 21.
- Не выполнялись тесты на физическом устройстве, камера, GPS, микрофон и sync двух
  телефонов.
- Не проверялись production hosting headers, store configuration и release
  signing infrastructure.
- Эксплуатационный OOM-сценарий импорта не запускался на малопамятном устройстве;
  риск подтверждён по алгоритму, точный порог зависит от устройства.
