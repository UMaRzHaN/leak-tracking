import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { STATUS } from "@/utils/status";
import { useLeakDetailsPersistence } from "./useLeakDetailsPersistence";

// Resolves against the real English locale, so a lost translation fails here
// instead of quietly falling back to the key.
vi.mock("@/app/hooks/useLanguage", async () => {
  const { englishLanguageHook } = await import("@/test/translate");
  return englishLanguageHook();
});

const LEAK = Object.freeze({
  id: 1,
  leak_id: "TAG-1",
  status: STATUS.OPEN,
  lat: 55.75,
  lng: 37.61,
  leak_speed: 10,
  component: "valve",
  photo: "idb://before",
  history: [],
});

function setup(overrides = {}) {
  const props = {
    leak: LEAK,
    allLeaks: [LEAK],
    onSave: vi.fn().mockResolvedValue(undefined),
    deletePhoto: vi.fn().mockResolvedValue(undefined),
    historyUser: "inspector",
    vars: {},
    editFields: [
      { key: "component" },
      { key: "leak_speed", numeric: true },
      { key: "lat", numeric: true },
      { key: "lng", numeric: true },
    ],
    localEdit: {},
    localCalcParams: { equipmentType: "GFM 2.0", serial_number: "SN-1" },
    dirtyFields: [],
    calcParamsDirty: false,
    originalCalcParams: { equipmentType: "GFM 2.0", serial_number: "SN-1" },
    isPhotoDirty: false,
    isAfterDirty: false,
    isRepairDirty: false,
    savePhoto: vi.fn().mockResolvedValue(null),
    savePhotoAfter: vi.fn().mockResolvedValue(null),
    savePhotoRepair: vi.fn().mockResolvedValue(null),
    setNotification: vi.fn(),
    setActiveTab: vi.fn(),
    requireHistoryUser: vi.fn(() => true),
    setStatusPickerOpen: vi.fn(),
    setResolveOpen: vi.fn(),
    setRepairOpen: vi.fn(),
    setReopenOpen: vi.fn(),
    paramsTab: "params",
    ...overrides,
  };
  const { result } = renderHook(() => useLeakDetailsPersistence(props));
  return { result, props };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("handleSave guards", () => {
  it("does nothing without a history user", async () => {
    const { result, props } = setup({ requireHistoryUser: vi.fn(() => false) });

    await act(() => result.current.handleSave());

    expect(props.onSave).not.toHaveBeenCalled();
    expect(props.savePhoto).not.toHaveBeenCalled();
  });

  it("demands a serial number for equipment that carries one", async () => {
    const { result, props } = setup({
      localCalcParams: { equipmentType: "GFM 2.0", serial_number: null },
    });

    await act(() => result.current.handleSave());

    expect(props.setActiveTab).toHaveBeenCalledWith("params");
    expect(props.setNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: "error" }),
    );
    expect(props.onSave).not.toHaveBeenCalled();
  });

  it("accepts a pink bag without a serial number", async () => {
    const { result, props } = setup({
      localCalcParams: { equipmentType: "Розовый мешок", serial_number: null },
    });

    await act(() => result.current.handleSave());

    expect(props.onSave).toHaveBeenCalled();
  });

  it.each([
    ["lat", { lat: 200 }],
    ["lng", { lng: 200 }],
  ])("rejects an out-of-range %s", async (_label, localEdit) => {
    const { result, props } = setup({ localEdit });

    await act(() => result.current.handleSave());

    expect(props.setNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: "error" }),
    );
    expect(props.onSave).not.toHaveBeenCalled();
  });
});

describe("handleSave", () => {
  it("writes edited fields, normalising the numeric ones", async () => {
    const { result, props } = setup({
      localEdit: { component: "flange", leak_speed: "12,5" },
      dirtyFields: [{ key: "component" }, { key: "leak_speed" }],
    });

    await act(() => result.current.handleSave());

    const saved = props.onSave.mock.calls[0][0];
    expect(saved.component).toBe("flange");
    // A comma is how the decimal separator is typed on a Russian keyboard.
    expect(saved.leak_speed).toBe(12.5);
  });

  it("appends one history entry naming the editor", async () => {
    const { result, props } = setup({
      localEdit: { component: "flange" },
      dirtyFields: [{ key: "component" }],
    });

    await act(() => result.current.handleSave());

    const saved = props.onSave.mock.calls[0][0];
    expect(saved.history).toHaveLength(1);
    expect(saved.history[0]).toMatchObject({
      action: "edited",
      user: "inspector",
    });
  });

  it("recomputes priority when the speed changed", async () => {
    const { result, props } = setup({
      localEdit: { leak_speed: "500" },
      dirtyFields: [{ key: "leak_speed" }],
    });

    await act(() => result.current.handleSave());

    expect(props.onSave.mock.calls[0][0].priority).toBeTruthy();
  });

  it("reports a failed save and releases the button", async () => {
    const { result, props } = setup({
      onSave: vi.fn().mockRejectedValue(new Error("storage full")),
      dirtyFields: [{ key: "component" }],
      localEdit: { component: "flange" },
    });

    await act(() => result.current.handleSave());

    expect(props.setNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: "error" }),
    );
    expect(result.current.saving).toBe(false);
  });

  it("stays quiet when the save was aborted", async () => {
    const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
    const { result, props } = setup({
      onSave: vi.fn().mockRejectedValue(abort),
      dirtyFields: [{ key: "component" }],
      localEdit: { component: "flange" },
    });

    await act(() => result.current.handleSave());

    // An abort is the app's own doing — the user has nothing to fix.
    expect(props.setNotification).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "error" }),
    );
  });
});

describe("handleStatusSelect", () => {
  it("opens the resolve sheet instead of saving straight away", async () => {
    const { result, props } = setup();

    await act(() => result.current.handleStatusSelect(STATUS.RESOLVED));

    expect(props.setResolveOpen).toHaveBeenCalledWith(true);
    expect(props.onSave).not.toHaveBeenCalled();
  });

  it("opens the repair sheet for in-progress", async () => {
    const { result, props } = setup();

    await act(() => result.current.handleStatusSelect(STATUS.IN_PROGRESS));

    expect(props.setRepairOpen).toHaveBeenCalledWith(true);
  });

  it("opens the reopen sheet when a resolved leak goes back to open", async () => {
    const { result, props } = setup({
      leak: { ...LEAK, status: STATUS.RESOLVED },
    });

    await act(() => result.current.handleStatusSelect(STATUS.OPEN));

    expect(props.setReopenOpen).toHaveBeenCalledWith(true);
  });

  it("ignores a selection that does not change the status", async () => {
    const { result, props } = setup();

    await act(() => result.current.handleStatusSelect(STATUS.OPEN));

    expect(props.onSave).not.toHaveBeenCalled();
    expect(props.requireHistoryUser).not.toHaveBeenCalled();
  });

  it("reports a failed status write", async () => {
    const { result, props } = setup({
      leak: { ...LEAK, status: STATUS.IN_PROGRESS },
      onSave: vi.fn().mockRejectedValue(new Error("nope")),
    });

    await act(() => result.current.handleStatusSelect(STATUS.OPEN));

    expect(props.setNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: "error" }),
    );
  });
});

describe("resolve, repair and reopen", () => {
  it("closes the resolve sheet after saving", async () => {
    // The lifecycle only allows resolving what is already in repair.
    const leak = { ...LEAK, status: STATUS.IN_PROGRESS };
    const { result, props } = setup({ leak, allLeaks: [leak] });

    await act(() =>
      result.current.handleResolveConfirm({
        photo_after: "idb://after",
        materials_equipment: "gasket",
        note: "done",
      }),
    );

    expect(props.onSave).toHaveBeenCalled();
    expect(props.setResolveOpen).toHaveBeenCalledWith(false);
  });

  it("drops the newly attached photo when resolving fails", async () => {
    const leak = { ...LEAK, status: STATUS.IN_PROGRESS };
    const { result, props } = setup({
      leak,
      allLeaks: [leak],
      onSave: vi.fn().mockRejectedValue(new Error("nope")),
    });

    await act(() =>
      result.current.handleResolveConfirm({ photo_after: "idb://fresh" }),
    );

    // Otherwise the photo stays in storage referenced by nothing.
    expect(props.deletePhoto).toHaveBeenCalledWith("idb://fresh");
    expect(props.setResolveOpen).not.toHaveBeenCalledWith(false);
  });

  it("closes the repair sheet after saving", async () => {
    const { result, props } = setup();

    await act(() =>
      result.current.handleRepairConfirm({ photo_repair: "idb://repair" }),
    );

    expect(props.onSave).toHaveBeenCalled();
    expect(props.setRepairOpen).toHaveBeenCalledWith(false);
  });

  it("drops the newly attached photo when the repair fails", async () => {
    const { result, props } = setup({
      onSave: vi.fn().mockRejectedValue(new Error("nope")),
    });

    await act(() =>
      result.current.handleRepairConfirm({ photo_repair: "idb://fresh" }),
    );

    expect(props.deletePhoto).toHaveBeenCalledWith("idb://fresh");
  });

  it("saves a reopen without optimistic update", async () => {
    const leak = { ...LEAK, status: STATUS.RESOLVED };
    const { result, props } = setup({ leak, allLeaks: [leak] });

    await act(() => result.current.handleReopenConfirm({ note: "again" }));

    expect(props.onSave).toHaveBeenCalledWith(
      expect.any(Object),
      // A reopen rewrites the record, so the list must not show it early.
      { optimistic: false },
    );
    expect(props.setReopenOpen).toHaveBeenCalledWith(false);
  });

  it("reports a failed reopen", async () => {
    const leak = { ...LEAK, status: STATUS.RESOLVED };
    const { result, props } = setup({
      leak,
      allLeaks: [leak],
      onSave: vi.fn().mockRejectedValue(new Error("nope")),
    });

    await act(() => result.current.handleReopenConfirm({ note: "again" }));

    expect(props.setNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: "error" }),
    );
  });

  it("requires a history user before any of them", async () => {
    const { result, props } = setup({ requireHistoryUser: vi.fn(() => false) });

    await act(() => result.current.handleResolveConfirm({}));
    await act(() => result.current.handleRepairConfirm({}));
    await act(() => result.current.handleReopenConfirm({}));

    expect(props.onSave).not.toHaveBeenCalled();
  });
});
