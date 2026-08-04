import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { STATUS } from "@/utils/status";
import { useBulkActions } from "./useBulkActions";

vi.mock("@/app/hooks/useLanguage", async () => {
  const { englishLanguageHook } = await import("@/test/translate");
  return englishLanguageHook();
});

vi.mock("@/utils/haptics", () => ({
  hapticSuccess: vi.fn(),
}));

const modes = [
  {
    label: "resolve",
    status: STATUS.RESOLVED,
    photoKey: "photo_after",
    queueKey: "resolveQueue",
    confirmKey: "handleSequentialResolveConfirm",
  },
  {
    label: "repair",
    status: STATUS.IN_PROGRESS,
    photoKey: "photo_repair",
    queueKey: "repairQueue",
    confirmKey: "handleSequentialRepairConfirm",
  },
];

function renderBulkActions({
  setData,
  deletePhoto,
  photoKey,
  oldPath,
  status,
}) {
  const data = [
    {
      id: "leak-1",
      leak_id: "1001",
      status,
      [photoKey]: oldPath,
    },
  ];
  const notify = vi.fn();
  const hook = renderHook(() =>
    useBulkActions({
      data,
      setData,
      displayed: data,
      notify,
      deletePhoto,
      userProfile: { name: "Inspector" },
    }),
  );
  return { ...hook, notify };
}

describe.each(modes)("bulk sequential $label photo lifecycle", (mode) => {
  it("rolls back the newly saved photo when project persistence fails", async () => {
    const oldPath = `photos/old-${mode.label}.jpg`;
    const newPath = `photos/new-${mode.label}.jpg`;
    const setData = vi.fn().mockRejectedValue(new Error("database locked"));
    const deletePhoto = vi.fn().mockResolvedValue(undefined);
    const { result, notify } = renderBulkActions({
      setData,
      deletePhoto,
      photoKey: mode.photoKey,
      oldPath,
      status:
        mode.status === STATUS.RESOLVED ? STATUS.IN_PROGRESS : STATUS.OPEN,
    });

    act(() => result.current.toggleSelected("leak-1"));
    await act(async () => {
      await result.current.handleBulkStatusChange(mode.status);
    });
    await act(async () => {
      await result.current[mode.confirmKey]({
        [mode.photoKey]: newPath,
      });
    });

    expect(deletePhoto).toHaveBeenCalledWith(newPath);
    expect(deletePhoto).not.toHaveBeenCalledWith(oldPath);
    expect(result.current[mode.queueKey]).toHaveLength(1);
    expect(notify).toHaveBeenCalledWith(
      "error",
      expect.stringContaining("database locked"),
    );
  });

  it("deletes the superseded photo only after a successful commit", async () => {
    const oldPath = `photos/old-${mode.label}.jpg`;
    const newPath = `photos/new-${mode.label}.jpg`;
    const setData = vi.fn().mockResolvedValue(undefined);
    const deletePhoto = vi.fn().mockResolvedValue(undefined);
    const { result } = renderBulkActions({
      setData,
      deletePhoto,
      photoKey: mode.photoKey,
      oldPath,
      status:
        mode.status === STATUS.RESOLVED ? STATUS.IN_PROGRESS : STATUS.OPEN,
    });

    act(() => result.current.toggleSelected("leak-1"));
    await act(async () => {
      await result.current.handleBulkStatusChange(mode.status);
    });
    await act(async () => {
      await result.current[mode.confirmKey]({
        [mode.photoKey]: newPath,
      });
    });

    expect(setData).toHaveBeenCalledOnce();
    expect(setData.mock.calls[0][0][0][mode.photoKey]).toBe(newPath);
    expect(deletePhoto).toHaveBeenCalledWith(oldPath);
    expect(deletePhoto).not.toHaveBeenCalledWith(newPath);
    expect(result.current[mode.queueKey]).toHaveLength(0);
  });
});

function renderWith(
  data,
  { userProfile = { name: "Inspector" }, setData, projectVars } = {},
) {
  const notify = vi.fn();
  const deletePhoto = vi.fn().mockResolvedValue(undefined);
  const hook = renderHook(() =>
    useBulkActions({
      data,
      setData: setData ?? vi.fn().mockResolvedValue(undefined),
      displayed: data,
      notify,
      deletePhoto,
      userProfile,
      projectVars,
    }),
  );
  return { ...hook, notify, deletePhoto };
}

const leak = (id, status = STATUS.OPEN) => ({ id, leak_id: id, status });

describe("bulk selection", () => {
  it("toggles one id on and off", () => {
    const { result } = renderWith([leak("a"), leak("b")]);

    act(() => result.current.toggleSelected("a"));
    expect([...result.current.selectedIds]).toEqual(["a"]);

    act(() => result.current.toggleSelected("a"));
    expect(result.current.selectedIds.size).toBe(0);
  });

  it("selects everything currently displayed, keeping earlier picks", () => {
    const { result } = renderWith([leak("a"), leak("b"), leak("c")]);

    act(() => result.current.toggleSelected("a"));
    act(() => result.current.selectDisplayed());

    expect([...result.current.selectedIds].sort()).toEqual(["a", "b", "c"]);
  });

  it("deselects one id, and leaves the set alone when it was not selected", () => {
    const { result } = renderWith([leak("a"), leak("b")]);

    act(() => result.current.selectDisplayed());
    const before = result.current.selectedIds;

    act(() => result.current.deselectId("zzz"));
    // Same object: nothing changed, so nothing re-rendered downstream.
    expect(result.current.selectedIds).toBe(before);

    act(() => result.current.deselectId("a"));
    expect([...result.current.selectedIds]).toEqual(["b"]);
  });

  it("clears the whole selection", () => {
    const { result } = renderWith([leak("a"), leak("b")]);

    act(() => result.current.selectDisplayed());
    act(() => result.current.clearSelection());

    expect(result.current.selectedIds.size).toBe(0);
  });
});

describe("bulk status change", () => {
  it("does nothing without a selection", async () => {
    const setData = vi.fn().mockResolvedValue(undefined);
    const { result } = renderWith([leak("a")], { setData });

    await act(async () => {
      await result.current.handleBulkStatusChange(STATUS.IN_PROGRESS);
    });

    expect(setData).not.toHaveBeenCalled();
  });

  it("refuses without a user name and says why", async () => {
    const setData = vi.fn().mockResolvedValue(undefined);
    const { result, notify } = renderWith([leak("a")], {
      setData,
      userProfile: { name: "  " },
    });

    act(() => result.current.toggleSelected("a"));
    await act(async () => {
      await result.current.handleBulkStatusChange(STATUS.IN_PROGRESS);
    });

    expect(setData).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(
      "error",
      "Fill in the user name in the profile",
    );
  });

  it("clears the selection when every picked leak is already in that status", async () => {
    const setData = vi.fn().mockResolvedValue(undefined);
    const { result } = renderWith([leak("a", STATUS.IN_PROGRESS)], { setData });

    act(() => result.current.toggleSelected("a"));
    await act(async () => {
      await result.current.handleBulkStatusChange(STATUS.IN_PROGRESS);
    });

    expect(setData).not.toHaveBeenCalled();
    expect(result.current.selectedIds.size).toBe(0);
  });

  it("queues resolve and repair one leak at a time", async () => {
    const { result } = renderWith([
      leak("a", STATUS.IN_PROGRESS),
      leak("b", STATUS.IN_PROGRESS),
    ]);

    act(() => result.current.selectDisplayed());
    await act(async () => {
      await result.current.handleBulkStatusChange(STATUS.RESOLVED);
    });

    expect(result.current.resolveQueue).toHaveLength(2);
    expect(result.current.resolveTotal).toBe(2);
  });

  it("reopens resolved leaks in one write and reports the count", async () => {
    const setData = vi.fn().mockResolvedValue(undefined);
    const { result, notify } = renderWith(
      [leak("a", STATUS.RESOLVED), leak("b", STATUS.RESOLVED)],
      { setData },
    );

    act(() => result.current.selectDisplayed());
    await act(async () => {
      await result.current.handleBulkStatusChange(STATUS.OPEN);
    });

    expect(setData).toHaveBeenCalledOnce();
    expect(setData.mock.calls[0][0].every((l) => l.status === "open")).toBe(
      true,
    );
    expect(notify).toHaveBeenCalledWith(
      "success",
      "Status changed for 2 records",
    );
    expect(result.current.selectedIds.size).toBe(0);
  });

  it("uses the singular form for a single record", async () => {
    const { result, notify } = renderWith([leak("a", STATUS.RESOLVED)]);

    act(() => result.current.toggleSelected("a"));
    await act(async () => {
      await result.current.handleBulkStatusChange(STATUS.OPEN);
    });

    expect(notify).toHaveBeenCalledWith(
      "success",
      "Status changed for 1 record",
    );
  });

  it("reports a failed write and keeps the selection", async () => {
    const setData = vi.fn().mockRejectedValue(new Error("db locked"));
    const { result, notify } = renderWith([leak("a", STATUS.RESOLVED)], {
      setData,
    });

    act(() => result.current.toggleSelected("a"));
    await act(async () => {
      await result.current.handleBulkStatusChange(STATUS.OPEN);
    });

    expect(notify).toHaveBeenCalledWith("error", "Save error: db locked");
    expect(result.current.selectedIds.size).toBe(1);
  });
});

describe("the sequential queues", () => {
  it("announces the total once the last one is confirmed", async () => {
    const { result, notify } = renderWith([
      leak("a", STATUS.IN_PROGRESS),
      leak("b", STATUS.IN_PROGRESS),
    ]);

    act(() => result.current.selectDisplayed());
    await act(async () => {
      await result.current.handleBulkStatusChange(STATUS.RESOLVED);
    });

    await act(async () => {
      await result.current.handleSequentialResolveConfirm({});
    });
    expect(result.current.resolveQueue).toHaveLength(1);
    expect(notify).not.toHaveBeenCalledWith(
      "success",
      expect.stringContaining("Resolved"),
    );

    await act(async () => {
      await result.current.handleSequentialResolveConfirm({});
    });
    expect(result.current.resolveQueue).toHaveLength(0);
    expect(notify).toHaveBeenCalledWith("success", "Resolved 2 records");
  });

  it("does nothing when the queue is empty", async () => {
    const setData = vi.fn().mockResolvedValue(undefined);
    const { result } = renderWith([leak("a")], { setData });

    await act(async () => {
      await result.current.handleSequentialResolveConfirm({});
      await result.current.handleSequentialRepairConfirm({});
    });

    expect(setData).not.toHaveBeenCalled();
  });

  it("abandons a queue on cancel", async () => {
    const { result } = renderWith([leak("a", STATUS.IN_PROGRESS)]);

    act(() => result.current.toggleSelected("a"));
    await act(async () => {
      await result.current.handleBulkStatusChange(STATUS.RESOLVED);
    });
    act(() => result.current.cancelBulkResolve());

    expect(result.current.resolveQueue).toHaveLength(0);
    expect(result.current.resolveTotal).toBe(0);

    act(() => result.current.toggleSelected("a"));
    await act(async () => {
      await result.current.handleBulkStatusChange(STATUS.IN_PROGRESS);
    });
    act(() => result.current.cancelBulkRepair());

    expect(result.current.repairQueue).toHaveLength(0);
    expect(result.current.repairTotal).toBe(0);
  });
});

describe("bulk recalculation", () => {
  const projectVars = { gasType: "methane", GWP: 28, Operating_mode: 365 };

  it("offers the first selected leak's parameters as the starting point", () => {
    const { result } = renderWith(
      [
        { id: "a", status: STATUS.OPEN, GWP: 25 },
        { id: "b", status: STATUS.OPEN, GWP: 82 },
      ],
      { projectVars },
    );

    // With nothing selected the project defaults stand in.
    expect(result.current.bulkCalculationVars).toEqual(projectVars);

    act(() => result.current.toggleSelected("b"));
    expect(result.current.bulkCalculationVars.GWP).toBe(82);
  });

  it("does nothing without a selection", async () => {
    const setData = vi.fn().mockResolvedValue(undefined);
    const { result } = renderWith([{ id: "a", status: STATUS.OPEN }], {
      setData,
      projectVars,
    });

    await act(async () => {
      await result.current.handleBulkCalculationSave({ GWP: 30 });
    });

    expect(setData).not.toHaveBeenCalled();
  });

  it("refuses without a user name and reports it as unsaved", async () => {
    const setData = vi.fn().mockResolvedValue(undefined);
    const { result, notify } = renderWith([{ id: "a", status: STATUS.OPEN }], {
      setData,
      projectVars,
      userProfile: null,
    });

    act(() => result.current.toggleSelected("a"));
    let saved;
    await act(async () => {
      saved = await result.current.handleBulkCalculationSave({ GWP: 30 });
    });

    expect(saved).toBe(false);
    expect(setData).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(
      "error",
      "Fill in the user name in the profile",
    );
  });

  // Applying the values a leak already has is a no-op, not an error — the
  // selection still clears, so the sheet closes.
  it("says so and writes nothing when the parameters already match", async () => {
    const setData = vi.fn().mockResolvedValue(undefined);
    const { result, notify } = renderWith(
      [{ id: "a", status: STATUS.OPEN, ...projectVars }],
      { setData, projectVars },
    );

    act(() => result.current.toggleSelected("a"));
    let saved;
    await act(async () => {
      saved = await result.current.handleBulkCalculationSave(
        result.current.bulkCalculationVars,
      );
    });

    expect(saved).toBe(true);
    expect(setData).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(
      "info",
      "Selected parameters are already applied",
    );
    expect(result.current.selectedIds.size).toBe(0);
  });

  it("recalculates only the selected leaks and reports how many changed", async () => {
    const setData = vi.fn().mockResolvedValue(undefined);
    const { result, notify } = renderWith(
      [
        { id: "a", status: STATUS.OPEN, ...projectVars },
        { id: "b", status: STATUS.OPEN, ...projectVars },
      ],
      { setData, projectVars },
    );

    act(() => result.current.toggleSelected("a"));
    let saved;
    await act(async () => {
      saved = await result.current.handleBulkCalculationSave({
        ...projectVars,
        GWP: 82,
      });
    });

    expect(saved).toBe(true);
    const [written] = setData.mock.calls[0];
    // The new values live in the leak's own calculationParams snapshot, which
    // is what keeps a recalculation reproducible later.
    expect(written[0].calculationParams.GWP).toBe(82);
    expect(written[0].history.at(-1)).toMatchObject({ user: "Inspector" });
    expect(written[1].calculationParams).toBeUndefined();
    expect(notify).toHaveBeenCalledWith(
      "success",
      "Parameters and calculations updated: 1",
    );
    expect(result.current.selectedIds.size).toBe(0);
  });

  it("reports a failed write and keeps the selection for a retry", async () => {
    const setData = vi.fn().mockRejectedValue(new Error("db locked"));
    const { result, notify } = renderWith(
      [{ id: "a", status: STATUS.OPEN, ...projectVars }],
      { setData, projectVars },
    );

    act(() => result.current.toggleSelected("a"));
    let saved;
    await act(async () => {
      saved = await result.current.handleBulkCalculationSave({
        ...projectVars,
        GWP: 82,
      });
    });

    expect(saved).toBe(false);
    expect(notify).toHaveBeenCalledWith(
      "error",
      "Failed to update parameters: db locked",
    );
    expect(result.current.selectedIds.size).toBe(1);
  });
});
