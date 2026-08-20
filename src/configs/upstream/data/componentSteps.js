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
  installation_type,
  locations,
  objects,
} from "@/data/leak/fieldDictionary";

/**
 * Four steps, ordered by how much of the information is actually available
 * while standing in front of the equipment.
 *
 * Two fields are required and no more: the identity number on the first step
 * and the photograph on the last. Everything between is read off a plate that
 * is often unreadable, so none of it may block the walk — the card is expected
 * to be incomplete and filled in later.
 */
export const COMPONENT_STEPS = [
  {
    title: "Идентификация",
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
        options: Object.values(locations).flat(),
      },
      {
        type: "autocomplete",
        key: "object",
        label: "Объект",
        options: Object.values(objects).flat(),
      },
      {
        /*
         * Наименования — из словаря утечек, дополненные железом, которого там
         * нет (см. `component_names`). Поле `component` у карточки и у утечки
         * общее: карточка должна копироваться в утечку напрямую, а два списка
         * называли одно и то же по-разному.
         */
        type: "autocomplete",
        key: "component",
        label: "Компонент",
        options: component_names,
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
        key: "nominal_diameter",
        label: "Номинальный диаметр",
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
        // A date the walker reads off a plate and the app has no way to guess,
        // so it is asked for — but through the platform's own picker, which
        // spares everyone an argument about separators.
        type: "date",
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
    title: "Фото *",
    fields: [
      { type: "photo", key: "photo", label: "Фото компонента", required: true },
    ],
  },
];
