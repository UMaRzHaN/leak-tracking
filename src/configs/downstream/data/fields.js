import {
  DATE_FIELD,
  IDENTIFIER_FIELDS,
  OBJECT_FIELDS,
  TYPE_FIELDS,
  CATEGORY_FIELD,
  DESCRIPTION_FIELDS,
  PARAM_FIELDS,
  COORD_FIELDS,
} from "@/configs/shared/fields";
import { createFieldSets } from "@/configs/shared/fieldRegistry";

const LOCATION_FIELDS = [
  {
    key: "locality",
    label: "Населенный пункт",
    viewable: true,
    editable: true,
    copyable: true,
    voice: true,
  },
  {
    key: "district",
    label: "Район",
    viewable: true,
    editable: true,
    copyable: true,
    voice: true,
  },
  {
    key: "address",
    label: "Адрес",
    viewable: true,
    editable: true,
    copyable: true,
    voice: true,
  },
];

const FIELD_DEFINITIONS = [
  DATE_FIELD,
  ...IDENTIFIER_FIELDS,
  ...LOCATION_FIELDS,
  ...OBJECT_FIELDS,
  ...TYPE_FIELDS,
  CATEGORY_FIELD,
  ...DESCRIPTION_FIELDS,
  ...PARAM_FIELDS,
  ...COORD_FIELDS,
];

export const {
  FIELDS,
  VIEW_FIELDS,
  EDIT_FIELDS,
  COPY_FIELDS,
  NUMBER_FIELDS,
  VOICE_FIELDS,
} = createFieldSets(FIELD_DEFINITIONS);
