import {
  DATE_FIELD, IDENTIFIER_FIELDS, OBJECT_FIELDS, TYPE_FIELDS,
  CATEGORY_FIELD, DESCRIPTION_FIELDS, PARAM_FIELDS, COORD_FIELDS,
} from "../../shared/fields";

const LOCATION_FIELDS = [
  { key: "district",  label: "Район",             viewable: true, editable: true, copyable: true },
  { key: "locality",  label: "Населенный пункт",  viewable: true, editable: true, copyable: true },
  { key: "address",   label: "Адрес",             viewable: true, editable: true, copyable: true },
];

export const FIELDS = [
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

export const VIEW_FIELDS   = FIELDS.filter((f) => f.viewable);
export const EDIT_FIELDS   = FIELDS.filter((f) => f.editable);
export const COPY_FIELDS   = FIELDS.filter((f) => f.copyable);
export const NUMBER_FIELDS = FIELDS.filter((f) => f.numeric);
