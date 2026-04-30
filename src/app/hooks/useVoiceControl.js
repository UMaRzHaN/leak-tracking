import { useState, useCallback, useMemo } from "react";
import { useSpeechRecognition } from "../../hooks/useSpeechRecognition";
import { handleVoiceText } from "../../utils/voice/handleVoiceText";
import { parseVoiceCommand } from "../../utils/voice/parseVoiceCommand";
import { useProjectConfig } from "../settings/useProjectConfig";
import { useProjectData } from "../settings/ProjectContext";

/**
 * Voice control hook — now step-aware and with pending confirmation flow.
 *
 * @param {object}   options
 * @param {number}   options.step      — current form step (1-based)
 * @param {object[]} options.steps     — full steps config array
 * @param {Function} options.onCommand — called with "next"|"back"|"save"|"clear"
 */
export function useVoiceControl({ step = 1, steps = [], onCommand } = {}) {
  const projectConfig = useProjectConfig();
  const { project } = useProjectData();
  const [pendingVoiceData, setPendingVoiceData] = useState(null);

  // Key of textarea field in current step — used for dictation mode
  const dictationKey = useMemo(() => {
    const currentStep = steps[step - 1];
    return currentStep?.fields?.find((f) => f.type === "textarea")?.key ?? null;
  }, [steps, step]);

  const onSpeechResult = useCallback(
    (text) => {
      // 1. Navigation command?
      const command = parseVoiceCommand(text);
      if (command) {
        onCommand?.(command);
        return;
      }

      // 2. Parse for fields (dictation mode handled inside handleVoiceText)
      const synonymsFields = projectConfig?.voice?.synonymsFields ?? [];
      handleVoiceText(synonymsFields, text, setPendingVoiceData, project, dictationKey);
    },
    [projectConfig, project, onCommand, dictationKey],
  );

  const { start, stop } = useSpeechRecognition(onSpeechResult);

  const dismissVoiceData = useCallback(() => {
    setPendingVoiceData(null);
  }, []);

  return {
    pendingVoiceData,
    dismissVoiceData,
    startVoiceInput: start,
    stopVoiceInput: stop,
  };
}
