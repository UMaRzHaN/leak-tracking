import { describe, expect, it } from "vitest";
import { parseNumericInput } from "./parseNumericInput";

describe("parseNumericInput", () => {
  it("keeps decimal comma text while typing trailing zeroes", () => {
    expect(parseNumericInput("4,0")).toBe("4,0");
    expect(parseNumericInput("4,00")).toBe("4,00");
  });

  it("keeps decimal dot text while typing trailing zeroes", () => {
    expect(parseNumericInput("4.0")).toBe("4.0");
    expect(parseNumericInput("4.00")).toBe("4.00");
  });

  it("still coerces complete integers to numbers", () => {
    expect(parseNumericInput("40")).toBe(40);
    expect(parseNumericInput("-12")).toBe(-12);
  });

  it("does not turn blank or invalid text into zero", () => {
    expect(parseNumericInput("   ")).toBe("");
    expect(parseNumericInput("abc")).toBe("");
    expect(parseNumericInput("-")).toBe("-");
  });
});
