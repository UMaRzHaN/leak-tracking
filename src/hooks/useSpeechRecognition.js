import { useRef } from "react";
import {
  startSpeechRecognition,
  stopSpeechRecognition,
} from "../services/speechService";

export const useSpeechRecognition = (onResult) => {
  const listeningRef = useRef(false);

  const start = async () => {
    if (listeningRef.current) return;
    listeningRef.current = true;

    await startSpeechRecognition();
  };

  const stop = async () => {
    if (!listeningRef.current) return;
    listeningRef.current = false;

    const text = await stopSpeechRecognition();
    if (text) onResult(text);
  };

  return { start, stop };
};
