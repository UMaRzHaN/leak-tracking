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

describe("useDeferredPhotoGc", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.scheduledWork = null;
  });

  it("waits for project data, runs once, and resets after project change", async () => {
    const gcOrphanedPhotos = vi.fn().mockResolvedValue(undefined);
    const baseProps = {
      activeProjectId: "project-a",
      dataForPhotoGc: [{ id: 1 }],
      dataLoaded: false,
      dataProjectId: "project-a",
      loadError: null,
      gcOrphanedPhotos,
    };
    const { rerender } = renderHook((props) => useDeferredPhotoGc(props), {
      initialProps: baseProps,
    });

    expect(mocks.scheduleIdleWork).not.toHaveBeenCalled();

    rerender({ ...baseProps, dataLoaded: true });
    expect(mocks.scheduleIdleWork).toHaveBeenCalledOnce();

    await act(async () => mocks.scheduledWork());
    expect(gcOrphanedPhotos).toHaveBeenCalledWith(baseProps.dataForPhotoGc);

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
});
