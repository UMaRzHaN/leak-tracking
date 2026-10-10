import { PROJECT_LOCATION_CONFIG } from "@/configs/projectLocation.config";
import { hasValidCoordinates } from "@/utils/coordinates";
import { accuracyLine, escapeXml, safeDescriptionText } from "./kmlText";

/**
 * Сборка документа KML: папки по группам, внутри — по месту, метка группы
 * своим цветом, описание строками «подпись: значение». О чём группы и что в
 * описании, решает раскладка карты в `kml.js`; здесь — только как это
 * записать, чтобы Google Earth и ГИС прочли.
 */
function tornadoIconUrl(colorHex) {
  return `https://earth.google.com/earth/rpc/cc/icon?color=${colorHex}&amp;id=1714&amp;scale=4`;
}

/** Дата для чужой программы: без локали, чтобы ГИС не гадала порядок. */
export function isoDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function descriptionRows(rows, record, t) {
  return (
    rows
      .filter(([, value]) => value != null && value !== "")
      .map(
        ([label, value]) =>
          `<b>${safeDescriptionText(label)}:</b> ${safeDescriptionText(value)}`,
      )
      .join("<br/>") + accuracyLine(record, t)
  );
}

/**
 * @param {{
 *   documentName: string,
 *   groups: { key: string, name: string, color: string }[],
 *   items: any[],
 *   groupOf: (item: any) => string|null,
 *   nameOf: (item: any) => string,
 *   rowsOf: (item: any) => any[][],
 *   project: string,
 *   t: Function,
 * }} options
 */
export function buildKml({
  documentName,
  groups,
  items,
  groupOf,
  nameOf,
  rowsOf,
  project,
  t,
}) {
  const config = PROJECT_LOCATION_CONFIG[project];
  const notSpecified = t("map.sheet.notSpecified");

  const filled = groups.map((group) => ({
    group,
    places: /** @type {Map<string, any[]>} */ (new Map()),
  }));
  const byKey = new Map(filled.map((entry) => [entry.group.key, entry.places]));
  for (const item of items) {
    if (!hasValidCoordinates(item)) continue;
    const places = byKey.get(groupOf(item) ?? "");
    if (!places) continue;
    const place = item[config.secondary] || notSpecified;
    let list = places.get(place);
    if (!list) {
      list = [];
      places.set(place, list);
    }
    list.push(item);
  }

  const used = filled.filter((entry) => entry.places.size > 0);

  const styles = used
    .map(
      ({ group }, index) => `
    <Style id="style_${index}">
      <IconStyle>
        <scale>1.2</scale>
        <Icon>
          <href>${tornadoIconUrl(group.color)}</href>
        </Icon>
      </IconStyle>
    </Style>`,
    )
    .join("");

  const folders = used
    .map(({ group, places }, index) => {
      const count = [...places.values()].reduce(
        (sum, list) => sum + list.length,
        0,
      );
      const placeFolders = [...places.entries()]
        .map(([place, list]) => {
          const placemarks = list
            .map(
              (item) => `
        <Placemark>
          <name>${escapeXml(nameOf(item))}</name>
          <styleUrl>#style_${index}</styleUrl>
          <description>
            <![CDATA[
              ${descriptionRows(rowsOf(item), item, t)}
            ]]>
          </description>
          <Point>
            <coordinates>${item.lng},${item.lat},0</coordinates>
          </Point>
        </Placemark>`,
            )
            .join("");
          return `
      <Folder>
        <name>${escapeXml(place)}</name>
        ${placemarks}
      </Folder>`;
        })
        .join("");
      return `
    <Folder>
      <name>${escapeXml(`${group.name} (${count})`)}</name>
      ${placeFolders}
    </Folder>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escapeXml(documentName)}</name>
    ${styles}
    ${folders}
  </Document>
</kml>`;
}
