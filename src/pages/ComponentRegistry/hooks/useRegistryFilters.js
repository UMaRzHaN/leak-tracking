import { useState } from "react";
import { NEARBY_RADIUS_M } from "@/domain/leakFilters";

/**
 * Отбор железа: состояние и «рядом со мной».
 *
 * Живёт выше страницы, вместе с остальными фильтрами: карта на базе железа
 * показывает тот же отбор, и переход между ней и реестром не должен его
 * сбрасывать. Своё состояние остаётся запасным — реестр открывают и без общего
 * набора, из тестов.
 *
 * Поиск и сортировка сюда не идут: это про то, как читают список, а не про то,
 * какое железо смотрят.
 */
export function useRegistryFilters(sharedFilters) {
  const [localStatuses, setLocalStatuses] = useState(
    /** @type {string[]} */ ([]),
  );
  const [localNearby, setLocalNearby] = useState(false);
  const [localRadius, setLocalRadius] = useState(NEARBY_RADIUS_M);

  return {
    statusFilter: sharedFilters?.componentStatusFilter ?? localStatuses,
    setStatusFilter:
      sharedFilters?.setComponentStatusFilter ?? setLocalStatuses,
    nearbyOnly: sharedFilters?.nearbyFilter ?? localNearby,
    setNearbyOnly: sharedFilters?.setNearbyFilter ?? setLocalNearby,
    nearbyRadius: sharedFilters?.nearbyRadius ?? localRadius,
    setNearbyRadius: sharedFilters?.setNearbyRadius ?? setLocalRadius,
  };
}
