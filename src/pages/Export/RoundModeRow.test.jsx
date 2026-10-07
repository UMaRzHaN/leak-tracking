import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEYS } from "@/app/project/storageKeys";
import RoundModeRow from "./RoundModeRow";

vi.mock("@/app/hooks/useLanguage", async () => {
  const { englishLanguageHook } = await import("@/test/translate");
  return englishLanguageHook();
});

describe("RoundModeRow", () => {
  afterEach(() => localStorage.clear());

  it("keeps a separate mode for each sheet with rounds", () => {
    render(
      <>
        <RoundModeRow label="Monitoring" projectId="p1" />
        <RoundModeRow
          label="Repair log"
          projectId="p1"
          storageKeyOf={STORAGE_KEYS.PROJECT_EXCEL_REPAIR_LOG_EXPORT_MODE}
        />
      </>,
    );
    const repairLog = screen.getByRole("radiogroup", { name: "Repair log" });
    const latest = [...repairLog.querySelectorAll("button")][1];
    fireEvent.click(latest);

    expect(latest.getAttribute("aria-checked")).toBe("true");
    expect(
      localStorage.getItem(
        STORAGE_KEYS.PROJECT_EXCEL_REPAIR_LOG_EXPORT_MODE("p1"),
      ),
    ).toBe("latest_per_round");
    expect(
      localStorage.getItem(STORAGE_KEYS.PROJECT_EXCEL_EXPORT_MODE("p1")),
    ).toBeNull();
  });
});
