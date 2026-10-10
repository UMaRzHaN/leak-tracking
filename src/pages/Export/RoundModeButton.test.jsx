import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEYS } from "@/app/project/storageKeys";
import RoundModeButton, { RoundModeCaption } from "./RoundModeButton";

vi.mock("@/app/hooks/useLanguage", async () => {
  const { englishLanguageHook } = await import("@/test/translate");
  return englishLanguageHook();
});

describe("RoundModeButton", () => {
  afterEach(() => localStorage.clear());

  it("«⋯» открывает выбор записей обхода, у каждого листа — свой", () => {
    render(
      <>
        <RoundModeButton label="Monitoring" projectId="p1" />
        <RoundModeButton
          label="Repair log"
          projectId="p1"
          storageKeyOf={STORAGE_KEYS.PROJECT_EXCEL_REPAIR_LOG_EXPORT_MODE}
        />
        <RoundModeCaption
          projectId="p1"
          storageKeyOf={STORAGE_KEYS.PROJECT_EXCEL_REPAIR_LOG_EXPORT_MODE}
        />
      </>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("All records")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Round records: Repair log" }),
    );
    const dialog = screen.getByRole("dialog");
    // У каждого варианта — пояснение, чем он отличается.
    expect(within(dialog).getByText(/One row per tag/)).toBeTruthy();
    fireEvent.click(
      within(dialog).getByRole("radio", { name: /Latest per round/ }),
    );

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("Latest per round")).toBeTruthy();
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
