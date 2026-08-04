# Оставшиеся задачи

**Дата:** 2026-08-04
**Состояние на:** `5fc1ea5`

Что осталось после аудита и последующей работы. Числа проверены на текущем коде,
а не взяты из отчётов.

Состояние гейтов: lint, format, typecheck, maintainability, coverage-ratchet,
build, bundle, licenses, audit — зелёные. 174 тест-файла, 1421 тест. Android:
42 unit-теста, `lintDebug` чист.

---

## 1. Миграция i18n: осталось 175 тернарников

Было 466. Приём отработан на пяти экранах, дальше механика повторяется.

### Как это делается

1. Дополнить `src/locales/{ru,en}/<namespace>.js` (или создать namespace и
   зарегистрировать в обоих `index.js`).
2. Заменить `lang === "ru" ? … : …` на `t("ns.key")`; подстановки — через
   `{{var}}` и вторым аргументом.
3. Функциям без React-контекста передавать `t` параметром, а не `lang`.
4. Тестовый мок перевести на общий хелпер:
   ```js
   vi.mock("@/app/hooks/useLanguage", async () => {
     const { englishLanguageHook } = await import("@/test/translate");
     return englishLanguageHook();
   });
   ```
   Он резолвит по настоящей английской локали, поэтому пропажа перевода валит
   тест. Утверждения при этом переводятся на английский.
5. Проверить, что тест ловит регрессию: удалить один ключ из `en` — должны
   упасть и тест паритета, и тесты экрана.

### Где осталось

| Область          | Штук |
| ---------------- | ---- |
| `src/features`   | 85   |
| `src/pages`      | 43   |
| `src/components` | 16   |
| `src/services`   | 15   |
| `src/hooks`      | 9    |
| `src/app`        | 5    |
| `src/utils`      | 2    |

Крупнейшие файлы:

```
24  features/fieldVisibility/FieldVisibilityModal.jsx
21  features/importConflict/ImportConflictSheet.jsx
15  pages/MapPage/kml.js                      ← см. §2
13  pages/AddLeak/AddLeak.jsx
 9  services/excelExport/auxiliarySheets.js   ← см. §2
 9  hooks/useActiveLocation.js
 9  features/leakList/LeakCardCompact/LeakCardCompact.jsx
 9  features/leakForm/LeakForm.jsx
 8  components/ui/MobileSheet/MobileSheet.jsx
 6  pages/DataBase/excel.js                   ← см. §2
```

### Три ловушки, на которые уже наступали

- **Не всё, что ветвится по языку, — перевод.** `lang === "ru" ? "ru-RU" : "en-US"`
  это Intl-локаль: есть готовый `getIntlLocale` в `src/utils/locale.js`.
- **Проверять, нет ли ключа уже.** В `leakDetails` половина строк дублировала
  существующие `relativeTime`, `photo.noPhoto`, `statuses.in_progress`.
- **`t` в зависимостях хуков.** Если эффект вызывает `setState`, а мок в тесте
  отдаёт новый `t` на каждый вызов — бесконечный цикл и смерть воркера **без
  единого упавшего утверждения**: файл просто исчезает из прогона. Проверять
  число тестов, а не только «passed». Отключать нужно **оба** правила:
  `react-hooks/exhaustive-deps` и `@eslint-react/exhaustive-deps`.

---

## 2. Текст внутри выгружаемых файлов

30 строк, которые нельзя перевести обычным способом.

### `src/pages/DataBase/excel.js` (6) + `src/services/excelExport/*` (15)

Работают **внутри Web Worker** (`excelExport.worker.js`), где нет ни i18next,
ни React-контекста. Требуется передавать готовые строки в payload воркера —
это меняет его контракт.

### `src/pages/MapPage/kml.js` (15)

Главный поток, но функция чистая: принимает `lang` аргументом, покрыта тремя
тест-файлами (`kml.test.js`, `kml.web.test.js`, `kml.native.test.js`),
проверяющими вывод на обоих языках.

Варианты: `i18n.getFixedT(lang)` (сохраняет сигнатуру, но привязывает к
глобальному состоянию) либо принимать `t` параметром (ломает три теста).

**Решить до начала:** должен ли язык выгружаемого файла следовать языку
интерфейса или задаваться отдельно. Сейчас следует.

---

## 3. Подписи полей формы: 78 ключей

Русские подписи живут в `src/configs/shared/fields.js` (36 полей) и трёх
`src/configs/*/data/fields.js` (по 3 поля на тип), а английские — в
`locales/en/addLeak.js`. Русский попадает в UI через `defaultValue` в местах
вызова.

Проверено: подписи используются **только для отображения** — ни Excel-экспорт,
ни схема бэкапа их не читают, так что перенос безопасен.

Решение принято: перенести русский в локали, конфиг оставляет себе ключ, тип и
флаги.

**Осторожно:** страж в `src/locales/locales.test.js` намеренно отвергает
частично мигрированный префикс. Заполнить 3 ключа из 75 нельзя — тест упадёт.
Префикс `addLeak.fields` мигрируется целиком за один заход.

Связано: `translateFieldLabel` продублирована в
`features/leakDetails/components/EditBlock.jsx` и `viewBlockUtils.js` — по
десять тернарников на двоих, уйдут вместе с этой задачей.

---

## 4. Покрытие тестами

**Сейчас:** 78,2 % statements, 66,5 % branches. Ratchet сторожит 47 файлов
критичного пути — они деградировать не могут.

**70 файлов с нулевым покрытием.** С реальной логикой:

| Файл                                                 | Строк |
| ---------------------------------------------------- | ----- |
| `hooks/useSwipeActions.js`                           | 49    |
| `hooks/useSpeechRecognition.js` + `speechService.js` | 58    |
| `configs/projectAdapter.js`                          | 22    |
| `app/project/hooks/useEffectiveProjectConfig.js`     | 21    |

**Низкое покрытие на важном:**

```
40%  pages/DataBase/hooks/useLeakActions.js
41%  pages/MainPage/hooks/useMainPageActions.js
45%  pages/MapPage/offlineMap.js
49%  features/calculationParameters/CalculationParametersForm.jsx
53%  features/leakDetails/hooks/useLeakDetailsPersistence.js
57%  pages/DataBase/hooks/useBulkActions.js
60%  hooks/useGeolocation.js
```

`useGeolocation` стоит отдельного внимания: коммит `21c60ec` заявлен как
«improve GPS reliability», но надёжность не зафиксирована тестами.

---

## 5. Производительность

### Параллелизм фото — нужен браузер

`IMPORT_CONCURRENCY = 3` и соседние константы (`services/backup/constants.js`,
`services/import/photoPipeline.js`) не обоснованы замером.

**Стенд на fake-indexeddb для этого не годится** — проверено:

```
параллелизм  1: 14 мс
параллелизм  8: 44 мс
```

Чем больше, тем медленнее: в fake-indexeddb нет настоящего ожидания
ввода-вывода, лишние воркеры добавляют только накладные расходы. Стенд дал бы
уверенный ответ «ставьте 1», почти наверняка неверный для браузера.

Нужен Playwright в Chromium, а по-хорошему — Android-эмулятор, потому что
исходная претензия была про Android с его Filesystem API.

### Двойная распаковка архива

`verifyArchiveLimits` распаковывает архив целиком до реального импорта. Но он
же — защита от zip-бомб: проверяет **фактический** распакованный размер.

**Это решение о безопасности, а не оптимизация.** Оба варианта из
`ARCHIVE_IMPORT_PERFORMANCE_AUDIT.md` ослабляют гарантию.

### Web Worker для импорта

Экспорт уже в воркере, импорт — нет. Самая крупная из оставшихся задач по
производительности.

---

## 6. Мелочи

### Бюджет бандла на исходе

```
initialRaw   405 444 / 419 840   (96,6 %)
initialGzip  123 123 / 128 000   (96,2 %)
appGraphJs 2 283 108 / 2 560 000 (89,2 %)
```

Запас ~14 КБ. React-патч в этой сессии съел 5,7 КБ. Следующая заметная фича в
initial-графе уронит CI.

### Мажорные версии

```
react-i18next  13 → 17      vite        6 → 8
i18next        23 → 26      typescript  6 → 7
web-vitals      2 → 6       jsdom      29 → 30
@vitejs/plugin-react 4 → 6   lint-staged 16 → 17
@testing-library/jest-dom 6 → 7
```

Уязвимостей нет. `i18next`/`react-i18next` логично поднимать после миграции
i18n — API `t` и `useTranslation` меняются между мажорами.

### Дублирование порогов покрытия

Пофайловые пороги заданы **в двух местах**: `vite.config.mjs`
(`coverage.thresholds`) и `scripts/coverage-ratchet.json`. При переезде
`services/` пришлось править оба. Стоит свести к одному источнику.

### `.claude/settings.local.json` отслеживается git

Правило в `.gitignore` корректное, но файл попал в индекс 30 апреля, а правило
добавлено 2 августа — `.gitignore` на отслеживаемые файлы не действует. Из-за
этого падает `check:clean`, который стоит первым шагом в CI и в
`npm run android:release`.

```bash
git rm --cached .claude/settings.local.json
```

Содержимое останется в истории девяти коммитов — для локальных разрешений
агента это вряд ли важно.

---

## 7. Что не проверялось локально

- **e2e / Playwright.** Ни разу не запускались. Важно: job `e2e` был сломан
  битым SHA до коммита `a419345`, то есть offline-smoke продакшен-сборки не
  выполнялся неизвестно сколько. Починку подтвердит только реальный прогон CI.
- **Android instrumented-тесты.** Unit-тесты гоняются локально (`cap sync`
  пишет только в игнорируемые пути), instrumented — нет, нужен эмулятор.

---

## Порядок, который я бы предложил

1. **`.claude/settings.local.json`** — одна команда, чинит `check:clean`.
2. **Досидеть i18n** (§1) — приём отработан, дальше механика. Начинать с
   `features` (85).
3. **Подписи полей** (§3) — развяжет список долга в `locales.test.js` и уберёт
   дублирование `translateFieldLabel`.
4. **Покрытие** (§4) — сначала `useLeakActions` и `useMainPageActions`: там
   пользовательские действия над данными.
5. **Текст в выгружаемых файлах** (§2) — после i18n, когда останется только он.
6. **Мажоры** (§6) — `i18next` после §1.
7. **Производительность** (§5) — самое дорогое, требует браузерного стенда.
