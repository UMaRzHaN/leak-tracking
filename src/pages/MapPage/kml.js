import { isNative } from "@/utils/platform";
import { PROJECT_LOCATION_CONFIG } from "@/configs/projectLocation.config";
import {
  INVENTORY_KML_DIR,
  LEAK_KML_DIR,
  projectExportFolder,
} from "@/services/storage/exportFolders";
import { buildKml, isoDate } from "./kmlDocument";
import { STATUS, getStatusMeta } from "@/utils/status";
import {
  REPAIR_STAGE,
  getRepairBrigade,
  getRepairStage,
} from "@/domain/repairStages";
import { getLastMonitoringRecord } from "@/utils/monitoring";

/**
 * Карта выгружает то, о чём она: у каждой свой вопрос, и файл раскладывает
 * точки по ответу на него, а внутри — по месту, как раньше.
 *
 * - утечки — по статусу;
 * - мониторинг — что ещё осмотреть в обходе и что уже осмотрено;
 * - ремонты — по стадии работ;
 * - инвентаризация — по состоянию железа.
 *
 * Цвет метки — тот же смысл, что у булавки на экране: статус, стадия,
 * погашенная осмотренная точка. Файл, открытый в Google Earth, читается так
 * же, как карта, с которой его выгрузили.
 */
export const KML_MODE = Object.freeze({
  LEAKS: "leaks",
  MONITORING: "monitoring",
  REPAIRS: "repairs",
});

const COLORS = {
  [STATUS.OPEN]: "E53935",
  [STATUS.IN_PROGRESS]: "FB8C00",
  [STATUS.RESOLVED]: "43A047",
  component: "0EA5E9",
  checked: "9E9E9E",
};

const STATUS_ORDER = [STATUS.OPEN, STATUS.IN_PROGRESS, STATUS.RESOLVED];

function locationRows(item, project, t) {
  const config = PROJECT_LOCATION_CONFIG[project];
  const notSpecified = t("map.sheet.notSpecified");
  return [
    [
      t(`database.locationLabels.${config.main}`),
      item[config.main] || notSpecified,
    ],
    [
      t(`database.locationLabels.${config.secondary}`),
      item[config.secondary] || notSpecified,
    ],
  ];
}

function leakRows(leak, project, t) {
  return [
    ...locationRows(leak, project, t),
    [
      t("addLeak.fields.component.label"),
      leak.component || t("map.sheet.notSpecified"),
    ],
    [
      t("addLeak.fields.leak_speed.shortLabel"),
      leak.leak_speed != null
        ? `${leak.leak_speed} ${t("common.units.litresPerMinute")}`
        : t("map.kml.noRate"),
    ],
  ];
}

const leakStatus = (leak) => leak?.status ?? STATUS.OPEN;

function statusGroups(t) {
  return STATUS_ORDER.map((status) => ({
    key: status,
    name: getStatusMeta(status, t).label,
    color: COLORS[status],
  }));
}

export function exportLeaksKML(
  leaks,
  project,
  t,
  mode = /** @type {string} */ (KML_MODE.LEAKS),
) {
  const base = {
    items: leaks,
    nameOf: (leak) => String(leak.leak_id ?? ""),
    project,
    t,
  };

  if (mode === KML_MODE.REPAIRS) {
    const stages = [
      [REPAIR_STAGE.WAITING_MTR, COLORS[STATUS.OPEN]],
      [REPAIR_STAGE.IN_REPAIR, COLORS[STATUS.IN_PROGRESS]],
      [REPAIR_STAGE.RESOLVED, COLORS[STATUS.RESOLVED]],
    ];
    return buildKml({
      ...base,
      documentName: t("map.kml.repairsDocumentName"),
      groups: stages.map(([stage, color]) => ({
        key: stage,
        name: t(`repairs.stages.${stage}`),
        color,
      })),
      groupOf: (leak) => getRepairStage(leak),
      rowsOf: (leak) => [
        ...leakRows(leak, project, t),
        [t("map.kml.brigade"), getRepairBrigade(leak)],
      ],
    });
  }

  if (mode === KML_MODE.MONITORING) {
    const inRound = leaks.some(
      (leak) => typeof leak?._checkedInRound === "boolean",
    );
    const rowsOf = (leak) => [
      ...leakRows(leak, project, t),
      [t("map.popup.status"), getStatusMeta(leakStatus(leak), t).label],
      [
        t("map.kml.lastInspection"),
        isoDate(getLastMonitoringRecord(leak)?.date) ??
          t("map.kml.neverInspected"),
      ],
    ];
    // Без обхода «не осмотрено» значило бы «никогда не проверялось» — тогда
    // раскладка та же, что у утечек.
    if (!inRound) {
      return buildKml({
        ...base,
        documentName: t("map.kml.monitoringDocumentName"),
        groups: statusGroups(t),
        groupOf: leakStatus,
        rowsOf,
      });
    }
    return buildKml({
      ...base,
      documentName: t("map.kml.monitoringDocumentName"),
      // Внутри «к осмотру» цвет — статус утечки, как у булавки; осмотренные
      // гаснут в серый.
      groups: [
        ...STATUS_ORDER.map((status) => ({
          key: `due:${status}`,
          name: `${t("map.kml.due")} · ${getStatusMeta(status, t).label}`,
          color: COLORS[status],
        })),
        { key: "checked", name: t("map.kml.checked"), color: COLORS.checked },
      ],
      groupOf: (leak) =>
        leak._checkedInRound ? "checked" : `due:${leakStatus(leak)}`,
      rowsOf,
    });
  }

  return buildKml({
    ...base,
    documentName: t("map.kml.documentName"),
    groups: statusGroups(t),
    groupOf: leakStatus,
    rowsOf: (leak) => leakRows(leak, project, t),
  });
}

/**
 * Компоненты на карте — своим файлом: у железа нет скорости утечки, зато
 * есть номер на схеме и состояние, в котором его застали. Папки — по
 * состоянию, в порядке, в каком они встречаются.
 */
export function exportComponentsKML(components, project, t) {
  const notSpecified = t("map.sheet.notSpecified");
  const statusOf = (component) =>
    String(component?.component_status ?? "").trim() || notSpecified;
  const keys = [...new Set(components.map(statusOf))];

  return buildKml({
    documentName: t("map.kml.componentsDocumentName"),
    groups: keys.map((key) => ({ key, name: key, color: COLORS.component })),
    items: components,
    groupOf: statusOf,
    nameOf: (component) =>
      String(component.component_uid ?? component.scheme_tag ?? ""),
    rowsOf: (component) => [
      ...locationRows(component, project, t),
      [t("components.tab"), component.component || notSpecified],
      [t("map.kml.schemeTag"), component.scheme_tag || notSpecified],
      [t("map.popup.status"), statusOf(component)],
      [
        t("map.kml.lastInspection"),
        isoDate(component.inspected_at || component.date) ??
          t("map.kml.neverInspected"),
      ],
    ],
    project,
    t,
  });
}

const LEAK_FILE_NAMES = {
  [KML_MODE.LEAKS]: "leaks_map.kml",
  [KML_MODE.MONITORING]: "monitoring_map.kml",
  [KML_MODE.REPAIRS]: "repairs_map.kml",
};

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

export async function saveLeaksKML(
  leaks,
  project,
  projectFolderName,
  t,
  mode = /** @type {string} */ (KML_MODE.LEAKS),
) {
  return writeKML({
    kml: exportLeaksKML(leaks, project, t, mode),
    fileName: LEAK_FILE_NAMES[mode] ?? LEAK_FILE_NAMES[KML_MODE.LEAKS],
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
