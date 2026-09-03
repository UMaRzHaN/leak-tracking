import { isNative } from "@/utils/platform";
import { PROJECT_LOCATION_CONFIG } from "@/configs/projectLocation.config";
import { hasValidCoordinates } from "@/utils/coordinates";
import {
  INVENTORY_KML_DIR,
  LEAK_KML_DIR,
  projectExportFolder,
} from "@/services/storage/exportFolders";

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

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeDescriptionText(value) {
  return cdataText(escapeHtml(value));
}

// The exported file speaks the language of the interface that asked for it,
// so `t` comes in from the caller rather than the module reaching for a
// global i18n instance.
/**
 * Строка про точность для выгрузки — только когда радиус записан.
 *
 * Пустой строкой «Точность: не указано» описание не засоряется: записи,
 * заведённые до появления поля, — обычный случай, а не пробел в данных, и
 * пометка о нём в каждой второй карточке ГИС ничего не сообщает.
 */
function accuracyLine(record, t) {
  const value = Number(record?.coords_accuracy);
  if (!Number.isFinite(value) || value <= 0) return "";
  const label = safeDescriptionText(t("map.popup.accuracy"));
  const metres = safeDescriptionText(
    t("map.popup.accuracyValue", { count: Math.round(value) }),
  );
  return `<br/><b>${label}:</b> ${metres}`;
}

export function exportLeaksKML(leaks, project, t) {
  const config = PROJECT_LOCATION_CONFIG[project];
  // The two location fields a project uses are named by its type, and those
  // names are already keys under `database.locationLabels`.
  const mainLabel = t(`database.locationLabels.${config.main}`);
  const secondaryLabel = t(`database.locationLabels.${config.secondary}`);
  const notSpecified = t("map.sheet.notSpecified");
  const noRate = t("map.kml.noRate");

  const byField = new Map();
  leaks.forEach((leak) => {
    if (!hasValidCoordinates(leak)) return;
    const field = leak[config.secondary] || notSpecified;
    if (!byField.has(field)) byField.set(field, []);
    byField.get(field).push(leak);
  });

  const groupNames = [...byField.keys()];

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
      const fieldLeaks = byField.get(field);
      const placemarks = fieldLeaks
        .map(
          (leak) => `
      <Placemark>
        <name>${escapeXml(leak.leak_id)}</name>
        <styleUrl>#style_${groupIndex}</styleUrl>
        <description>
          <![CDATA[
            <b>${safeDescriptionText(mainLabel)}:</b> ${safeDescriptionText(leak[config.main]) || notSpecified}<br/>
            <b>${safeDescriptionText(secondaryLabel)}:</b> ${safeDescriptionText(leak[config.secondary]) || notSpecified}<br/>
            <b>${safeDescriptionText(t("addLeak.fields.component.label"))}:</b> ${safeDescriptionText(leak.component) || notSpecified}<br/>
            <b>${safeDescriptionText(t("addLeak.fields.leak_speed.shortLabel"))}:</b> ${
              leak.leak_speed != null
                ? `${safeDescriptionText(leak.leak_speed)} ${safeDescriptionText(t("common.units.litresPerMinute"))}`
                : noRate
            }${accuracyLine(leak, t)}
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
    <name>${escapeXml(t("map.kml.documentName"))}</name>
    ${styles}
    ${folders}
  </Document>
</kml>`;
}

/**
 * Компоненты на карте — своим файлом.
 *
 * Тот же формат и та же группировка по месторождению, но говорится в нём
 * другое: у железа нет скорости утечки, зато есть номер на схеме и состояние,
 * в котором его застали. Выгружать компоненты под видом утечек значило бы
 * отдать получателю файл, где половина подписей не про то.
 */
export function exportComponentsKML(components, project, t) {
  const config = PROJECT_LOCATION_CONFIG[project];
  const mainLabel = t(`database.locationLabels.${config.main}`);
  const secondaryLabel = t(`database.locationLabels.${config.secondary}`);
  const notSpecified = t("map.sheet.notSpecified");

  const byField = new Map();
  components.forEach((component) => {
    if (!hasValidCoordinates(component)) return;
    const field = component[config.secondary] || notSpecified;
    if (!byField.has(field)) byField.set(field, []);
    byField.get(field).push(component);
  });

  const groupNames = [...byField.keys()];

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
      const placemarks = byField
        .get(field)
        .map(
          (component) => `
      <Placemark>
        <name>${escapeXml(component.component_uid ?? component.scheme_tag ?? "")}</name>
        <styleUrl>#style_${groupIndex}</styleUrl>
        <description>
          <![CDATA[
            <b>${safeDescriptionText(mainLabel)}:</b> ${safeDescriptionText(component[config.main]) || notSpecified}<br/>
            <b>${safeDescriptionText(secondaryLabel)}:</b> ${safeDescriptionText(component[config.secondary]) || notSpecified}<br/>
            <b>${safeDescriptionText(t("components.tab"))}:</b> ${safeDescriptionText(component.component) || notSpecified}<br/>
            <b>${safeDescriptionText(t("map.kml.schemeTag"))}:</b> ${safeDescriptionText(component.scheme_tag) || notSpecified}<br/>
            <b>${safeDescriptionText(t("map.popup.status"))}:</b> ${safeDescriptionText(component.component_status) || notSpecified}${accuracyLine(component, t)}
          ]]>
        </description>
        <Point>
          <coordinates>${component.lng},${component.lat},0</coordinates>
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
    <name>${escapeXml(t("map.kml.componentsDocumentName"))}</name>
    ${styles}
    ${folders}
  </Document>
</kml>`;
}

export async function saveComponentsKML(
  components,
  project,
  projectFolderName,
  t,
) {
  return writeKML({
    kml: exportComponentsKML(components, project, t),
    fileName: "components_map.kml",
    folderName: projectExportFolder(projectFolderName, INVENTORY_KML_DIR),
    t,
  });
}

export async function saveLeaksKML(leaks, project, projectFolderName, t) {
  return writeKML({
    kml: exportLeaksKML(leaks, project, t),
    fileName: "leaks_map.kml",
    folderName: projectExportFolder(projectFolderName, LEAK_KML_DIR),
    t,
  });
}

async function writeKML({ kml, fileName, folderName, t }) {
  if (isNative) {
    const { writePublicFile } =
      await import("@/services/storage/publicFileWriter");
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
      message: t("map.kml.savedToDocuments", {
        path: `${folderName}/${fileName}`,
      }),
    };
  }

  downloadFileWeb(kml, fileName);

  return {
    ok: true,
    fileName,
    path: fileName,
    message: t("map.kml.downloaded"),
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
