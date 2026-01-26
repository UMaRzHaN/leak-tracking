import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Capacitor } from "@capacitor/core";

const FOLDER = "LeakReports";

export async function saveLeaksKML(leaks, exportLeaksKML) {
  const kml = exportLeaksKML(leaks);
  const fileName = `leaks_${Date.now()}.kml`;

  // 📱 MOBILE (Android / iOS)
  if (Capacitor.isNativePlatform()) {
    // гарантируем папку
    await Filesystem.mkdir({
      path: FOLDER,
      directory: Directory.Documents,
      recursive: true,
    }).catch(() => {});

    // сохраняем файл
    await Filesystem.writeFile({
      path: `${FOLDER}/${fileName}`,
      data: kml,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
    });

    return `${FOLDER}/${fileName}`;
  }

  // 🌐 WEB (Browser)
  downloadFileWeb(kml, `${FOLDER}_${fileName}`);
  return `${FOLDER}_${fileName}`;
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
