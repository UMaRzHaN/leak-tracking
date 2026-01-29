export function exportLeaksKML(leaks) {
  // 1️⃣ группировка по field
  const byField = leaks.reduce((acc, leak) => {
    const field = leak.field || "Без участка";

    if (!acc[field]) acc[field] = [];
    acc[field].push(leak);

    return acc;
  }, {});

  // 2️⃣ генерация Folder'ов
  const folders = Object.entries(byField)
    .map(([field, fieldLeaks]) => {
      const placemarks = fieldLeaks
        .map(
          (l) => `
          <Placemark>
            <name>${l.leak_id ?? ""}</name>
            <description>
              <![CDATA[
                <b>Участок:</b> ${field}<br/>
                <b>Месторождение:</b> ${l.deposit ?? "Не указано"}
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

  // 3️⃣ итоговый KML
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Leak Reports</name>
    ${folders}
  </Document>
</kml>`;
}
