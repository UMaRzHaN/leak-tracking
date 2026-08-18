import {
  body_materials,
  component_names,
  component_statuses,
  component_types,
  equipment_types,
  mediums,
} from "@/data/component/componentDictionary";
import {
  actuator_type,
  connection_type,
  components,
  installation_type,
  locations,
  objects,
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
        key: "object",
        label: "Объект",
        options: Object.values(objects).flat(),
      },
      {
        type: "autocomplete",
        key: "component",
        label: "Компонент",
        options: Object.values(components).flat(),
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
    /*
     * Coordinates are stamped from the receiver when the card is opened and
     * never asked for, exactly as a leak records them — a field for a number
     * the app already has only invites a worse one.
     */
    title: "Фото",
    fields: [{ type: "photo", key: "photo", label: "Фото компонента" }],
  },
];
