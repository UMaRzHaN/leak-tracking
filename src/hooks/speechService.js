import { isNative } from "@/utils/platform";
import { SpeechRecognition } from "@capacitor-community/speech-recognition";
import { getSpeechLocale } from "@/utils/locale";

let webRecognition = null;
let webBuffer = "";

export const startSpeechRecognition = async (language) => {
  const speechLocale = getSpeechLocale(language);

  if (isNative) {
    const perm = await SpeechRecognition.requestPermissions();
    if (perm.speechRecognition !== "granted") {
      throw new Error("Нет доступа к микрофону");
    }

    const result = await SpeechRecognition.start({
      language: speechLocale,
      popup: true,
    });

    return result?.matches?.[0] || null;
  }

  const SpeechAPI = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechAPI) {
    throw new Error("Голосовой ввод не поддерживается");
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
