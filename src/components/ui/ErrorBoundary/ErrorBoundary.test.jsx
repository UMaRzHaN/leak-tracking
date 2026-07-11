import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ErrorBoundary from "./ErrorBoundary";
import { logger } from "@/utils/logger";

vi.mock("@/utils/logger", () => ({
  logger: {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

function Crashy({ shouldThrow }) {
  if (shouldThrow) {
    throw new Error("boom");
  }

  return <div>safe content</div>;
}

describe("ErrorBoundary", () => {
  let consoleErrorSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("renders fallback UI and logs the caught error", () => {
    render(
      <ErrorBoundary>
        <Crashy shouldThrow />
      </ErrorBoundary>,
    );

    expect(screen.getByText("boom")).toBeTruthy();
    expect(screen.getAllByRole("button")).toHaveLength(2);
    expect(logger.error).toHaveBeenCalledWith(
      "[ErrorBoundary]",
      expect.any(Error),
      expect.objectContaining({
        componentStack: expect.any(String),
      }),
    );
  });

  it("can recover after retry when the child stops throwing", () => {
    const { rerender } = render(
      <ErrorBoundary>
        <Crashy shouldThrow />
      </ErrorBoundary>,
    );

    rerender(
      <ErrorBoundary>
        <Crashy shouldThrow={false} />
      </ErrorBoundary>,
    );

    const [retryButton] = screen.getAllByRole("button");
    fireEvent.click(retryButton);

    expect(screen.getByText("safe content")).toBeTruthy();
  });
});
