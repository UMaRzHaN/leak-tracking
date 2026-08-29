import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  stop: vi.fn(),
  warn: vi.fn(),
}));

vi.mock("./speechService", () => ({
  startSpeechRecognition: mocks.start,
  stopSpeechRecognition: mocks.stop,
}));
vi.mock("@/utils/logger", () => ({ logger: { warn: mocks.warn } }));
vi.mock("@/utils/platform", () => ({ isNative: false }));

const { useSpeechRecognition } = await import("./useSpeechRecognition");

function renderVoice() {
  const onResult = vi.fn();
  const { result } = renderHook(() => useSpeechRecognition(onResult, "ru"));
  return { voice: result.current, onResult };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.stop.mockResolvedValue(null);
});

describe("useSpeechRecognition в браузере", () => {
  it("слушает, пока держат кнопку, и отдаёт текст на отпускании", async () => {
    mocks.stop.mockResolvedValue("задвижка тридцать два");
    const { voice, onResult } = renderVoice();

    await voice.start();
    expect(mocks.start).toHaveBeenCalledWith("ru");
    // Пока слушают, отдавать нечего.
    expect(onResult).not.toHaveBeenCalled();

    await voice.stop();
    expect(onResult).toHaveBeenCalledWith("задвижка тридцать два");
  });

  it("второе нажатие не начинает второе распознавание", async () => {
    const { voice } = renderVoice();

    await voice.start();
    await voice.start();

    expect(mocks.start).toHaveBeenCalledOnce();
  });

  it("остановка без начала ничего не делает", async () => {
    const { voice } = renderVoice();

    await voice.stop();

    expect(mocks.stop).not.toHaveBeenCalled();
  });

  it("нераспознанное молчание не дёргает форму", async () => {
    mocks.stop.mockResolvedValue(null);
    const { voice, onResult } = renderVoice();

    await voice.start();
    await voice.stop();

    expect(onResult).not.toHaveBeenCalled();
  });

  it("отказ на старте отпускает кнопку, а не запирает её навсегда", async () => {
    // Без сброса признака следующее нажатие считалось бы повторным, и
    // голосовой ввод переставал работать до перезагрузки экрана.
    mocks.start.mockRejectedValueOnce(new Error("Нет доступа к микрофону"));
    const { voice } = renderVoice();

    await voice.start();
    expect(mocks.warn).toHaveBeenCalled();

    mocks.start.mockResolvedValue(null);
    await voice.start();
    expect(mocks.start).toHaveBeenCalledTimes(2);
  });

  it("отказ на остановке тоже отпускает кнопку", async () => {
    mocks.stop.mockRejectedValueOnce(new Error("распознавание отвалилось"));
    const { voice, onResult } = renderVoice();
    await voice.start();

    await voice.stop();

    expect(mocks.warn).toHaveBeenCalled();
    expect(onResult).not.toHaveBeenCalled();
    // Кнопка снова рабочая.
    await voice.start();
    expect(mocks.start).toHaveBeenCalledTimes(2);
  });
});

describe("useSpeechRecognition на телефоне", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doMock("@/utils/platform", () => ({ isNative: true }));
    vi.doMock("./speechService", () => ({
      startSpeechRecognition: mocks.start,
      stopSpeechRecognition: mocks.stop,
    }));
    vi.doMock("@/utils/logger", () => ({ logger: { warn: mocks.warn } }));
  });

  async function renderNativeVoice() {
    const { useSpeechRecognition: hook } =
      await import("./useSpeechRecognition");
    const onResult = vi.fn();
    const { result } = renderHook(() => hook(onResult, "ru"));
    return { voice: result.current, onResult };
  }

  it("получает текст сразу на старте: диалог системы уже всё спросил", async () => {
    mocks.start.mockResolvedValue("кран шаровой");
    const { voice, onResult } = await renderNativeVoice();

    await voice.start();

    expect(onResult).toHaveBeenCalledWith("кран шаровой");
  });

  it("отдельной остановки на телефоне нет", async () => {
    mocks.start.mockResolvedValue("кран");
    const { voice } = await renderNativeVoice();
    await voice.start();

    await voice.stop();

    expect(mocks.stop).not.toHaveBeenCalled();
  });

  it("после отданного результата кнопка снова свободна", async () => {
    mocks.start.mockResolvedValue("кран");
    const { voice } = await renderNativeVoice();

    await voice.start();
    await voice.start();

    expect(mocks.start).toHaveBeenCalledTimes(2);
  });
});
