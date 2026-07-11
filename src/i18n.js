import i18n from "i18next";
import { initReactI18next } from "react-i18next";

const LANGUAGE_STORAGE_KEY = "app_language";

const savedLanguage = localStorage.getItem(LANGUAGE_STORAGE_KEY) || "ru";

const resources = {
  ru: {
    translation: {
      header: {
        appTitle: "Журнал утечек газа",
        defaultProject: "Журнал утечек",
        gpsOnTitle: "GPS включён — нажмите для паузы",
        gpsOffTitle: "GPS выключен — нажмите для включения",
        gps: "GPS",
        gpsOn: "GPS вкл",
        gpsOff: "GPS выкл",
        gpsSearch: "Поиск…",
        gpsError: "Ошибка",
        settings: "Настройки",
      },
      projectSetup: {
        title: "Журнал утечек",
        subtitle: "Создайте первый проект для начала работы",

        projectName: "Название проекта",
        projectType: "Тип проекта",

        projectExample: "Например: Тенгиз Q1 2026",
        deviceFolder: "Папка на устройстве",

        selectProjectType: "Выберите тип проекта",

        start: "Начать работу",

        or: "или",

        import: "Импортировать из ZIP",
        importing: "Импорт…",

        importHint: "Восстановить проект из резервной копии",

        importError: "Ошибка импорта",
      },
      mainPage: {
        total: "Всего",
        open: "Открыто",
        inProgress: "В работе",
        resolved: "Устранено",

        recentRecords: "Последние {{count}} записей",
        showAll: "Все {{count}} →",

        shownRecent: "показаны последние {{count}}",
      },
      emptyState: {
        noRecords: "Записей пока нет",
        noFilteredRecords: "Нет записей с таким статусом",
        addFirstLeak: "Добавьте первую утечку через кнопку + внизу",
        addLeak: "+ Добавить утечку",
      },
      addLeak: {
        pageTitle: "Новая утечка",
        stepPrefix: "Шаг",
        draftBanner: {
          message: "📋 Есть незаконченная запись",
          restore: "Восстановить",
          discard: "Удалить",
        },
        buttons: {
          prev: "← Назад",
          next: "Далее →",
          save: "💾 Сохранить",
          saving: "Сохранение...",
          clearStep: "Очистить шаг 🧽",
          clearAll: "Очистить все поля 🧹",
        },
        confirm: {
          title: "Заполнить из предыдущей записи?",
          description: "Некоторые поля пустые. Скопировать значения?",
          confirmLabel: "Скопировать",
          cancelLabel: "Отмена",
        },
        validation: {
          lat: "Широта {{lat}} вне допустимого диапазона [-90, 90]",
          lng: "Долгота {{lng}} вне допустимого диапазона [-180, 180]",
          photoReady:
            "Фото ещё не готово для сохранения. Повторите попытку через секунду.",
        },
      },
      settings: {
        title: "Настройки",
        appearanceTitle: "Внешний вид",
        themeLabelDark: "Тёмная тема",
        themeLabelLight: "Светлая тема",
        themeHintDark: "Тёмный фон, снижает нагрузку на глаза",
        themeHintLight: "Светлый фон",
        languageLabel: "Язык",
        languageHintRu:
          "Текущий язык интерфейса страницы добавления утечки: Русский",
        toggleButtonEn: "EN",

        projects: "Проекты",
        addProject: "Добавить",
        noProjects: "Нет проектов. Создайте первый.",

        calculationParameters: "Параметры расчёта",
        projectSettings: "Настройки для проекта",
        editParameters: "Редактировать параметры",

        fieldsAndExcel: "Поля формы и Excel",
        fieldsDescription:
          "Скройте неиспользуемые поля — они исчезнут из формы и столбцов экспорта.",
        hiddenFields: "Скрыто",
        configureFields: "Настроить поля",

        backup: "Резервная копия",
        exportZip: "Экспорт ZIP",
        importZip: "Импорт ZIP",
        backupHint:
          "ZIP-архив содержит все записи и фотографии. Рекомендуется для переноса данных между устройствами.",

        mapCache: "Кэш карты",
        satelliteTiles: "Спутниковые тайлы",
        cacheEmpty: "Кэш пуст",
        loading: "Загрузка...",
        clearMapCache: "Очистить кэш карты",

        dangerZone: "Опасная зона",
        dangerHint:
          "Очистка удаляет все записи об утечках активного проекта. Фото-файлы на устройстве сохранятся.",
        clearDatabase: "Очистить базу данных",

        notifications: {
          parametersSaved: "Параметры расчёта сохранены",
          changesCanceled: "Изменения отменены",
          cacheCleared: "Кэш карты очищен",
          databaseCleared: "База данных очищена",
          allFieldsActive: "Все поля активны",
          hiddenFieldsCount: "Скрыто полей: {{count}}",
        },

        dialogs: {
          clearMapCache:
            "Очистить кэш карты? Тайлы будут перекачаны при следующем открытии карты.",
          clearDatabase:
            "Удалить все записи об утечках?\n\nЭто действие необратимо. Фото-файлы сохранятся на устройстве.",
        },
      },
      emissionsSummary: {
        title: "Потери проекта (открытые)",

        gasLosses: "Потери газа",
        emissions: "Выбросы",
        activeLeaks: "Активных утечек",

        records: "записей",
        methaneUnit: "м³/год",
        co2Unit: "т CO₂-экв/год",
      },
      fieldVisibility: {
        title: "Настройка полей",
        active: "активно",

        searchPlaceholder: "Поиск по названию или ключу...",
        notFound: "Поля не найдены",

        excelOnly: "Только Excel (расчётные)",

        hidden: "скрыто",
        required: "обязательное",

        showAll: "Показать все",
        hideAll: "Скрыть все",
        hideOthers: "Скрыть остальные",

        systemNote:
          "Поля «№», «Дата обнаружения», «Статус» и «Дата устранения» системные — всегда включаются в экспорт Excel.",

        cancel: "Отмена",
        save: "Сохранить",
      },
      settingsModal: {
        title: "Параметры расчёта",
        gasToFlare: "Газ на сжигание",
        flare: "Сжигание",
        utilization: "Утилизация",
        gasContent: "Содержание газа в смеси",
        current: "Текущее",
        equipmentType: "Тип оборудования",
        uncertainty: "Неопределённость",
        serialNumber: "Серийный номер оборудования",
        equipmentOptions: {
          gfm20: "GFM 2.0",
          gfm30: "GFM 3.0",
          pinkBag: "Розовый мешок",
        },
        operatingMode: "Режим работы",
        operatingModeDays: "дней за год",
        gasType: "Тип газа",
        density: "Плотность",
        cancel: "Отмена",
        save: "Сохранить",

        confirm: {
          title: "Отменить изменения?",
          text: "Вы уверены? Все несохранённые изменения будут потеряны.",
          continueEditing: "Продолжить редактирование",
          discardChanges: "Отменить изменения",
        },
      },
      leakDetails: {
        priority: "Приоритет",

        actions: {
          created: "Запись создана",
          status_changed: "Статус изменён",
          edited: "Данные изменены",
          comment: "Комментарий",
        },

        statuses: {
          open: "Открыта",
          in_progress: "В работе",
          resolved: "Устранена",
        },

        comment: {
          add: "Добавить комментарий",
          placeholder: "Введите комментарий...",
          cancel: "Отмена",
          save: "Сохранить",
        },

        photo: {
          before: "До",
          after: "После",
          noPhoto: "нет фото",
        },

        empty: {
          info: "Нет данных",
          photo: "Фото не добавлены",
          params: "Параметры не заданы",
          coords: "Координаты не заданы",
          history: "История пуста",
        },

        relativeTime: {
          justNow: "только что",
          minutesAgo: "{{count}} мин назад",
          hoursAgo: "{{count}} ч назад",
          daysAgo: "{{count}} дн назад",
        },
      },
      voice: {
        preview: {
          title: "Распознано голосом",
          empty: "Ничего не распознано",
          cancel: "Отмена",
          apply: "Применить",
        },
      },
      photoInput: {
        camera: "Камера",
        gallery: "Галерея",
        replace: "Заменить фото",
        chooseFile: "Выбрать файл",
        selectedAlt: "Выбранное фото",
        addResultPhoto: "Добавить фото по результату",
        reportingHint: "Рекомендуется для отчётности",
        requiredField: "Поле «{{label}}» обязательно",
      },
      resolve: {
        title: "Устранение утечки",
        photoLabel: "Фото после устранения",
        materialsLabel: "МТР (материалы и оборудование)",
        materialsPlaceholder: "Перечислите использованные материалы...",
        noteLabel: "Примечание",
        notePlaceholder: "Дополнительные сведения об устранении...",
        cancel: "Отмена",
        confirm: "Подтвердить",
        addPhoto: "Добавьте фото",
        saving: "Сохранение...",
        error: "Ошибка сохранения",
      },
      footer: {
        home: "Главная",
        add: "Добавить",
        database: "База",
        map: "Карта",
        addLeak: "Добавить утечку",
      },
    },
  },
  en: {
    translation: {
      header: {
        appTitle: "Gas Leak Log",
        defaultProject: "Leak Log",

        gpsOnTitle: "GPS enabled — tap to pause",
        gpsOffTitle: "GPS disabled — tap to enable",

        gps: "GPS",
        gpsOn: "GPS on",
        gpsOff: "GPS off",
        gpsSearch: "Searching…",
        gpsError: "Error",

        settings: "Settings",
      },
      projectSetup: {
        title: "Leak Tracking",
        subtitle: "Create your first project to get started",

        projectName: "Project Name",
        projectType: "Project Type",

        projectExample: "Example: Tengiz Q1 2026",
        deviceFolder: "Device folder",

        selectProjectType: "Select project type",

        start: "Start",

        or: "or",

        import: "Import from ZIP",
        importing: "Importing…",

        importHint: "Restore a project from a backup",

        importError: "Import error",
      },
      mainPage: {
        total: "Total",
        open: "Open",
        inProgress: "In Progress",
        resolved: "Resolved",

        recentRecords: "Last {{count}} records",
        showAll: "All {{count}} →",

        shownRecent: "showing last {{count}}",
      },
      emptyState: {
        noRecords: "No records yet",
        noFilteredRecords: "No records with this status",
        addFirstLeak: "Add your first leak using the + button at the bottom",
        addLeak: "+ Add Leak",
      },
      addLeak: {
        pageTitle: "New leak",
        stepPrefix: "Step",
        draftBanner: {
          message: "📋 Unfinished entry available",
          restore: "Restore",
          discard: "Delete",
        },
        buttons: {
          prev: "← Back",
          next: "Next →",
          save: "💾 Save",
          saving: "Saving...",
          clearStep: "Clear step 🧽",
          clearAll: "Clear all fields 🧹",
        },
        confirm: {
          title: "Fill from previous entry?",
          description: "Some fields are empty. Copy values?",
          confirmLabel: "Copy",
          cancelLabel: "Cancel",
        },
        validation: {
          lat: "Latitude {{lat}} is outside the allowed range [-90, 90]",
          lng: "Longitude {{lng}} is outside the allowed range [-180, 180]",
          photoReady:
            "Photo is not ready for saving yet. Try again in a second.",
        },
        stepTitles: {
          basic: "Basic",
          mtrAndDescription: "MTR and description *",
          noteAndPhoto: "Note and photo",
        },
        fields: {
          district: {
            label: "District",
            placeholder: "e.g. Yaroslavsky",
            hint: "Administrative district where the leak was recorded",
          },
          locality: {
            label: "Locality",
            placeholder: "e.g. Yaroslavl",
            hint: "City or settlement",
          },
          address: {
            label: "Address",
            placeholder: "e.g. Lenin St, 1, apt. 1",
            hint: "Street, house, apartment",
          },
          object: {
            label: "Object",
            placeholder: "e.g. Basement of a residential building",
            hint: "Object where the leak was recorded",
          },
          category: {
            label: "Category",
            placeholder: "e.g. Cabinet and regulator stations",
            hint: "Leak category",
          },
          leak_id: {
            label: "Tag",
            placeholder: "e.g. 4242",
            hint: "Unique number on the physical marker attached to the leak location",
          },
          component: {
            label: "Component",
            placeholder: "e.g. Ball valve",
            hint: "Part or unit from which the leak was recorded",
          },
          video_id: {
            label: "Video",
            placeholder: "e.g. 1042",
            hint: "Video recording number from the instrument (OGI)",
          },
          pressure: {
            label: "Pressure",
            placeholder: "e.g. 4.5",
            hint: "Operating pressure in the pipeline, atm",
          },
          temperature: {
            label: "Temperature",
            placeholder: "e.g. 20",
            hint: "Operating medium temperature, °C",
          },
          leak_speed: {
            label: "Leak rate",
            placeholder: "e.g. 1.5",
            hint: "Measured leak rate by instrument, L/min",
          },
          field: {
            label: "MGPA",
            placeholder: "e.g. MGPA-1",
            hint: "Main gas pipeline administration",
          },
          station: {
            label: "Compressor station",
            placeholder: "e.g. CS-1",
            hint: "Name of the compressor station",
          },
          location: {
            label: "Location",
            placeholder: "e.g. workshop A of compressor units",
            hint: "Area where the leak was recorded",
          },
          subdivision: {
            label: "Subdivision",
            placeholder: "e.g. Messoyakha UPG",
            hint: "Name of the subdivision where the leak was recorded",
          },
          deposit: {
            label: "Deposit",
            placeholder: "e.g. Messoyakhskoye",
            hint: "Name of the deposit where the leak was recorded",
          },
          leak_cause: {
            label: "Leak cause",
            placeholder: "e.g. Corrosion",
            hint: "Established or probable cause of the leak",
          },
          leak_description: {
            label: "Leak description",
            placeholder: "e.g. crack",
            hint: "Nature and location of the leak: connection type, visible damage",
          },
          technological_solution: {
            label: "Technical solution",
            placeholder: "e.g. Inspection",
            hint: "Proposed method to fix the leak",
          },
          repair_recommendation: {
            label: "Repair plan",
            placeholder: "e.g. Fix without shutdown",
            hint: "How to fix without or with equipment shutdown",
          },
          materials_equipment: {
            label: "Repair materials/equipment",
            placeholder: "e.g. gasket",
            hint: "Proposed materials and equipment for repair",
          },
          actuator_type: {
            label: "Actuator type",
            placeholder: "e.g. manual",
            hint: "Manual, electric, pneumatic, etc.",
          },
          connection_type: {
            label: "Connection type",
            placeholder: "e.g. flange joint",
            hint: "Flanged, threaded, welded, etc.",
          },
          installation_type: {
            label: "Installation type",
            placeholder: "e.g. aboveground",
            hint: "Aboveground, underground, indoor, etc.",
          },
          note: {
            label: "Note",
            hint: "Any additional details: detection conditions, related defects",
          },
          photo: {
            label: "Leak photo",
          },
        },
      },
      settings: {
        title: "Settings",

        appearanceTitle: "Appearance",
        themeLabelDark: "Dark theme",
        themeLabelLight: "Light theme",
        themeHintDark: "Dark background is easier on the eyes",
        themeHintLight: "Light background",

        languageLabel: "Language",
        languageHintEn: "Current leak entry page language: English",
        toggleButtonRu: "RU",
        projects: "Projects",
        addProject: "Add",
        noProjects: "No projects yet. Create your first one.",

        calculationParameters: "Calculation Parameters",
        projectSettings: "Settings for project",
        editParameters: "Edit Parameters",

        fieldsAndExcel: "Form Fields and Excel",
        fieldsDescription:
          "Hide unused fields — they will disappear from the form and export columns.",
        hiddenFields: "Hidden",
        configureFields: "Configure Fields",

        backup: "Backup",
        exportZip: "Export ZIP",
        importZip: "Import ZIP",
        backupHint:
          "The ZIP archive contains all records and photos. Recommended for transferring data between devices.",

        mapCache: "Map Cache",
        satelliteTiles: "Satellite Tiles",
        cacheEmpty: "Cache is empty",
        loading: "Loading...",
        clearMapCache: "Clear Map Cache",

        dangerZone: "Danger Zone",
        dangerHint:
          "Clearing removes all leak records from the active project. Photo files on the device will remain.",
        clearDatabase: "Clear Database",

        notifications: {
          parametersSaved: "Calculation parameters saved",
          changesCanceled: "Changes cancelled",
          cacheCleared: "Map cache cleared",
          databaseCleared: "Database cleared",
          allFieldsActive: "All fields are active",
          hiddenFieldsCount: "Hidden fields: {{count}}",
        },

        dialogs: {
          clearMapCache:
            "Clear map cache? Tiles will be downloaded again when the map is opened next time.",
          clearDatabase:
            "Delete all leak records?\n\nThis action cannot be undone. Photo files will remain on the device.",
        },
      },
      emissionsSummary: {
        title: "Project Losses (Open)",

        gasLosses: "Gas Losses",
        emissions: "Emissions",
        activeLeaks: "Active Leaks",

        records: "records",
        methaneUnit: "m³/year",
        co2Unit: "t CO₂e/year",
      },
      fieldVisibility: {
        title: "Field Configuration",
        active: "active",

        searchPlaceholder: "Search by name or key...",
        notFound: "No fields found",

        excelOnly: "Excel Only (Calculated)",

        hidden: "hidden",
        required: "required",

        showAll: "Show All",
        hideAll: "Hide All",
        hideOthers: "Hide Others",

        systemNote:
          'Fields "No.", "Detection Date", "Status" and "Resolution Date" are system fields and are always included in Excel export.',

        cancel: "Cancel",
        save: "Save",
      },
      settingsModal: {
        title: "Calculation Parameters",
        gasToFlare: "Gas to flare",
        flare: "Flaring",
        utilization: "Utilization",
        gasContent: "Gas content in mixture",
        current: "Current",
        equipmentType: "Equipment type",
        uncertainty: "Uncertainty",
        serialNumber: "Equipment serial number",
        equipmentOptions: {
          gfm20: "GFM 2.0",
          gfm30: "GFM 3.0",
          pinkBag: "Pink bag",
        },
        operatingMode: "Operating mode",
        operatingModeDays: "days per year",
        gasType: "Gas type",
        density: "Density",
        cancel: "Cancel",
        save: "Save",

        confirm: {
          title: "Discard changes?",
          text: "Are you sure? All unsaved changes will be lost.",
          continueEditing: "Continue editing",
          discardChanges: "Discard changes",
        },
      },
      leakDetails: {
        priority: "Priority",

        actions: {
          created: "Record created",
          status_changed: "Status changed",
          edited: "Data updated",
          comment: "Comment",
        },

        statuses: {
          open: "Open",
          in_progress: "In progress",
          resolved: "Resolved",
        },

        comment: {
          add: "Add comment",
          placeholder: "Enter a comment...",
          cancel: "Cancel",
          save: "Save",
        },

        photo: {
          before: "Before",
          after: "After",
          noPhoto: "no photo",
        },

        empty: {
          info: "No data",
          photo: "No photos added",
          params: "No parameters set",
          coords: "No coordinates set",
          history: "History is empty",
        },

        relativeTime: {
          justNow: "just now",
          minutesAgo: "{{count}} min ago",
          hoursAgo: "{{count}} h ago",
          daysAgo: "{{count}} d ago",
        },
      },
      voice: {
        preview: {
          title: "Recognized by voice",
          empty: "Nothing was recognized",
          cancel: "Cancel",
          apply: "Apply",
        },
      },
      photoInput: {
        camera: "Camera",
        gallery: "Gallery",
        replace: "Replace photo",
        chooseFile: "Choose file",
        selectedAlt: "Selected photo",
        addResultPhoto: "Add result photo",
        reportingHint: "Recommended for reporting",
        requiredField: 'Field "{{label}}" is required',
      },
      resolve: {
        title: "Leak resolution",
        photoLabel: "Photo after resolution",
        materialsLabel: "MTR (materials and equipment)",
        materialsPlaceholder: "List the materials used...",
        noteLabel: "Note",
        notePlaceholder: "Additional resolution details...",
        cancel: "Cancel",
        confirm: "Confirm",
        addPhoto: "Add photo",
        saving: "Saving...",
        error: "Save error",
      },
      footer: {
        home: "Home",
        add: "Add",
        database: "Database",
        map: "Map",
        addLeak: "Add Leak",
      },
    },
  },
};

i18n.use(initReactI18next).init({
  resources,
  lng: savedLanguage,
  fallbackLng: "ru",
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
