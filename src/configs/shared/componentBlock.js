import {
  createComponentFieldSets,
  COMPONENT_REQUIRED_FIELDS,
} from "@/configs/shared/componentFieldSets";
import { createComponentSteps } from "@/configs/shared/componentSteps";
import { splitExcelColumns } from "@/configs/shared/excel";
import {
  body_materials,
  component_names,
  component_statuses,
  component_types,
  equipment_types,
  mediums,
} from "@/data/component/componentDictionary";

/**
 * Реестр компонентов одного типа проекта, загружаемый по требованию.
 *
 * Вынесен из конфигов типов потому, что те лежат в стартовом графе: словари и
 * четырёхшаговая форма нужны, только когда кто-то откроет реестр, а встроенные
 * в конфиг они брали плату за себя с каждого холодного старта.
 *
 * У типов проекта реестр общий — железо не меняется от того, промысел это,
 * транспорт или распределение. Различаются уровни места, и только они
 * приходят сюда снаружи.
 */

/**
 * Повторяет порядок колонок «Database component.xlsx», чтобы лист реестра
 * ложился прямо в существующую отчётность заказчика. Три отступления, все
 * намеренные: единственная колонка источника «Местонахождения» разворачивается
 * в те уровни, которые приложение действительно ведёт у этого типа проекта,
 * единственная «Координаты» делится на X и Y — так их уже пишет лист утечек в
 * той же книге, — и первым идёт номер строки.
 *
 * Собирается `splitExcelColumns`, а не `withRequiredExcelColumns`: последний
 * подмешивает колонки, осмысленные только для утечки (время обнаружения,
 * оборудование для замера, погрешность).
 */
function componentExcelColumns(locationLevels) {
  return [
    { key: "index", header: "№" },
    ...locationLevels.map(({ key, label }) => ({ key, header: label })),
    { key: "object", header: "Объект" },
    { key: "component", header: "Наименование компонента" },
    { key: "component_name_en", header: "Component name" },
    { key: "component_uid", header: "Индивидуальный номер компонента" },
    { key: "scheme_tag", header: "Инвентаризационный номер на схеме" },
    { key: "component_type", header: "Тип компонента" },
    { key: "equipment_type", header: "Тип оборудования" },
    { key: "nominal_diameter", header: "Номинальный диаметр компонента" },
    { key: "nominal_pressure", header: "Номинальное давление компонента" },
    { key: "working_pressure", header: "Рабочее давление" },
    { key: "working_temperature", header: "Рабочая температура" },
    { key: "connection_type", header: "Тип соединения" },
    { key: "medium", header: "Среда применения" },
    { key: "body_material", header: "Материал Корпуса" },
    { key: "actuator_type", header: "Тип привода" },
    { key: "installation_type", header: "Тип установки" },
    { key: "installed_at", header: "Дата монтажа" },
    { key: "inspected_at", header: "Дата Инспекции" },
    { key: "manufacturer", header: "Производитель" },
    { key: "component_status", header: "Статус компонента" },
    { key: "lat", header: "Координата X" },
    { key: "lng", header: "Координата Y" },
    { key: "photo", header: "Фото" },
  ];
}

/**
 * Что голос вправе заполнить в карточке компонента.
 *
 * Сначала здесь были только поля, общие с утечкой, — и голос заполнял пятую
 * часть карточки, а остальное человек дописывал руками, стоя у железа с
 * телефоном в одной руке. Теперь распознаватель знает и паспортные величины:
 * они читаются с таблички вслух ровно так же, как всё прочее.
 *
 * Дата монтажа сюда намеренно не входит: её берут календарём, а
 * продиктованная дата — это спор о том, что значит «двенадцатое пятое».
 *
 * `options` — списки допустимых значений. Услышанное «запорная арматура»
 * сопоставляется с «Запорная арматура» из словаря, иначе в карточку попадала
 * бы строка, которой нет ни в одном выпадающем списке.
 */
function componentVoice(locationLevels) {
  return {
    outputFields: [
      // Место: голос кладёт услышанное на уровни иерархии этого типа проекта.
      ...locationLevels.map(({ key }) => key),
      "object",
      // Что это за железо.
      "component",
      "component_uid",
      "scheme_tag",
      "component_type",
      "equipment_type",
      // Что написано на табличке.
      "nominal_diameter",
      "nominal_pressure",
      "working_pressure",
      "working_temperature",
      "connection_type",
      "actuator_type",
      "installation_type",
      "medium",
      "body_material",
      "manufacturer",
      "component_status",
    ],
    synonymsFields: [
      "component",
      "actuator_type",
      "connection_type",
      "installation_type",
    ],
    options: {
      /*
       * Места здесь нет намеренно. В словаре стоит «Скважина» — вид узла, — а
       * говорят «Скважина 22», и сведение к словарю отрезало бы номер, то есть
       * ровно то, что отличает один узел от другого.
       */
      component: component_names,
      component_type: component_types,
      equipment_type: equipment_types,
      medium: mediums,
      body_material: body_materials,
      component_status: component_statuses,
    },
  };
}

/**
 * @param {{
 *   locationLevels: {key: string, label: string}[],
 *   lastOptions: string[],
 *   location: object,
 * }} config
 */
export function createComponentBlock({
  locationLevels,
  lastOptions,
  location,
}) {
  const { FIELDS, NUMBER_FIELDS, COPY_FIELDS, SEARCH_FIELDS } =
    createComponentFieldSets(locationLevels);

  return Object.freeze({
    steps: {
      mode: "manual",
      steps: createComponentSteps({ locationLevels, lastOptions }),
    },
    voice: componentVoice(locationLevels),
    system: {
      fields: FIELDS,
      numeric: NUMBER_FIELDS,
      copyable: COPY_FIELDS,
      search: SEARCH_FIELDS,
      required: COMPONENT_REQUIRED_FIELDS,
      identity: "component_uid",
      location,
    },
    export: {
      excel: {
        format: "XLSX",
        purpose: "sheet",
        direction: ["export"],
        sheet: "Компоненты",
        ...splitExcelColumns(componentExcelColumns(locationLevels)),
      },
    },
  });
}
