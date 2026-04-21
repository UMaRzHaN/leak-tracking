import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Capacitor } from "@capacitor/core";
import { PROJECT_LOCATION_CONFIG } from "../../configs/projectLocation.config";

const FOLDER = "LeakReports";

export function exportLeaksGeoJSON(leaks, project) {
  const config = PROJECT_LOCATION_CONFIG[project];
  return {
    type: "FeatureCollection",
    features: leaks.map((l) => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [l.lng, l.lat],
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

export async function saveLeaksGeoJSON(leaks, exportFn) {
  const geojson = exportFn(leaks);
  const fileName = `leaks_map.geojson`;
  const data = JSON.stringify(geojson, null, 2);

  if (Capacitor.isNativePlatform()) {
    await Filesystem.mkdir({
      path: FOLDER,
      directory: Directory.Documents,
      recursive: true,
    }).catch(() => {});

    await Filesystem.writeFile({
      path: `${FOLDER}/${fileName}`,
      data,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
    });

    return `${FOLDER}/${fileName}`;
  }

  downloadFileWeb(data, fileName);
  return fileName;
}

function downloadFileWeb(data, fileName) {
  const blob = new Blob([data], { type: "application/geo+json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
