import { useRef } from "react";
import {
  startSpeechRecognition,
  stopSpeechRecognition,
} from "../services/speechService";
import { Capacitor } from "@capacitor/core";

export const useSpeechRecognition = (onResult) => {
  const listeningRef = useRef(false);
  const isNative = Capacitor.isNativePlatform();

  const start = async () => {
    if (listeningRef.current) return;
    listeningRef.current = true;

    try {
      const text = await startSpeechRecognition();

      // 📱 mobile: результат может быть null (отмена)
      if (isNative && text) {
        onResult(text);
      }
    } catch (e) {
      console.warn("Speech cancelled or failed", e);
    } finally {
      // 🔑 ВСЕГДА сбрасываем состояние
      listeningRef.current = false;
    }
  };

  const stop = async () => {
    if (isNative) return;
    if (!listeningRef.current) return;

    listeningRef.current = false;
    const text = await stopSpeechRecognition();
    if (text) onResult(text);
  };

  return { start, stop };
};
