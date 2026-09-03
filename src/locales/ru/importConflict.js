export const importConflict = {
  title: "Проект уже существует",
  description: "«{{project}}» уже есть в приложении",
  source: "в архиве",

  // Plural forms picked by Intl.PluralRules, so the call site stays free of
  // per-language branching. Every form every language can select has to be
  // present here, which is why English repeats itself.
  records: {
    one: "запись",
    few: "записи",
    many: "записей",
    other: "записей",
  },

  preview: {
    added: "Добавится",
    updated: "Обновится",
    skipped: "Пропустится",
    photosAdded: "Фото новых",
    photosReplaced: "Фото на замену",
    photosReused: "Фото уже есть",
    archivePhotos: "Фото архива",
    registryGroup: "Реестр компонентов",
    componentsAdded: "Компонентов добавится",
    componentsUpdated: "Компонентов обновится",
    componentsRemoved: "Компонентов удалится",
    componentPhotos: "Фото компонентов",
    changedFields: "Изменённые поля",
  },

  diagnostics: {
    summary: "Что отличается",
    photo: "фото",
    unreadable: "локальное фото не прочитано",
    different: "содержимое фото отличается",
    monitoringRecords: "История мониторинга",
    events: "История событий",
    history: "История изменений",
  },

  actions: {
    overwrite: "Перезаписать",
    merge: "Объединить",
    copy: "Создать копию",
    cancel: "Отмена",
  },
};
