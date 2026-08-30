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
  title = /** @type {string|null} */ (null),
  description = /** @type {string|null} */ (null),
  saveLabel = /** @type {string|null} */ (null),
  allowUnchangedSave = false,
}) {
  const { t } = useLanguage();
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
      serialNumberRequired: t("settings.enterSerialNumber"),
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
          defaultValue: t("settings.gases.methane"),
        }),
        ethane: t("settingsModal.gasOptions.ethane", {
          defaultValue: t("settings.gases.ethane"),
        }),
        propane: t("settingsModal.gasOptions.propane", {
          defaultValue: t("settings.gases.propane"),
        }),
        butane: t("settingsModal.gasOptions.butane", {
          defaultValue: t("settings.gases.butane"),
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
    [t],
  );

  const [localVars, setLocalVars] = useState(() => pickCalcVars(currentVars));
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLocalVars(pickCalcVars(currentVars));
    setShowConfirm(false);
    setSubmitted(false);
    setSaving(false);
  }, [open, currentVars]);

  const isDirty = useMemo(
    () =>
      Object.entries(localVars).some(
        ([key, value]) => value !== currentVars[key],
      ),
    [localVars, currentVars],
  );

  const handleSave = async () => {
    setSubmitted(true);
    if (
      !isPinkBagEquipment(localVars.equipmentType) &&
      localVars.serial_number == null
    ) {
      return;
    }

    setSaving(true);
    try {
      const saved = await onSave({
        ...currentVars,
        ...localVars,
        percentage_gas_to_utilization: 100 - localVars.percentage_gas_to_flare,
      });
      if (saved === false) return;
      setShowConfirm(false);
      setSubmitted(false);
      onClose(false);
    } finally {
      setSaving(false);
    }
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
          <div className={s.headerText}>
            <h2>{title ?? localeTexts.title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button
            type="button"
            className={s.closeBtn}
            onClick={handleCancel}
            aria-label={t("settings.close")}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
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
            disabled={(!isDirty && !allowUnchangedSave) || saving}
          >
            {saving ? "…" : (saveLabel ?? localeTexts.save)}
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
