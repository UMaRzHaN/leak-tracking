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
      },
      {
        type: "input",
        key: "station",
        label: "Компрессорная станция",
        placeholder: "напр. КС-1",
      },
      {
        type: "autocomplete",
        key: "location",
        label: "Локация",
        options: Object.values(locations).flat(),
        placeholder: "напр. цех А компрессорных агрегатов",
      },
      {
        type: "autocomplete",
        key: "object",
        label: "Объект",
        options: Object.values(objects).flat(),
        placeholder: "напр. АВОГ-1",
      },
      {
        type: "input",
        key: "leak_id",
        label: "Бирка",
        required: true,
        number: true,
        placeholder: "напр. 4242",
      },
      {
        type: "autocomplete",
        key: "component",
        label: "Компонент",
        options: Object.values(components).flat(),
        placeholder: "напр. Кран Шаровый",
      },
      {
        type: "input",
        key: "video_id",
        label: "Видео",
        number: true,
        required: true,
        placeholder: "напр. 1042",
      },
      {
        type: "input",
        key: "pressure",
        label: "Давление",
        number: true,
        placeholder: "напр. 4.5",
      },
      {
        type: "input",
        key: "temperature",
        label: "Температура",
        number: true,
        placeholder: "напр. 20",
      },
      {
        type: "input",
        key: "leak_speed",
        label: "Скорость",
        number: true,
        required: true,
        placeholder: "напр. 1.5",
      },
    ],
  },
  makeDescriptionStep([LEAK_CAUSE_FIELD]),
  PHOTO_STEP,
];
