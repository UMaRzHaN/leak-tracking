<div align="center">

# 🔍 Leak Tracker

**Полевая система учёта и контроля утечек газа**

[![React](https://img.shields.io/badge/React-19.2-61DAFB?style=for-the-badge&logo=react&logoColor=white)](https://react.dev)
[![Capacitor](https://img.shields.io/badge/Capacitor-8.0-119EFF?style=for-the-badge&logo=capacitor&logoColor=white)](https://capacitorjs.com)
[![Leaflet](https://img.shields.io/badge/Leaflet-1.9-199900?style=for-the-badge&logo=leaflet&logoColor=white)](https://leafletjs.com)
[![Offline First](https://img.shields.io/badge/Offline-First-orange?style=for-the-badge)](#-офлайн-карты)

_Мобильное приложение для регистрации, мониторинга и отчётности по утечкам в нефтегазовой отрасли._  
_Работает полностью в режиме офлайн — без серверов, без облаков._

</div>

---

## ✨ Возможности

|   | Функция | Описание |
|---|---------|----------|
| 📋 | **Регистрация утечек** | Многошаговая форма с фото, координатами и расчётом приоритета |
| 🗺️ | **Карта с кластеризацией** | Leaflet-карта с офлайн-тайлами, кэш в IndexedDB |
| 🎤 | **Голосовой ввод** | Распознавание речи на русском с нечётким сопоставлением |
| 📊 | **Экспорт данных** | XLSX с вложенными фото, KML для ГИС, JSON-бэкап |
| 🔄 | **Жизненный цикл** | Открыта → В работе → Устранена, полная история изменений |
| 🌙 | **Тёмная тема** | CSS-переменные, переключение сохраняется между сессиями |
| 📡 | **Офлайн-первый** | Все данные хранятся локально — интернет не нужен |
| 📱 | **Android / iOS** | Нативная сборка через Capacitor |

---

## 🚀 Быстрый старт

### Веб-версия

```bash
git clone https://github.com/your-username/leak-tracking.git
cd leak-tracking
npm install
npm start
# → http://localhost:3000
```

### Сборка для Android

```bash
npm run build       # продакшн-бандл
npx cap sync        # синхронизация с Capacitor
npx cap open android  # открыть в Android Studio
```

---

## 🏗️ Стек технологий

```
Frontend              Мобильность              Карты                Хранилище
──────────────        ─────────────────        ──────────────       ──────────────────
React 19              Capacitor 8              Leaflet 1.9          localStorage (web)
SCSS / CSS Vars       Camera API               MarkerCluster        IndexedDB (фото)
CRA (Webpack)         Geolocation API          Offline TileLayer    Filesystem (native)
clsx                  Speech Recognition       KML export           ExcelJS / JSZip
```

---

## 📁 Структура проекта

```
src/
├── app/
│   ├── hooks/            # useAppState, useProjectData, useVoiceControl
│   ├── settings/         # ProjectContext, мультипроектность
│   └── migrations/       # Миграции локальных данных
│
├── pages/
│   ├── MainPage/         # Главная — статистика и последние записи
│   ├── AddLeak/          # Многошаговая форма создания утечки
│   ├── DataBase/         # База — поиск, фильтр, виртуализация
│   ├── MapPage/          # Leaflet-карта с кластеризацией
│   ├── Settings/         # Настройки проекта и экспорт
│   └── ProjectSetup/     # Экран первого запуска
│
├── components/
│   ├── LeakForm/         # Форма с голосом, фото, координатами
│   ├── LeakDetailsSheet/ # Детальная карточка (bottom sheet)
│   ├── VoiceButton/      # Кнопка голосового ввода
│   └── ...               # Модалки, уведомления, свайп-карточки
│
├── services/
│   ├── export/           # excel.js · kml.js · backup.js
│   └── maps/             # offlineMap.js · tileCache.js
│
├── hooks/                # useGeolocation · usePhotoStorage · useFormDraft …
├── configs/              # upstream / midstream / downstream конфиги
└── utils/
    ├── voice/            # parseVoiceText · fuzzyMatch · synonyms (RU)
    ├── calculations/     # Расчёт скорости и приоритета утечки
    └── status.js         # Константы и переходы статусов
```

---

## 🗂️ Типы проектов

Приложение поддерживает три вида нефтегазовых операций с разными наборами полей и шаблонами отчётов:

| Тип | Описание | Ключевые поля |
|-----|----------|---------------|
| **Upstream** | Добыча | Месторождение, куст, категория скважины |
| **Midstream** | Транспортировка | Трубопровод, участок, диаметр |
| **Downstream** | Переработка / сбыт | Установка, узел, технологический блок |

---

## 🔄 Жизненный цикл утечки

```
  ┌──────────┐      ┌─────────────┐      ┌────────────┐
  │  ОТКРЫТА │ ───► │  В РАБОТЕ   │ ───► │ УСТРАНЕНА  │
  │  (open)  │      │(in_progress)│      │ (resolved) │
  └──────────┘      └─────────────┘      └────────────┘
       │                   │                    │
   Регистрация         Назначение           Фото после +
   + координаты        специалиста          акт устранения
```

Каждый переход фиксируется в `history[]` с датой и исполнителем.

---

## 🎤 Голосовой ввод

Весь конвейер распознавания работает на клиенте, без внешних сервисов:

```
Микрофон → Speech API (RU) → parseVoiceText → normalizeBySynonyms → fuzzyMatchOption → VoicePreviewSheet → Форма
```

- **Синонимы**: "норма" → `normal`, "высокое" → `high`, "критическое" → `critical`
- **Нечёткое сопоставление**: поиск наиболее близкого варианта из справочника
- **Предпросмотр**: пользователь подтверждает или редактирует перед сохранением

---

## 📤 Форматы экспорта

| Формат | Библиотека | Что содержит |
|--------|-----------|--------------|
| **XLSX** | ExcelJS | Все поля + вложенные фото в ячейках |
| **KML** | Ручная генерация | Точки на карте для QGIS / Google Earth |
| **JSON** | Встроенный | Полный бэкап для переноса или импорта |

---

## 🗺️ Офлайн-карты

```
CachedTileLayer (расширяет L.TileLayer)
│
├── Тайл есть в сети?
│     ├── Да  → загрузить и сохранить в кэш
│     └── Нет → отдать из кэша, если есть
│
└── Кэш: IndexedDB (web) / Capacitor Filesystem (native)
```

---

## 📊 Модель данных утечки

```js
{
  id:          1745000000000,       // timestamp
  date:        "2026-04-22T10:00Z",
  status:      "open",              // open | in_progress | resolved
  priority:    "critical",          // critical | high | medium | low
  lat:         55.7558,
  lng:         37.6173,
  leak_speed:  150,                 // л/мин
  photo:       "idb://...",         // IndexedDB или путь на устройстве
  photo_after: "idb://...",         // фото после устранения
  history:     [{ action, to, date }],
  // ... поля, специфичные для типа проекта
}
```

---

## 🌙 Темизация

Переключение через `data-theme="dark"` на `<html>`, значение сохраняется в `localStorage`:

```scss
:root                { --color-surface: #ffffff; --color-text: #1a1a2e; }
[data-theme="dark"]  { --color-surface: #1e1e2e; --color-text: #e0e0f0; }
```

---

## 🔒 Приватность

- Все данные хранятся **только на устройстве** — нет сервера, нет аналитики
- Фото сжимаются (Canvas → JPEG) и сохраняются в IndexedDB / Filesystem локально
- Работает в полностью изолированной сети

---

## 📜 Скрипты

```bash
npm start          # Запуск dev-сервера → localhost:3000
npm run build      # Продакшн-сборка → build/
npm test           # Jest + Testing Library
npx cap sync       # Синхронизация с Capacitor
npx cap open android  # Открыть в Android Studio
```

---

<div align="center">

Сделано для инженеров, работающих в поле — без интернета, без лишнего.

</div>
