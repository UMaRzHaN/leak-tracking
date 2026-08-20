import { describe, expect, it } from "vitest";
import UPSTREAM_CONFIG from "@/configs/upstream/upstream.config";
import COMPONENT_BLOCK from "@/configs/upstream/data/componentBlock";
import {
  FIELDS,
  NUMBER_FIELDS,
  REQUIRED_FIELDS,
} from "@/configs/upstream/data/componentFields";
import { COMPONENT_STEPS } from "@/configs/upstream/data/componentSteps";

const fieldKeys = new Set(FIELDS.map((field) => field.key));

describe("upstream component fields", () => {
  it("keeps the leak block untouched alongside the registry", () => {
    // The whole point of the sibling block: adding the registry must not shift
    // a single thing the leak entity reads.
    expect(UPSTREAM_CONFIG.system.fields.some((f) => f.key === "leak_id")).toBe(
      true,
    );
    expect(
      UPSTREAM_CONFIG.system.fields.some((f) => f.key === "component_uid"),
    ).toBe(false);
    expect(COMPONENT_BLOCK.system.fields).toBe(FIELDS);
  });

  it("requires identity and evidence, and nothing else", () => {
    expect(REQUIRED_FIELDS).toEqual(["component_uid", "photo"]);
    // photo rides the attachment pipeline rather than the field set, the same
    // way it does for a leak.
    for (const key of REQUIRED_FIELDS.filter((key) => key !== "photo")) {
      expect(fieldKeys.has(key)).toBe(true);
    }
  });

  it("asks for nothing that has to be measured rather than read", () => {
    // A walker with a tape measure is doing something other than an inventory.
    expect(fieldKeys.has("diameter")).toBe(false);
    expect(fieldKeys.has("line_pressure")).toBe(false);
    expect(COMPONENT_BLOCK.export.excel.keysOrder).not.toContain("diameter");
  });

  it("does not reuse the leak's pressure and temperature keys", () => {
    // Those carry atm and °C at the moment of detection; the registry carries
    // equipment ratings in MPa. One shared key would silently mix two units.
    expect(fieldKeys.has("pressure")).toBe(false);
    expect(fieldKeys.has("temperature")).toBe(false);
    expect(fieldKeys.has("working_pressure")).toBe(true);
    expect(fieldKeys.has("working_temperature")).toBe(true);
  });

  it("shares the keys that carry the same dictionaries as a leak", () => {
    for (const key of ["actuator_type", "connection_type", "installation_type"])
      expect(fieldKeys.has(key)).toBe(true);
  });

  it("marks the identity number numeric so the list sorts 9 before 10", () => {
    expect(NUMBER_FIELDS.some((field) => field.key === "component_uid")).toBe(
      true,
    );
  });

  it("asks for the installation date by hand, in the format it stores", () => {
    const installed = COMPONENT_STEPS.flatMap((step) => step.fields).find(
      (field) => field.key === "installed_at",
    );
    expect(installed.type).toBe("date");
    expect(installed.placeholder).toBe("ДД.ММ.ГГГГ");
  });

  it("keeps the English name out of the form but in the workbook", () => {
    const stepKeys = COMPONENT_STEPS.flatMap((step) =>
      step.fields.map((field) => field.key),
    );
    expect(stepKeys).not.toContain("component_name_en");
    expect(stepKeys).toContain("component");

    expect(
      FIELDS.find((field) => field.key === "component_name_en").editable,
    ).toBe(false);
    expect(COMPONENT_BLOCK.export.excel.keysOrder).toContain(
      "component_name_en",
    );
  });

  it("does not ask for a date the app already knows", () => {
    const stepKeys = COMPONENT_STEPS.flatMap((step) =>
      step.fields.map((field) => field.key),
    );
    expect(stepKeys).not.toContain("inspected_at");

    // Still a field, and still an export column — just never typed.
    const inspected = FIELDS.find((field) => field.key === "inspected_at");
    expect(inspected.editable).toBe(false);
    expect(inspected.viewable).toBe(true);
    expect(COMPONENT_BLOCK.export.excel.keysOrder).toContain("inspected_at");
  });

  it("still asks for the installation date, which is on the plate", () => {
    const stepKeys = COMPONENT_STEPS.flatMap((step) =>
      step.fields.map((field) => field.key),
    );
    expect(stepKeys).toContain("installed_at");
  });

  it("declares every step field in the field set", () => {
    const stepKeys = COMPONENT_STEPS.flatMap((step) =>
      step.fields.map((field) => field.key),
    );
    // photo is a system-level attachment rather than a declared data field.
    for (const key of stepKeys.filter((key) => key !== "photo")) {
      expect(fieldKeys.has(key), `step field ${key} is not declared`).toBe(
        true,
      );
    }
  });

  it("marks required step fields exactly where the field config does", () => {
    const requiredStepKeys = COMPONENT_STEPS.flatMap((step) =>
      step.fields.filter((field) => field.required).map((field) => field.key),
    );
    expect(new Set(requiredStepKeys)).toEqual(new Set(REQUIRED_FIELDS));
  });
});

describe("upstream component excel columns", () => {
  const { headers, keysOrder } = COMPONENT_BLOCK.export.excel;

  it("pairs every header with a key", () => {
    expect(headers).toHaveLength(keysOrder.length);
    expect(new Set(keysOrder).size).toBe(keysOrder.length);
  });

  it("keeps the customer's column order from the source workbook", () => {
    // The source keeps one "Местонахождения" column; the app records against
    // four, so they lead the sheet in the order the card asks for them.
    expect(keysOrder.slice(0, 9)).toEqual([
      "index",
      "subdivision",
      "deposit",
      "location",
      "object",
      "component",
      "component_name_en",
      "component_uid",
      "scheme_tag",
    ]);
    expect(keysOrder.at(-1)).toBe("photo");
  });

  it("stays clear of the leak-only required columns", () => {
    for (const key of ["time", "detectedBy", "equipmentType", "uncertainty"]) {
      expect(keysOrder).not.toContain(key);
    }
  });

  it("exports every column from a declared field, plus the row number", () => {
    // index is the row counter and photo rides the attachment pipeline — the
    // leak config leaves both out of its field set for the same reason.
    const derived = new Set(["index", "photo"]);
    for (const key of keysOrder.filter((key) => !derived.has(key))) {
      expect(fieldKeys.has(key), `exported ${key} is not a field`).toBe(true);
    }
  });

  it("ships as its own sheet rather than its own file", () => {
    expect(COMPONENT_BLOCK.export.excel.sheet).toBe("Компоненты");
    expect(COMPONENT_BLOCK.export.excel.direction).toEqual(["export"]);
  });
});
