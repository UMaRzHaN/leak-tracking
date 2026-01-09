import { Capacitor } from "@capacitor/core";
import { SpeechRecognition } from "@capacitor-community/speech-recognition";

export const startSpeechRecognition = async () => {
  if (!Capacitor.isNativePlatform()) {
    throw new Error("SpeechRecognition доступен только на мобильных");
  }

  const perm = await SpeechRecognition.checkPermissions();
  if (perm.speechRecognition !== "granted") {
    const req = await SpeechRecognition.requestPermissions();
    if (req.speechRecognition !== "granted") {
      throw new Error("Нет доступа к микрофону");
    }
  }

  const result = await SpeechRecognition.start({
    language: "ru-RU",
    popup: true,
  });

  return result?.matches?.[0] || null;
};

export const stopSpeechRecognition = async () => {
  const result = await SpeechRecognition.stop();
  return result?.matches?.[0] || null;
};
