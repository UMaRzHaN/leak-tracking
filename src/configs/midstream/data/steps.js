import {
  locations,
  objects,
  components,
  cause,
} from "@/data/leak/fieldDictionary";
import { makeDescriptionStep, PHOTO_STEP } from "@/configs/shared/steps";

const LEAK_CAUSE_FIELD = {
  type: "autocomplete",
  key: "leak_cause",
  label: "Причина утечки",
  options: Object.values(cause).flat(),
  placeholder: "напр. Коррозия",
  hint: "Установленная или предполагаемая причина возникновения утечки",
};

export const STEPS = [
  {
    title: "Основное",
    fields: [
      {
        type: "input",
        key: "field",
        label: "УМГ",
        placeholder: "напр. УМГ-1",
        hint: "Наименование управления магистральных газопроводов",
      },
      {
        type: "input",
        key: "station",
        label: "Компрессорная станция",
        placeholder: "напр. КС-1",
        hint: "Наименование компрессорной станции",
      },
      {
        type: "autocomplete",
        key: "location",
        label: "Локация",
        options: Object.values(locations).flat(),
        placeholder: "напр. цех А компрессорных агрегатов",
        hint: "Участок, на котором зафиксирована утечка",
      },
      {
        type: "autocomplete",
        key: "object",
        label: "Объект",
        options: Object.values(objects).flat(),
        placeholder: "напр. АВОГ-1",
        hint: "Объект, в котором зафиксирована утечка",
      },
      {
        type: "input",
        key: "leak_id",
        label: "Бирка",
        required: true,
        number: true,
        placeholder: "напр. 4242",
        hint: "Уникальный номер на физическом маркере, прикреплённом к месту утечки",
      },
      {
        type: "autocomplete",
        key: "component",
        label: "Компонент",
        options: Object.values(components).flat(),
        placeholder: "напр. Кран Шаровый",
        hint: "Деталь или узел, из которого зафиксирована утечка",
      },
      {
        type: "input",
        key: "video_id",
        label: "Видео",
        number: true,
        required: true,
        placeholder: "напр. 1042",
        hint: "Номер видеозаписи из прибора (OGI)",
      },
      {
        type: "input",
        key: "detectedBy",
        label: "Кто зафиксировал",
        placeholder: "напр. Иванов И.И.",
        hint: "Сотрудник, который первично зафиксировал утечку",
      },
      {
        type: "input",
        key: "pressure",
        label: "Давление",
        number: true,
        placeholder: "напр. 4.5",
        hint: "Рабочее давление в трубопроводе, атм",
      },
      {
        type: "input",
        key: "temperature",
        label: "Температура",
        number: true,
        placeholder: "напр. 20",
        hint: "Температура рабочей среды, °C",
      },
      {
        type: "input",
        key: "leak_speed",
        label: "Скорость",
        number: true,
        required: true,
        placeholder: "напр. 1.5",
        hint: "Измеренная скорость утечки по прибору, л/мин",
      },
    ],
  },
  makeDescriptionStep([LEAK_CAUSE_FIELD]),
  PHOTO_STEP,
];
