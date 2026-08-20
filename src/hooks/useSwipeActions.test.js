import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSwipeActions } from "./useSwipeActions";

const touch = (x, y = 0) => ({ touches: [{ clientX: x, clientY: y }] });
const touchEnd = (x, y = 0) => ({
  changedTouches: [{ clientX: x, clientY: y }],
});

describe("useSwipeActions", () => {
  let handlers;

  beforeEach(() => {
    handlers = {
      onSwipeLeft: vi.fn(),
      onSwipeRight: vi.fn(),
      onSwipeMove: vi.fn(),
    };
  });

  const setup = (options = {}) =>
    renderHook(() => useSwipeActions({ ...handlers, ...options })).result
      .current;

  it("открывает детали жестом слева направо", () => {
    const swipe = setup();

    swipe.onTouchStart(touch(10));
    swipe.onTouchMove(touch(60));
    swipe.onTouchEnd(touchEnd(100));

    expect(handlers.onSwipeRight).toHaveBeenCalledOnce();
    expect(handlers.onSwipeLeft).not.toHaveBeenCalled();
    // Карточка возвращается на место, чем бы жест ни кончился.
    expect(handlers.onSwipeMove).toHaveBeenLastCalledWith(0);
  });

  it("открывает статус жестом справа налево", () => {
    const swipe = setup();

    swipe.onTouchStart(touch(200));
    swipe.onTouchEnd(touchEnd(100));

    expect(handlers.onSwipeLeft).toHaveBeenCalledOnce();
    expect(handlers.onSwipeRight).not.toHaveBeenCalled();
  });

  it("не считает жестом движение короче порога", () => {
    const swipe = setup({ threshold: 60 });

    swipe.onTouchStart(touch(10));
    swipe.onTouchEnd(touchEnd(69));

    expect(handlers.onSwipeLeft).not.toHaveBeenCalled();
    expect(handlers.onSwipeRight).not.toHaveBeenCalled();
    expect(handlers.onSwipeMove).toHaveBeenLastCalledWith(0);
  });

  it("отпускает жест, когда список прокручивают вертикально", () => {
    // Главное в этой защите: пролистывая базу пальцем вверх, человек не должен
    // случайно открыть карточку. Сдвиг по вертикали больше горизонтального в
    // полтора раза — это прокрутка, а не свайп.
    const swipe = setup();

    swipe.onTouchStart(touch(100, 100));
    swipe.onTouchMove(touch(120, 200));
    swipe.onTouchEnd(touchEnd(300, 200));

    expect(handlers.onSwipeRight).not.toHaveBeenCalled();
    expect(handlers.onSwipeLeft).not.toHaveBeenCalled();
  });

  it("после отмены по вертикали продолжение движения уже не считается", () => {
    const swipe = setup();

    swipe.onTouchStart(touch(100, 100));
    swipe.onTouchMove(touch(105, 200));
    handlers.onSwipeMove.mockClear();
    swipe.onTouchMove(touch(300, 200));

    expect(handlers.onSwipeMove).not.toHaveBeenCalled();
  });

  it("ведёт жест мышью так же, как пальцем", () => {
    const swipe = setup();

    swipe.onMouseDown({ clientX: 10, clientY: 0 });
    swipe.onMouseMove({ clientX: 50, clientY: 0 });
    swipe.onMouseUp({ clientX: 100, clientY: 0 });

    expect(handlers.onSwipeRight).toHaveBeenCalledOnce();
  });

  it("не путает мышь и палец на одном экране", () => {
    // Гибридные устройства шлют и то и другое; принимать оба потока сразу
    // значило бы считать один жест дважды.
    const swipe = setup();

    swipe.onMouseDown({ clientX: 10, clientY: 0 });
    swipe.onTouchMove(touch(200));
    swipe.onTouchEnd(touchEnd(200));

    expect(handlers.onSwipeRight).not.toHaveBeenCalled();

    swipe.onMouseUp({ clientX: 200, clientY: 0 });
    expect(handlers.onSwipeRight).toHaveBeenCalledOnce();
  });

  it("сообщает смещение по ходу жеста — иначе карточке нечего анимировать", () => {
    const swipe = setup();

    swipe.onTouchStart(touch(100));
    swipe.onTouchMove(touch(140));

    expect(handlers.onSwipeMove).toHaveBeenCalledWith(40);
  });
});
