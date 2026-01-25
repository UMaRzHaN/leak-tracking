import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Capacitor } from "@capacitor/core";
import { exportLeaksGeoJSON } from "../configs/compression/exportLeaksGeoJSON";

const FOLDER = "LeakReports";

export async function saveLeaksGeoJSON(leaks) {
  const geojson = exportLeaksGeoJSON(leaks);
  const fileName = `leaks_${Date.now()}.geojson`;
  const data = JSON.stringify(geojson, null, 2);

  // 📱 MOBILE (Android / iOS)
  if (Capacitor.isNativePlatform()) {
    // 1️⃣ гарантируем папку
    await Filesystem.mkdir({
      path: FOLDER,
      directory: Directory.Documents,
      recursive: true,
    }).catch(() => {}); // папка уже есть — ок

    // 2️⃣ сохраняем файл В папку
    await Filesystem.writeFile({
      path: `${FOLDER}/${fileName}`,
      data,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
    });

    return `${FOLDER}/${fileName}`;
  }

  // 🌐 WEB (Browser)
  downloadFileWeb(data, fileName);
  return fileName;
}

// ===== WEB helper =====
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
