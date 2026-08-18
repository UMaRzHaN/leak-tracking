import {
  body_materials,
  component_names,
  component_names_en,
  component_statuses,
  component_types,
  equipment_types,
  mediums,
  process_lines,
} from "@/data/component/componentDictionary";
import {
  actuator_type,
  connection_type,
  installation_type,
  locations,
} from "@/data/leak/fieldDictionary";

/**
 * Four steps, ordered by how much of the information is actually available
 * while standing in front of the equipment.
 *
 * Only the first step carries required fields. Steps two and three are read off
 * a plate that is often unreadable, so they must never block saving — the card
 * is expected to be incomplete and filled in later.
 */
export const COMPONENT_STEPS = [
  {
    title: "Идентификация *",
    fields: [
      {
        type: "input",
        key: "subdivision",
        label: "Подразделение",
      },
      {
        type: "input",
        key: "deposit",
        label: "Месторождение",
      },
      {
        type: "autocomplete",
        key: "location",
        label: "Локация",
        required: true,
        options: Object.values(locations).flat(),
      },
      {
        type: "autocomplete",
        key: "process_line",
        label: "Линия",
        options: process_lines,
      },
      {
        type: "input",
        key: "component_uid",
        label: "Индивидуальный номер",
        required: true,
        number: true,
      },
      {
        type: "input",
        key: "scheme_tag",
        label: "Номер на схеме",
      },
      {
        type: "autocomplete",
        key: "component_name",
        label: "Наименование компонента",
        required: true,
        options: component_names,
      },
      {
        type: "autocomplete",
        key: "component_name_en",
        label: "Component name",
        options: component_names_en,
      },
    ],
  },
  {
    title: "Параметры",
    fields: [
      {
        type: "autocomplete",
        key: "component_type",
        label: "Тип компонента",
        options: component_types,
      },
      {
        type: "autocomplete",
        key: "equipment_type",
        label: "Тип оборудования",
        options: equipment_types,
      },
      {
        type: "input",
        key: "diameter",
        label: "Диаметр, мм",
        number: true,
      },
      {
        type: "input",
        key: "nominal_diameter",
        label: "Номинальный диаметр",
        number: true,
      },
      {
        type: "input",
        key: "line_pressure",
        label: "Давление на линии, МПа",
        number: true,
      },
      {
        type: "input",
        key: "nominal_pressure",
        label: "Номинальное давление, МПа",
        number: true,
      },
      {
        type: "input",
        key: "working_pressure",
        label: "Рабочее давление, МПа",
        number: true,
      },
      {
        type: "input",
        key: "working_temperature",
        label: "Рабочая температура, °C",
        number: true,
      },
    ],
  },
  {
    title: "Паспорт",
    fields: [
      {
        type: "autocomplete",
        key: "connection_type",
        label: "Тип присоединения",
        options: Object.values(connection_type).flat(),
      },
      {
        type: "autocomplete",
        key: "actuator_type",
        label: "Тип привода",
        options: Object.values(actuator_type).flat(),
      },
      {
        type: "autocomplete",
        key: "installation_type",
        label: "Тип установки",
        options: Object.values(installation_type).flat(),
      },
      {
        type: "autocomplete",
        key: "medium",
        label: "Среда применения",
        options: mediums,
      },
      {
        type: "autocomplete",
        key: "body_material",
        label: "Материал корпуса",
        options: body_materials,
      },
      {
        type: "input",
        key: "manufacturer",
        label: "Производитель",
      },
      {
        type: "input",
        key: "installed_at",
        label: "Дата монтажа",
      },
      {
        type: "autocomplete",
        key: "component_status",
        label: "Статус компонента",
        options: component_statuses,
      },
    ],
  },
  {
    title: "Фото и координаты",
    fields: [
      { type: "photo", key: "photo", label: "Фото компонента" },
      /*
       * Stamped from the receiver when the card is created, the way a leak is,
       * and left editable: indoors and among steelwork a fix is often wrong by
       * more than the distance between two valves, and the person standing
       * there is the one who can correct it.
       */
      { type: "input", key: "lat", label: "Координата X", number: true },
      { type: "input", key: "lng", label: "Координата Y", number: true },
    ],
  },
];
