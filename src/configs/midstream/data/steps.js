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
};

export const STEPS = [
  {
    title: "Основное",
    fields: [
      {
        type: "input",
        key: "field",
        label: "УМГ",
      },
      {
        type: "input",
        key: "station",
        label: "Компрессорная станция",
      },
      {
        type: "autocomplete",
        key: "location",
        label: "Локация",
        options: Object.values(locations).flat(),
      },
      {
        type: "autocomplete",
        key: "object",
        label: "Объект",
        options: Object.values(objects).flat(),
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
  makeDescriptionStep([LEAK_CAUSE_FIELD]),
  PHOTO_STEP,
];
