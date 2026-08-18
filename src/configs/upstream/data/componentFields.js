import {
  COMPONENT_BUILD_FIELDS,
  COMPONENT_IDENTITY_FIELDS,
  COMPONENT_PLACE_FIELDS,
  COMPONENT_PASSPORT_FIELDS,
  COMPONENT_SEARCH_FIELDS_HEAD,
  COMPONENT_SEARCH_FIELDS_TAIL,
  COMPONENT_SIZE_FIELDS,
  COMPONENT_SYSTEM_FIELDS,
  COMPONENT_TYPE_FIELDS,
} from "@/configs/shared/componentFields";
import { TYPE_FIELDS, COORD_FIELDS } from "@/configs/shared/fields";
import { createFieldSets } from "@/configs/shared/fieldRegistry";

/**
 * Where the component physically sits. Mirrors the leak entity's hierarchy for
 * upstream — Подразделение / Месторождение / Локация — so a component and a
 * leak found on it land in the same place on the map and under the same filter.
 *
 * "Локация" holds the node from the drawing set: УППГ, Сборный пункт,
 * Скважина 22. It anchors search and filtering; the app does not assign work by
 * it and does not track a node as walked or unwalked.
 */
const LOCATION_FIELDS = [
  {
    key: "subdivision",
    label: "Подразделение",
    viewable: true,
    editable: true,
    copyable: true,
  },
  {
    key: "deposit",
    label: "Месторождение",
    viewable: true,
    editable: true,
    copyable: true,
  },
  {
    key: "location",
    label: "Локация",
    viewable: true,
    editable: true,
    copyable: true,
  },
];

const FIELD_DEFINITIONS = [
  ...COMPONENT_SYSTEM_FIELDS,
  ...COMPONENT_IDENTITY_FIELDS,
  ...LOCATION_FIELDS,
  ...COMPONENT_PLACE_FIELDS,
  ...COMPONENT_TYPE_FIELDS,
  ...COMPONENT_SIZE_FIELDS,
  ...TYPE_FIELDS,
  ...COMPONENT_BUILD_FIELDS,
  ...COMPONENT_PASSPORT_FIELDS,
  ...COORD_FIELDS,
];

export const SEARCH_FIELDS = [
  ...COMPONENT_SEARCH_FIELDS_HEAD,
  { key: "deposit", label: "Месторождение" },
  { key: "location", label: "Локация" },
  ...COMPONENT_SEARCH_FIELDS_TAIL,
];

/**
 * The only fields a card cannot be saved without. Everything else is filled in
 * later — a plate that is worn off or buried under insulation must not stop the
 * walk, which is the opposite of how the leak form behaves.
 */
export const REQUIRED_FIELDS = ["location", "component_uid", "component_name"];

export const { FIELDS, VIEW_FIELDS, EDIT_FIELDS, COPY_FIELDS, NUMBER_FIELDS } =
  createFieldSets(FIELD_DEFINITIONS);
