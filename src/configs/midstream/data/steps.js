import {
  locations,
  objects,
  components,
  cause,
} from "../../../data/dictionaries";
import { makeDescriptionStep, PHOTO_STEP } from "../../shared/steps";

const LEAK_CAUSE_FIELD = {
  type: "autocomplete", key: "leak_cause", label: "Причина утечки",
  options: Object.values(cause).flat(),
  hint: "Установленная или предполагаемая причина возникновения утечки",
};

export const STEPS = [
  {
    title: "Основное",
    fields: [
      { type: "input",        key: "field",       label: "УМГ" },
      { type: "input",        key: "station",     label: "Компрессорная станция" },
      { type: "autocomplete", key: "location",    label: "Локация",    options: Object.values(locations).flat() },
      { type: "autocomplete", key: "object",      label: "Объект",     options: Object.values(objects).flat() },
      { type: "input",        key: "leak_id",     label: "Бирка",      required: true, number: true, placeholder: "напр. 4242",   hint: "Уникальный номер на физическом маркере, прикреплённом к месту утечки" },
      { type: "autocomplete", key: "component",   label: "Компонент",  options: Object.values(components).flat(), hint: "Деталь или узел, из которого зафиксирована утечка" },
      { type: "input",        key: "video_id",    label: "Видео",      number: true, required: true, placeholder: "напр. 1042", hint: "Номер видеозаписи из прибора-течеискателя" },
      { type: "input",        key: "pressure",    label: "Давление",   number: true, placeholder: "напр. 4.5",  hint: "Рабочее давление в трубопроводе, атм" },
      { type: "input",        key: "temperature", label: "Температура", number: true, placeholder: "напр. 20",  hint: "Температура рабочей среды, °C" },
      { type: "input",        key: "leak_speed",  label: "Скорость",   number: true, required: true, placeholder: "напр. 1.5",  hint: "Измеренная скорость утечки по прибору, л/мин" },
    ],
  },
  makeDescriptionStep([LEAK_CAUSE_FIELD]),
  PHOTO_STEP,
];
