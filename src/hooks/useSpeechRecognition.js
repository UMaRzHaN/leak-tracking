import { useRef } from "react";
import {
  startSpeechRecognition,
  stopSpeechRecognition,
} from "../services/speechService";

export const useSpeechRecognition = (onResult) => {
  const busyRef = useRef(false);

  const start = async () => {
    if (busyRef.current) return;
    busyRef.current = true;

    try {
      const text = await startSpeechRecognition();
      if (text) onResult(text);
    } finally {
      busyRef.current = false;
    }
  };

  const stop = async () => {
    if (!busyRef.current) return;

    try {
      const text = await stopSpeechRecognition();
      if (text) onResult(text);
    } finally {
      busyRef.current = false;
    }
  };

  return { start, stop };
};
