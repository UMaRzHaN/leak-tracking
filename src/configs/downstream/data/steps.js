import {
  addresses,
  objects,
  components,
  categories_down,
} from "../../../data/dictionaries";
import { makeDescriptionStep, PHOTO_STEP } from "../../shared/steps";

export const STEPS = [
  {
    title: "Основное",
    fields: [
      { type: "input",        key: "district",    label: "Район" },
      { type: "input",        key: "locality",    label: "Населенный пункт" },
      { type: "autocomplete", key: "address",     label: "Адрес",      options: Object.values(addresses).flat() },
      { type: "autocomplete", key: "object",      label: "Объект",     options: Object.values(objects).flat() },
      { type: "autocomplete", key: "category",    label: "Категория",  options: Object.values(categories_down).flat() },
      { type: "input",        key: "leak_id",     label: "Бирка",      required: true, number: true, placeholder: "напр. 4242",   hint: "Уникальный номер на физическом маркере, прикреплённом к месту утечки" },
      { type: "autocomplete", key: "component",   label: "Компонент",  options: Object.values(components).flat(), hint: "Деталь или узел, из которого зафиксирована утечка" },
      { type: "input",        key: "video_id",    label: "Видео",      number: true, required: true, placeholder: "напр. 1042", hint: "Номер видеозаписи из прибора-течеискателя" },
      { type: "input",        key: "pressure",    label: "Давление",   number: true, placeholder: "напр. 4.5",  hint: "Рабочее давление в трубопроводе, атм" },
      { type: "input",        key: "temperature", label: "Температура", number: true, placeholder: "напр. 20",  hint: "Температура рабочей среды, °C" },
      { type: "input",        key: "leak_speed",  label: "Скорость",   number: true, required: true, placeholder: "напр. 1.5",  hint: "Измеренная скорость утечки по прибору, л/мин" },
    ],
  },
  makeDescriptionStep(),
  PHOTO_STEP,
];
