import {
  locations,
  objects,
  components,
  categories_up,
} from "../../../data/dictionaries";
import { makeDescriptionStep, PHOTO_STEP } from "../../shared/steps";

export const STEPS = [
  {
    title: "Основное",
    fields: [
      { type: "input",        key: "subdivision", label: "Подразделение" },
      { type: "input",        key: "deposit",     label: "Месторождение" },
      { type: "autocomplete", key: "location",    label: "Локация",    options: Object.values(locations).flat() },
      { type: "autocomplete", key: "object",      label: "Объект",     options: Object.values(objects).flat() },
      { type: "autocomplete", key: "category",    label: "Категория",  options: Object.values(categories_up).flat() },
      { type: "input",        key: "leak_id",     label: "Бирка",      required: true, number: true },
      { type: "autocomplete", key: "component",   label: "Компонент",  options: Object.values(components).flat() },
      { type: "input",        key: "video_id",    label: "Видео",      number: true, required: true },
      { type: "input",        key: "pressure",    label: "Давление",   number: true },
      { type: "input",        key: "temperature", label: "Температура", number: true },
      { type: "input",        key: "leak_speed",  label: "Скорость",   number: true, required: true },
    ],
  },
  makeDescriptionStep(),
  PHOTO_STEP,
];
