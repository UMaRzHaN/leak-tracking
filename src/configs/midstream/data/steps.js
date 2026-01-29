import {
  locations,
  objects,
  components,
  description,
  cause,
  solutions,
  recommendations,
  materials,
  actuator_type,
  connection_type,
  installation_type,
} from "./dictionaries";

export const STEPS = [
  {
    title: "Основное",
    fields: [
      { type: "input", key: "field", label: "УМГ" },
      { type: "input", key: "station", label: "Компрессорная станция" },
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
      { type: "input", key: "pressure", label: "Давление", number: true },
      { type: "input", key: "temperature", label: "Температура", number: true },
      {
        type: "input",
        key: "leak_speed",
        label: "Скорость",
        number: true,
        required: true,
      },
      {
        type: "autocomplete",
        key: "leak_description",
        label: "Описание утечки",
        options: Object.values(description).flat(),
      },
      {
        type: "autocomplete",
        key: "leak_cause",
        label: "Причина утечки",
        options: Object.values(cause).flat(),
      },
      {
        type: "autocomplete",
        key: "technological_solution",
        label: "Техрешение",
        options: Object.values(solutions).flat(),
      },
      {
        type: "autocomplete",
        key: "repair_recommendation",
        label: "План устранения",
        options: Object.values(recommendations).flat(),
      },
    ],
  },
  // {
  //   title: "Объект и компонент",
  //   fields: [
  //     {
  //       type: "autocomplete",
  //       key: "object",
  //       label: "Объект",
  //       options: Object.values(objects).flat(),
  //     },
  //     {
  //       type: "input",
  //       key: "leak_id",
  //       label: "Бирка",
  //       required: true,
  //     },
  //     {
  //       type: "autocomplete",
  //       key: "component",
  //       label: "Компонент",
  //       options: Object.values(components).flat(),
  //     },
  //   ],
  // },
  // {
  //   title: "Параметры",
  //   fields: [
  //     {
  //       type: "input",
  //       key: "video_id",
  //       label: "Видео",
  //       number: true,
  //       required: true,
  //     },
  //     { type: "input", key: "pressure", label: "Давление", number: true },
  //     { type: "input", key: "temperature", label: "Температура", number: true },
  //   ],
  // },
  // {
  //   title: "Описание",
  //   fields: [
  //     {
  //       type: "input",
  //       key: "leak_speed",
  //       label: "Скорость",
  //       number: true,
  //       required: true,
  //     },
  //     {
  //       type: "autocomplete",
  //       key: "leak_description",
  //       label: "Описание утечки",
  //       options: Object.values(description).flat(),
  //     },
  //     {
  //       type: "autocomplete",
  //       key: "leak_cause",
  //       label: "Причина утечки",
  //       options: Object.values(cause).flat(),
  //     },
  //   ],
  // },
  // {
  //   title: "Материалы и примечание",
  //   fields: [
  //     {
  //       type: "autocomplete",
  //       key: "technological_solution",
  //       label: "Техрешение",
  //       options: Object.values(solutions).flat(),
  //     },
  //     {
  //       type: "autocomplete",
  //       key: "repair_recommendation",
  //       label: "План устранения",
  //       options: Object.values(recommendations).flat(),
  //     },
  //     {
  //       type: "autocomplete",
  //       key: "materials_equipment",
  //       label: "МТР ремонта",
  //       options: Object.values(materials).flat(),
  //     },
  //   ],
  // },
  {
    title: "МТР *",
    fields: [
      {
        type: "autocomplete",
        key: "materials_equipment",
        label: "МТР ремонта",
        options: Object.values(materials).flat(),
        required: true,
      },
      {
        type: "autocomplete",
        key: "actuator_type",
        label: "Тип привода",
        options: Object.values(actuator_type).flat(),
        required: true,
      },
      {
        type: "autocomplete",
        key: "connection_type",
        label: "Тип присоединения",
        options: Object.values(connection_type).flat(),
        required: true,
      },
      {
        type: "autocomplete",
        key: "installation_type",
        label: "Тип установки",
        options: Object.values(installation_type).flat(),
        required: true,
      },
    ],
  },
  {
    title: "Примечание и фото",
    fields: [
      { type: "textarea", key: "note", label: "Примечание" },
      { type: "photo", key: "photo", label: "Фото утечки", required: true },
    ],
  },
];
