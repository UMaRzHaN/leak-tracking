import { useEffect, useState } from "react";
import { logger } from "@/utils/logger";

/**
 * Компоненты — только затем, чтобы шапка считала папки по ним.
 *
 * Выбор места один на всё приложение, и на экране реестра он должен считать
 * то, что на этом экране лежит: иначе рядом с «Мессояхское УПГ» стоит число
 * утечек, а открывается папка с железом. Реестр читается по своему ключу и в
 * общий список записей не входит, поэтому шапке приходится читать его самой.
 *
 * Загружается динамически и только когда реестр открыт: `ComponentRepository`
 * тянет за собой мост Capacitor, а `App.jsx` лежит в стартовом графе, где
 * запас до предела сборки — несколько килобайт.
 */

/** Событие, которым реестр сообщает, что список изменился. */
export const COMPONENT_REGISTRY_UPDATED = "component-registry-updated";

export function useRegistryLocationSource(project, active) {
  const [components, setComponents] = useState([]);

  useEffect(() => {
    if (!active || !project?.id) return undefined;

    let cancelled = false;
    const load = () =>
      import("@/repositories/ComponentRepository")
        .then(({ ComponentRepository }) => ComponentRepository.load(project))
        .then((loaded) => {
          if (!cancelled) setComponents(loaded);
        })
        .catch((error) => {
          if (cancelled) return;
          logger.warn("[locationScope] реестр не прочитался:", error);
          setComponents([]);
        });

    load();
    // Заведённая карточка меняет счёт в папках сразу, а не после ухода с
    // экрана и возвращения на него.
    window.addEventListener(COMPONENT_REGISTRY_UPDATED, load);
    return () => {
      cancelled = true;
      window.removeEventListener(COMPONENT_REGISTRY_UPDATED, load);
    };
  }, [active, project]);

  return components;
}
