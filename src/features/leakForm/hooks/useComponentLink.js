import { useMemo } from "react";
import { useProjectData } from "@/app/project/ProjectContext";
import { PROJECT_LOCATION_CONFIG } from "@/configs/projectLocation.config";
import {
  componentPlaceKeys,
  isLinkedToComponent,
  linkLeakToComponent,
  unlinkLeakComponent,
} from "@/domain/leakComponentLink";

/**
 * Связь утечки с карточкой реестра: что переносится и что после этого заперто.
 *
 * Место берётся у карточки и правке не подлежит, пока связь стоит: реестр —
 * источник истины о том, где стоит железо. Расхождение чинят в реестре, а не
 * правкой в одной утечке; открепление возвращает поля человеку.
 *
 * Ключи уровней приходят из настройки типа проекта, а не перечислены: у
 * промысла это подразделение и месторождение, у магистрали УМГ и станция, и
 * переносить наугад нельзя — те же значения лежат под разными именами.
 *
 * @param {Record<string, any>} form
 * @param {(updater: (current: any) => any) => void} setForm
 * @param {{lat?: any, lng?: any}|null} coords
 */
export function useComponentLink(form, setForm, coords) {
  const { activeProject, project } = useProjectData();

  const placeKeys = useMemo(
    () => componentPlaceKeys(PROJECT_LOCATION_CONFIG[project]),
    [project],
  );

  const lockedKeys = useMemo(
    () => (isLinkedToComponent(form) ? new Set(placeKeys) : null),
    [form, placeKeys],
  );

  const componentLink = useMemo(
    () => ({
      project: activeProject,
      coords,
      onPick: (component) =>
        setForm((current) =>
          linkLeakToComponent(current, component, placeKeys),
        ),
      onUnlink: () => setForm((current) => unlinkLeakComponent(current)),
    }),
    [activeProject, coords, placeKeys, setForm],
  );

  return { lockedKeys, componentLink };
}
