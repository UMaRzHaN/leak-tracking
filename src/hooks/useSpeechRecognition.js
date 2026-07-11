import { useRef } from "react";
import { startSpeechRecognition, stopSpeechRecognition } from "./speechService";
import { isNative } from "@/utils/platform";

export const useSpeechRecognition = (onResult, language) => {
  const listeningRef = useRef(false);

  const start = async () => {
    if (listeningRef.current) return;
    listeningRef.current = true;

    try {
      if (isNative) {
        const text = await startSpeechRecognition(language);
        if (text) onResult(text);
        listeningRef.current = false;
        return;
      }

      await startSpeechRecognition(language);
    } catch (e) {
      console.warn("Speech start failed", e);
      listeningRef.current = false;
    }
  };

  const stop = async () => {
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
