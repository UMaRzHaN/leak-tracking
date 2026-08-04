import { beforeEach, describe, expect, it, vi } from "vitest";
import { translate } from "@/test/translate";

vi.mock("@/utils/logger", () => ({
  logger: {
    error: vi.fn(),
  },
}));

const loggerModule = await import("@/utils/logger");
const { handleExport } = await import("./handleExport");

describe("handleExport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports an error when there is no data to export", async () => {
    const onError = vi.fn();

    await handleExport({
      leaks: [],
      saveFn: vi.fn(),
      onError,
      t: translate,
    });

    expect(onError).toHaveBeenCalledWith("No data to export");
  });

  it("reports an error when export function is unavailable", async () => {
    const onError = vi.fn();

    await handleExport({
      leaks: [{ id: "l1" }],
      saveFn: null,
      onError,
      t: translate,
    });

    expect(onError).toHaveBeenCalledWith(
      "Export is not available for this project",
    );
  });

  it("logs and reports generic export error when save fails", async () => {
    const onError = vi.fn();

    await handleExport({
      leaks: [{ id: "l1" }],
      saveFn: vi.fn().mockRejectedValue(new Error("boom")),
      onError,
      t: translate,
    });

    expect(loggerModule.logger.error).toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith("Export error");
  });
});
