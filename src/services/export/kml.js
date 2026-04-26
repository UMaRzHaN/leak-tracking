import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Capacitor } from "@capacitor/core";
import { PROJECT_LOCATION_CONFIG } from "../../configs/projectLocation.config";

export function exportLeaksKML(leaks, project) {
  const config = PROJECT_LOCATION_CONFIG[project];

  const byField = leaks.reduce((acc, leak) => {
    const field = leak[config.secondary] || "Не определено";
    if (!acc[field]) acc[field] = [];
    acc[field].push(leak);
    return acc;
  }, {});

  const folders = Object.entries(byField)
    .map(([field, fieldLeaks]) => {
      const placemarks = fieldLeaks
        .map(
          (l) => `
          <Placemark>
            <name>${l.leak_id ?? ""}</name>
            <description>
              <![CDATA[
                <b>${config.main_label}:</b> ${l[config.main] ?? "Не указан"}<br/>
                <b>${config.label}:</b> ${l[config.secondary] ?? "Не указан"}<br/>
                <b>Компонент:</b> ${l.component ?? "Не указан"}<br/>
                <b>Скорость:</b> ${l.leak_speed ?? "Без скорости"}
              ]]>
            </description>
            <Point>
              <coordinates>${l.lng},${l.lat},0</coordinates>
            </Point>
          </Placemark>
        `,
        )
        .join("");

      return `
        <Folder>
          <name>${field}</name>
          ${placemarks}
        </Folder>
      `;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Leak Reports</name>
    ${folders}
  </Document>
</kml>`;
}

export async function saveLeaksKML(leaks, project, projectFolderName = null) {
  const kml = exportLeaksKML(leaks, project);
  const fileName = `leaks_map.kml`;
  const folderName = projectFolderName
    ? `${projectFolderName}/export/map`
    : "export/map";

  if (Capacitor.isNativePlatform()) {
    await Filesystem.mkdir({
      path: folderName,
      directory: Directory.Documents,
      recursive: true,
    }).catch(() => {});

    await Filesystem.writeFile({
      path: `${folderName}/${fileName}`,
      data: kml,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
    });

    return {
      ok: true,
      fileName,
      path: `${folderName}/${fileName}`,
      message: `Сохранено в Документы/${folderName}/${fileName}`,
    };
  }

  downloadFileWeb(kml, fileName);

  return {
    ok: true,
    fileName,
    path: fileName,
    message: "KML-файл успешно скачан",
  };
}

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