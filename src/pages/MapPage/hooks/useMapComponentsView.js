import { useMemo } from "react";
import { usedComponentStatuses } from "@/domain/componentStatuses";
import { filterComponentMarkers } from "@/pages/MapPage/componentMarkers";

/**
 * Отбор булавок по состоянию железа — для кнопки на карте.
 *
 * Тот же, что на странице реестра: он лежит в общем наборе фильтров, поэтому
 * выбранное в списке видно на карте, и наоборот. Список состояний считается по
 * тем, что на карте есть, тем же правилом, что и в реестре.
 *
 * @param {Record<string, any>[]} markers
 * @param {any} sharedFilters
 */
export function useComponentStatusFilter(markers, sharedFilters) {
  return useMemo(
    () => ({
      statuses: usedComponentStatuses(markers),
      selected: sharedFilters?.componentStatusFilter ?? [],
      onToggle: (status) =>
        sharedFilters?.setComponentStatusFilter?.((current) =>
          current.includes(status)
            ? current.filter((item) => item !== status)
            : [...current, status],
        ),
      onClear: () => sharedFilters?.setComponentStatusFilter?.([]),
    }),
    [markers, sharedFilters],
  );
}

/**
 * Что карта показывает на базе железа: булавки после отбора и сам отбор.
 *
 * Вместе, потому что это одно решение: список состояний считается по тем
 * булавкам, что здесь есть, и он же их и режет. Порознь они лежали в разных
 * концах `useMapPage`, между делами про слои и тайлы.
 */
export function useMapComponentsView({
  markers,
  showsComponents,
  sharedFilters,
  nearbyOnly,
  nearbyRadius,
  coords,
}) {
  const visible = useMemo(
    () =>
      showsComponents
        ? filterComponentMarkers(markers, {
            sharedFilters,
            nearbyOnly,
            nearbyRadius,
            coords,
          })
        : [],
    [markers, coords, nearbyOnly, nearbyRadius, sharedFilters, showsComponents],
  );

  return { visible, status: useComponentStatusFilter(markers, sharedFilters) };
}
