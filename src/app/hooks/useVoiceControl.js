import { useState, useCallback, useMemo } from "react";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { handleVoiceText } from "@/features/voice/utils/handleVoiceText";
import { parseVoiceCommand } from "@/features/voice/utils/parseVoiceCommand";
import { useProjectConfig } from "@/app/project/hooks/useProjectConfig";
import { useProjectData } from "@/app/project/ProjectContext";
import { useLanguage } from "@/app/hooks/useLanguage";

/**
 * Voice control hook with step-aware parsing and pending confirmation flow.
 *
 * @param {object} options
 * @param {number} options.step
 * @param {object[]} options.steps
 * @param {Function} options.onCommand
 */
export function useVoiceControl({ step = 1, steps = [], onCommand } = {}) {
  const projectConfig = useProjectConfig();
  const { project } = useProjectData();
  const { lang } = useLanguage();
  const [pendingVoiceData, setPendingVoiceData] = useState(null);

  const dictationKey = useMemo(() => {
    const currentStep = steps[step - 1];
    return currentStep?.fields?.find((field) => field.type === "textarea")?.key;
  }, [steps, step]);

  const onSpeechResult = useCallback(
    (text) => {
      const command = parseVoiceCommand(text, lang);
      if (command) {
        onCommand?.(command);
        return;
      }

      const synonymsFields = projectConfig?.voice?.synonymsFields ?? [];
      handleVoiceText(
        synonymsFields,
        text,
        setPendingVoiceData,
        project,
        dictationKey ?? null,
      );
    },
    [dictationKey, lang, onCommand, project, projectConfig],
  );

  const { start, stop } = useSpeechRecognition(onSpeechResult, lang);

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
