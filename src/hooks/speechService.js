import { appError } from "@/utils/appError";
import { isNative } from "@/utils/platform";
import { getSpeechLocale } from "@/utils/locale";

let webRecognition = /** @type {any} */ (null);
let webBuffer = "";

export const startSpeechRecognition = async (language) => {
  const speechLocale = getSpeechLocale(language);

  if (isNative) {
    // Плагин подтягивается по нажатию, а не при загрузке приложения: чанк
    // Capacitor общий на все плагины, и статический импорт затаскивал
    // распознавание речи на первый экран вместе с камерой и сканером.
    const { SpeechRecognition } =
      await import("@capacitor-community/speech-recognition");
    const perm = await SpeechRecognition.requestPermissions();
    if (perm.speechRecognition !== "granted") {
      throw appError("MIC_DENIED", "Нет доступа к микрофону");
    }

    const result = await SpeechRecognition.start({
      language: speechLocale,
      popup: true,
    });

    return result?.matches?.[0] || null;
  }

  const SpeechAPI = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechAPI) {
    throw appError("VOICE_UNSUPPORTED", "Голосовой ввод не поддерживается");
  }

  webBuffer = "";
  webRecognition = new SpeechAPI();
  webRecognition.lang = speechLocale;
  webRecognition.interimResults = true;
  webRecognition.maxAlternatives = 1;

  webRecognition.onresult = (event) => {
    webBuffer = Array.from(event.results)
      .map((result) => result[0].transcript)
      .join(" ");
  };

  webRecognition.start();
  return null;
};

export const stopSpeechRecognition = async () => {
  if (isNative) return null;

  if (webRecognition) {
    webRecognition.stop();
    webRecognition = null;
  }

  return webBuffer || null;
};
