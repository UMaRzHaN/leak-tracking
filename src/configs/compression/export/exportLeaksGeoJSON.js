export function exportLeaksGeoJSON(leaks) {
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
        station: l.station ?? "Без поля",
        date: l.date ?? null,
        comment: l.comment ?? null,
      },
    })),
  };
}
