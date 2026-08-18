/**
 * Autocomplete dictionaries for the component registry.
 *
 * Seeded from "Database component.xlsx" — the three component sheets of the
 * Buzahur field (gas treatment plant, typical well, collection point). Values
 * are suggestions, never a closed set: the walk is a discovery process and the
 * operator has to be able to enter equipment nobody listed in advance.
 *
 * Kept separate from the leak dictionary on purpose. That one describes what
 * happened at a leak (causes, fixes, materials for the repair); this one
 * describes the hardware itself.
 */

/** Russian names, paired with `COMPONENT_NAMES_EN` through `COMPONENT_NAME_TRANSLATIONS`. */
export const component_names = [
  "Труба",
  "Задвижка",
  "Задвижка с ручным приводом",
  "Кран шаровой",
  "Вентиль",
  "Запорный вентиль",
  "Клапан обратный",
  "Клапан отсекатель",
  "Регулирующий клапан",
  "Клапан регулирующий давление",
  "Предохранительный клапан",
  "Регулируемый штуцер",
  "Двухвентильный манифолд",
  "Манометр",
  "Датчик температуры газа",
  "Расходомер",
  "Уровнемерная колонка",
  "Сепаратор",
  "Разделитель",
  "Выветриватель",
  "Дегазатор",
  "Ёмкость",
  "Воздухосборник",
  "Фланцевое соединение",
  "Сварной шов",
  "Отвод",
  "Тройник",
  "Заглушка",
];

export const component_names_en = [
  "Pipe",
  "Gate valve",
  "Manual gate valve",
  "Ball valve",
  "Valve",
  "Shut-off valve",
  "Check valve",
  "Shut-off valve",
  "Control valve",
  "Pressure control valve",
  "Safety valve",
  "Regulating nipple",
  "Two-valve manifold",
  "Pressure gauge",
  "Gas temperature sensor",
  "Flow meter",
  "Level gauge column",
  "Separator",
  "Divider",
  "Weathering agent",
  "Degasser",
  "Container",
  "Air collector",
  "Flange connection",
  "Weld seam",
  "Bend",
  "Tee",
  "Plug",
];

/**
 * Fills the English name once the Russian one is picked, so the operator types
 * a component name once instead of twice. Both fields stay editable — the
 * lookup is a convenience, not a constraint.
 */
export const COMPONENT_NAME_TRANSLATIONS = Object.freeze(
  Object.fromEntries(
    component_names.map((name, index) => [name, component_names_en[index]]),
  ),
);

/** What the component does in the process. */
export const component_types = [
  "Запорная арматура",
  "Регулирующая арматура",
  "Предохранительная арматура",
  "Обратная арматура",
  "Трубопровод",
  "Соединение",
  "Измерительный прибор",
  "Ёмкостное оборудование",
];

/** What class of equipment it belongs to. */
export const equipment_types = [
  "Технологическое оборудование",
  "Трубопроводная арматура",
  "КИПиА",
  "Ёмкостное оборудование",
  "Насосно-компрессорное оборудование",
  "Вспомогательное оборудование",
];

export const mediums = [
  "Природный газ",
  "Газовый конденсат",
  "Пластовая вода",
  "Метанол",
  "Ингибитор коррозии",
  "Воздух КИП",
  "Топливный газ",
];

export const body_materials = [
  "Сталь 20",
  "Сталь 09Г2С",
  "Сталь 12Х18Н10Т",
  "Нержавеющая сталь",
  "Углеродистая сталь",
  "Легированная сталь",
  "Чугун",
  "Латунь",
  "Бронза",
];

/**
 * State of the hardware — not a workflow. The registry has no lifecycle: a
 * component never moves through "open → in progress → resolved" the way a leak
 * does, it simply is in one of these states when someone looks at it.
 */
export const component_statuses = [
  "В работе",
  "В резерве",
  "Законсервирован",
  "Требует замены",
  "Выведен из эксплуатации",
  "Демонтирован",
];
