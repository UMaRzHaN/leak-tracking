import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/utils/platform", () => ({ isNative: false }));
vi.mock("@/app/hooks/useLanguage", () => ({
  useLanguage: () => ({ t: (key) => key }),
}));

const VoiceButton = (await import("./VoiceButton")).default;

function setup() {
  const start = vi.fn();
  const stop = vi.fn();
  render(<VoiceButton startVoiceInput={start} stopVoiceInput={stop} />);
  return { start, stop, button: screen.getByRole("button") };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("VoiceButton в браузере", () => {
  it("эмулированные mouse-события после касания не запускают второй сеанс", () => {
    // Мобильный браузер после touchend досылает mousedown/mouseup: сеанс уже
    // остановлен, и mousedown включал микрофон снова.
    const { start, stop, button } = setup();

    fireEvent.touchStart(button);
    fireEvent.touchEnd(button);
    fireEvent.mouseDown(button);
    fireEvent.mouseUp(button);

    expect(start).toHaveBeenCalledOnce();
    expect(stop).toHaveBeenCalledOnce();
  });

  it("мышью без касания работает как прежде", () => {
    vi.useFakeTimers();
    const { start, stop, button } = setup();

    fireEvent.mouseDown(button);
    fireEvent.mouseUp(button);
    expect(start).toHaveBeenCalledOnce();
    expect(stop).toHaveBeenCalledOnce();

    // И после касания — тоже, как только эхо касания прошло.
    fireEvent.touchStart(button);
    fireEvent.touchEnd(button);
    vi.advanceTimersByTime(1000);
    fireEvent.mouseDown(button);
    expect(start).toHaveBeenCalledTimes(3);
  });
});
