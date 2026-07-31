import { isNative } from "@/utils/platform";
import { PROJECT_LOCATION_CONFIG } from "@/configs/projectLocation.config";

const ICON_COLORS = [
  "E53935",
  "43A047",
  "1E88E5",
  "FB8C00",
  "8E24AA",
  "00ACC1",
  "FFB300",
  "D81B60",
  "6D4C41",
  "00897B",
  "3949AB",
  "7CB342",
];

function tornadoIconUrl(colorHex) {
  return `https://earth.google.com/earth/rpc/cc/icon?color=${colorHex}&amp;id=1714&amp;scale=4`;
}

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function cdataText(value) {
  return String(value ?? "").replace(/]]>/g, "]]&gt;");
}

function getProjectLabels(project, lang) {
  const isRu = lang === "ru";

  if (project === "midstream") {
    return {
      mainLabel: isRu ? "УМГ" : "MGPA",
      secondaryLabel: isRu ? "Станция" : "Station",
    };
  }

  if (project === "upstream") {
    return {
      mainLabel: isRu ? "Подразделение" : "Subdivision",
      secondaryLabel: isRu ? "Месторождение" : "Deposit",
    };
  }

  return {
    mainLabel: isRu ? "Район" : "District",
    secondaryLabel: isRu ? "Населенный пункт" : "Locality",
  };
}

export function exportLeaksKML(leaks, project, lang = "ru") {
  const config = PROJECT_LOCATION_CONFIG[project];
  const labels = getProjectLabels(project, lang);
  const notSpecified = lang === "ru" ? "Не указано" : "Not specified";
  const noRate = lang === "ru" ? "Без скорости" : "No rate";

  const byField = leaks.reduce((acc, leak) => {
    if (leak.lat == null || leak.lng == null) return acc;
    const field = leak[config.secondary] || notSpecified;
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
          (leak) => `
      <Placemark>
        <name>${escapeXml(leak.leak_id)}</name>
        <styleUrl>#style_${groupIndex}</styleUrl>
        <description>
          <![CDATA[
            <b>${cdataText(labels.mainLabel)}:</b> ${cdataText(leak[config.main]) || notSpecified}<br/>
            <b>${cdataText(labels.secondaryLabel)}:</b> ${cdataText(leak[config.secondary]) || notSpecified}<br/>
            <b>${lang === "ru" ? "Компонент" : "Component"}:</b> ${cdataText(leak.component) || notSpecified}<br/>
            <b>${lang === "ru" ? "Скорость" : "Leak rate"}:</b> ${
              leak.leak_speed != null
                ? `${cdataText(leak.leak_speed)} ${lang === "ru" ? "л/мин" : "L/min"}`
                : noRate
            }
          ]]>
        </description>
        <Point>
          <coordinates>${leak.lng},${leak.lat},0</coordinates>
        </Point>
      </Placemark>`,
        )
        .join("");

      return `
    <Folder>
      <name>${escapeXml(field)}</name>
      ${placemarks}
    </Folder>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${lang === "ru" ? "Отчет по утечкам" : "Leak Report"}</name>
    ${styles}
    ${folders}
  </Document>
</kml>`;
}

export async function saveLeaksKML(
  leaks,
  project,
  projectFolderName = null,
  lang = "ru",
) {
  const kml = exportLeaksKML(leaks, project, lang);
  const fileName = "leaks_map.kml";
  const folderName = projectFolderName
    ? `${projectFolderName}/export/map`
    : "export/map";

  if (isNative) {
    const { writePublicFile } = await import("@/services/publicFileWriter");
    await writePublicFile({
      folder: folderName,
      fileName,
      blob: new Blob([kml], { type: "application/vnd.google-earth.kml+xml" }),
      mimeType: "application/vnd.google-earth.kml+xml",
    });

    return {
      ok: true,
      fileName,
      path: `${folderName}/${fileName}`,
      message:
        lang === "ru"
          ? `Сохранено в Документы/${folderName}/${fileName}`
          : `Saved to Documents/${folderName}/${fileName}`,
    };
  }

  downloadFileWeb(kml, fileName);

  return {
    ok: true,
    fileName,
    path: fileName,
    message:
      lang === "ru"
        ? "KML-файл успешно скачан"
        : "KML file downloaded successfully",
  };
}

function downloadFileWeb(data, fileName) {
  const blob = new Blob([data], {
    type: "application/vnd.google-earth.kml+xml",
  });

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;

  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
