import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SchemaViewer from "./SchemaViewer";

const texts = { fit: "Fit", close: "Close", hint: "Pinch to zoom" };

function open(props = {}) {
  const onClose = vi.fn();
  const view = render(
    <SchemaViewer
      src="/schemas/obvyazka.png"
      alt="Обвязка устья"
      texts={texts}
      onClose={onClose}
      {...props}
    />,
  );
  return { onClose, ...view };
}

const drawing = () => screen.getByAltText("Обвязка устья");
const frame = () => drawing().parentElement;
const zoom = () => screen.getByText(/%$/).textContent;
const transform = () => drawing().style.transform;

const zoomIn = (times = 1) => {
  for (let i = 0; i < times; i += 1) {
    fireEvent.wheel(frame(), { deltaY: -10 });
  }
};
const zoomOut = (times = 1) => {
  for (let i = 0; i < times; i += 1) {
    fireEvent.wheel(frame(), { deltaY: 10 });
  }
};

describe("SchemaViewer", () => {
  it("открывает чертёж по размеру кадра", () => {
    open();

    expect(zoom()).toBe("100%");
    expect(screen.getByRole("button", { name: "Fit" })).toBeDisabled();
  });

  it("не приближает дальше предела и не отдаляет мельче кадра", () => {
    open();

    zoomIn(40);
    expect(zoom()).toBe("800%");

    zoomOut(80);
    expect(zoom()).toBe("100%");
  });

  it("возвращает чертёж в кадр, когда его отдаляют обратно", () => {
    // Иначе уведённый в сторону и отдалённый чертёж оставляет пустую рамку.
    open();
    zoomIn(10);

    fireEvent.pointerDown(frame(), { pointerId: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(frame(), {
      pointerId: 1,
      clientX: 400,
      clientY: 300,
    });
    fireEvent.pointerUp(frame(), { pointerId: 1 });
    expect(transform()).toContain("translate(400px, 300px)");

    zoomOut(40);
    expect(transform()).toContain("translate(0px, 0px)");
  });

  it("не двигает чертёж, который и так помещается", () => {
    open();

    fireEvent.pointerDown(frame(), { pointerId: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(frame(), {
      pointerId: 1,
      clientX: 200,
      clientY: 200,
    });

    expect(transform()).toContain("translate(0px, 0px)");
  });

  it("двойным касанием приближает и возвращает обратно", () => {
    const now = vi.spyOn(Date, "now");
    now.mockReturnValue(1000);
    open();

    fireEvent.click(frame());
    now.mockReturnValue(1100);
    fireEvent.click(frame());
    expect(zoom()).toBe("300%");

    // Второй двойной тап отделён паузой — иначе это один непрерывный дробный
    // тап, в котором каждое касание после первого переключает масштаб.
    now.mockReturnValue(5000);
    fireEvent.click(frame());
    now.mockReturnValue(5100);
    fireEvent.click(frame());
    expect(zoom()).toBe("100%");

    now.mockRestore();
  });

  it("одиночные касания с паузой не считаются двойным", () => {
    const now = vi.spyOn(Date, "now");
    now.mockReturnValue(1000);
    open();

    fireEvent.click(frame());
    now.mockReturnValue(2000);
    fireEvent.click(frame());

    expect(zoom()).toBe("100%");
    now.mockRestore();
  });

  it("новый чертёж открывается заново, а не с прежним увеличением", () => {
    const { rerender } = open();
    zoomIn(10);
    expect(zoom()).not.toBe("100%");

    rerender(
      <SchemaViewer
        src="/schemas/second.png"
        alt="Обвязка устья"
        texts={texts}
        onClose={vi.fn()}
      />,
    );

    expect(zoom()).toBe("100%");
  });

  it("приближает щипком и удерживает предел", () => {
    // Основной жест на телефоне: пальцы разводят, чтобы прочитать позиционные
    // номера — ради них чертёж и не ужимают на входе.
    open();

    fireEvent.pointerDown(frame(), {
      pointerId: 1,
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerDown(frame(), {
      pointerId: 2,
      clientX: 200,
      clientY: 100,
    });
    fireEvent.pointerMove(frame(), {
      pointerId: 2,
      clientX: 400,
      clientY: 100,
    });

    expect(zoom()).toBe("300%");

    // Дальше предела не пускает и щипок.
    fireEvent.pointerMove(frame(), {
      pointerId: 2,
      clientX: 4000,
      clientY: 100,
    });
    expect(zoom()).toBe("800%");

    // Отпущенный второй палец переводит жест обратно в перетаскивание.
    fireEvent.pointerUp(frame(), { pointerId: 2 });
    fireEvent.pointerMove(frame(), {
      pointerId: 1,
      clientX: 150,
      clientY: 130,
    });
    expect(transform()).toContain("translate(50px, 30px)");
  });

  it("закрывается кнопкой и щелчком по фону", () => {
    // Полноэкранный просмотр когда-то не оставлял, куда нажать: чертёж
    // закрывал и навигацию тоже.
    const { onClose, container } = open();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    // Фон — первый слой оверлея, под самим листом.
    fireEvent.click(container.firstChild.firstChild);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
