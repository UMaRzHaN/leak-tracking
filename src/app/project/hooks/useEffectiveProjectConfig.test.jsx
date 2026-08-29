import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ config: null, hiddenFields: new Set() }));

vi.mock("./useProjectConfig", () => ({
  useProjectConfig: () => mocks.config,
}));
vi.mock("@/app/project/ProjectContext", () => ({
  useProjectData: () => ({ activeProject: { id: "p1" } }),
}));
vi.mock("./useHiddenFields", () => ({
  useHiddenFields: () => ({ hiddenFields: mocks.hiddenFields }),
}));

const { useEffectiveProjectConfig } =
  await import("./useEffectiveProjectConfig");

/**
 * Конфиг ровно той формы, которую читает хук: шаги формы и колонки Excel.
 * `photo` среди полей намеренно — это защищённый ключ, и он проверяется.
 */
function makeConfig() {
  return {
    steps: {
      mode: "manual",
      steps: [
        {
          title: "Место",
          fields: [{ key: "object" }, { key: "component" }],
        },
        { title: "Замер", fields: [{ key: "leak_speed" }] },
        { title: "Фото", fields: [{ key: "photo" }] },
      ],
    },
    export: {
      excel: {
        headers: ["Объект", "Компонент", "Скорость", "Фото"],
        keysOrder: ["object", "component", "leak_speed", "photo"],
      },
    },
    system: { numeric: ["leak_speed"], copyable: ["object"] },
  };
}

function render() {
  return renderHook(() => useEffectiveProjectConfig()).result;
}

beforeEach(() => {
  mocks.config = makeConfig();
  mocks.hiddenFields = new Set();
});

describe("useEffectiveProjectConfig", () => {
  it("без скрытых полей отдаёт конфиг как есть, тем же объектом", () => {
    const result = render();

    // Именно тем же: пересборка конфига на каждый рендер сбрасывала бы всё,
    // что от него зависит по ссылке.
    expect(result.current).toBe(mocks.config);
  });

  it("убирает скрытое поле и из формы, и из колонок выгрузки", () => {
    mocks.hiddenFields = new Set(["component"]);

    const { steps } = render().current.steps;
    const excel = render().current.export.excel;

    expect(steps[0].fields.map((f) => f.key)).toEqual(["object"]);
    expect(excel.keysOrder).toEqual(["object", "leak_speed", "photo"]);
    // Заголовок обязан уйти вместе со своим ключом: колонки читаются парами,
    // и разъехавшись однажды, лист перестал бы соответствовать данным.
    expect(excel.headers).toEqual(["Объект", "Скорость", "Фото"]);
  });

  it("шаг, оставшийся без единого поля, исчезает целиком", () => {
    mocks.hiddenFields = new Set(["leak_speed"]);

    const { steps } = render().current.steps;

    expect(steps.map((step) => step.title)).toEqual(["Место", "Фото"]);
  });

  it("защищённое поле спрятать нельзя", () => {
    // Фото — часть отчётности, и его сокрытие оставило бы записи без снимков
    // молча. Список защищённых ключей на это и заведён.
    mocks.hiddenFields = new Set(["photo"]);

    const result = render();

    expect(result.current).toBe(mocks.config);
  });

  it("защищённые ключи не мешают спрятать остальные", () => {
    mocks.hiddenFields = new Set(["photo", "object"]);

    const excel = render().current.export.excel;

    expect(excel.keysOrder).toEqual(["component", "leak_speed", "photo"]);
  });

  it("не трогает служебные списки: они про обработку, а не про показ", () => {
    mocks.hiddenFields = new Set(["object", "leak_speed"]);

    const { system } = render().current;

    expect(system).toEqual({ numeric: ["leak_speed"], copyable: ["object"] });
  });

  it("исходный конфиг остаётся нетронутым", () => {
    mocks.hiddenFields = new Set(["component"]);

    render();

    expect(mocks.config.steps.steps[0].fields.map((f) => f.key)).toEqual([
      "object",
      "component",
    ]);
    expect(mocks.config.export.excel.headers).toHaveLength(4);
  });
});
