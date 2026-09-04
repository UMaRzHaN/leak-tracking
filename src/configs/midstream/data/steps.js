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
      /*
       * Привязка к заведённой карточке — первым полем шага, потому что снимает
       * работу со всех, что ниже: выбранная карточка сама проставит место,
       * объект, наименование, привод, присоединение и исполнение. Набирать их
       * руками, а потом выбирать карточку, значит написать то же самое дважды.
       *
       * Не обязательна и ничего не заменяет. Реестр ведут не везде, а обход
       * утечек начинают раньше, чем заканчивают обход железа: утечке, которой
       * не к чему привязаться, надо записываться так же легко, как и раньше.
       */
      {
        type: "component-link",
        key: "component_id",
        label: "Компонент из реестра",
      },
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
