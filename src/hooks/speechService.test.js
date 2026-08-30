import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/utils/platform", () => ({ isNative: false }));

// Наверху, а не внутри describe: `vi.hoisted` всё равно поднимается выше всего
// файла, и запись внутри блока показывала порядок выполнения неверно. Vitest
// на это предупреждает и обещает сделать ошибкой.
const nativeMocks = vi.hoisted(() => ({
  requestPermissions: vi.fn(),
  start: vi.fn(),
}));

const { startSpeechRecognition, stopSpeechRecognition } =
  await import("./speechService");

/** Заглушка браузерного распознавания: та же форма, что у настоящего API. */
function fakeSpeechApi() {
  const instances = [];
  const Api = vi.fn(function () {
    this.start = vi.fn();
    this.stop = vi.fn();
    instances.push(this);
  });
  return { Api, instances };
}

/** Событие того вида, в каком его отдаёт браузер: список списков. */
function resultsEvent(...chunks) {
  return { results: chunks.map((text) => [{ transcript: text }]) };
}

afterEach(() => {
  delete window.SpeechRecognition;
  delete window.webkitSpeechRecognition;
});

describe("распознавание речи в браузере", () => {
  it("отказывается там, где браузер этого не умеет", async () => {
    await expect(startSpeechRecognition("ru")).rejects.toMatchObject({
      code: "VOICE_UNSUPPORTED",
    });
  });

  it("работает и через префиксный webkit-вариант", async () => {
    const { Api, instances } = fakeSpeechApi();
    window.webkitSpeechRecognition = Api;

    await startSpeechRecognition("ru");

    expect(instances).toHaveLength(1);
    expect(instances[0].start).toHaveBeenCalledOnce();
  });

  it("настраивается на язык интерфейса и слушает по ходу речи", async () => {
    const { Api, instances } = fakeSpeechApi();
    window.SpeechRecognition = Api;

    // Начало ничего не возвращает: текст соберётся к моменту остановки.
    await expect(startSpeechRecognition("en")).resolves.toBeNull();

    const recognition = instances[0];
    expect(recognition.lang).toBe("en-US");
    // Промежуточные результаты нужны, чтобы не терять начало фразы.
    expect(recognition.interimResults).toBe(true);
    expect(recognition.maxAlternatives).toBe(1);
  });

  it("склеивает распознанное и отдаёт его при остановке", async () => {
    const { Api, instances } = fakeSpeechApi();
    window.SpeechRecognition = Api;
    await startSpeechRecognition("ru");
    const recognition = instances[0];

    recognition.onresult(resultsEvent("задвижка", "тридцать два"));

    await expect(stopSpeechRecognition()).resolves.toBe(
      "задвижка тридцать два",
    );
    expect(recognition.stop).toHaveBeenCalledOnce();
  });

  it("каждый ответ браузера заменяет накопленное, а не дописывается к нему", async () => {
    // Браузер присылает всю фразу целиком на каждом обновлении, включая уже
    // сказанное. Складывать их значило бы получить «задвижка задвижка тридцать
    // два».
    const { Api, instances } = fakeSpeechApi();
    window.SpeechRecognition = Api;
    await startSpeechRecognition("ru");
    const recognition = instances[0];

    recognition.onresult(resultsEvent("задвижка"));
    recognition.onresult(resultsEvent("задвижка", "тридцать два"));

    await expect(stopSpeechRecognition()).resolves.toBe(
      "задвижка тридцать два",
    );
  });

  it("остановка без единого слова возвращает пустоту, а не пустую строку", async () => {
    const { Api } = fakeSpeechApi();
    window.SpeechRecognition = Api;
    await startSpeechRecognition("ru");

    await expect(stopSpeechRecognition()).resolves.toBeNull();
  });

  it("повторная остановка ничего не ломает", async () => {
    const { Api, instances } = fakeSpeechApi();
    window.SpeechRecognition = Api;
    await startSpeechRecognition("ru");
    instances[0].onresult(resultsEvent("кран"));

    await expect(stopSpeechRecognition()).resolves.toBe("кран");
    // Второй вызов уже не трогает распознавание: оно отпущено.
    await stopSpeechRecognition();
    expect(instances[0].stop).toHaveBeenCalledOnce();
  });
});

describe("распознавание речи на телефоне", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doMock("@/utils/platform", () => ({ isNative: true }));
    vi.doMock("@capacitor-community/speech-recognition", () => ({
      SpeechRecognition: {
        requestPermissions: nativeMocks.requestPermissions,
        start: nativeMocks.start,
      },
    }));
  });

  async function loadNative() {
    return await import("./speechService");
  }

  it("без разрешения на микрофон не начинает", async () => {
    nativeMocks.requestPermissions.mockResolvedValue({
      speechRecognition: "denied",
    });
    const service = await loadNative();

    await expect(service.startSpeechRecognition("ru")).rejects.toMatchObject({
      code: "MIC_DENIED",
    });
    expect(nativeMocks.start).not.toHaveBeenCalled();
  });

  it("возвращает лучший вариант из распознанных сразу", async () => {
    nativeMocks.requestPermissions.mockResolvedValue({
      speechRecognition: "granted",
    });
    nativeMocks.start.mockResolvedValue({
      matches: ["задвижка тридцать два", "задвижка 32"],
    });
    const service = await loadNative();

    await expect(service.startSpeechRecognition("ru")).resolves.toBe(
      "задвижка тридцать два",
    );
    expect(nativeMocks.start).toHaveBeenCalledWith({
      language: "ru-RU",
      popup: true,
    });
  });

  it("ничего не расслышав, возвращает пустоту", async () => {
    nativeMocks.requestPermissions.mockResolvedValue({
      speechRecognition: "granted",
    });
    nativeMocks.start.mockResolvedValue({ matches: [] });
    const service = await loadNative();

    await expect(service.startSpeechRecognition("ru")).resolves.toBeNull();
  });

  it("остановка на телефоне не нужна: результат приходит сразу", async () => {
    const service = await loadNative();

    await expect(service.stopSpeechRecognition()).resolves.toBeNull();
  });
});
