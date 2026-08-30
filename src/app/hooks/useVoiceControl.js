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
 * @param {number} [options.step]
 * @param {Record<string, any>[]} [options.steps]
 * @param {Function} [options.onCommand]
 * @param {Record<string, any>|null} [options.voice] чей это словарь. По умолчанию — блок
 *   утечки из конфига проекта; реестр компонентов передаёт свой, потому что
 *   заполняет он другие поля, и без этого распознанному было некуда деться.
 */
export function useVoiceControl({
  step = 1,
  steps = /** @type {any[]} */ ([]),
  onCommand,
  voice = /** @type {any} */ (null),
} = {}) {
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

      const active = voice ?? projectConfig?.voice;
      const synonymsFields = active?.synonymsFields ?? [];
      const outputFields = active?.outputFields ?? [];
      handleVoiceText(
        synonymsFields,
        text,
        setPendingVoiceData,
        project,
        dictationKey ?? null,
        outputFields,
        active?.options ?? {},
      );
    },
    [dictationKey, lang, onCommand, project, projectConfig, voice],
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
