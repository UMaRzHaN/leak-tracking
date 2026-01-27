import { useState, useCallback } from "react";
import { useSpeechRecognition } from "../../hooks/useSpeechRecognition";
import { handleVoiceText } from "../../utils/voice/handleVoiceText";
import { useProjectConfig } from "../settings/useProjectConfig";

export function useVoiceControl(setPage) {
  const projectConfig = useProjectConfig();
  const [voiceData, setVoiceData] = useState(null);

  const clearVoiceData = useCallback(() => {
    setVoiceData(null);
  }, []);

  const onSpeechResult = useCallback(
    (text) => {
      handleVoiceText(
        text,
        projectConfig?.voice?.pipeline,
        setVoiceData,
        setPage,
      );
    },
    [projectConfig, setPage],
  );

  const { start, stop } = useSpeechRecognition(onSpeechResult);

  return {
    voiceData,
    clearVoiceData,
    startVoiceInput: start,
    stopVoiceInput: stop,
  };
}
