import { useState, useCallback } from "react";
import { useSpeechRecognition } from "../../hooks/useSpeechRecognition";
import { handleVoiceText } from "../../utils/voice/handleVoiceText";
import { useProjectConfig } from "../settings/useProjectConfig";
import { useProject } from "../settings/ProjectContext";

export function useVoiceControl() {
  const projectConfig = useProjectConfig();
  const { project } = useProject();
  const [voiceData, setVoiceData] = useState(null);

  const clearVoiceData = useCallback(() => {
    setVoiceData(null);
  }, []);

  const onSpeechResult = useCallback(
    (text) => {
      const synonymsFields = projectConfig?.voice?.synonymsFields ?? [];
      handleVoiceText(synonymsFields, text, setVoiceData, project);
    },
    [projectConfig, project],
  );

  const { start, stop } = useSpeechRecognition(onSpeechResult);

  return {
    voiceData,
    clearVoiceData,
    startVoiceInput: start,
    stopVoiceInput: stop,
  };
}
