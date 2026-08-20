import { describe, expect, it } from "vitest";
import { maskDateInput } from "./maskDateInput";

describe("maskDateInput", () => {
  it("ставит точки сам, пока набирают цифры", () => {
    expect(maskDateInput("1")).toBe("1");
    expect(maskDateInput("12")).toBe("12");
    expect(maskDateInput("120")).toBe("12.0");
    expect(maskDateInput("12052020")).toBe("12.05.2020");
  });

  it("приводит любой разделитель к точке", () => {
    expect(maskDateInput("12/05/2020")).toBe("12.05.2020");
    expect(maskDateInput("12-05-2020")).toBe("12.05.2020");
    expect(maskDateInput("12.05.2020")).toBe("12.05.2020");
  });

  it("не даёт точке залипнуть перед стиранием", () => {
    // «12.» после Backspace — это «12», иначе стереть точку было бы нечем.
    expect(maskDateInput("12.")).toBe("12");
    expect(maskDateInput("12.05.")).toBe("12.05");
  });

  it("не берёт больше восьми цифр и не выдумывает пустое", () => {
    expect(maskDateInput("120520201")).toBe("12.05.2020");
    expect(maskDateInput("")).toBe("");
    expect(maskDateInput(null)).toBe("");
    expect(maskDateInput("год")).toBe("");
  });
});
