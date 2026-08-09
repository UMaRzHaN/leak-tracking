import {
  locations,
  objects,
  components,
  categories_up,
} from "@/data/leak/fieldDictionary";
import { makeDescriptionStep, PHOTO_STEP } from "@/configs/shared/steps";

export const STEPS = [
  {
    title: "Основное",
    fields: [
      {
        type: "input",
        key: "subdivision",
        label: "Подразделение",
        placeholder: "напр. Мессояхское УПГ",
      },
      {
        type: "input",
        key: "deposit",
        label: "Месторождение",
        placeholder: "напр. Мессояхское",
      },
      {
        type: "autocomplete",
        key: "location",
        label: "Локация",
        options: Object.values(locations).flat(),
        placeholder: "напр. скважина 1",
      },
      {
        type: "autocomplete",
        key: "object",
        label: "Объект",
        options: Object.values(objects).flat(),
        placeholder: "напр. дренажный линия",
      },
      {
        type: "autocomplete",
        key: "category",
        label: "Категория",
        options: Object.values(categories_up).flat(),
        placeholder: "напр. Well",
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
  makeDescriptionStep(),
  PHOTO_STEP,
];
