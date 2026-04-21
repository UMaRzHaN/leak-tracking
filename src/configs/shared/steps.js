/**
 * Shared form step definitions used across all project types.
 *
 * - makeDescriptionStep(extraFields?) — "МТР и Описание" step; pass project-specific
 *   fields (e.g. leak_cause) to prepend them before leak_description.
 * - PHOTO_STEP — "Примечание и фото" step (identical in every project).
 */

import {
  description,
  solutions,
  recommendations,
  materials,
  actuator_type,
  connection_type,
  installation_type,
} from "../../data/dictionaries";

export function makeDescriptionStep(extraFields = []) {
  return {
    title: "МТР и Описание *",
    fields: [
      ...extraFields,
      {
        type: "autocomplete", key: "leak_description", label: "Описание утечки",
        options: Object.values(description).flat(),
        hint: "Характер и место утечки: тип соединения, видимые повреждения",
      },
      {
        type: "autocomplete", key: "technological_solution", label: "Техрешение",
        options: Object.values(solutions).flat(),
        hint: "Способ устранения без остановки оборудования",
      },
      {
        type: "autocomplete", key: "repair_recommendation", label: "План устранения",
        options: Object.values(recommendations).flat(),
        hint: "Рекомендуемые работы при плановом ремонте",
      },
      {
        type: "autocomplete", key: "materials_equipment", label: "МТР ремонта",
        options: Object.values(materials).flat(),
        hint: "Предполагаемые материалы и оборудование для устранения",
      },
      {
        type: "autocomplete", key: "actuator_type", label: "Тип привода",
        options: Object.values(actuator_type).flat(),
        hint: "Ручной, электрический, пневматический и т.д.",
      },
      {
        type: "autocomplete", key: "connection_type", label: "Тип присоединения",
        options: Object.values(connection_type).flat(),
        hint: "Фланцевое, резьбовое, сварное и т.д.",
      },
      {
        type: "autocomplete", key: "installation_type", label: "Тип установки",
        options: Object.values(installation_type).flat(),
        hint: "Надземная, подземная, внутри здания и т.д.",
      },
    ],
  };
}

export const PHOTO_STEP = {
  title: "Примечание и фото",
  fields: [
    { type: "textarea", key: "note",  label: "Примечание", hint: "Любые дополнительные сведения: условия обнаружения, сопутствующие дефекты" },
    { type: "photo",    key: "photo", label: "Фото утечки", required: true },
  ],
};
