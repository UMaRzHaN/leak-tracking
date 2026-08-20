import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  preserveAndReset: vi.fn(),
  exportDiagnostics: vi.fn(() => '{"entries":[]}'),
  error: vi.fn(),
}));

vi.mock("@/app/project/projectStorage", () => ({
  preserveAndResetCorruptedProjects: mocks.preserveAndReset,
}));
vi.mock("@/utils/logger", () => ({
  logger: { error: mocks.error, exportDiagnostics: mocks.exportDiagnostics },
}));

const ErrorBoundary = (await import("./ErrorBoundary")).default;

function Boom({ error }) {
  throw error;
}

const corrupted = () => {
  const error = new Error("project list is not JSON");
  error.code = "PROJECT_LIST_READ_FAILED";
  error.recoveryValue = '{"broken":';
  return error;
};

let click;
let reload;
let consoleError;

beforeEach(() => {
  vi.clearAllMocks();
  globalThis.URL.createObjectURL = vi.fn(() => "blob:recovery");
  globalThis.URL.revokeObjectURL = vi.fn();
  // Скачивание — клик по невидимой ссылке; jsdom считает его переходом.
  click = vi
    .spyOn(globalThis.HTMLAnchorElement.prototype, "click")
    .mockImplementation(() => {});
  reload = vi.fn();
  vi.stubGlobal("location", { ...window.location, reload });
  // React печатает пойманную ошибку сам; в выводе теста это шум.
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  click.mockRestore();
  consoleError.mockRestore();
  vi.unstubAllGlobals();
});

describe("ErrorBoundary", () => {
  it("не мешает, пока ничего не сломалось", () => {
    render(
      <ErrorBoundary>
        <p>рабочий экран</p>
      </ErrorBoundary>,
    );

    expect(screen.getByText("рабочий экран")).toBeInTheDocument();
    expect(mocks.error).not.toHaveBeenCalled();
  });

  describe("обычная поломка", () => {
    const renderBroken = () =>
      render(
        <ErrorBoundary>
          <Boom error={new Error("вкладка не открылась")} />
        </ErrorBoundary>,
      );

    it("показывает, что именно случилось, и пишет в диагностику", () => {
      renderBroken();

      expect(screen.getByText("вкладка не открылась")).toBeInTheDocument();
      expect(mocks.error).toHaveBeenCalledWith(
        "[ErrorBoundary]",
        expect.any(Error),
        expect.anything(),
      );
    });

    it("«попробовать снова» возвращает к работе, если причина ушла", () => {
      // Кнопка снимает состояние ошибки и рисует детей заново: поможет она
      // только тогда, когда падать больше нечему.
      let failing = true;
      const Flaky = () => {
        if (failing) throw new Error("вкладка не открылась");
        return <p>рабочий экран</p>;
      };

      render(
        <ErrorBoundary>
          <Flaky />
        </ErrorBoundary>,
      );
      expect(screen.getByText("вкладка не открылась")).toBeInTheDocument();

      failing = false;
      fireEvent.click(screen.getByText("Попробовать снова"));

      expect(screen.getByText("рабочий экран")).toBeInTheDocument();
    });

    it("отдаёт диагностику файлом", () => {
      renderBroken();

      fireEvent.click(screen.getByText("Скачать диагностику"));

      expect(mocks.exportDiagnostics).toHaveBeenCalled();
      expect(click).toHaveBeenCalledOnce();
    });

    it("перезагружает приложение по просьбе", () => {
      renderBroken();

      fireEvent.click(screen.getByText("Перезагрузить приложение"));

      expect(reload).toHaveBeenCalledOnce();
    });
  });

  describe("повреждённый список проектов", () => {
    const renderCorrupted = (error = corrupted()) =>
      render(
        <ErrorBoundary>
          <Boom error={error} />
        </ErrorBoundary>,
      );

    it("объясняет отдельно, а не общей ошибкой", () => {
      renderCorrupted();

      expect(screen.getByText("Повреждён список проектов")).toBeInTheDocument();
      expect(screen.queryByText("Что-то пошло не так")).not.toBeInTheDocument();
    });

    it("даёт скачать исходное значение до сброса", () => {
      renderCorrupted();

      fireEvent.click(screen.getByText("Скачать данные для восстановления"));

      expect(globalThis.URL.createObjectURL).toHaveBeenCalledOnce();
      expect(click).toHaveBeenCalledOnce();
    });

    it("не предлагает скачивание, когда сохранять нечего", () => {
      const error = corrupted();
      delete error.recoveryValue;

      renderCorrupted(error);

      expect(
        screen.queryByText("Скачать данные для восстановления"),
      ).not.toBeInTheDocument();
      // Сброс всё равно доступен: без него приложение не открыть.
      expect(
        screen.getByText("Сохранить копию и сбросить список"),
      ).toBeInTheDocument();
    });

    it("сбрасывает список, отдав повреждённое значение на сохранение", () => {
      // Это единственная необратимая кнопка на экране: важно, что исходное
      // значение уходит в сохранение, а не стирается вместе со списком.
      renderCorrupted();

      fireEvent.click(screen.getByText("Сохранить копию и сбросить список"));

      expect(mocks.preserveAndReset).toHaveBeenCalledWith('{"broken":');
      expect(reload).toHaveBeenCalledOnce();
    });
  });
});
