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
      // 📱 Mobile → сразу возвращает результат
      if (isNative) {
        const text = await startSpeechRecognition();
        if (text) onResult(text);
        listeningRef.current = false;
        return;
      }

      // 🌐 Web → просто запускаем распознавание
      await startSpeechRecognition();
    } catch (e) {
      console.warn("Speech start failed", e);
      listeningRef.current = false;
    }
  };

  const stop = async () => {
    // 📱 Mobile → stop не используется
    if (isNative) return;
    if (!listeningRef.current) return;

    try {
      const text = await stopSpeechRecognition();
      if (text) onResult(text);
    } catch (e) {
      console.warn("Speech stop failed", e);
    } finally {
      listeningRef.current = false;
    }
  };

  return { start, stop };
};
