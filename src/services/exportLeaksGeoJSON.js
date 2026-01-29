import { PROJECT_LOCATION_CONFIG } from "../configs/projectLocation.config";

export function exportLeaksGeoJSON(leaks, project) {
  const config = PROJECT_LOCATION_CONFIG[project];
  return {
    type: "FeatureCollection",
    features: leaks.map((l) => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [l.lng, l.lat], // ВАЖНО: lng, lat
      },
      properties: {
        id: l.id ?? null,
        [config.secondary]: l[config.secondary] ?? "Без поля",
        date: l.date ?? null,
        comment: l.comment ?? null,
      },
    })),
  };
}
