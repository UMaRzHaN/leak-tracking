import { PROJECTS } from "./projects";

/** @typedef {Record<string, any>} Field */
/** @typedef {Record<string, any>} SearchField */
/** @typedef {Record<string, any>} LocationMeta */

/**
 * Resolves the raw config object for a project.
 * Accepts a project object ({ type, ... }) or a bare type string.
 * Falls back to midstream if the type is unknown.
 */
function resolveConfig(project) {
  const type = project?.type ?? project;
  return PROJECTS[type] ?? PROJECTS.midstream;
}

/**
 * Returns what features are available for this project type.
 * All flags are derived from the config itself — no hardcoded type comparisons.
 *
 * @param {object|string} project  Project object or type string
 * @returns {{
 *   hasCategory: boolean,
 *   hasLeakCauseField: boolean,
 *   hasMeasurementEquipment: boolean,
 *   hasVoice: boolean,
 *   canExportExcel: boolean,
 *   canImportExcel: boolean,
 *   locationDepth: number,
 * }}
 */
export function getProjectCapabilities(project) {
  const config = resolveConfig(project);
  const { fields, location } = config.system;
  const excelKeys = config.export.excel.keysOrder;

  return {
    hasCategory: fields.some((f) => f.key === "category"),
    hasLeakCauseField: fields.some((f) => f.key === "leak_cause"),
    hasMeasurementEquipment: excelKeys.includes("equipmentType"),
    hasVoice: Boolean(config.voice),
    canExportExcel: config.export.excel.direction.includes("export"),
    canImportExcel: config.export.excel.direction.includes("import"),
    locationDepth: [location.main, location.secondary, location.last].filter(
      Boolean,
    ).length,
  };
}

/**
 * Returns structured field sets for this project type.
 *
 * @param {object|string} project
 * @returns {{
 *   all: Field[],
 *   viewable: Field[],
 *   editable: Field[],
 *   copyable: Field[],
 *   numeric: Field[],
 *   search: SearchField[],
 *   location: LocationMeta,
 *   locationFields: Field[],
 * }}
 */
export function getProjectFields(project) {
  const config = resolveConfig(project);
  const { fields, location, search, copyable, numeric } = config.system;

  const locationKeys = new Set([
    location.main,
    location.secondary,
    location.last,
  ]);

  return {
    all: fields,
    viewable: fields.filter((f) => f.viewable),
    editable: fields.filter((f) => f.editable),
    copyable,
    numeric,
    search,
    location: {
      main: location.main,
      secondary: location.secondary,
      last: location.last,
      mainLabel: location.main_label,
      label: location.label,
    },
    locationFields: fields.filter((f) => locationKeys.has(f.key)),
  };
}

/**
 * Returns validation rules derived from the project config.
 * "required" covers the core location fields that anchor every record.
 *
 * @param {object|string} project
 * @returns {{
 *   required: string[],
 *   numericKeys: string[],
 *   location: { main: string, secondary: string, last: string },
 * }}
 */
export function getProjectValidation(project) {
  const config = resolveConfig(project);
  const { location, numeric } = config.system;

  return {
    required: [location.main, location.secondary].filter(Boolean),
    numericKeys: numeric.map((f) => f.key),
    location: {
      main: location.main,
      secondary: location.secondary,
      last: location.last,
    },
  };
}

/**
 * Returns map rendering and grouping behavior for this project type.
 * Matches what useActiveLocation and the KML exporter already do internally.
 *
 * @param {object|string} project
 * @returns {{
 *   groupByField: string,
 *   groupLabel: string,
 *   locationHierarchy: LocationMeta,
 *   kmlPopupFields: { key: string, label: string }[],
 *   markerPopupFields: string[],
 * }}
 */
export function getProjectMapBehavior(project) {
  const config = resolveConfig(project);
  const { location } = config.system;

  return {
    groupByField: location.secondary,
    groupLabel: location.label,
    locationHierarchy: {
      main: location.main,
      secondary: location.secondary,
      last: location.last,
      mainLabel: location.main_label,
      label: location.label,
    },
    kmlPopupFields: [
      { key: location.main, label: location.main_label },
      { key: location.secondary, label: location.label },
      { key: "component", label: "Компонент" },
      { key: "leak_speed", label: "Скорость утечки, л/мин" },
    ],
    markerPopupFields: [
      location.main,
      location.secondary,
      "object",
      "component",
      "leak_speed",
      "date",
    ],
  };
}

/* =========================================================================
   COMPONENT REGISTRY
   =========================================================================

   The inventory of physical equipment is a second entity living beside the
   leak. Everything above reads `config.system` / `config.steps` /
   `config.export` and means "leak" — that shape predates the registry and is
   left exactly as it was. The registry declares its own block, and the helpers
   below are the only way into it.

   A project type that does not declare the block simply has no registry. That
   keeps the feature switch derived from config, in line with the promise at
   the top of this file: no hardcoded comparisons against the project type.

   The block loads on demand. Checking whether a registry exists happens on
   every render of the navigation bar, so that check has to stay synchronous
   and free; reading the block only happens once the screen opens, so it can
   afford an await. Declaring the two together would have charged every cold
   start for a screen most sessions never reach.
   ========================================================================= */

/**
 * Whether this project type carries a component registry at all.
 * Synchronous and cheap — called from the navigation bar on every render.
 * @param {object|string} project
 */
export function hasComponentRegistry(project) {
  return typeof resolveConfig(project)?.components?.load === "function";
}

/**
 * Loads the registry declaration for a project type.
 *
 * @param {object|string} project
 * @returns {Promise<{
 *   fields: {
 *     all: Field[], viewable: Field[], editable: Field[], copyable: Field[],
 *     numeric: Field[], search: SearchField[], location: LocationMeta,
 *     locationFields: Field[],
 *   },
 *   steps: any,
 *   validation: {
 *     required: string[], numericKeys: string[], identityKey: string,
 *     location: { main: string, secondary: string, last: string },
 *   },
 *   excel: any,
 *   voice: any,
 * }>}
 */
export async function loadComponentRegistry(project) {
  const loader = resolveConfig(project)?.components?.load;
  if (typeof loader !== "function") {
    const error = new Error(
      "Project type has no component registry configured",
    );
    error.code = "NO_COMPONENT_REGISTRY";
    throw error;
  }

  const block = (await loader()).default;
  const { fields, location, search, copyable, numeric, required, identity } =
    block.system;

  const locationKeys = new Set([
    location.main,
    location.secondary,
    location.last,
  ]);

  return {
    fields: {
      all: fields,
      viewable: fields.filter((f) => f.viewable),
      editable: fields.filter((f) => f.editable),
      copyable,
      numeric,
      search,
      location: {
        main: location.main,
        secondary: location.secondary,
        last: location.last,
        mainLabel: location.main_label,
        label: location.label,
      },
      locationFields: fields.filter((f) => locationKeys.has(f.key)),
    },
    steps: block.steps,
    /**
     * Unlike a leak, "required" here is a short explicit list rather than the
     * location anchors: a plate that is worn off or hidden under insulation
     * must not stop the walk, so only what is readable from across the
     * platform is mandatory.
     */
    validation: {
      required: [...required],
      numericKeys: numeric.map((f) => f.key),
      identityKey: identity,
      location: {
        main: location.main,
        secondary: location.secondary,
        last: location.last,
      },
    },
    excel: block.export.excel,
    /** Может отсутствовать: тип проекта вправе не давать реестру голос. */
    voice: block.voice ?? null,
  };
}
