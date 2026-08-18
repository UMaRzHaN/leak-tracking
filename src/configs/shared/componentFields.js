/**
 * Shared component-registry field definitions.
 *
 * The registry describes physical equipment, not a leak event: a ball valve is
 * a ball valve in upstream, midstream and downstream alike. So the passport
 * blocks live here and every project config composes them together with its
 * own location hierarchy, dictionaries and export columns — the same way
 * `fields.js` is composed for leaks.
 *
 * Property order convention matches fields.js: key, label, viewable, editable,
 * copyable, numeric, multiline, coord.
 *
 * Keys shared with the leak entity (connection_type, actuator_type,
 * installation_type, lat, lng, photo) are reused verbatim: they carry the same
 * dictionaries, and the leak-to-component autofill planned later becomes a
 * straight key copy instead of a mapping table.
 */

/**
 * Identity. `component_uid` is the number assigned during the walk — it is
 * unique, but only by agreement between the people doing the walking, never by
 * construction. `scheme_tag` is copied off the P&ID and repeats freely: the
 * source drawing has ЗД32 twice and PG on dozens of positions.
 */
export const COMPONENT_IDENTITY_FIELDS = [
  {
    key: "component_uid",
    label: "Индивидуальный номер компонента",
    viewable: true,
    editable: true,
    numeric: true,
  },
  {
    key: "scheme_tag",
    label: "Инвентаризационный номер на схеме",
    viewable: true,
    editable: true,
    copyable: true,
  },
  {
    key: "component_name",
    label: "Наименование компонента",
    viewable: true,
    editable: true,
    copyable: true,
  },
  {
    /*
     * Derived from the Russian name rather than typed. The customer's workbook
     * expects the column, but asking a walker to write the same equipment down
     * twice only invites the two to disagree.
     */
    key: "component_name_en",
    label: "Component name",
    viewable: true,
    editable: false,
  },
];

/**
 * Where the component sits and what it is, named with the leak entity's own two
 * keys. Shared verbatim so the pair reads the same on both screens, and so the
 * planned link from a leak to its component stays a straight copy rather than a
 * mapping table.
 */
export const COMPONENT_PLACE_FIELDS = [
  {
    key: "object",
    label: "Объект",
    viewable: true,
    editable: true,
    copyable: true,
  },
  {
    key: "component",
    label: "Компонент",
    viewable: true,
    editable: true,
    copyable: true,
  },
];

export const COMPONENT_TYPE_FIELDS = [
  {
    key: "component_type",
    label: "Тип компонента",
    viewable: true,
    editable: true,
    copyable: true,
  },
  {
    key: "equipment_type",
    label: "Тип оборудования",
    viewable: true,
    editable: true,
    copyable: true,
  },
];

/**
 * Dimensions and ratings.
 *
 * Deliberately *not* reusing the leak's `pressure` and `temperature` keys: those
 * are a measurement at the moment of detection in atm and °C, while these are
 * equipment ratings in MPa. Sharing a key would silently mix two units in one
 * column the first time the two entities are joined.
 */
export const COMPONENT_SIZE_FIELDS = [
  {
    key: "diameter",
    label: "Диаметр, мм",
    viewable: true,
    editable: true,
    copyable: true,
    numeric: true,
  },
  {
    key: "nominal_diameter",
    label: "Номинальный диаметр компонента",
    viewable: true,
    editable: true,
    copyable: true,
    numeric: true,
  },
  {
    key: "line_pressure",
    label: "Давление на линии, МПа",
    viewable: true,
    editable: true,
    copyable: true,
    numeric: true,
  },
  {
    key: "nominal_pressure",
    label: "Номинальное давление компонента, МПа",
    viewable: true,
    editable: true,
    copyable: true,
    numeric: true,
  },
  {
    key: "working_pressure",
    label: "Рабочее давление, МПа",
    viewable: true,
    editable: true,
    copyable: true,
    numeric: true,
  },
  {
    key: "working_temperature",
    label: "Рабочая температура, °C",
    viewable: true,
    editable: true,
    copyable: true,
    numeric: true,
  },
];

/** Materials and service conditions. */
export const COMPONENT_BUILD_FIELDS = [
  {
    key: "medium",
    label: "Среда применения",
    viewable: true,
    editable: true,
    copyable: true,
  },
  {
    key: "body_material",
    label: "Материал корпуса",
    viewable: true,
    editable: true,
    copyable: true,
  },
];

/**
 * Passport data read off the equipment plate. Frequently unreadable in the
 * field — worn off, painted over, hidden under insulation — which is why none
 * of these are ever required to save a card.
 */
export const COMPONENT_PASSPORT_FIELDS = [
  {
    key: "manufacturer",
    label: "Производитель",
    viewable: true,
    editable: true,
    copyable: true,
  },
  {
    key: "installed_at",
    label: "Дата монтажа",
    viewable: true,
    editable: true,
    copyable: true,
  },
  {
    key: "component_status",
    label: "Статус компонента",
    viewable: true,
    editable: true,
    copyable: true,
  },
];

/** Recorded automatically when the card is created; not editable by hand. */
export const COMPONENT_SYSTEM_FIELDS = [
  {
    key: "date",
    label: "Дата внесения",
    viewable: true,
    editable: false,
  },
  {
    /*
     * When the equipment was actually looked at, which is when the card was
     * filled in. Derived rather than typed: asking for a date the app already
     * knows only invites a wrong one, and the source workbook expects the
     * column filled either way.
     */
    key: "inspected_at",
    label: "Дата инспекции",
    viewable: true,
    editable: false,
  },
  {
    key: "addedBy",
    label: "Кто внёс",
    viewable: false,
    editable: false,
  },
];

export const COMPONENT_SEARCH_FIELDS_HEAD = [
  { key: "all", label: "По всем полям" },
  { key: "component_uid", label: "Индивидуальный номер компонента" },
  { key: "scheme_tag", label: "Инвентаризационный номер на схеме" },
  { key: "component_name", label: "Наименование компонента" },
];

export const COMPONENT_SEARCH_FIELDS_TAIL = [
  { key: "object", label: "Объект" },
  { key: "component", label: "Компонент" },
  { key: "component_type", label: "Тип компонента" },
  { key: "equipment_type", label: "Тип оборудования" },
  { key: "body_material", label: "Материал корпуса" },
  { key: "manufacturer", label: "Производитель" },
  { key: "component_status", label: "Статус компонента" },
];
