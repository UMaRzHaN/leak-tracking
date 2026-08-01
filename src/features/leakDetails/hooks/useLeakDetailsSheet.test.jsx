import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deletePhoto: vi.fn(),
  photoDirty: true,
  resetPhoto: vi.fn(),
  saveAfter: vi.fn(),
  saveBefore: vi.fn(),
  saveRepair: vi.fn(),
}));

vi.mock("@/app/hooks/useLanguage", () => ({
  useLanguage: () => ({ lang: "en" }),
}));
vi.mock("@/app/project/ProjectContext", () => ({
  useProjectData: () => ({ activeProject: { id: "project-1" } }),
}));
vi.mock("@/app/project/hooks/useProjectConfig", () => ({
  useProjectConfig: () => ({
    vars: {},
    system: {
      fields: [
        { key: "component", editOrder: 1 },
        { key: "lat", editOrder: 2, numeric: true },
        { key: "lng", editOrder: 3, numeric: true },
        { key: "leak_speed", editOrder: 4, numeric: true },
      ],
    },
  }),
}));
vi.mock("@/app/project/hooks/useProjectVars", () => ({
  useProjectVars: () => ({ vars: {} }),
}));
vi.mock("@/hooks/usePhotoStorage", () => ({
  usePhotoStorage: () => ({ deletePhoto: mocks.deletePhoto }),
}));
vi.mock("@/hooks/useEditablePhoto", () => ({
  useEditablePhoto: ({ leakId }) => {
    const isAfter = leakId.endsWith("_after");
    const isRepair = leakId.endsWith("_repair");
    return {
      src: `src:${leakId}`,
      isDirty: !isAfter && !isRepair && mocks.photoDirty,
      changePhoto: vi.fn(),
      choosePhoto: vi.fn(),
      savePhoto: isAfter
        ? mocks.saveAfter
        : isRepair
          ? mocks.saveRepair
          : mocks.saveBefore,
      resetPhoto: mocks.resetPhoto,
      isNative: false,
    };
  },
}));
vi.mock("@/utils/calculations/calculations", () => ({
  isPinkBagEquipment: () => true,
}));
vi.mock("@/utils/calculationParams", () => ({
  CALCULATION_PARAM_KEYS: [],
  CALCULATION_PARAMS_VERSION: 1,
  buildLeakCalculationParams: () => ({}),
  calculateLeakWithSnapshot: (value) => value,
  calculationParamsEqual: () => true,
}));

import { MODE, useLeakDetailsSheet } from "./useLeakDetailsSheet";

const leak = {
  id: "leak-1",
  leak_id: "TAG-1",
  component: "Old valve",
  lat: 41,
  lng: 69,
  leak_speed: 2,
  photo: "idb://old-before",
  photo_after: "idb://old-after",
  photo_repair: null,
  status: "open",
  history: [],
  updatedAt: 10,
};

function renderDetails(overrides = {}) {
  const props = {
    leak,
    onClose: vi.fn(),
    onSave: vi.fn().mockResolvedValue(undefined),
    onDelete: vi.fn(),
    userProfile: { name: "Inspector" },
    ...overrides,
  };
  return { ...renderHook(() => useLeakDetailsSheet(props)), props };
}

describe("useLeakDetailsSheet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.photoDirty = true;
    mocks.deletePhoto.mockResolvedValue(undefined);
    mocks.saveBefore.mockResolvedValue("idb://new-before");
    mocks.saveAfter.mockResolvedValue(undefined);
    mocks.saveRepair.mockResolvedValue(undefined);
  });

  it("commits edits before deleting a replaced photo", async () => {
    const order = [];
    const onSave = vi.fn(async () => order.push("saved"));
    mocks.deletePhoto.mockImplementation(async () => order.push("deleted"));
    const { result } = renderDetails({ onSave });

    await waitFor(() =>
      expect(result.current.localEdit.component).toBe("Old valve"),
    );
    act(() => result.current.handleEdit());
    act(() =>
      result.current.setLocalEdit((current) => ({
        ...current,
        component: "New valve",
      })),
    );
    await act(() => result.current.handleSave());

    expect(onSave).toHaveBeenCalledOnce();
    const saved = onSave.mock.calls[0][0];
    expect(saved).toMatchObject({
      component: "New valve",
      photo: "idb://new-before",
      calculationVersion: 1,
    });
    expect(saved.history.at(-1)).toMatchObject({
      action: "edited",
      user: "Inspector",
    });
    expect(order).toEqual(["saved", "deleted"]);
    expect(mocks.deletePhoto).toHaveBeenCalledWith("idb://old-before");
  });

  it("removes only the uncommitted replacement when persistence fails", async () => {
    const onSave = vi.fn().mockRejectedValue(new Error("database failed"));
    const { result } = renderDetails({ onSave });

    await waitFor(() =>
      expect(result.current.localEdit.component).toBeTruthy(),
    );
    await act(() => result.current.handleSave());

    expect(mocks.deletePhoto).toHaveBeenCalledOnce();
    expect(mocks.deletePhoto).toHaveBeenCalledWith("idb://new-before");
    expect(mocks.deletePhoto).not.toHaveBeenCalledWith("idb://old-before");
    expect(result.current.notification).toEqual({
      type: "error",
      message: "Save error",
    });
  });

  it("blocks audited changes when the user profile has no name", async () => {
    const { result, props } = renderDetails({ userProfile: { name: " " } });

    await act(() => result.current.handleSave());

    expect(props.onSave).not.toHaveBeenCalled();
    expect(mocks.saveBefore).not.toHaveBeenCalled();
    expect(result.current.notification).toEqual({
      type: "error",
      message: "Fill in the user name in the profile",
    });
  });

  it("requires confirmation before closing dirty edits", async () => {
    const { result, props } = renderDetails();

    act(() => result.current.handleClose());
    expect(result.current.closeConfirmOpen).toBe(true);
    expect(props.onClose).not.toHaveBeenCalled();

    act(() => result.current.confirmClose());
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it("cleans up a newly captured resolution photo after a failed save", async () => {
    const onSave = vi.fn().mockRejectedValue(new Error("database failed"));
    const { result } = renderDetails({ onSave });

    await act(() =>
      result.current.handleResolveConfirm({
        photo_after: "idb://new-after",
        materials_equipment: "Seal replaced",
        note: "Resolved",
      }),
    );

    expect(mocks.deletePhoto).toHaveBeenCalledWith("idb://new-after");
    expect(result.current.notification).toEqual({
      type: "error",
      message: "Save error",
    });
    expect(result.current.mode).toBe(MODE.VIEW);
  });

  it("rejects invalid coordinates before writing photos or project data", async () => {
    const { result, props } = renderDetails();

    await waitFor(() => expect(result.current.localEdit.lat).toBe(41));
    act(() =>
      result.current.setLocalEdit((current) => ({ ...current, lat: 91 })),
    );
    await act(() => result.current.handleSave());

    expect(props.onSave).not.toHaveBeenCalled();
    expect(mocks.saveBefore).not.toHaveBeenCalled();
    expect(result.current.notification.message).toContain(
      "Latitude 91 is outside the allowed range",
    );
  });

  it("commits a resolution before removing the superseded after-photo", async () => {
    mocks.photoDirty = false;
    const order = [];
    const onSave = vi.fn(async () => order.push("saved"));
    mocks.deletePhoto.mockImplementation(async () => order.push("deleted"));
    const { result } = renderDetails({ onSave });

    await act(() =>
      result.current.handleResolveConfirm({
        photo_after: "idb://new-after",
        materials_equipment: "Seal replaced",
        note: "Resolved",
      }),
    );

    expect(onSave.mock.calls[0][0]).toMatchObject({
      status: "resolved",
      photo_after: "idb://new-after",
    });
    expect(mocks.deletePhoto).toHaveBeenCalledWith("idb://old-after");
    expect(order).toEqual(["saved", "deleted"]);
  });
});
