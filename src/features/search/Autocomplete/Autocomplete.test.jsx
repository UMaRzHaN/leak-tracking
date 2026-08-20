import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { translate } from "@/test/translate";

vi.mock("@/app/hooks/useLanguage", () => ({
  useLanguage: () => ({ t: translate }),
}));

import Autocomplete from "./Autocomplete";

const OPTIONS = ["Кран Шаровой", "Кран Пробковый", "Вентиль"];

function renderField(props = {}) {
  const onChange = props.onChange ?? vi.fn();
  const utils = render(
    <Autocomplete
      id="component"
      label="Компонент"
      value=""
      options={OPTIONS}
      onChange={onChange}
      {...props}
    />,
  );
  return { ...utils, onChange, input: screen.getByLabelText(/Компонент/) };
}

describe("Autocomplete", () => {
  it("предлагает совпадения по мере набора", () => {
    const { input } = renderField();

    fireEvent.change(input, { target: { value: "Кран" } });

    expect(screen.getByText("Кран Шаровой")).toBeTruthy();
    expect(screen.getByText("Кран Пробковый")).toBeTruthy();
    expect(screen.queryByText("Вентиль")).toBeNull();
  });

  it("подставляет выбранное значение", () => {
    const { input, onChange } = renderField();

    fireEvent.change(input, { target: { value: "Кран" } });
    fireEvent.click(screen.getByText("Кран Шаровой"));

    expect(onChange).toHaveBeenLastCalledWith("Кран Шаровой");
    expect(screen.queryByText("Кран Пробковый")).toBeNull();
  });

  /*
   * Escape снимает подсказки — и не больше.
   *
   * Карточку компонента и утечку заполняют внутри листа, который сам
   * закрывается по Escape, а слушает он на `document`. Пока подсказки открыты,
   * событие наверх не идёт: иначе попытка убрать перекрывший кнопку список
   * уносила бы всё набранное вместе с листом.
   */
  describe("Escape", () => {
    it("закрывает список подсказок", () => {
      const { input } = renderField();
      fireEvent.change(input, { target: { value: "Кран" } });
      expect(screen.getByText("Кран Шаровой")).toBeTruthy();

      fireEvent.keyDown(input, { key: "Escape" });

      expect(screen.queryByText("Кран Шаровой")).toBeNull();
    });

    it("оставляет набранное на месте", () => {
      const { input, onChange } = renderField();
      fireEvent.change(input, { target: { value: "Кран" } });
      onChange.mockClear();

      fireEvent.keyDown(input, { key: "Escape" });

      expect(input.value).toBe("Кран");
      expect(onChange).not.toHaveBeenCalled();
    });

    it("не пускает событие к листу, пока подсказки открыты", () => {
      const onEscapeAbove = vi.fn();
      document.addEventListener("keydown", onEscapeAbove);
      try {
        const { input } = renderField();
        fireEvent.change(input, { target: { value: "Кран" } });

        fireEvent.keyDown(input, { key: "Escape" });

        expect(onEscapeAbove).not.toHaveBeenCalled();
      } finally {
        document.removeEventListener("keydown", onEscapeAbove);
      }
    });

    // Список закрыт — Escape предназначен листу, и мешать нельзя.
    it("пропускает событие наверх, когда подсказок нет", () => {
      const onEscapeAbove = vi.fn();
      document.addEventListener("keydown", onEscapeAbove);
      try {
        const { input } = renderField();

        fireEvent.keyDown(input, { key: "Escape" });

        expect(onEscapeAbove).toHaveBeenCalled();
      } finally {
        document.removeEventListener("keydown", onEscapeAbove);
      }
    });

    it("пропускает событие наверх, когда ничего не совпало", () => {
      const onEscapeAbove = vi.fn();
      document.addEventListener("keydown", onEscapeAbove);
      try {
        const { input } = renderField();
        fireEvent.change(input, { target: { value: "щщщ" } });

        fireEvent.keyDown(input, { key: "Escape" });

        expect(onEscapeAbove).toHaveBeenCalled();
      } finally {
        document.removeEventListener("keydown", onEscapeAbove);
      }
    });

    it("не трогает другие клавиши", () => {
      const { input } = renderField();
      fireEvent.change(input, { target: { value: "Кран" } });

      fireEvent.keyDown(input, { key: "Enter" });

      expect(screen.getByText("Кран Шаровой")).toBeTruthy();
    });
  });
});
