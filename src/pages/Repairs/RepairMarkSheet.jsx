import { useId, useState } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import { useModalDialog } from "@/hooks/useModalDialog";
import Icon from "@/components/ui/Icon/Icon";
import {
  REPAIR_STAGE,
  getRepairStage,
  getRepairBrigade,
} from "@/domain/repairStages";
import s from "./Repairs.module.scss";

const STAGES = [
  REPAIR_STAGE.WAITING_MTR,
  REPAIR_STAGE.IN_REPAIR,
  REPAIR_STAGE.READY,
];

/**
 * «Отметить» в обходе ремонтов (7b): стадия работ, бригада и пара слов о
 * том, что на месте. Принять ремонт отсюда нельзя — для этого экран приёмки
 * со снимком после работ.
 */
export default function RepairMarkSheet({ leak, saving, onSave, onClose }) {
  const { t } = useLanguage();
  const titleId = useId();
  const dialogRef = useModalDialog({ onClose, closeDisabled: saving });
  const [stage, setStage] = useState(
    () => getRepairStage(leak) ?? REPAIR_STAGE.IN_REPAIR,
  );
  const [brigade, setBrigade] = useState(() => getRepairBrigade(leak) ?? "");
  const [note, setNote] = useState("");

  return (
    <div className={s.sheetRoot}>
      <div
        className={s.backdrop}
        data-modal-backdrop=""
        onClick={saving ? undefined : onClose}
      />
      <div
        ref={dialogRef}
        className={s.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className={s.sheetHead}>
          <div>
            <p className={s.caption}>
              {t("cards.tagPrefix")}
              {leak.leak_id ?? "—"}
            </p>
            <h2 id={titleId}>{t("repairs.mark.title")}</h2>
          </div>
          <button
            type="button"
            className={s.iconBtn}
            onClick={onClose}
            disabled={saving}
            aria-label={t("repairs.close")}
          >
            <Icon name="close" size={16} strokeWidth={2} />
          </button>
        </div>

        <div className={s.field}>
          <span>{t("repairs.mark.stage")}</span>
          <div className={s.choice} role="radiogroup">
            {STAGES.map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={stage === value}
                className={stage === value ? s.choiceActive : ""}
                onClick={() => setStage(value)}
              >
                {t(`repairs.stages.${value}`)}
              </button>
            ))}
          </div>
        </div>

        <label className={s.field}>
          <span>{t("repairs.brigade")}</span>
          <input
            value={brigade}
            onChange={(event) => setBrigade(event.target.value)}
            placeholder={t("repairs.brigadePlaceholder")}
          />
        </label>

        <label className={s.field}>
          <span>{t("repairs.comment")}</span>
          <textarea
            value={note}
            rows={3}
            onChange={(event) => setNote(event.target.value)}
            placeholder={t("repairs.mark.notePlaceholder")}
          />
        </label>

        <button
          type="button"
          className={s.primary}
          disabled={saving}
          onClick={() => onSave({ stage, brigade, note })}
        >
          {t("repairs.mark.save")}
        </button>
      </div>
    </div>
  );
}
