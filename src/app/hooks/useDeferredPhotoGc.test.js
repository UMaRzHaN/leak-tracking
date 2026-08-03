import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  scheduledWork: null,
  cancel: vi.fn(),
  scheduleIdleWork: vi.fn((work) => {
    mocks.scheduledWork = work;
    return mocks.cancel;
  }),
}));

vi.mock("@/utils/scheduleIdleWork", () => ({
  scheduleIdleWork: mocks.scheduleIdleWork,
}));
vi.mock("@/utils/logger", () => ({
  logger: { warn: vi.fn() },
}));

import { useDeferredPhotoGc } from "./useDeferredPhotoGc";

function createBaseProps(overrides = {}) {
  return {
    activeProjectId: "project-a",
    dataForPhotoGc: [{ id: 1 }],
    dataLoaded: false,
    dataProjectId: "project-a",
    loadError: null,
    gcOrphanedPhotos: vi.fn().mockResolvedValue(undefined),
    suspended: false,
    isSuspended: vi.fn(() => false),
    ...overrides,
  };
}

describe("useDeferredPhotoGc", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.scheduledWork = null;
  });

  it("waits for project data, runs once, and resets after project change", async () => {
    const baseProps = createBaseProps();
    const { rerender } = renderHook((props) => useDeferredPhotoGc(props), {
      initialProps: baseProps,
    });

    expect(mocks.scheduleIdleWork).not.toHaveBeenCalled();

    rerender({ ...baseProps, dataLoaded: true });
    expect(mocks.scheduleIdleWork).toHaveBeenCalledOnce();

    await act(async () => mocks.scheduledWork());
    expect(baseProps.gcOrphanedPhotos).toHaveBeenCalledWith(
      baseProps.dataForPhotoGc,
    );

    rerender({ ...baseProps, dataLoaded: true });
    expect(mocks.scheduleIdleWork).toHaveBeenCalledOnce();

    rerender({
      ...baseProps,
      activeProjectId: "project-b",
      dataProjectId: "project-b",
      dataLoaded: true,
    });
    expect(mocks.scheduleIdleWork).toHaveBeenCalledTimes(2);
  });

  it("does not schedule photo GC while an import is suspended", () => {
    const baseProps = createBaseProps({
      dataLoaded: true,
      suspended: true,
      isSuspended: vi.fn(() => true),
    });

    renderHook(() => useDeferredPhotoGc(baseProps));

    expect(mocks.scheduleIdleWork).not.toHaveBeenCalled();
    expect(baseProps.gcOrphanedPhotos).not.toHaveBeenCalled();
  });

  it("rechecks the synchronous import guard before deleting photos", async () => {
    let importActive = false;
    const baseProps = createBaseProps({
      dataLoaded: true,
      isSuspended: vi.fn(() => importActive),
    });
    const { rerender } = renderHook((props) => useDeferredPhotoGc(props), {
      initialProps: baseProps,
    });

    expect(mocks.scheduleIdleWork).toHaveBeenCalledOnce();
    importActive = true;
    await act(async () => mocks.scheduledWork());
    expect(baseProps.gcOrphanedPhotos).not.toHaveBeenCalled();

    rerender({ ...baseProps, suspended: true });
    importActive = false;
    rerender({ ...baseProps, suspended: false, resumeKey: 1 });

    expect(mocks.scheduleIdleWork).toHaveBeenCalledTimes(2);
    await act(async () => mocks.scheduledWork());
    expect(baseProps.gcOrphanedPhotos).toHaveBeenCalledOnce();
  });

  it("allows a later retry when photo GC itself fails", async () => {
    const gcOrphanedPhotos = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValueOnce(undefined);
    const baseProps = createBaseProps({
      dataLoaded: true,
      gcOrphanedPhotos,
    });
    const { rerender } = renderHook((props) => useDeferredPhotoGc(props), {
      initialProps: baseProps,
    });

    await act(async () => mocks.scheduledWork());
    rerender({ ...baseProps, dataForPhotoGc: [{ id: 2 }] });

    expect(mocks.scheduleIdleWork).toHaveBeenCalledTimes(2);
    await act(async () => mocks.scheduledWork());
    expect(gcOrphanedPhotos).toHaveBeenCalledTimes(2);
  });
});
