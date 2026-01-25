import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Capacitor } from "@capacitor/core";
import { exportLeaksGeoJSON } from "../utils/exportLeaksGeoJSON";

export async function saveLeaksGeoJSON(leaks) {
  const geojson = exportLeaksGeoJSON(leaks);
  const fileName = `leaks_${Date.now()}.geojson`;
  const data = JSON.stringify(geojson, null, 2);

  // 📱 MOBILE (Android / iOS)
  if (Capacitor.isNativePlatform()) {
    await Filesystem.writeFile({
      path: fileName,
      data,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
    });

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

  // 🌐 WEB (Browser)
  downloadFileWeb(data, fileName);
  return fileName;
}
