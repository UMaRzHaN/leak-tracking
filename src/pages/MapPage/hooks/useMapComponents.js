import { useMemo } from "react";
import { useComponentRegistryStore } from "@/features/componentRegistry/ComponentRegistryContext";
import { toComponentMarkers } from "@/pages/MapPage/componentMarkers";

/**
 * The registry, turned into pins.
 *
 * Deliberately not `useComponentRegistry`: that hook also loads the registry's
 * declaration — the equipment dictionaries and the four-step form, some eleven
 * kilobytes — because the screen it serves has to draw a card. The map draws
 * pins and needs nothing but the stored records, which is why both read the
 * shared store rather than the same hook.
 *
 * Requested when the map is switched to, not when the app starts. Most
 * sessions on the map are about leaks.
 */
export function useMapComponents(active) {
  const { enabled, components, loading } = useComponentRegistryStore({
    active,
  });

  const markers = useMemo(
    () => (enabled ? toComponentMarkers(components) : EMPTY),
    [components, enabled],
  );

  return { available: enabled, markers, loading };
}

const EMPTY = /** @type {any[]} */ (/** @type {unknown} */ (Object.freeze([])));
