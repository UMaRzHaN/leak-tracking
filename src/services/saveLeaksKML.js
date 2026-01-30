import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Capacitor } from "@capacitor/core";
import { exportLeaksKML } from "./exportLeaksKML";

export async function saveLeaksKML(leaks, project, mkdir) {
  const kml = exportLeaksKML(leaks, project);
  const fileName = `leaks_${Date.now()}.kml`;
  const MAPS_FOLDER = mkdir + "/maps";
  // 📱 MOBILE (Android / iOS)
  if (Capacitor.isNativePlatform()) {
    // гарантируем папку
    await Filesystem.mkdir({
      path: MAPS_FOLDER,
      directory: Directory.Documents,
      recursive: true,
    }).catch(() => {});

    // сохраняем файл
    await Filesystem.writeFile({
      path: `${mkdir}/${fileName}`,
      data: kml,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
    });

    return `${mkdir}/${fileName}`;
  }

  // 🌐 WEB (Browser)
  downloadFileWeb(kml, `${mkdir}_${fileName}`);
  return `${mkdir}_${fileName}`;
}

// ===== WEB helper =====
function downloadFileWeb(data, fileName) {
  const blob = new Blob([data], {
    type: "application/vnd.google-earth.kml+xml",
  });

  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();

  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
