import { useEffect, useState } from "react";
import { hasComponentRegistry } from "@/configs/projectAdapter";
import { ComponentRepository } from "@/repositories/ComponentRepository";
import { logger } from "@/utils/logger";
import { toComponentMarkers } from "@/pages/MapPage/componentMarkers";

/**
 * The registry, read for the map only.
 *
 * Deliberately not `useComponentRegistry`: that hook also loads the registry's
 * declaration — the equipment dictionaries and the four-step form, some eleven
 * kilobytes — because the screen it serves has to draw a card. The map draws
 * pins and needs nothing but the stored records.
 *
 * Loaded when the base is switched to, not when the map opens. Most sessions
 * on the map are about leaks.
 */
export function useMapComponents(project, active) {
  const available = Boolean(project?.id) && hasComponentRegistry(project);
  const [markers, setMarkers] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!available || !active) return undefined;

    let cancelled = false;
    setLoading(true);
    ComponentRepository.load(project)
      .then((components) => {
        if (!cancelled) setMarkers(toComponentMarkers(components));
      })
      .catch((error) => {
        if (cancelled) return;
        logger.warn("[map] the registry could not be read:", error);
        setMarkers([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [active, available, project]);

  return { available, markers, loading };
}
