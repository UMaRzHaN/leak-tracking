import {
  addresses,
  objects,
  components,
  categories_down,
} from "@/data/leak/fieldDictionary";
import { makeDescriptionStep, PHOTO_STEP } from "@/configs/shared/steps";

export const STEPS = [
  {
    title: "Основное",
    fields: [
      {
        type: "input",
        key: "district",
        label: "Район",
      },
      {
        type: "input",
        key: "locality",
        label: "Населенный пункт",
      },
      {
        type: "autocomplete",
        key: "address",
        label: "Адрес",
        options: Object.values(addresses).flat(),
      },
      {
        type: "autocomplete",
        key: "object",
        label: "Объект",
        options: Object.values(objects).flat(),
      },
      {
        type: "autocomplete",
        key: "category",
        label: "Категория",
        options: Object.values(categories_down).flat(),
      },
      {
        type: "input",
        key: "leak_id",
        label: "Бирка",
        required: true,
        number: true,
      },
      {
        type: "autocomplete",
        key: "component",
        label: "Компонент",
        options: Object.values(components).flat(),
      },
      {
        type: "input",
        key: "video_id",
        label: "Видео",
        number: true,
        required: true,
      },
      {
        type: "input",
        key: "pressure",
        label: "Давление",
        number: true,
      },
      {
        type: "input",
        key: "temperature",
        label: "Температура",
        number: true,
      },
      {
        type: "input",
        key: "leak_speed",
        label: "Скорость",
        number: true,
        required: true,
      },
    ],
  },
  makeDescriptionStep(),
  PHOTO_STEP,
];
