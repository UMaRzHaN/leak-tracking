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

function ProjectStorageCrash() {
  const error = new Error("corrupted");
  error.code = "PROJECT_LIST_READ_FAILED";
  error.recoveryValue = "{broken";
  throw error;
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
    expect(screen.getAllByRole("button")).toHaveLength(3);
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

  it("offers a non-looping recovery flow for a corrupted project list", () => {
    render(
      <ErrorBoundary>
        <ProjectStorageCrash />
      </ErrorBoundary>,
    );

    expect(screen.getByText("Повреждён список проектов")).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: "Скачать данные для восстановления",
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: "Сохранить копию и сбросить список",
      }),
    ).toBeTruthy();
    expect(screen.queryByText("Попробовать снова")).toBeNull();
  });
});
