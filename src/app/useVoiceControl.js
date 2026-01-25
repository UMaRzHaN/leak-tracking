import { useState, useCallback } from "react";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition";
import { handleVoiceText } from "../utils/handleVoiceText";

export function useVoiceControl(setPage) {
  const [voiceData, setVoiceData] = useState(null);

  const clearVoiceData = useCallback(() => {
    setVoiceData(null);
  }, []);

  const { start, stop } = useSpeechRecognition((text) => {
    handleVoiceText(text, setVoiceData, setPage);
  });

  return {
    voiceData,
    clearVoiceData,
    startVoiceInput: start,
    stopVoiceInput: stop,
  };
}
