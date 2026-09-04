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
        key: "locality",
        label: "Населенный пункт",
      },
      {
        type: "input",
        key: "district",
        label: "Район",
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
