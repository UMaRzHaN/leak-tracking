import { Capacitor } from "@capacitor/core";
import { SpeechRecognition } from "@capacitor-community/speech-recognition";

/* ======================================
   SHARED STATE
====================================== */
let webRecognition = null;
let webBuffer = "";
let mobileBuffer = null;

/* ======================================
   START SPEECH RECOGNITION
====================================== */
export const startSpeechRecognition = async () => {
  /* ---------- 📱 MOBILE ---------- */
  if (Capacitor.isNativePlatform()) {
    const perm = await SpeechRecognition.requestPermissions();
    if (perm.speechRecognition !== "granted") {
      throw new Error("Нет доступа к микрофону");
    }

    const result = await SpeechRecognition.start({
      language: "ru-RU",
      popup: true,
    });

    mobileBuffer = result?.matches?.[0] || null;
    return;
  }

  /* ---------- 🖥 WEB ---------- */
  const SpeechAPI =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechAPI) {
    throw new Error("Голосовой ввод не поддерживается");
  }

  webBuffer = "";
  webRecognition = new SpeechAPI();

  webRecognition.lang = "ru-RU";
  webRecognition.interimResults = true;
  webRecognition.maxAlternatives = 1;

  webRecognition.onresult = (event) => {
    webBuffer = Array.from(event.results)
      .map(r => r[0].transcript)
      .join(" ");
  };

  webRecognition.start();
};

/* ======================================
   STOP SPEECH RECOGNITION
====================================== */
export const stopSpeechRecognition = async () => {
  /* ---------- 📱 MOBILE ---------- */
  if (Capacitor.isNativePlatform()) {
    await SpeechRecognition.stop();
    return mobileBuffer;
  }

  /* ---------- 🖥 WEB ---------- */
  if (webRecognition) {
    webRecognition.stop();
    webRecognition = null;
  }

  return webBuffer || null;
};
