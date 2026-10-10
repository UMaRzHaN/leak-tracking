import { mergeInvoices } from "@/domain/equipmentAcceptance";
import { readAcceptances, saveAcceptances } from "@/utils/acceptanceStorage";
import {
  readStoredSurvey,
  readSurvey,
  saveSurvey,
} from "@/utils/surveyStorage";

/**
 * Накладные приёмки и ввод обследования — небольшой JSON проекта рядом с
 * утечками. В архив они едут в project.json, и при приёме в существующий
 * проект правило одно для любого пути: ZIP с перезаписью, слиянием или
 * обменом и Excel с его служебным листом.
 *
 * Накладные сливаются, а не заменяются: приёмку, сделанную на этом устройстве
 * после выгрузки архива, приём терять не должен. Ввод обследования — одна
 * запись на проект: берётся более свежая, со своей меткой из архива.
 *
 * @param {string} projectId
 * @param {{ acceptances?: unknown, survey?: any }|null|undefined} meta
 */
export function mergeAcceptancesAndSurvey(projectId, meta) {
  if (Array.isArray(meta?.acceptances)) {
    saveAcceptances(
      projectId,
      mergeInvoices(readAcceptances(projectId), meta.acceptances),
    );
  }
  if (
    meta?.survey &&
    String(meta.survey.updatedAt ?? "") >
      String(readSurvey(projectId).updatedAt ?? "")
  ) {
    saveSurvey(projectId, meta.survey, { keepUpdatedAt: true });
  }
}

/**
 * Снимок до импорта: импорт откатывается целиком, и накладные с обследованием,
 * слитые до сбоя записи утечек, должны вернуться вместе с ними.
 *
 * @param {string} projectId
 * @returns {() => void} восстановление снимка
 */
export function snapshotAcceptancesAndSurvey(projectId) {
  const acceptances = readAcceptances(projectId);
  const survey = readStoredSurvey(projectId);
  return () => {
    saveAcceptances(projectId, acceptances);
    saveSurvey(projectId, survey, { keepUpdatedAt: true });
  };
}
