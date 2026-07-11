import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/hooks/useProjectData", () => ({
  useProjectData: vi.fn(),
}));

vi.mock("@/hooks/usePhotoStorage", () => ({
  usePhotoStorage: vi.fn(),
}));

vi.mock("./useDataBaseFilters", () => ({
  useDataBaseFilters: vi.fn(),
}));

vi.mock("./useLeakActions", () => ({
  useLeakActions: vi.fn(),
}));

vi.mock("./useBulkActions", () => ({
  useBulkActions: vi.fn(),
}));

vi.mock("./useDataBaseExport", () => ({
  useDataBaseExport: vi.fn(),
}));

const projectDataModule = await import("@/app/hooks/useProjectData");
const photoStorageModule = await import("@/hooks/usePhotoStorage");
const filtersModule = await import("./useDataBaseFilters");
const leakActionsModule = await import("./useLeakActions");
const bulkActionsModule = await import("./useBulkActions");
const exportModule = await import("./useDataBaseExport");
const { useDataBaseController } = await import("./useDataBaseController");

describe("useDataBaseController", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    projectDataModule.useProjectData.mockReturnValue({
      save: vi.fn(),
    });
    photoStorageModule.usePhotoStorage.mockReturnValue({
      deletePhoto: vi.fn(),
    });
    filtersModule.useDataBaseFilters.mockReturnValue({
      displayed: [{ id: "l1" }],
    });
    leakActionsModule.useLeakActions.mockReturnValue({
      activeLeak: null,
    });
    bulkActionsModule.useBulkActions.mockReturnValue({
      handleBulkStatusChange: vi.fn(),
    });
    exportModule.useDataBaseExport.mockReturnValue({
      handleExport: vi.fn(),
    });
  });

  it("opens bulk picker, delegates status change and closes it", () => {
    const handleBulkStatusChange = vi.fn();
    bulkActionsModule.useBulkActions.mockReturnValue({
      handleBulkStatusChange,
    });

    const { result } = renderHook(() =>
      useDataBaseController({
        data: [{ id: "l1" }],
        setData: vi.fn(),
        coords: null,
      }),
    );

    expect(result.current.bulkPickerOpen).toBe(false);

    act(() => {
      result.current.openBulkPicker();
    });
    expect(result.current.bulkPickerOpen).toBe(true);

    act(() => {
      result.current.handleBulkPickerSelect("resolved");
    });

    expect(handleBulkStatusChange).toHaveBeenCalledWith("resolved");
    expect(result.current.bulkPickerOpen).toBe(false);
  });

  it("stores and clears notifications", () => {
    const { result } = renderHook(() =>
      useDataBaseController({
        data: [],
        setData: vi.fn(),
        coords: null,
      }),
    );

    act(() => {
      result.current.notify("success", "Saved");
    });
    expect(result.current.notification).toEqual({
      type: "success",
      message: "Saved",
    });

    act(() => {
      result.current.clearNotification();
    });
    expect(result.current.notification).toBeNull();
  });
});
