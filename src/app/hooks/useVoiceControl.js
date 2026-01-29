import { useState, useCallback, useEffect } from "react";
import { useSpeechRecognition } from "../../hooks/useSpeechRecognition";
import { handleVoiceText } from "../../utils/voice/handleVoiceText";
import { useProjectConfig } from "../settings/useProjectConfig";
import { useProject } from "../settings/ProjectContext";

export function useVoiceControl(setPage) {
  const projectConfig = useProjectConfig();
  const { project } = useProject();
  const [voiceData, setVoiceData] = useState(null);

  useEffect(() => {
    console.log(voiceData);
  }, [voiceData]);

  const clearVoiceData = useCallback(() => {
    setVoiceData(null);
  }, []);

  const onSpeechResult = useCallback(
    (text) => {
      const synonymsFields = projectConfig?.voice?.synonymsFields ?? [];
      handleVoiceText(synonymsFields, text, setVoiceData, setPage, project);
    },
    [projectConfig, setPage, project],
  );

  const { start, stop } = useSpeechRecognition(onSpeechResult);

  return {
    voiceData,
    clearVoiceData,
    startVoiceInput: start,
    stopVoiceInput: stop,
  };
}
