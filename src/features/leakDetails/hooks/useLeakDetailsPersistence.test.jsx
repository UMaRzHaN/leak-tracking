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

  it("keeps the receiver accuracy for coordinates taken from GPS", async () => {
    const { result, props } = setup({
      localEdit: {
        lat: 41.3,
        lng: 69.2,
        __gps: { lat: 41.3, lng: 69.2, accuracy: 6.4 },
      },
      dirtyFields: [{ key: "lat" }, { key: "lng" }],
    });

    await act(() => result.current.handleSave());

    const saved = props.onSave.mock.calls[0][0];
    expect(saved).toMatchObject({ lat: 41.3, lng: 69.2, coords_accuracy: 6 });
    expect(saved.__gps).toBeUndefined();
  });

  it("drops the accuracy when coordinates are typed by hand", async () => {
    const { result, props } = setup({
      localEdit: { lat: "41,3", lng: "69,2" },
      dirtyFields: [{ key: "lat" }, { key: "lng" }],
    });

    await act(() => result.current.handleSave());

    expect(props.onSave.mock.calls[0][0].coords_accuracy).toBeUndefined();
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

  it("сохраняет исправленный осмотр и статус, пошедший за его итогом", async () => {
    const leak = {
      ...LEAK,
      status: STATUS.RESOLVED,
      events: [
        {
          id: "i1",
          type: "inspection",
          date: "2026-10-05T10:00:00.000Z",
          result: "resolved",
        },
      ],
    };
    const { result, props } = setup({
      leak,
      allLeaks: [leak],
      recordEdits: { i1: { result: "still_leaking", physicalTag: false } },
    });

    await act(() => result.current.handleSave());

    const saved = props.onSave.mock.calls[0][0];
    expect(saved.status).toBe(STATUS.OPEN);
    expect(saved.events[0]).toMatchObject({
      result: "still_leaking",
      physicalTag: false,
    });
    expect(saved.history.at(-1).changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "result", to: "still_leaking" }),
        expect.objectContaining({ key: "status", to: STATUS.OPEN }),
      ]),
    );
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
