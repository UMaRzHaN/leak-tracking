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

|   | Функция | Описание |
|---|---------|----------|
| 📋 | **Регистрация утечек** | Многошаговая форма с фото, координатами и расчетами |
| 🗺️ | **Офлайн-карта** | Leaflet с локальным кэшем тайлов и кластеризацией |
| 🎤 | **Голосовой ввод** | Распознавание речи с fuzzy matching и preview-подтверждением |
| 📦 | **Импорт / Экспорт проектов** | ZIP-бэкап с метаданными проекта и фотографиями |
| 📊 | **Экспорт отчетов** | XLSX / KML / JSON |
| 🔄 | **Lifecycle Management** | Open → In Progress → Resolved + история изменений |
| 🌙 | **Темизация** | Поддержка dark / light mode |
| 📱 | **Android Ready** | Capacitor 8 native build |

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

---

## 📁 Архитектура проекта

```text
src/
├── app/                # App state / migrations / project settings
├── pages/              # Основные экраны приложения
├── components/         # UI-компоненты и sheets/modals
├── configs/            # Конфиги upstream/midstream/downstream
├── hooks/              # Бизнес- и UI-хуки
├── services/           # Export / Maps / Storage logic
├── utils/              # Calculations / Voice / Normalize helpers
└── tests/              # Unit tests
```

---

## 🗂️ Поддерживаемые типы проектов

| Тип | Назначение |
|------|------------|
| Upstream | Добыча |
| Midstream | Транспортировка и хранение|
| Downstream | Переработка / Сбыт |

Каждый тип проекта использует собственную схему полей, форму ввода и экспортный шаблон.

---

## 📦 Импорт / Экспорт

Проект поддерживает перенос данных между устройствами через ZIP-архив:

```text
Export ZIP
├── project.json        # Метаданные проекта
├── leaks.json          # Все записи
└── photos/             # Все связанные изображения
```

При импорте автоматически:
- создаётся новый проект;
- восстанавливаются записи и фото;
- применяется конфигурация project type;
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

## 🔒 Приватность

- Все данные хранятся локально на устройстве
- Нет серверной части / облака / телеметрии

---

## 📜 Скрипты

```bash
npm run dev       # Development server
npm run build     # Production build
npm run preview   # Preview build
npm test          # Run tests
npx cap sync      # Sync Capacitor
```

---

<div align="center">

Разработано для полевых инженеров и LDAR-команд.

</div>

