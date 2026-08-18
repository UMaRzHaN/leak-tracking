import { describe, expect, it } from "vitest";
import {
  getProjectFields,
  hasComponentRegistry,
  loadComponentRegistry,
} from "@/configs/projectAdapter";

const upstreamRegistry = await loadComponentRegistry("upstream");

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

  it("throws a recognisable error instead of returning junk", async () => {
    await expect(loadComponentRegistry("midstream")).rejects.toThrowError(
      /no component registry/i,
    );
    await expect(loadComponentRegistry("midstream")).rejects.toMatchObject({
      code: "NO_COMPONENT_REGISTRY",
    });
  });

  it("keeps the availability check free of the declaration it gates", async () => {
    // hasComponentRegistry runs on every render of the navigation bar, so it
    // must not pull in the dictionaries and the form behind the block.
    const { PROJECTS } = await import("@/configs/projects");
    expect(typeof PROJECTS.upstream.components.load).toBe("function");
    expect(PROJECTS.upstream.components.system).toBeUndefined();
    expect(PROJECTS.upstream.components.steps).toBeUndefined();
  });
});

describe("component field sets", () => {
  it("returns the registry's fields, not the leak's", () => {
    const componentKeys = upstreamRegistry.fields.all.map((f) => f.key);
    const leakKeys = getProjectFields("upstream").all.map((f) => f.key);

    expect(componentKeys).toContain("component_uid");
    expect(componentKeys).not.toContain("leak_speed");
    expect(leakKeys).toContain("leak_speed");
    expect(leakKeys).not.toContain("component_uid");
  });

  it("exposes the same location hierarchy as the leak entity", () => {
    // A component and a leak found on it have to land under the same filter
    // and in the same place on the map.
    expect(upstreamRegistry.fields.location).toEqual(
      getProjectFields("upstream").location,
    );
  });

  it("splits viewable and editable off the declared flags", () => {
    const { all, viewable, editable } = upstreamRegistry.fields;
    expect(viewable.length).toBeLessThanOrEqual(all.length);
    expect(editable.every((field) => field.editable)).toBe(true);
    expect(editable.some((field) => field.key === "date")).toBe(false);
  });
});

describe("component validation", () => {
  const validation = upstreamRegistry.validation;

  it("requires only the three fields readable without a plate", () => {
    expect(validation.required).toEqual([
      "location",
      "component_uid",
      "component",
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

  it("hands back a copy so a caller cannot edit the frozen config", async () => {
    validation.required.push("manufacturer");
    const reloaded = await loadComponentRegistry("upstream");
    expect(reloaded.required).toBeUndefined();
    expect(reloaded.validation.required).not.toContain("manufacturer");
  });
});

describe("component excel shape", () => {
  it("exports as a sheet and does not accept import yet", () => {
    const excel = upstreamRegistry.excel;
    expect(excel.sheet).toBe("Компоненты");
    expect(excel.direction).toEqual(["export"]);
    expect(excel.headers[0]).toBe("№");
  });
});

describe("component steps", () => {
  it("declares four manual steps", () => {
    const steps = upstreamRegistry.steps;
    expect(steps.mode).toBe("manual");
    expect(steps.steps.map((step) => step.title)).toEqual([
      "Идентификация *",
      "Параметры",
      "Паспорт",
      "Фото",
    ]);
  });
});
