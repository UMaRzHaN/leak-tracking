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
  objects,
} from "@/data/leak/fieldDictionary";

/**
 * Четыре шага карточки компонента, упорядоченные по тому, сколько сведений
 * реально доступно, пока стоишь перед железом.
 *
 * Обязательных полей два и не больше: номер на первом шаге и снимок на
 * последнем. Всё между ними читается с таблички, которая часто нечитаема, и
 * потому ничто из этого не вправе остановить обход — карточка заведомо
 * неполна и дозаполняется позже.
 *
 * Различаются у типов проекта только три верхних поля — уровни места. Форма
 * утечки везде устроена одинаково: два старших уровня набираются руками,
 * младший берётся автодополнением из своего словаря (узлы промысла у
 * upstream и midstream, адреса у downstream). Карточка повторяет этот
 * порядок, чтобы компонент и найденная на нём утечка ложились в одно место на
 * карте и под один фильтр.
 *
 * @param {{
 *   locationLevels: {key: string, label: string}[],
 *   lastOptions: string[],
 * }} config уровни места этого типа и словарь для младшего из них
 */
export function createComponentSteps({ locationLevels, lastOptions }) {
  const [main, secondary, last] = locationLevels;

  return [
    {
      title: "Идентификация",
      fields: [
        {
          type: "input",
          key: main.key,
          label: main.label,
        },
        {
          type: "input",
          key: secondary.key,
          label: secondary.label,
        },
        {
          type: "autocomplete",
          key: last.key,
          label: last.label,
          options: lastOptions,
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
          // so it is asked for. Набирается руками: календарь открывался на
          // текущем месяце, а монтаж был в позапрошлом десятилетии, и до него
          // долистывали. Формат прежний — ДД.ММ.ГГГГ, точки поле ставит само.
          type: "date",
          key: "installed_at",
          label: "Дата монтажа",
          placeholder: "ДД.ММ.ГГГГ",
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
        {
          type: "photo",
          key: "photo",
          label: "Фото компонента",
          required: true,
        },
      ],
    },
  ];
}
