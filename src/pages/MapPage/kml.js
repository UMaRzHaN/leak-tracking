import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { isNative } from "@/utils/platform";
import { PROJECT_LOCATION_CONFIG } from "@/configs/projectLocation.config";

// Colors in RRGGBB format (used in Google Earth icon URL parameter)
const ICON_COLORS = [
  "E53935", // Red
  "43A047", // Green
  "1E88E5", // Blue
  "FB8C00", // Orange
  "8E24AA", // Purple
  "00ACC1", // Cyan
  "FFB300", // Amber
  "D81B60", // Pink
  "6D4C41", // Brown
  "00897B", // Teal
  "3949AB", // Indigo
  "7CB342", // Lime
];

// Google Earth tornado icon (ID=1714), color embedded in URL
function tornadoIconUrl(colorHex) {
  return `https://earth.google.com/earth/rpc/cc/icon?color=${colorHex}&amp;id=1714&amp;scale=4`;
}

// Prevent premature CDATA close if a field value contains "]]>"
function cdata(value) {
  return String(value ?? "").replace(/]]>/g, "]]&gt;");
}

export function exportLeaksKML(leaks, project) {
  const config = PROJECT_LOCATION_CONFIG[project];

  const byField = leaks.reduce((acc, leak) => {
    if (leak.lat == null || leak.lng == null) return acc;
    const field = leak[config.secondary] || "Не определено";
    if (!acc[field]) acc[field] = [];
    acc[field].push(leak);
    return acc;
  }, {});

  const groupNames = Object.keys(byField);

  const styles = groupNames
    .map((_, index) => {
      const color = ICON_COLORS[index % ICON_COLORS.length];
      return `
    <Style id="style_${index}">
      <IconStyle>
        <scale>1.2</scale>
        <Icon>
          <href>${tornadoIconUrl(color)}</href>
        </Icon>
      </IconStyle>
    </Style>`;
    })
    .join("");

  const folders = groupNames
    .map((field, groupIndex) => {
      const fieldLeaks = byField[field];
      const placemarks = fieldLeaks
        .map(
          (l) => `
      <Placemark>
        <name>${cdata(l.leak_id)}</name>
        <styleUrl>#style_${groupIndex}</styleUrl>
        <description>
          <![CDATA[
            <b>${cdata(config.main_label)}:</b> ${cdata(l[config.main]) || "Не указан"}<br/>
            <b>${cdata(config.label)}:</b> ${cdata(l[config.secondary]) || "Не указан"}<br/>
            <b>Компонент:</b> ${cdata(l.component) || "Не указан"}<br/>
            <b>Скорость:</b> ${l.leak_speed != null ? `${cdata(l.leak_speed)} л/мин` : "Без скорости"}
          ]]>
        </description>
        <Point>
          <coordinates>${l.lng},${l.lat},0</coordinates>
        </Point>
      </Placemark>`,
        )
        .join("");

      return `
    <Folder>
      <name>${cdata(field)}</name>
      ${placemarks}
    </Folder>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Leak Reports</name>
    ${styles}
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

  if (isNative) {
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
