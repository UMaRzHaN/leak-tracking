import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMainPageActions } from "./useMainPageActions";

const deletePhoto = vi.hoisted(() => vi.fn());

vi.mock("@/app/hooks/useLanguage", async () => {
  const { englishLanguageHook } = await import("@/test/translate");
  return englishLanguageHook();
});

vi.mock("@/hooks/usePhotoStorage", () => ({
  usePhotoStorage: () => ({ deletePhoto }),
}));

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
  scopedData,
  userProfile = { name: "Inspector" },
  setData = vi.fn().mockResolvedValue(undefined),
}) {
  const hook = renderHook(() =>
    useMainPageActions({ data, scopedData, setData, userProfile }),
  );
  return { ...hook, setData };
}

const leakWith = (id, overrides = {}) => ({
  id,
  leak_id: id.replace("leak-", ""),
  status: "open",
  ...overrides,
});

beforeEach(() => {
  deletePhoto.mockReset().mockResolvedValue(undefined);
});

describe("useMainPageActions", () => {
  describe("the selected location", () => {
    const inScope = leakWith("leak-1");
    const outOfScope = leakWith("leak-2", { status: "resolved" });

    it("summarises and lists only what the location leaves visible", () => {
      const { result } = renderActions({
        data: [inScope, outOfScope],
        scopedData: [inScope],
      });

      expect(result.current.stats).toEqual({
        total: 1,
        open: 1,
        inProgress: 0,
        resolved: 0,
      });
      expect(result.current.recent.map((leak) => leak.id)).toEqual(["leak-1"]);
    });

    it("keeps leaks outside the location when one inside it is saved", async () => {
      // The mutation rebuilds the list it persists. Building it from the
      // scoped view would delete every record outside the selected folder —
      // silently, and on the next save.
      const { result, setData } = renderActions({
        data: [inScope, outOfScope],
        scopedData: [inScope],
      });

      await act(async () => {
        await result.current.handleSaveLeak({ ...inScope, note: "edited" });
      });

      expect(setData.mock.calls[0][0].map((leak) => leak.id)).toEqual([
        "leak-1",
        "leak-2",
      ]);
    });

    it("keeps leaks outside the location when one inside it is deleted", async () => {
      const { result, setData } = renderActions({
        data: [inScope, outOfScope],
        scopedData: [inScope],
      });

      await act(async () => {
        await result.current.handleDeleteLeak("leak-1");
      });

      expect(setData.mock.calls[0][0].map((leak) => leak.id)).toEqual([
        "leak-2",
      ]);
    });

    it("falls back to the whole project when no location is selected", () => {
      const { result } = renderActions({ data: [inScope, outOfScope] });

      expect(result.current.stats.total).toBe(2);
    });
  });

  describe("the dashboard summary", () => {
    it("counts each status, treating a missing status as open", () => {
      const { result } = renderActions({
        data: [
          leakWith("leak-1"),
          { id: "leak-2" },
          leakWith("leak-3", { status: "in_progress" }),
          leakWith("leak-4", { status: "resolved" }),
          leakWith("leak-5", { status: "resolved" }),
        ],
      });

      expect(result.current.stats).toEqual({
        total: 5,
        open: 2,
        inProgress: 1,
        resolved: 2,
      });
    });

    it("lists the newest tags first and caps the list", () => {
      const data = Array.from({ length: 12 }, (_, index) =>
        leakWith(`leak-${index + 1}`),
      );
      const { result } = renderActions({ data });

      expect(result.current.recent).toHaveLength(result.current.RECENT_COUNT);
      expect(result.current.recent[0].leak_id).toBe("12");
    });

    // Records added in the app get a random UUID, so ordering by id showed the
    // "last N records" in random order — the screen's own timestamps ran out of
    // sequence. Ordering is by createdAt, the value the cards render.
    it("orders the list by creation time, not by the random record id", () => {
      const data = [
        leakWith("leak-a", {
          id: "f81d4fae-7dec-41d0-9f6c-000000000001",
          createdAt: "2026-08-09T09:05:00.000Z",
        }),
        leakWith("leak-b", {
          id: "00000000-7dec-41d0-9f6c-000000000002",
          createdAt: "2026-08-09T09:11:00.000Z",
        }),
        leakWith("leak-c", {
          id: "aaaaaaaa-7dec-41d0-9f6c-000000000003",
          createdAt: "2026-08-09T09:08:00.000Z",
        }),
      ];
      const { result } = renderActions({ data });

      expect(result.current.recent.map((leak) => leak.createdAt)).toEqual([
        "2026-08-09T09:11:00.000Z",
        "2026-08-09T09:08:00.000Z",
        "2026-08-09T09:05:00.000Z",
      ]);
    });

    it("filters the list by status and toggles the filter off on a second press", () => {
      const { result } = renderActions({
        data: [
          leakWith("leak-1"),
          leakWith("leak-2", { status: "resolved" }),
          { id: "leak-3" },
        ],
      });

      act(() => result.current.toggleFilter("resolved"));
      expect(result.current.statusFilter).toBe("resolved");
      expect(result.current.recent.map((l) => l.id)).toEqual(["leak-2"]);

      // A leak with no status counts as open here too.
      act(() => result.current.toggleFilter("open"));
      expect(result.current.recent.map((l) => l.id)).toEqual([
        "leak-3",
        "leak-1",
      ]);

      act(() => result.current.toggleFilter("open"));
      expect(result.current.statusFilter).toBe(result.current.ALL);
      expect(result.current.recent).toHaveLength(3);
    });
  });

  describe("the user name gate", () => {
    it("does not open the status picker and says why", () => {
      const leak = leakWith("leak-1");
      const { result } = renderActions({
        data: [leak],
        userProfile: { name: "  " },
      });

      act(() => result.current.handlePickStatus(leak));

      expect(result.current.pickerLeak).toBeNull();
      expect(result.current.notification).toEqual({
        type: "error",
        message: "Fill in the user name in the profile",
      });
    });

    it("blocks every confirm handler, writing nothing", async () => {
      const leak = leakWith("leak-1", { status: "resolved" });
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

  // The lifecycle is a strict cycle — open → in_progress → resolved → open.
  describe("choosing a status", () => {
    it("routes resolve, repair and reopen to their own sheets", async () => {
      const cases = [
        { status: "in_progress", pick: "resolved", sheet: "resolveLeak" },
        { status: "open", pick: "in_progress", sheet: "repairLeak" },
        { status: "resolved", pick: "open", sheet: "reopenLeak" },
      ];

      for (const { status, pick, sheet } of cases) {
        const leak = leakWith("leak-1", { status });
        const { result, setData } = renderActions({ data: [leak] });

        act(() => result.current.setPickerLeak(leak));
        await act(async () => {
          await result.current.handleStatusSelect(pick);
        });

        expect(result.current[sheet]).toEqual(leak);
        expect(setData).not.toHaveBeenCalled();
      }
    });

    it("ignores a pick that changes nothing and one with no leak", async () => {
      const leak = leakWith("leak-1");
      const { result, setData } = renderActions({ data: [leak] });

      act(() => result.current.setPickerLeak(leak));
      await act(async () => {
        await result.current.handleStatusSelect("open");
      });
      await act(async () => {
        await result.current.handleStatusSelect("in_progress");
      });

      expect(setData).not.toHaveBeenCalled();
    });

    it("reports a transition that skips a step instead of throwing", async () => {
      const leak = leakWith("leak-1", { status: "in_progress" });
      const { result, setData } = renderActions({ data: [leak] });

      act(() => result.current.setPickerLeak(leak));
      await act(async () => {
        await result.current.handleStatusSelect("open");
      });

      expect(setData).not.toHaveBeenCalled();
      expect(result.current.notification.message).toBe(
        "Save error: Invalid leak status transition: in_progress -> open",
      );
    });
  });

  describe("resolving and repairing", () => {
    it("stores the resolution and closes the sheet", async () => {
      const leak = leakWith("leak-1", { status: "in_progress" });
      const { result, setData } = renderActions({ data: [leak] });

      act(() => result.current.setResolveLeak(leak));
      await act(async () => {
        await result.current.handleResolveConfirm({
          photo_after: "idb://after",
          note: "sealed",
        });
      });

      expect(setData.mock.calls[0][0][0]).toMatchObject({
        status: "resolved",
        photo_after: "idb://after",
        note: "sealed",
      });
      expect(result.current.resolveLeak).toBeNull();
    });

    // The photo lands before the record. A failed write leaves a file that
    // nothing points at.
    it("collects the new after-photo when the write fails", async () => {
      const setData = vi.fn().mockRejectedValue(new Error("no space"));
      const leak = leakWith("leak-1", { status: "in_progress" });
      const { result } = renderActions({ data: [leak], setData });

      act(() => result.current.setResolveLeak(leak));
      await act(async () => {
        await result.current.handleResolveConfirm({
          photo_after: "idb://orphan",
        });
      });

      expect(deletePhoto).toHaveBeenCalledWith("idb://orphan");
      expect(result.current.notification.message).toBe("Save error: no space");
      expect(result.current.resolveLeak).toEqual(leak);
    });

    it("stores the repair and drops the photo it replaced", async () => {
      const leak = leakWith("leak-1", { photo_repair: "idb://old" });
      const { result, setData } = renderActions({ data: [leak] });

      act(() => result.current.setRepairLeak(leak));
      await act(async () => {
        await result.current.handleRepairConfirm({ photo_repair: "idb://new" });
      });

      expect(setData.mock.calls[0][0][0]).toMatchObject({
        status: "in_progress",
        photo_repair: "idb://new",
      });
      expect(deletePhoto).toHaveBeenCalledWith("idb://old");
      expect(result.current.repairLeak).toBeNull();
    });

    it("collects the new repair photo when the write fails", async () => {
      const setData = vi.fn().mockRejectedValue(new Error("io error"));
      const leak = leakWith("leak-1");
      const { result } = renderActions({ data: [leak], setData });

      act(() => result.current.setRepairLeak(leak));
      await act(async () => {
        await result.current.handleRepairConfirm({
          photo_repair: "idb://orphan",
        });
      });

      expect(deletePhoto).toHaveBeenCalledWith("idb://orphan");
      expect(result.current.notification.message).toBe("Save error: io error");
    });
  });

  describe("reopening", () => {
    it("writes without an optimistic update, because the record is recalculated", async () => {
      const leak = leakWith("leak-1", {
        status: "resolved",
        resolvedAt: "2026-01-01T00:00:00.000Z",
      });
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
      const leak = leakWith("leak-1", { status: "resolved" });
      const { result } = renderActions({ data: [leak], setData });

      act(() => result.current.setReopenLeak(leak));
      await act(async () => {
        await result.current.handleReopenConfirm({});
      });

      expect(result.current.notification.message).toBe("Save error: conflict");
      expect(result.current.reopenLeak).toEqual(leak);
    });
  });

  describe("saving and deleting", () => {
    it("replaces the record and closes the details sheet", async () => {
      const leak = leakWith("leak-1", { note: "before" });
      const { result, setData } = renderActions({ data: [leak] });

      act(() => result.current.setActiveLeak(leak));
      await act(async () => {
        await result.current.handleSaveLeak({ ...leak, note: "after" });
      });

      expect(setData.mock.calls[0][0]).toEqual([{ ...leak, note: "after" }]);
      expect(result.current.activeLeak).toBeNull();
    });

    // This one rethrows: the details sheet has its own saving state to unwind.
    it("rethrows a failed save and keeps the sheet open", async () => {
      const setData = vi.fn().mockRejectedValue(new Error("locked"));
      const leak = leakWith("leak-1");
      const { result } = renderActions({ data: [leak], setData });

      act(() => result.current.setActiveLeak(leak));
      // Caught here rather than by `expect(act(...)).rejects`, so that React
      // still commits the notification before the assertions run.
      let thrown = null;
      await act(async () => {
        thrown = await result.current.handleSaveLeak(leak).then(
          () => null,
          (error) => error,
        );
      });

      expect(thrown?.message).toBe("locked");
      expect(result.current.notification.message).toBe("Save error: locked");
      expect(result.current.activeLeak).toEqual(leak);
    });

    it("does not delete a shared photo when removing a recent leak", async () => {
      const sharedPath = "idb://shared";
      const data = [
        { id: "leak-1", photo: sharedPath },
        { id: "leak-2", photo_repair: sharedPath },
      ];
      const { result, setData } = renderActions({ data });

      await act(async () => {
        await result.current.handleDeleteLeak("leak-1");
      });

      expect(setData).toHaveBeenCalledWith([data[1]]);
      expect(deletePhoto).not.toHaveBeenCalled();
    });

    it("deletes photo files unique to the removed leak", async () => {
      const data = [
        {
          id: "leak-1",
          photo: "idb://before",
          monitoringRecords: [{ photo: "idb://monitoring" }],
        },
        { id: "leak-2" },
      ];
      const { result } = renderActions({ data });

      await act(async () => {
        await result.current.handleDeleteLeak("leak-1");
      });

      expect(deletePhoto).toHaveBeenCalledWith("idb://before");
      expect(deletePhoto).toHaveBeenCalledWith("idb://monitoring");
    });

    it("reports a failed delete and keeps the photo", async () => {
      const setData = vi.fn().mockRejectedValue(new Error("quota exceeded"));
      const { result } = renderActions({
        data: [{ id: "leak-1", photo: "idb://before" }],
        setData,
      });

      await act(async () => {
        await result.current.handleDeleteLeak("leak-1");
      });

      expect(result.current.notification.message).toBe(
        "Delete error: quota exceeded",
      );
      expect(deletePhoto).not.toHaveBeenCalled();
    });
  });
});
