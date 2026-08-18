export const components = {
  title: "Component registry",
  tab: "Components",
  conflictBanner:
    "{{count}} duplicated number(s). Both cards were kept — renumber one.",
  showConflicts: "Show them",
  showAll: "Show all",
  count: "Recorded: {{count}}",
  shown: "{{count}} shown",
  add: "Add component",
  addTitle: "New component",
  editTitle: "Component card",
  cancel: "Cancel",
  remove: "Delete component",
  unnamed: "Unnamed",
  loading: "Loading the registry...",
  empty: "The registry is empty. The first component is recorded on site.",
  noMatches: "Nothing found",
  loadError: "Could not read the registry. Nothing is lost — try again later.",
  searchPlaceholder: "Number, name, drawing tag...",
  locationFilter: "Filter by location",
  allLocations: "All locations",
  duplicateWarning:
    "That number is already in the registry ({{count}}). You can still save — it gets resolved on merge.",
  stepPrefix: "Step",
  /*
   * One line saying what the field wants, and a worked example inside it —
   * the same pair the leak form gives, because a walker at the equipment
   * reads the example and stops guessing between a name, a number and an
   * abbreviation.
   */
  fields: {
    subdivision: {
      hint: "Name of the division the component belongs to",
      placeholder: "e.g. Messoyakha gas plant",
    },
    deposit: {
      hint: "Field the component belongs to",
      placeholder: "e.g. Buzahur",
    },
    location: {
      hint: "Node or site from the drawing set: plant, collection point, well",
      placeholder: "e.g. Well 22",
    },
    object: {
      hint: "The object the component stands on",
      placeholder: "e.g. drain line",
    },
    component: {
      hint: "What kind of hardware this is",
      placeholder: "e.g. Gate valve",
    },
    component_uid: {
      hint: "The number you assign during the walk. Digits only",
      placeholder: "e.g. 14",
    },
    scheme_tag: {
      hint: "Position tag from the drawing. Repeats — it need not be unique",
      placeholder: "e.g. ЗД32",
    },
    component_name: {
      hint: "Component name as the documentation calls it",
      placeholder: "e.g. Задвижка",
    },
    component_name_en: {
      hint: "Filled in from the Russian name",
      placeholder: "e.g. Gate valve",
    },
    component_type: {
      hint: "What the component does in the process",
      placeholder: "e.g. Shut-off valve",
    },
    equipment_type: {
      hint: "Class of equipment it belongs to",
      placeholder: "e.g. Pipeline valve",
    },
    diameter: {
      hint: "Actual outer diameter, millimetres",
      placeholder: "e.g. 426",
    },
    nominal_diameter: {
      hint: "Nominal bore DN from the plate",
      placeholder: "e.g. 400",
    },
    line_pressure: {
      hint: "Pressure on the line the component sits on, MPa",
      placeholder: "e.g. 35",
    },
    nominal_pressure: {
      hint: "Nominal pressure PN from the plate, MPa",
      placeholder: "e.g. 16",
    },
    working_pressure: {
      hint: "Pressure the component actually works at, MPa",
      placeholder: "e.g. 12",
    },
    working_temperature: {
      hint: "Working temperature of the medium, °C",
      placeholder: "e.g. 40",
    },
    connection_type: {
      hint: "How the component joins the pipeline",
      placeholder: "e.g. Flange connection",
    },
    actuator_type: {
      hint: "What drives it",
      placeholder: "e.g. Manual",
    },
    installation_type: {
      hint: "How it sits relative to the ground",
      placeholder: "e.g. Above ground",
    },
    medium: {
      hint: "What passes through it",
      placeholder: "e.g. Natural gas",
    },
    body_material: {
      hint: "Body material from the plate or the marking",
      placeholder: "e.g. Steel 20",
    },
    manufacturer: {
      hint: "Manufacturer from the plate",
      placeholder: "e.g. Penztyazhpromarmatura",
    },
    installed_at: {
      hint: "Installation date from the plate or the documentation",
      placeholder: "e.g. 12.05.2019",
    },
    component_status: {
      hint: "State of the hardware at the time of the walk",
      placeholder: "e.g. In service",
    },
    photo: {
      hint: "A shot of the whole component, enough to recognise it by",
    },
  },
  buttons: {
    prev: "← Back",
    next: "Next →",
    save: "Save",
    saving: "Saving...",
    clearStep: "Clear step",
    clearAll: "Clear all",
  },
  copyConfirm: {
    title: "Fill from the previous card?",
    description:
      "Some fields were left empty. Take them from the previous component? Anything already filled stays as it is.",
    confirmLabel: "Fill",
    cancelLabel: "Leave empty",
  },
  errors: {
    required: "Required",
    badCoordinate: "Coordinate is out of range",
    digitsOnly: "Digits only",
  },
};
