import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import TileProgress from "./TileProgress";

// Resolves against the real English locale, so these assertions fail if the
// screen loses a translation rather than quietly falling back to the key.
vi.mock("@/app/hooks/useLanguage", async () => {
  const { englishLanguageHook } = await import("@/test/translate");
  return englishLanguageHook();
});

afterEach(cleanup);

function renderProgress(progress) {
  const { container } = render(<TileProgress progress={progress} />);
  return container;
}

/** Полоса — единственный вложенный `div` внутри корня компонента. */
function progressBar(container) {
  return container.firstChild?.querySelector("div") ?? null;
}

describe("TileProgress", () => {
  it("renders nothing until a download starts", () => {
    expect(renderProgress(null).firstChild).toBeNull();
  });

  it("shows the running percentage and a bar of that width", () => {
    const container = renderProgress({ done: 3, total: 12 });

    expect(screen.getByText("Downloading 25%")).toBeInTheDocument();
    expect(progressBar(container)).toHaveStyle({ width: "25%" });
  });

  /*
   * Тайлы считает та же величина, на которую делят. Пока их ноль — делить
   * не на что, и проценты должны остаться нулём, а не `NaN`.
   */
  it("stays at zero percent before the tile count is known", () => {
    renderProgress({ done: 0, total: 0 });

    expect(screen.getByText("Downloading 0%")).toBeInTheDocument();
  });

  it("counts what was fetched, what was already there, and what failed", () => {
    renderProgress({
      done: 10,
      total: 10,
      status: "success",
      stats: { saved: 6, alreadyCached: 3, failed: 1 },
    });

    expect(
      screen.getByText("✓ downloaded 6, cached 3, failed 1"),
    ).toBeInTheDocument();
  });

  it("omits the parts that counted nothing", () => {
    renderProgress({
      done: 4,
      total: 4,
      status: "success",
      stats: { saved: 4, alreadyCached: 0, failed: 0 },
    });

    expect(screen.getByText("✓ downloaded 4")).toBeInTheDocument();
  });

  /*
   * Повторное скачивание того же участка не сохраняет ни одного тайла — все
   * уже лежат в кэше. Ранний возврат про отказы сюда не попадает, и «скачано
   * 0» в подписи быть не должно.
   */
  it("omits the fetched part when everything was already cached", () => {
    renderProgress({
      done: 9,
      total: 9,
      status: "success",
      stats: { saved: 0, alreadyCached: 9, failed: 0 },
    });

    expect(screen.getByText("✓ cached 9")).toBeInTheDocument();
  });

  it("falls back to the total when the run kept no breakdown", () => {
    renderProgress({ done: 7, total: 7, status: "success" });

    expect(screen.getByText("✓ Saved 7 tiles")).toBeInTheDocument();
  });

  /*
   * Ни одного сохранённого тайла и ни одного уже лежавшего — говорить «скачано
   * 0» здесь не о чем, весь итог в числе отказов.
   */
  it("reports a run where every tile failed as a failure", () => {
    renderProgress({
      done: 5,
      total: 5,
      status: "error",
      stats: { saved: 0, alreadyCached: 0, failed: 5 },
    });

    expect(
      screen.getByText("✕ Failed to download 5 tiles"),
    ).toBeInTheDocument();
  });

  it("reports an error with no breakdown as a plain failure", () => {
    renderProgress({ done: 2, total: 9, status: "error" });

    expect(screen.getByText("✕ Download failed")).toBeInTheDocument();
  });

  it("says how far a cancelled download got", () => {
    renderProgress({ done: 4, total: 20, status: "cancelled" });

    expect(screen.getByText("Cancelled — saved 4 of 20")).toBeInTheDocument();
  });

  /*
   * Полоса — это индикатор идущей загрузки: у завершившейся её быть не должно,
   * чем бы та ни кончилась.
   */
  it("drops the progress bar once the download has finished", () => {
    for (const status of ["success", "error", "cancelled"]) {
      const container = renderProgress({ done: 1, total: 2, status });
      expect(progressBar(container)).toBeNull();
      cleanup();
    }
  });
});
