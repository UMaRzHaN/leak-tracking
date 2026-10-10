import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import EditTextField from "./EditTextField";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key) => key }),
}));

describe("EditTextField", () => {
  it("показывает число без хвоста погрешности и не трогает его, пока не правят", () => {
    const onChange = vi.fn();
    render(
      <EditTextField
        label="Температура"
        numeric
        value={319.95 - 273.15}
        onChange={onChange}
      />,
    );

    const input = screen.getByLabelText("Температура");
    expect(input.value).toBe("46.8");
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "47" } });
    expect(onChange).toHaveBeenCalledWith(47);
  });

  it("текстовое поле выводит значение как есть", () => {
    render(<EditTextField label="Объект" value="КС-1" onChange={vi.fn()} />);
    expect(screen.getByLabelText("Объект").value).toBe("КС-1");
  });
});
