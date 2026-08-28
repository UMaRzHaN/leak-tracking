import { describe, expect, it } from "vitest";
import { hasComponentRegistry } from "@/configs/componentRegistry.config";
import {
  getProjectFields,
  loadComponentRegistry,
} from "@/configs/projectAdapter";

const upstreamRegistry = await loadComponentRegistry("upstream");

describe("component registry availability", () => {
  it("is on for every type that declares a block", () => {
    expect(hasComponentRegistry("upstream")).toBe(true);
    expect(hasComponentRegistry("midstream")).toBe(true);
    expect(hasComponentRegistry("downstream")).toBe(true);
  });

  it("accepts a project object the same way the leak helpers do", () => {
    expect(hasComponentRegistry({ type: "upstream" })).toBe(true);
  });

  // Пока реестр вёл один тип, «нет» на незнакомый тип получалось само:
  // подстановка по умолчанию приводила к midstream, у которого блока не было.
  // Теперь блок есть у всех, и ответ должен быть по существу, а не по тому,
  // на какой тип пришлась подстановка.
  it("treats an unknown type as having no registry", () => {
    expect(hasComponentRegistry("nonsense")).toBe(false);
    expect(hasComponentRegistry(null)).toBe(false);
  });

  // Загрузчик обязан отвечать так же, как проверка доступности: иначе
  // `hasComponentRegistry` сказал бы «нет», а `loadComponentRegistry` молча
  // отдал бы чужой реестр.
  it("throws a recognisable error instead of returning junk", async () => {
    await expect(loadComponentRegistry("nonsense")).rejects.toThrowError(
      /no component registry/i,
    );
    await expect(loadComponentRegistry("nonsense")).rejects.toMatchObject({
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
    expect(validation.required).toEqual(["component_uid", "photo"]);
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
      "Идентификация",
      "Параметры",
      "Паспорт",
      "Фото *",
    ]);
  });
});
