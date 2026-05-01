<div align="center">

# 🔍 Leak Tracker

**Полевая система учёта и контроля утечек газа**

[![React](https://img.shields.io/badge/React-19.2-61DAFB?style=for-the-badge&logo=react&logoColor=white)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-6.x-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev)
[![Capacitor](https://img.shields.io/badge/Capacitor-8.0-119EFF?style=for-the-badge&logo=capacitor&logoColor=white)](https://capacitorjs.com)
[![Leaflet](https://img.shields.io/badge/Leaflet-1.9-199900?style=for-the-badge&logo=leaflet&logoColor=white)](https://leafletjs.com)
[![Offline First](https://img.shields.io/badge/Offline-First-orange?style=for-the-badge)](#-офлайн-карты)

_Мобильное приложение для регистрации, мониторинга и отчётности по утечкам в нефтегазовой отрасли._  
_Работает полностью офлайн, поддерживает мультипроектность и перенос данных между устройствами._

</div>

---

## ✨ Возможности

|     | Функция                       | Описание                                                                |
| --- | ----------------------------- | ----------------------------------------------------------------------- |
| 📋  | **Регистрация утечек**        | Многошаговая форма с фото, координатами и расчетами                     |
| 🗺️  | **Офлайн-карта**              | Leaflet с локальным кэшем тайлов и кластеризацией                       |
| 🎤  | **Голосовой ввод**            | Распознавание речи с fuzzy matching и preview-подтверждением            |
| 📦  | **Импорт / Экспорт проектов** | ZIP-бэкап с метаданными проекта и фотографиями                          |
| 📊  | **Экспорт отчетов**           | XLSX / KML / JSON                                                       |
| 🔄  | **Lifecycle Management**      | Open → In Progress → Resolved + история изменений                       |
| 🗂️  | **База данных**               | Фильтры по статусу, приоритету, GPS-близости; bulk-действия; сортировка |
| 🌙  | **Темизация**                 | Поддержка dark / light mode                                             |
| 📱  | **Android Ready**             | Capacitor 8 native build                                                |

---

## 🚀 Быстрый старт

```bash
git clone <repo>
cd leak-tracking
npm install
npm run dev
```

---

## 🏗️ Технологический стек

```text
Frontend        React 19 + Vite 6
Styling         SCSS Modules / CSS Variables
Mobile          Capacitor 8
Maps            Leaflet + MarkerCluster
Storage         localStorage / IndexedDB / Filesystem
Export          ExcelJS / JSZip / XLSX
Validation      Zod
Testing         Vitest + Testing Library
```

### 📦 Зависимости

| Категория | Пакеты |
|-----------|--------|
| **Core** | React 19.2, React DOM 19.2, Vite 6 |
| **Mobile** | Capacitor 8 (android, camera, cli, core, filesystem, geolocation, share), speech-recognition |
| **Maps** | Leaflet 1.9, Leaflet MarkerCluster 1.5 |
| **Export** | ExcelJS 4.4, JSZip 3.10, XLSX 0.18 |
| **Validation** | Zod 4.3 |
| **UI** | clsx 2.1 |
| **Testing** | Vitest, Testing Library (DOM, Jest, React, User Event) |

---

## 📁 Архитектура проекта

```text
src/
├── app/
│   ├── App.jsx
│   ├── hooks/              # useAppState, useProjectData, useTheme, useVoiceControl
│   ├── migrations/         # One-time legacy data cleanup
│   └── project/            # ProjectContext + project storage/migration/keys
│       └── hooks/          # useProjectConfig, useProjectVars, useHiddenFields, …
│
├── components/
│   ├── layout/             # Header, Footer, PageHeader (structural shells)
│   └── ui/                 # ConfirmSheet, MobileSheet, Notification, StatusBadge, ErrorBoundary
│
├── configs/
│   ├── index.js            # Barrel → PROJECT_CONFIGS, PROJECT_META
│   ├── projects.js
│   ├── projectAdapter.js
│   ├── projectLocation.config.js
│   ├── shared/             # Common fields + steps across project types
│   ├── upstream/           # UPSTREAM_CONFIG + data/fields + data/steps
│   ├── midstream/
│   └── downstream/
│
├── data/
│   ├── leak/               # fieldDictionary, statusDictionary, priorityDictionary
│   └── variables.js
│
├── features/               # Domain components — one folder per bounded context
│   ├── editTextField/
│   ├── fieldVisibility/    # FieldVisibilityModal
│   ├── leakDetails/        # LeakDetailsSheet + hooks + sub-components
│   ├── leakForm/           # LeakForm + LeakFormContext + hooks + Header/Footer
│   │   └── components/     # ClearActions, StepHeader, InputCard, StepRenderer
│   ├── leakList/           # VirtualizedLeakList, LeakCardCompact, RecentLeaks
│   ├── photos/             # PhotoViewer, PhotoInput
│   ├── resolve/            # ResolveModal
│   ├── search/             # Autocomplete (+ smartFilter), SearchFieldSelect, QuickActions
│   ├── settings/           # SettingsModal (UI only; page logic lives in pages/Settings)
│   ├── status/             # StatusPickerModal
│   └── voice/              # VoiceButton, VoicePreviewSheet
│       └── utils/          # numbers, normalization, matching, synonyms, parseVoiceText, …
│
├── hooks/                  # Shared hooks used in 2+ features
│   ├── cameraService.js    # Co-located with sole consumer useCamera
│   ├── photoService.js
│   ├── speechService.js
│   ├── useCamera.js
│   ├── useEditablePhoto.js
│   ├── useFormDraft.js
│   ├── useGeolocation.js
│   ├── usePhotoStorage.js
│   └── …
│
├── pages/
│   ├── AddLeak/
│   ├── DataBase/           # + excel.js + hooks/ + components/
│   ├── MainPage/
│   ├── MapPage/            # + offlineMap.js + kml.js + handleExport.js + hooks/
│   ├── ProjectSetup/
│   └── Settings/           # + backup.js + hooks/ + components/
│
├── repositories/
│   ├── idb.js              # createIdbStore() factory (IndexedDB)
│   ├── LeakRepository.js
│   ├── PhotoRepository.js
│   ├── backupSchema.js     # Zod schemas for ZIP import/export
│   └── compressImage.js
│
├── services/
│   └── maps/tileCache.js   # Shared tile-caching logic (3 consumers)
│
├── utils/
│   ├── calculations/       # Emissions & flow-rate calculations
│   ├── normalize/          # capitalizeFirst, normalizeNumber, parseNumericInput
│   ├── geoUtils.js
│   ├── haptics.js
│   ├── photoConversion.js
│   ├── platform.js
│   ├── priority.js
│   ├── status.js
│   └── timeAgo.js
│
├── index.jsx               # App entry point
├── index.scss              # Global CSS variables + base styles
└── reportWebVitals.js
```

> **Placement rule (hook / service / util):** co-locate with the single consumer;
> promote to `src/hooks/` / `src/services/` / `src/utils/` only when used by 2+
> unrelated features. Consumer count = 0 → delete. See `CONTRIBUTING.md`.

---

## 🗂️ Поддерживаемые типы проектов

| Тип        | Назначение                 |
| ---------- | -------------------------- |
| Upstream   | Добыча                     |
| Midstream  | Транспортировка и хранение |
| Downstream | Переработка / Сбыт         |

Каждый тип проекта использует собственную схему полей, форму ввода и экспортный шаблон.

---

## 📊 Модель объекта утечки

```ts
interface LeakRecord {
  id: number;
  lat: number;
  lng: number;
  status: "open" | "in_progress" | "resolved";
  leak_id?: string | number;
  component?: string;
  leak_description?: string;
  photo?: string | null;
  photo_after?: string | null;
  priority?: "low" | "medium" | "high" | "critical";
  updatedAt?: number;
  resolvedAt?: number;
  // ... дополнительные поля (project-specific)
}

interface LeakHistoryEntry {
  action: "created" | "status_changed" | "edited" | "comment";
  to?: string;        // для status_changed
  text?: string;      // для comment
  date: string;       // ISO date
}
```

---

## 📦 Импорт / Экспорт

Проект поддерживает перенос данных между устройствами через ZIP-архив:

```text
Export ZIP
├── project.json        # Метаданные проекта (schemaVersion, name, type, vars)
├── backup.json         # Все записи утечек
└── photos/             # Связанные изображения (before / after)
```

При импорте автоматически:

- тип проекта определяется из `project.json` или автоматически по полям записей;
- создаётся новый проект и активируется;
- восстанавливаются записи, фотографии и переменные расчётов;
- инициализируется локальное хранилище.

---

## 🗺️ Офлайн-карты

```text
Tile Request
   ↓
Network Available?
 ├─ Yes → Cache Tile
 └─ No  → Load From Cache
```

Поддерживается кэширование карт для работы в полностью изолированных сетях.

---

## 🗂️ База данных (DataBase)

Страница со списком всех утечек проекта:

- **Поиск** по ID, объекту, описанию
- **Фильтры**: статус (Open / In Progress / Resolved), приоритет (Low / Medium / High / Critical), GPS-фильтр «Рядом со мной»
- **Сортировка** по дате (новые / старые)
- **Bulk-действия**: выбор нескольких записей, массовое изменение статуса, последовательное закрытие с фото
- **Экспорт** отфильтрованного набора в XLSX / KML / ZIP

---

## 🔒 Приватность

- Все данные хранятся локально на устройстве
- Нет серверной части / облака / телеметрии
- Подходит для air-gapped environments

---

## 📱 Сборка и запуск на телефоне

### Android

```bash
npm run build
npm run cap:sync android
npx cap open android
```

Далее в Android Studio:

1. Подключить устройство / эмулятор
2. Нажать **Run**
3. APK установится на телефон

### iOS

```bash
npm run build
npx cap sync ios
npx cap open ios
```

Далее открыть проект в Xcode и выполнить build на устройство.

---

## ⚙️ Production Deployment Notes

- Для Android рекомендуется включить ProGuard / R8
- Для iOS — настроить permissions в Info.plist
- Перед релизом очистить dev-логирование и mock data
- Рекомендуется включить versioned migrations для local storage

---

## 📜 Скрипты

```bash
npm run dev       # Development server
npm run build     # Production build
npm run preview   # Preview build
npm test          # Run tests
npm run cap:sync      # Sync Capacitor
```

---

## 🧭 Архитектурная диаграмма

```mermaid
flowchart TD
    UI[React UI / Pages] --> Hooks[Custom Hooks]
    Hooks --> Context[Project / App Context]
    Hooks --> Services[Domain Services]

    Services --> Storage[localStorage / IndexedDB / Filesystem]
    Services --> Maps[Offline Map Engine + Tile Cache]
    Services --> Export[Export Engine: XLSX / KML / ZIP]
    Services --> Photo[Photo Service + GC]
    Services --> Native[Capacitor Native APIs]

    Native --> Camera[Camera]
    Native --> Geo[Geolocation]
    Native --> FS[Filesystem]
    Native --> Speech[Speech Recognition]
```

---

## 🔄 State Machine: Leak Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Open : Зарегистрирована
    Open --> InProgress : Взять в работу
    InProgress --> Resolved : Устранено
    Resolved --> Open : Переоткрыть
```

---

## 🏆 Архитектурные особенности

- **Offline-First Core** — приложение полностью функционально без сети
- **Project Isolation** — каждый проект хранится в отдельном namespace
- **Portable Backup System** — перенос проекта одним ZIP-файлом
- **Extensible Config Architecture** — новые project types добавляются конфигом
- **Native Device Integration** — Camera / Filesystem / Geolocation / Speech API

---

## 📈 Roadmap

- [ ] Cloud Sync / Optional Backend Mode
- [ ] Multi-user Collaboration
- [ ] Advanced Analytics Dashboard
- [ ] GIS Layer Import / Overlay Support
- [ ] Enterprise Audit Trail / Signatures

---

## 🤝 Для кого создан проект

- LDAR / Methane Management Teams
- Field Inspectors
- Compressor Station Operators
- Environmental Compliance Engineers
- Oil & Gas Asset Integrity Teams

---

<div align=\"center\">

**Industrial-grade leak management platform for field operations.**

</div>
