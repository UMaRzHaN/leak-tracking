import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useLanguage } from "@/app/hooks/useLanguage";
import CalculationParametersForm from "@/features/calculationParameters/CalculationParametersForm";
import { isPinkBagEquipment } from "@/utils/calculations/calculations";
import s from "./SettingsModal.module.scss";

function pickCalcVars(vars) {
  return {
    equipmentType: vars.equipmentType,
    uncertainty: vars.uncertainty,
    gasType: vars.gasType,
    density: vars.density,
    percentage_gas_to_flare: vars.percentage_gas_to_flare,
    percentage_gas_to_utilization: vars.percentage_gas_to_utilization,
    gasPercentage: vars.gasPercentage,
    GWP: vars.GWP,
    GWP_Minus: vars.GWP_Minus,
    serial_number: vars.serial_number,
    Operating_mode: vars.Operating_mode,
  };
}

export default function SettingsModal({
  open,
  onClose,
  variables: currentVars,
  onSave,
}) {
  const { t, lang } = useLanguage();
  const localeTexts = useMemo(
    () => ({
      title: t("settingsModal.title"),
      gasToFlare: t("settingsModal.gasToFlare"),
      flare: t("settingsModal.flare"),
      utilization: t("settingsModal.utilization"),
      gasContent: t("settingsModal.gasContent"),
      current: t("settingsModal.current"),
      equipmentType: t("settingsModal.equipmentType"),
      uncertainty: t("settingsModal.uncertainty"),
      serialNumber: t("settingsModal.serialNumber"),
      serialNumberRequired:
        lang === "ru"
          ? "Укажите серийный номер оборудования"
          : "Enter equipment serial number",
      equipmentOptions: {
        gfm20: t("settingsModal.equipmentOptions.gfm20"),
        gfm30: t("settingsModal.equipmentOptions.gfm30"),
        pinkBag: t("settingsModal.equipmentOptions.pinkBag"),
      },
      operatingMode: t("settingsModal.operatingMode"),
      operatingModeDays: t("settingsModal.operatingModeDays"),
      gasType: t("settingsModal.gasType"),
      gasOptions: {
        methane: t("settingsModal.gasOptions.methane", {
          defaultValue: lang === "ru" ? "Метан (CH₄)" : "Methane (CH₄)",
        }),
        ethane: t("settingsModal.gasOptions.ethane", {
          defaultValue: lang === "ru" ? "Этан (C₂H₆)" : "Ethane (C₂H₆)",
        }),
        propane: t("settingsModal.gasOptions.propane", {
          defaultValue: lang === "ru" ? "Пропан (C₃H₈)" : "Propane (C₃H₈)",
        }),
        butane: t("settingsModal.gasOptions.butane", {
          defaultValue: lang === "ru" ? "Бутан (C₄H₁₀)" : "Butane (C₄H₁₀)",
        }),
      },
      cancel: t("settingsModal.cancel"),
      save: t("settingsModal.save"),
      confirm: {
        title: t("settingsModal.confirm.title"),
        text: t("settingsModal.confirm.text"),
        continueEditing: t("settingsModal.confirm.continueEditing"),
        discardChanges: t("settingsModal.confirm.discardChanges"),
      },
    }),
    [t, lang],
  );

  const [localVars, setLocalVars] = useState(() => pickCalcVars(currentVars));
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLocalVars(pickCalcVars(currentVars));
    setShowConfirm(false);
    setSubmitted(false);
  }, [open, currentVars]);

  const isDirty = useMemo(
    () =>
      Object.entries(localVars).some(
        ([key, value]) => value !== currentVars[key],
      ),
    [localVars, currentVars],
  );

  const handleSave = () => {
    setSubmitted(true);
    if (
      !isPinkBagEquipment(localVars.equipmentType) &&
      localVars.serial_number == null
    ) {
      return;
    }

    onSave({
      ...currentVars,
      ...localVars,
      percentage_gas_to_utilization: 100 - localVars.percentage_gas_to_flare,
    });

    setShowConfirm(false);
    setSubmitted(false);
    onClose(false);
  };

  const handleCancel = () => {
    if (isDirty) {
      setShowConfirm(true);
      return;
    }
    onClose(false);
  };

  if (!open) return null;

  return (
    <>
      <div className={s.backdrop} onClick={handleCancel} />

      <div className={s.modal}>
        <div className={s.header}>
          <h2>{localeTexts.title}</h2>
          <button className={s.closeBtn} onClick={handleCancel}>
            x
          </button>
        </div>

        <div className={s.content}>
          <CalculationParametersForm
            value={localVars}
            setValue={setLocalVars}
            texts={localeTexts}
            submitted={submitted}
            idPrefix="settings-calc"
          />
        </div>

        <div className={s.footer}>
          <button className={s.cancelBtn} onClick={handleCancel}>
            {localeTexts.cancel}
          </button>
          <button
            className={s.saveBtn}
            onClick={handleSave}
            disabled={!isDirty}
          >
            {localeTexts.save}
          </button>
        </div>
      </div>

      {showConfirm &&
        createPortal(
          <div className={s.confirmDialog}>
            <div className={s.confirmContent}>
              <span className={s.confirmIcon}>?</span>
              <h3>{localeTexts.confirm.title}</h3>
              <p>{localeTexts.confirm.text}</p>
            </div>

            <div className={s.confirmFooter}>
              <button
                className={s.confirmKeepBtn}
                onClick={() => setShowConfirm(false)}
              >
                {localeTexts.confirm.continueEditing}
              </button>
              <button
                className={s.confirmDiscardBtn}
                onClick={() => {
                  setShowConfirm(false);
                  onClose(true);
                }}
              >
                {localeTexts.confirm.discardChanges}
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
