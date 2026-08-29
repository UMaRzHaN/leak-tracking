import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", async () => {
  const { translate } = await import("@/test/translate");
  return { useTranslation: () => ({ t: translate, i18n: { language: "en" } }) };
});

const PhotoViewer = (await import("./PhotoViewer")).default;

const photos = ["blob:до", "blob:в-ремонте", "blob:после"];
const labels = ["До", "В ремонте", "После"];

function renderViewer(props = {}) {
  const onClose = vi.fn();
  const result = render(<PhotoViewer onClose={onClose} {...props} />);
  return { ...result, onClose };
}

describe("PhotoViewer", () => {
  it("не рисует ничего, когда показывать нечего", () => {
    const { container } = renderViewer({ photos: [] });

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("одиночный снимок открывается без стрелок", () => {
    renderViewer({ src: "blob:один" });

    expect(screen.getByRole("img")).toHaveAttribute("src", "blob:один");
    expect(screen.queryByLabelText("Previous photo")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Next photo")).not.toBeInTheDocument();
  });

  it("листает вперёд и назад, показывая подпись текущего снимка", () => {
    renderViewer({ photos, labels });

    // На первом снимке назад некуда.
    expect(screen.queryByLabelText("Previous photo")).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Next photo"));
    expect(screen.getByRole("img")).toHaveAttribute("src", "blob:в-ремонте");
    expect(screen.getByText("В ремонте")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Previous photo"));
    expect(screen.getByRole("img")).toHaveAttribute("src", "blob:до");
  });

  it("на последнем снимке вперёд некуда", () => {
    renderViewer({ photos, initialIndex: 2 });

    expect(screen.getByRole("img")).toHaveAttribute("src", "blob:после");
    expect(screen.queryByLabelText("Next photo")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Previous photo")).toBeInTheDocument();
  });

  it("клавиатура листает и закрывает", () => {
    const { onClose } = renderViewer({ photos });

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByRole("img")).toHaveAttribute("src", "blob:в-ремонте");

    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(screen.getByRole("img")).toHaveAttribute("src", "blob:до");

    // За край не уходит: стрелка влево на первом снимке ничего не меняет.
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(screen.getByRole("img")).toHaveAttribute("src", "blob:до");

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("клик по самому снимку не закрывает просмотр", () => {
    const { onClose } = renderViewer({ photos });

    fireEvent.click(screen.getByRole("img"));

    expect(onClose).not.toHaveBeenCalled();
  });

  it("закрывается по фону", () => {
    const { onClose } = renderViewer({ photos });

    fireEvent.click(screen.getByRole("dialog"));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("закрывается по крестику", () => {
    const { onClose } = renderViewer({ photos });

    fireEvent.click(screen.getByLabelText("Close"));

    expect(onClose).toHaveBeenCalled();
  });

  it("клик по стрелке не закрывает просмотр заодно с перелистыванием", () => {
    // Стрелка лежит поверх фона, который закрывает окно: без остановки
    // всплытия один клик и листал бы, и закрывал.
    const { onClose } = renderViewer({ photos });

    fireEvent.click(screen.getByLabelText("Next photo"));

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("img")).toHaveAttribute("src", "blob:в-ремонте");
  });

  it("считает снимки в подсказке и подписывает счётчиком только пачку", () => {
    const { unmount } = renderViewer({ photos });
    expect(
      screen.getByText("1 / 3 · arrow keys or swipe to navigate"),
    ).toBeInTheDocument();
    unmount();

    renderViewer({ src: "blob:один" });
    expect(
      screen.getByText("Tap outside the photo to close"),
    ).toBeInTheDocument();
  });

  it("возвращает странице прокрутку, когда закрывается", () => {
    const { unmount } = renderViewer({ photos });
    expect(document.body.style.overflow).toBe("hidden");

    unmount();
    expect(document.body.style.overflow).toBe("");
  });
});
