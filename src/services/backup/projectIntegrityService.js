import { getPhotoSrc } from "@/hooks/photoService";
import { logger } from "@/utils/logger";
import { isLinkedToComponent } from "@/domain/leakComponentLink";
import { normalizeLeakTag } from "@/utils/leakIdentity";
import { hasValidCoordinates } from "@/utils/coordinates";
import {
  LEAK_PHOTO_FIELDS,
  MONITORING_PHOTO_FIELDS,
} from "@/utils/photoFields";

function getLeakPhotoRefs(leak) {
  const refs = LEAK_PHOTO_FIELDS.map((field) => [field, leak?.[field]]);
  if (Array.isArray(leak?.monitoringRecords)) {
    leak.monitoringRecords.forEach((record, index) => {
      MONITORING_PHOTO_FIELDS.forEach((field) => {
        refs.push([`monitoringRecords[${index}].${field}`, record?.[field]]);
      });
    });
  }
  return refs;
}

function getLeakLabel(leak) {
  return String(leak?.leak_id ?? leak?.id ?? "?");
}

function getLatestMonitoringResult(leak) {
  const records = Array.isArray(leak?.monitoringRecords)
    ? leak.monitoringRecords
    : [];
  if (!records.length) return null;

  return records.reduce((latest, record) => {
    const latestTime = Date.parse(latest?.date ?? "");
    const recordTime = Date.parse(record?.date ?? "");
    if (!Number.isFinite(recordTime)) return latest ?? record;
    if (!Number.isFinite(latestTime) || recordTime >= latestTime) return record;
    return latest;
  }, null)?.result;
}

async function photoExists(path, idbGetPhoto) {
  if (!path) return false;
  if (path.startsWith("data:image/")) return true;

  if (path.startsWith("idb://")) {
    const key = path.replace("idb://", "");
    return Boolean(await idbGetPhoto?.(key));
  }

  return Boolean(await getPhotoSrc(path));
}

/**
 * Идентификаторы карточек, которые сейчас есть в реестре.
 *
 * `null` — «спросить не у кого»: у типа проекта реестра нет или он не
 * прочитался. Пустой реестр и непрочитанный реестр выглядят одинаково, и
 * принять второй за первый значит объявить битыми все связи разом.
 *
 * Читается прямо здесь, а не берётся у владельца списка: проверку запускают с
 * экрана настроек, где реестр никто не открывал, и поднимать ради одной
 * кнопки весь обход в память приложения незачем.
 */
export async function readComponentRegistryIds(project) {
  const { hasComponentRegistry } =
    await import("@/configs/componentRegistry.config");
  if (!project?.id || !hasComponentRegistry(project)) return null;

  try {
    const [{ ComponentRepository }, { liveComponents }] = await Promise.all([
      import("@/repositories/ComponentRepository"),
      import("@/domain/componentTombstones"),
    ]);
    const stored = await ComponentRepository.load(project);
    return new Set(
      liveComponents(stored).map((component) => String(component.id)),
    );
  } catch (error) {
    logger.warn(
      "[settings] реестр не прочитался, связи не проверяются:",
      error,
    );
    return null;
  }
}

/**
 * @param {any[]} [leaks]
 * @param {{
 *   idbGetPhoto?: Function,
 *   leakPhotoRequired?: boolean,
 *   monitoringPhotoRequired?: boolean,
 *   componentIds?: Set<string>|null,
 * }} [options]
 *   `componentIds` — карточки реестра, которые сейчас есть. `null` значит «не
 *   у кого спросить»: у типа проекта нет реестра или он не прочитался. Тогда
 *   связи не проверяются вовсе — пустой реестр и непрочитанный реестр дают
 *   один и тот же ответ, и второй объявил бы битыми все связи разом.
 */
export async function analyzeProjectIntegrity(
  leaks = [],
  {
    idbGetPhoto,
    leakPhotoRequired = true,
    monitoringPhotoRequired = true,
    componentIds = null,
  } = {},
) {
  const missingPhoto = [];
  const missingRepairPhoto = [];
  const missingAfterPhoto = [];
  const missingMonitoringPhoto = [];
  const brokenPhoto = [];
  const missingCoords = [];
  const duplicateLeakIds = [];
  const missingComponent = [];
  const seenLeakIds = new Map();

  for (const leak of leaks) {
    const label = getLeakLabel(leak);
    const latestMonitoringResult = getLatestMonitoringResult(leak);
    const optionalMonitoringRepairPhoto =
      !monitoringPhotoRequired && latestMonitoringResult === "needs_recheck";
    const optionalMonitoringAfterPhoto =
      !monitoringPhotoRequired && latestMonitoringResult === "resolved";

    if (!hasValidCoordinates(leak)) missingCoords.push(label);

    const leakTag = normalizeLeakTag(leak?.leak_id);
    if (leakTag) {
      if (seenLeakIds.has(leakTag)) {
        duplicateLeakIds.push(leakTag);
      } else {
        seenLeakIds.set(leakTag, leak);
      }
    }

    if (leakPhotoRequired && !leak?.photo) {
      missingPhoto.push(label);
    }

    if (
      leak?.status === "in_progress" &&
      !leak?.photo_repair &&
      !optionalMonitoringRepairPhoto
    ) {
      missingRepairPhoto.push(label);
    }

    if (
      leak?.status === "resolved" &&
      !leak?.photo_after &&
      !optionalMonitoringAfterPhoto
    ) {
      missingAfterPhoto.push(label);
    }

    if (monitoringPhotoRequired && Array.isArray(leak?.monitoringRecords)) {
      leak.monitoringRecords.forEach((record, index) => {
        if (!record?.photo) {
          missingMonitoringPhoto.push(`${label}:monitoringRecords[${index}]`);
        }
      });
    }

    // Утечка ссылается на карточку, которой в реестре нет. Чаще всего карточку
    // удалили — своим удалением или приехавшим с соседнего устройства. Утечка
    // от этого не ломается: наименование, привод и присоединение переписаны на
    // неё саму, и подпись читается по ним. Но «перейти к карточке» вести
    // некуда, и человек об этом узнаёт, только ткнув.
    if (componentIds && isLinkedToComponent(leak)) {
      if (!componentIds.has(String(leak.component_id))) {
        const uid = String(leak.component_uid ?? "").trim();
        missingComponent.push(uid ? `${label}:№${uid}` : label);
      }
    }

    for (const [field, path] of getLeakPhotoRefs(leak)) {
      if (!path) continue;
      if (!(await photoExists(path, idbGetPhoto))) {
        brokenPhoto.push(`${label}:${field}`);
      }
    }
  }

  const issues =
    missingPhoto.length +
    missingRepairPhoto.length +
    missingAfterPhoto.length +
    missingMonitoringPhoto.length +
    brokenPhoto.length +
    missingCoords.length +
    duplicateLeakIds.length +
    missingComponent.length;

  return {
    total: leaks.length,
    issues,
    missingPhoto,
    missingRepairPhoto,
    missingAfterPhoto,
    missingMonitoringPhoto,
    brokenPhoto,
    missingCoords,
    duplicateLeakIds,
    missingComponent,
    ok: issues === 0,
  };
}
