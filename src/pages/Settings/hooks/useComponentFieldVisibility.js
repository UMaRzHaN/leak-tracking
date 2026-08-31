import { useEffect, useState } from "react";
import { hasComponentRegistry } from "@/configs/componentRegistry.config";
import { useHiddenFields } from "@/app/project/hooks/useHiddenFields";
import { HIDDEN_FIELD_SCOPES } from "@/app/project/hiddenFieldsStorage";
import { logger } from "@/utils/logger";

/**
 * Скрытые поля карточки компонента — для раздела настроек.
 *
 * Конфигурация реестра грузится лениво и здесь берётся сырой, без фильтра:
 * настройки показывают все поля, иначе скрытое нельзя было бы вернуть.
 *
 * Отдельным хуком, а не внутри `useSettingsPage`: тот и так у самого потолка
 * бюджета, а реестр есть не у всякого проекта — незачем платить за его
 * конфигурацию там, где её не спрашивают.
 */
export function useComponentFieldVisibility(project) {
  const available = Boolean(project?.id) && hasComponentRegistry(project);
  const [config, setConfig] = useState(/** @type {any} */ (null));
  const { hiddenFields, setHiddenFields } = useHiddenFields(
    project?.id ?? null,
    HIDDEN_FIELD_SCOPES.COMPONENTS,
  );

  useEffect(() => {
    if (!available) {
      setConfig(null);
      return undefined;
    }
    let cancelled = false;
    import("@/configs/projectAdapter")
      .then(({ loadComponentRegistry }) => loadComponentRegistry(project))
      // Окно выбора полей читает форму конфигурации утечки — `steps.steps` и
      // `export.excel`. Реестр отдаёт `excel` верхним уровнем, поэтому здесь
      // он приводится к той же форме, а не окно учится второй.
      .then(
        (loaded) =>
          !cancelled &&
          setConfig({ steps: loaded.steps, export: { excel: loaded.excel } }),
      )
      .catch((error) => {
        if (cancelled) return;
        logger.error("[settings] component registry config failed:", error);
      });
    return () => {
      cancelled = true;
    };
  }, [available, project]);

  return {
    available: available && Boolean(config),
    config,
    hiddenFields,
    setHiddenFields,
  };
}
