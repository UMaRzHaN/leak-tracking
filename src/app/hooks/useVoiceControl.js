import { useState, useCallback, useMemo } from "react";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { handleVoiceText } from "@/features/voice/utils/handleVoiceText";
import { parseVoiceCommand } from "@/features/voice/utils/parseVoiceCommand";
import { useProjectConfig } from "@/app/project/hooks/useProjectConfig";
import { useProjectData } from "@/app/project/ProjectContext";
import { useLanguage } from "@/app/hooks/useLanguage";
import { applyVoiceCorrections } from "@/features/voice/utils/voiceCorrections";
import { useVoiceCorrections } from "@/app/project/hooks/useVoiceCorrections";

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
  const { activeProject, project } = useProjectData();
  const { lang } = useLanguage();
  const { corrections } = useVoiceCorrections(activeProject?.id);
  const [pendingVoiceData, setPendingVoiceData] = useState(null);
  // Что было сказано на месте подставленного словарём — для листа
  // подтверждения: по полям и фраза целиком.
  const [pendingVoiceHeard, setPendingVoiceHeard] = useState(
    /** @type {{ phrase: string, fields: Record<string, string> } | null} */ (
      null
    ),
  );

  const dictationKey = useMemo(() => {
    const currentStep = steps[step - 1];
    return currentStep?.fields?.find((field) => field.type === "textarea")?.key;
  }, [steps, step]);

  const onSpeechResult = useCallback(
    (raw) => {
      // Поправки применяются раньше всего, включая разбор команд: «сохранить»,
      // услышанное как «сохрани», — такая же ошибка распознавателя, как и
      // «место рождения», и чинить её вторым списком незачем.
      const text = applyVoiceCorrections(raw, corrections);
      // Без обработчика команд фраза — просто диктовка: «назад», сказанное в
      // карточке реестра, иначе пропадало бы молча.
      const command = onCommand ? parseVoiceCommand(text, lang) : null;
      if (command) {
        onCommand(command);
        return;
      }

      const active = voice ?? projectConfig?.voice;
      const synonymsFields = active?.synonymsFields ?? [];
      const outputFields = active?.outputFields ?? [];
      const fields = handleVoiceText(
        synonymsFields,
        text,
        setPendingVoiceData,
        project,
        dictationKey ?? null,
        outputFields,
        active?.options ?? {},
      );
      setPendingVoiceHeard({ phrase: text, fields: fields ?? {} });
    },
    [corrections, dictationKey, lang, onCommand, project, projectConfig, voice],
  );

  const { start, stop } = useSpeechRecognition(onSpeechResult, lang);

  const dismissVoiceData = useCallback(() => {
    setPendingVoiceData(null);
    setPendingVoiceHeard(null);
  }, []);

  return {
    pendingVoiceData,
    pendingVoiceHeard,
    dismissVoiceData,
    startVoiceInput: start,
    stopVoiceInput: stop,
  };
}
