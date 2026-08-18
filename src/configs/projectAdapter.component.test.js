import { describe, expect, it } from "vitest";
import {
  getComponentExcel,
  getComponentFields,
  getComponentSteps,
  getComponentValidation,
  getProjectFields,
  hasComponentRegistry,
} from "@/configs/projectAdapter";

describe("component registry availability", () => {
  it("is on for upstream and off for the streams without a declared block", () => {
    expect(hasComponentRegistry("upstream")).toBe(true);
    expect(hasComponentRegistry("midstream")).toBe(false);
    expect(hasComponentRegistry("downstream")).toBe(false);
  });

  it("accepts a project object the same way the leak helpers do", () => {
    expect(hasComponentRegistry({ type: "upstream" })).toBe(true);
  });

  it("treats an unknown type as having no registry", () => {
    // resolveConfig falls back to midstream, which declares no block.
    expect(hasComponentRegistry("nonsense")).toBe(false);
  });

  it("throws a recognisable error instead of returning junk", () => {
    expect(() => getComponentFields("midstream")).toThrowError(
      /no component registry/i,
    );
    try {
      getComponentSteps("midstream");
    } catch (error) {
      expect(error.code).toBe("NO_COMPONENT_REGISTRY");
    }
  });
});

describe("component field sets", () => {
  it("returns the registry's fields, not the leak's", () => {
    const componentKeys = getComponentFields("upstream").all.map((f) => f.key);
    const leakKeys = getProjectFields("upstream").all.map((f) => f.key);

    expect(componentKeys).toContain("component_uid");
    expect(componentKeys).not.toContain("leak_speed");
    expect(leakKeys).toContain("leak_speed");
    expect(leakKeys).not.toContain("component_uid");
  });

  it("exposes the same location hierarchy as the leak entity", () => {
    // A component and a leak found on it have to land under the same filter
    // and in the same place on the map.
    expect(getComponentFields("upstream").location).toEqual(
      getProjectFields("upstream").location,
    );
  });

  it("splits viewable and editable off the declared flags", () => {
    const { all, viewable, editable } = getComponentFields("upstream");
    expect(viewable.length).toBeLessThanOrEqual(all.length);
    expect(editable.every((field) => field.editable)).toBe(true);
    expect(editable.some((field) => field.key === "date")).toBe(false);
  });
});

describe("component validation", () => {
  const validation = getComponentValidation("upstream");

  it("requires only the three fields readable without a plate", () => {
    expect(validation.required).toEqual([
      "location",
      "component_uid",
      "component_name",
    ]);
  });

  it("does not inherit the leak rule of requiring both location anchors", () => {
    expect(validation.required).not.toContain("subdivision");
    expect(validation.required).not.toContain("deposit");
  });

  it("names the field carrying identity", () => {
    expect(validation.identityKey).toBe("component_uid");
    expect(validation.numericKeys).toContain("component_uid");
  });

  it("hands back a copy so a caller cannot edit the frozen config", () => {
    validation.required.push("manufacturer");
    expect(getComponentValidation("upstream").required).not.toContain(
      "manufacturer",
    );
  });
});

describe("component excel shape", () => {
  it("exports as a sheet and does not accept import yet", () => {
    const excel = getComponentExcel("upstream");
    expect(excel.sheet).toBe("Компоненты");
    expect(excel.direction).toEqual(["export"]);
    expect(excel.headers[0]).toBe("№");
  });
});

describe("component steps", () => {
  it("declares four manual steps", () => {
    const steps = getComponentSteps("upstream");
    expect(steps.mode).toBe("manual");
    expect(steps.steps.map((step) => step.title)).toEqual([
      "Идентификация *",
      "Параметры",
      "Паспорт",
      "Фото",
    ]);
  });
});
