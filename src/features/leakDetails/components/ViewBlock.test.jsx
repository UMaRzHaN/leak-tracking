import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/hooks/useLanguage", async () => {
  const { englishLanguageHook } = await import("@/test/translate");
  return englishLanguageHook();
});

// Разделы подменены метками: здесь проверяется распределитель — какая вкладка
// какой раздел открывает и с какими полями, — а не вёрстка самих разделов.
const section = (name) => ({
  default: ({ fields = [] }) => (
    <div data-testid={name}>{fields.map((f) => f.key).join(",")}</div>
  ),
});
vi.mock("./LeakSummarySection", () => section("summary"));
vi.mock("./LeakLocationSection", () => section("location"));
vi.mock("./LeakMeasurementSection", () => section("measurement"));
vi.mock("./LeakRepairSection", () => section("repair"));
vi.mock("./LeakHistorySection", () => section("history"));

const ViewBlock = (await import("./ViewBlock")).default;

const projectConfig = {
  system: {
    fields: [
      { key: "note", multiline: true, viewOrder: 5 },
      { key: "lat", numeric: true, coord: true, viewOrder: 4 },
      { key: "pressure", numeric: true, viewOrder: 3 },
      { key: "component", viewOrder: 1 },
      { key: "internal", viewable: false, viewOrder: 0 },
    ],
  },
};

const open = (activeTab) =>
  render(
    <ViewBlock
      activeTab={activeTab}
      data={{ id: 1 }}
      projectConfig={projectConfig}
    />,
  );

describe("ViewBlock", () => {
  it("раскладывает поля по видам и отдаёт каждому разделу свои", () => {
    open("info");
    // Текстовые и многострочные — в сводку, в порядке viewOrder.
    expect(screen.getByTestId("summary")).toHaveTextContent("component,note");

    open("params");
    expect(screen.getByTestId("measurement")).toHaveTextContent("pressure");

    open("coords");
    // Координата числовая, но место ей среди координат, а не среди замеров.
    expect(screen.getByTestId("location")).toHaveTextContent("lat");
  });

  it("не показывает поля, отмеченные как невидимые", () => {
    open("info");

    expect(screen.getByTestId("summary")).not.toHaveTextContent("internal");
  });

  it("ведёт обходы и журнал в один и тот же раздел", () => {
    // Разделяет их сам раздел по activeTab; здесь важно, что оба туда доходят.
    open("monitoring");
    expect(screen.getByTestId("history")).toBeInTheDocument();

    open("log");
    expect(screen.getAllByTestId("history")).toHaveLength(2);
  });

  it("открывает ремонт на вкладке фотографий", () => {
    open("photo");

    expect(screen.getByTestId("repair")).toBeInTheDocument();
  });

  it("на незнакомой вкладке не рисует ничего", () => {
    const { container } = open("нет такой");

    expect(container).toBeEmptyDOMElement();
  });

  it("переживает конфигурацию без полей", () => {
    render(
      <ViewBlock
        activeTab="info"
        data={{ id: 1 }}
        projectConfig={{ system: {} }}
      />,
    );

    expect(screen.getByTestId("summary")).toBeInTheDocument();
  });
});
