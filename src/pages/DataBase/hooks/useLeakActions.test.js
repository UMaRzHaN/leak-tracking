import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useLeakActions } from "./useLeakActions";

vi.mock("@/app/hooks/useLanguage", async () => {
  const { englishLanguageHook } = await import("@/test/translate");
  return englishLanguageHook();
});

vi.mock("@/app/project/ProjectContext", () => ({
  useProjectData: () => ({ activeProject: { id: "project-1" } }),
}));

vi.mock("@/app/project/hooks/useProjectVars", () => ({
  useProjectVars: () => ({ vars: {} }),
}));

vi.mock("@/utils/haptics", () => ({
  hapticSuccess: vi.fn(),
}));

function renderActions({
  data,
  userProfile = { name: "Inspector" },
  setData = vi.fn().mockResolvedValue(undefined),
}) {
  const deletePhoto = vi.fn().mockResolvedValue(undefined);
  const notify = vi.fn();
  const hook = renderHook(() =>
    useLeakActions({
      data,
      setData,
      notify,
      deletePhoto,
      userProfile,
    }),
  );
  return { ...hook, setData, deletePhoto, notify };
}

const openLeak = (overrides = {}) => ({
  id: "leak-1",
  status: "open",
  ...overrides,
});

describe("useLeakActions", () => {
  describe("deleting", () => {
    it("keeps a photo file when another leak still references it", async () => {
      const sharedPath = "idb://shared";
      const data = [
        { id: "leak-1", photo: sharedPath },
        { id: "leak-2", photo_after: sharedPath },
      ];
      const { result, setData, deletePhoto } = renderActions({ data });

      await act(async () => {
        await result.current.handleDelete("leak-1");
      });

      expect(setData).toHaveBeenCalledWith([data[1]]);
      expect(deletePhoto).not.toHaveBeenCalled();
    });

    it("deletes photo files that are unique to the removed leak", async () => {
      const data = [
        {
          id: "leak-1",
          photo: "idb://before",
          monitoringRecords: [{ photo: "idb://monitoring" }],
        },
        { id: "leak-2" },
      ];
      const { result, deletePhoto } = renderActions({ data });

      await act(async () => {
        await result.current.handleDelete("leak-1");
      });

      expect(deletePhoto).toHaveBeenCalledTimes(2);
      expect(deletePhoto).toHaveBeenCalledWith("idb://before");
      expect(deletePhoto).toHaveBeenCalledWith("idb://monitoring");
    });

    it("reports the failure and keeps the photo when the write fails", async () => {
      const setData = vi.fn().mockRejectedValue(new Error("quota exceeded"));
      const { result, notify, deletePhoto } = renderActions({
        data: [{ id: "leak-1", photo: "idb://before" }],
        setData,
      });

      await act(async () => {
        await result.current.handleDelete("leak-1");
      });

      expect(notify).toHaveBeenCalledWith(
        "error",
        "Delete error: quota exceeded",
      );
      // The record is still there, so its photo must not be collected.
      expect(deletePhoto).not.toHaveBeenCalled();
    });

    it("tells the caller which record went away", async () => {
      const onDeleted = vi.fn();
      const { result } = renderActions({ data: [{ id: "leak-1" }] });

      await act(async () => {
        await result.current.handleDelete("leak-1", { onDeleted });
      });

      expect(onDeleted).toHaveBeenCalledWith("leak-1");
    });
  });

  describe("the user name gate", () => {
    it("does not open status actions without a user name", () => {
      const leak = openLeak();
      const { result, notify } = renderActions({
        data: [leak],
        userProfile: { name: "   " },
      });

      act(() => {
        result.current.handlePickStatus(leak);
      });

      expect(result.current.pickerLeak).toBeNull();
      expect(notify).toHaveBeenCalledWith(
        "error",
        "Fill in the user name in the profile",
      );
    });

    // Every confirm handler re-checks, because the profile can be emptied
    // while a sheet is open.
    it("blocks every confirm handler, writing nothing", async () => {
      const leak = openLeak({ status: "resolved" });
      const { result, setData } = renderActions({
        data: [leak],
        userProfile: null,
      });

      act(() => {
        result.current.setResolveLeak(leak);
        result.current.setRepairLeak(leak);
        result.current.setReopenLeak(leak);
      });

      await act(async () => {
        await result.current.handleResolveConfirm({});
        await result.current.handleRepairConfirm({});
        await result.current.handleReopenConfirm({});
      });

      expect(setData).not.toHaveBeenCalled();
    });
  });

  // The lifecycle is a strict cycle — open → in_progress → resolved → open —
  // and the picker only ever offers nextStatus(current).
  describe("choosing a status", () => {
    it("routes resolve, repair and reopen to their own sheets", async () => {
      const cases = [
        {
          leak: { id: "leak-1", status: "in_progress" },
          pick: "resolved",
          sheet: "resolveLeak",
        },
        {
          leak: { id: "leak-1", status: "open" },
          pick: "in_progress",
          sheet: "repairLeak",
        },
        {
          leak: { id: "leak-1", status: "resolved" },
          pick: "open",
          sheet: "reopenLeak",
        },
      ];

      for (const { leak, pick, sheet } of cases) {
        const { result, setData } = renderActions({ data: [leak] });

        act(() => result.current.setPickerLeak(leak));
        await act(async () => {
          await result.current.handleStatusSelect(pick);
        });

        expect(result.current[sheet]).toEqual(leak);
        expect(result.current.pickerLeak).toBeNull();
        // A sheet decides what to write; the picker itself never does.
        expect(setData).not.toHaveBeenCalled();
      }
    });

    it("ignores a pick that does not change the status", async () => {
      const leak = openLeak();
      const { result, setData } = renderActions({ data: [leak] });

      act(() => result.current.setPickerLeak(leak));
      await act(async () => {
        await result.current.handleStatusSelect("open");
      });

      expect(setData).not.toHaveBeenCalled();
    });

    it("does nothing when no leak is picked", async () => {
      const { result, setData } = renderActions({ data: [openLeak()] });

      await act(async () => {
        await result.current.handleStatusSelect("in_progress");
      });

      expect(setData).not.toHaveBeenCalled();
    });

    // Every legal transition is intercepted above, so this branch is only
    // reachable by a caller that skips a step. It must report, not throw.
    it("reports a transition that skips a step instead of throwing", async () => {
      const leak = { id: "leak-1", status: "in_progress" };
      const { result, notify, setData } = renderActions({ data: [leak] });

      act(() => result.current.setPickerLeak(leak));
      await act(async () => {
        await result.current.handleStatusSelect("open");
      });

      expect(setData).not.toHaveBeenCalled();
      expect(notify).toHaveBeenCalledWith(
        "error",
        "Save error: Invalid leak status transition: in_progress -> open",
      );
    });
  });

  describe("resolving", () => {
    it("stores the resolution and closes the sheet", async () => {
      const leak = openLeak({ status: "in_progress" });
      const { result, setData } = renderActions({ data: [leak] });

      act(() => result.current.setResolveLeak(leak));
      await act(async () => {
        await result.current.handleResolveConfirm({
          photo_after: "idb://after",
          materials_equipment: "gasket",
          note: "done",
        });
      });

      const [written] = setData.mock.calls[0];
      expect(written[0]).toMatchObject({
        status: "resolved",
        photo_after: "idb://after",
        materials_equipment: "gasket",
      });
      expect(result.current.resolveLeak).toBeNull();
    });

    it("collects the replaced after-photo, not the new one", async () => {
      const leak = openLeak({
        status: "in_progress",
        photo_after: "idb://old-after",
      });
      const { result, deletePhoto } = renderActions({ data: [leak] });

      act(() => result.current.setResolveLeak(leak));
      await act(async () => {
        await result.current.handleResolveConfirm({
          photo_after: "idb://new-after",
        });
      });

      expect(deletePhoto).toHaveBeenCalledWith("idb://old-after");
      expect(deletePhoto).not.toHaveBeenCalledWith("idb://new-after");
    });

    // The photo is written before the record. If the record never lands, the
    // photo is a file nothing points at.
    it("collects the new photo when the write fails", async () => {
      const setData = vi.fn().mockRejectedValue(new Error("no space"));
      const leak = openLeak({ status: "in_progress" });
      const { result, deletePhoto, notify } = renderActions({
        data: [leak],
        setData,
      });

      act(() => result.current.setResolveLeak(leak));
      await act(async () => {
        await result.current.handleResolveConfirm({
          photo_after: "idb://orphan",
        });
      });

      expect(deletePhoto).toHaveBeenCalledWith("idb://orphan");
      expect(notify).toHaveBeenCalledWith("error", "Save error: no space");
      expect(result.current.resolveLeak).toEqual(leak);
    });
  });

  describe("starting a repair", () => {
    it("stores the repair and drops both the replaced and orphaned photos", async () => {
      const leak = {
        id: "leak-1",
        status: "open",
        photo: "idb://before",
        photo_repair: "idb://old-repair",
      };
      const { result, setData, deletePhoto } = renderActions({ data: [leak] });

      act(() => result.current.setRepairLeak(leak));
      await act(async () => {
        await result.current.handleRepairConfirm({
          photo_repair: "idb://new-repair",
          materials_equipment: "clamp",
        });
      });

      const [written] = setData.mock.calls[0];
      expect(written[0]).toMatchObject({
        status: "in_progress",
        photo_repair: "idb://new-repair",
      });
      expect(deletePhoto).toHaveBeenCalledWith("idb://old-repair");
      expect(result.current.repairLeak).toBeNull();
    });

    it("collects the new repair photo when the write fails", async () => {
      const setData = vi.fn().mockRejectedValue(new Error("io error"));
      const leak = openLeak();
      const { result, deletePhoto, notify } = renderActions({
        data: [leak],
        setData,
      });

      act(() => result.current.setRepairLeak(leak));
      await act(async () => {
        await result.current.handleRepairConfirm({
          photo_repair: "idb://orphan",
        });
      });

      expect(deletePhoto).toHaveBeenCalledWith("idb://orphan");
      expect(notify).toHaveBeenCalledWith("error", "Save error: io error");
    });
  });

  describe("reopening", () => {
    it("writes without an optimistic update, because the record is recalculated", async () => {
      const leak = {
        id: "leak-1",
        status: "resolved",
        resolvedAt: "2026-01-01T00:00:00.000Z",
      };
      const { result, setData } = renderActions({ data: [leak] });

      act(() => result.current.setReopenLeak(leak));
      await act(async () => {
        await result.current.handleReopenConfirm({ leak_speed: "12" });
      });

      const [written, options] = setData.mock.calls[0];
      expect(options).toEqual({ optimistic: false });
      expect(written[0]).toMatchObject({ status: "open", resolvedAt: null });
      expect(result.current.reopenLeak).toBeNull();
    });

    it("reports a failed reopen and keeps the sheet open", async () => {
      const setData = vi.fn().mockRejectedValue(new Error("conflict"));
      const leak = { id: "leak-1", status: "resolved" };
      const { result, notify } = renderActions({ data: [leak], setData });

      act(() => result.current.setReopenLeak(leak));
      await act(async () => {
        await result.current.handleReopenConfirm({});
      });

      expect(notify).toHaveBeenCalledWith("error", "Save error: conflict");
      expect(result.current.reopenLeak).toEqual(leak);
    });
  });

  describe("saving an edited leak", () => {
    it("replaces the record and closes the details sheet", async () => {
      const leak = openLeak({ note: "before" });
      const { result, setData } = renderActions({ data: [leak] });

      act(() => result.current.setActiveLeak(leak));
      await act(async () => {
        await result.current.handleSave({ ...leak, note: "after" });
      });

      expect(setData.mock.calls[0][0]).toEqual([{ ...leak, note: "after" }]);
      expect(result.current.activeLeak).toBeNull();
    });

    // Unlike the others this one rethrows: the details sheet has its own
    // saving state to unwind.
    it("rethrows so the caller can react, and keeps the sheet open", async () => {
      const setData = vi.fn().mockRejectedValue(new Error("locked"));
      const leak = openLeak();
      const { result, notify } = renderActions({ data: [leak], setData });

      act(() => result.current.setActiveLeak(leak));
      await expect(
        act(async () => {
          await result.current.handleSave(leak);
        }),
      ).rejects.toThrow("locked");

      expect(notify).toHaveBeenCalledWith("error", "Save error: locked");
      expect(result.current.activeLeak).toEqual(leak);
    });
  });
});
