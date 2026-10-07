import { REPAIR_CHECK_OUTCOME } from "@/domain/repairCheck";

// Кнопка и строка под ответами говорят, куда уйдёт запись.
const OUTCOME_TEXT = {
  [REPAIR_CHECK_OUTCOME.RESOLVED]: {
    submit: "repairs.accept.submit",
    result: "repairs.accept.resultResolved",
  },
  [REPAIR_CHECK_OUTCOME.IN_REPAIR]: {
    submit: "repairs.accept.keepInRepair",
    result: "repairs.accept.resultInRepair",
  },
  [REPAIR_CHECK_OUTCOME.WAITING_MTR]: {
    submit: "repairs.accept.toWaiting",
    result: "repairs.accept.resultWaiting",
  },
};

// Повторная проверка закрытого ремонта: «утечки нет» оставляет его закрытым,
// «утечка есть» переоткрывает утечку.
const RECHECK_TEXT = {
  [REPAIR_CHECK_OUTCOME.RESOLVED]: {
    submit: "repairs.accept.confirmResolved",
    result: "repairs.accept.resultStillResolved",
  },
  [REPAIR_CHECK_OUTCOME.IN_REPAIR]: {
    submit: "repairs.accept.reopenInRepair",
    result: "repairs.accept.resultReopenInRepair",
  },
  [REPAIR_CHECK_OUTCOME.WAITING_MTR]: {
    submit: "repairs.accept.toWaiting",
    result: "repairs.accept.resultReopenWaiting",
  },
};

/**
 * Подписи кнопки и итога проверки ремонта.
 *
 * @param {string} outcome исход из `repairCheckOutcome`
 * @param {boolean} recheck проверяют ли закрытый ремонт повторно
 */
export function repairCheckTexts(outcome, recheck) {
  return (recheck ? RECHECK_TEXT : OUTCOME_TEXT)[outcome];
}
