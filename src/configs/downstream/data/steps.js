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
        placeholder: "напр. Ярославский",
      },
      {
        type: "input",
        key: "locality",
        label: "Населенный пункт",
        placeholder: "напр. Ярославль",
      },
      {
        type: "autocomplete",
        key: "address",
        label: "Адрес",
        options: Object.values(addresses).flat(),
        placeholder: "напр. ул. Ленина, д. 1, кв. 1",
      },
      {
        type: "autocomplete",
        key: "object",
        label: "Объект",
        options: Object.values(objects).flat(),
        placeholder: "напр. Подвал жилого дома",
      },
      {
        type: "autocomplete",
        key: "category",
        label: "Категория",
        options: Object.values(categories_down).flat(),
        placeholder: "напр. Шкафные и регуляторные пункты",
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
