import { Capacitor } from "@capacitor/core";
import { SpeechRecognition } from "@capacitor-community/speech-recognition";
import { normalizeSpokenNumber } from "../utils/normalizeSpokenNumber";

/* ======================================
   INTERNAL WEB INSTANCE (singleton)
====================================== */
let webRecognition = null;

/* ======================================
   START SPEECH RECOGNITION
====================================== */
export const startSpeechRecognition = async () => {
  /* ---------- 📱 MOBILE (CAPACITOR) ---------- */
  if (Capacitor.isNativePlatform()) {
    const perm = await SpeechRecognition.checkPermissions();
    if (perm.speechRecognition !== "granted") {
      const req = await SpeechRecognition.requestPermissions();
      if (req.speechRecognition !== "granted") {
        throw new Error("Нет доступа к микрофону");
      }
    }

    const result = await SpeechRecognition.start({
      language: "ru-RU",
      popup: true, // Google UI
    });
    const text = result?.matches?.[0] || null;
    return normalizeSpokenNumber(text);
  }

  /* ---------- 🖥 WEB (Web Speech API) ---------- */
  return new Promise((resolve, reject) => {
    const SpeechAPI =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechAPI) {
      reject(new Error("Голосовой ввод не поддерживается в этом браузере"));
      return;
    }

    webRecognition = new SpeechAPI();

    webRecognition.lang = "ru-RU";
    webRecognition.interimResults = false;
    webRecognition.maxAlternatives = 1;

    webRecognition.onresult = (event) => {
      const text = event.results?.[0]?.[0]?.transcript || null;
      resolve(normalizeSpokenNumber(text));
    };
    webRecognition.onerror = (event) => {
      reject(new Error(event.error || "Ошибка распознавания речи"));
    };

    webRecognition.onend = () => {
      // если пользователь ничего не сказал
      resolve(null);
    };

    webRecognition.start();
  });
};

/* ======================================
   STOP SPEECH RECOGNITION
====================================== */
export const stopSpeechRecognition = async () => {
  /* ---------- 📱 MOBILE ---------- */
  if (Capacitor.isNativePlatform()) {
    const result = await SpeechRecognition.stop();
    return result?.matches?.[0] || null;
  }

  /* ---------- 🖥 WEB ---------- */
  if (webRecognition) {
    webRecognition.stop();
    webRecognition = null;
  }

  // ⚠️ для web результат НЕ возвращается
  return null;
};
