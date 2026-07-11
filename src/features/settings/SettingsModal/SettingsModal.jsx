import { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import s from "./SettingsModal.module.scss";
import * as variables from "@/data/variables";
import { useLanguage } from "@/app/hooks/useLanguage";
import { isPinkBagEquipment } from "@/utils/calculations/calculations";

export default function SettingsModal({
  open,
  onClose,
  variables: currentVars,
  onSave,
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
      density: t("settingsModal.density"),

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
  /* =========================
     LOCAL DRAFT STATE
  ========================= */
  const [localVars, setLocalVars] = useState(() => ({
    equipmentType: currentVars.equipmentType,
    uncertainty: currentVars.uncertainty,
    gasType: currentVars.gasType,
    density: currentVars.density,
    percentage_gas_to_flare: currentVars.percentage_gas_to_flare,
    gasPercentage: currentVars.gasPercentage,
    GWP: currentVars.GWP,
    GWP_Minus: currentVars.GWP_Minus,
    serial_number: currentVars.serial_number,
    Operating_mode: currentVars.Operating_mode,
  }));

  const [showConfirm, setShowConfirm] = useState(false);

  /* =========================
     SYNC ON OPEN / PROJECT CHANGE
  ========================= */
  useEffect(() => {
    if (!open) return;

    setLocalVars({
      equipmentType: currentVars.equipmentType,
      uncertainty: currentVars.uncertainty,
      gasType: currentVars.gasType,
      density: currentVars.density,
      percentage_gas_to_flare: currentVars.percentage_gas_to_flare,
      gasPercentage: currentVars.gasPercentage,
      GWP: currentVars.GWP,
      GWP_Minus: currentVars.GWP_Minus,
      serial_number: currentVars.serial_number,
      Operating_mode: currentVars.Operating_mode,
    });

    setShowConfirm(false);
  }, [open, currentVars]);

  /* =========================
     DIRTY CHECK
  ========================= */
  const isDirty = useMemo(() => {
    return (
      localVars.equipmentType !== currentVars.equipmentType ||
      localVars.uncertainty !== currentVars.uncertainty ||
      localVars.gasType !== currentVars.gasType ||
      localVars.density !== currentVars.density ||
      localVars.percentage_gas_to_flare !==
        currentVars.percentage_gas_to_flare ||
      localVars.gasPercentage !== currentVars.gasPercentage ||
      localVars.GWP !== currentVars.GWP ||
      localVars.GWP_Minus !== currentVars.GWP_Minus ||
      localVars.serial_number !== currentVars.serial_number ||
      localVars.Operating_mode !== currentVars.Operating_mode
    );
  }, [localVars, currentVars]);

  /* =========================
     HANDLERS
  ========================= */
  const handleChange = (key, value) => {
    setLocalVars((prev) => {
      const next = { ...prev };

      if (key === "gasType") {
        const gas = variables.GAS_TYPES[value];
        if (!gas) return prev;

        next.gasType = value;
        next.density = gas.density;
      } else if (key === "equipmentType") {
        const equipment = variables.EQUIPMENT_TYPES[value];
        if (!equipment) return prev;

        next.equipmentType = value;
        next.uncertainty = equipment.uncertainty;
        next.serial_number = equipment.serial_number;
      } else {
        const numValue = Number(value);
        if (Number.isNaN(numValue)) return prev;
        next[key] = numValue;
      }

      return next;
    });
  };

  const handleSave = () => {
    onSave({
      ...currentVars,
      ...localVars,
      percentage_gas_to_utilization: 100 - localVars.percentage_gas_to_flare,
    });

    setShowConfirm(false);
    onClose(false);
  };

  const handleCancel = () => {
    if (isDirty) {
      setShowConfirm(true);
    } else {
      onClose(false);
    }
  };

  const handleDiscardChanges = () => {
    setShowConfirm(false);
    onClose(true);
  };

  const handleKeepEditing = () => {
    setShowConfirm(false);
  };

  if (!open) return null;

  /* =========================
     RENDER
  ========================= */
  return (
    <>
      {/* ===== BACKDROP ===== */}
      <div className={s.backdrop} onClick={handleCancel} />

      {/* ===== MODAL ===== */}
      <div className={s.modal}>
        <div className={s.header}>
          <h2>{localeTexts.title}</h2>
          <button className={s.closeBtn} onClick={handleCancel}>
            ✕
          </button>
        </div>

        {/* ===== CONTENT ===== */}
        <div className={s.content}>
          {/* FLARE */}
          <div className={s.paramGroup}>
            <label htmlFor="flare">
              <span className={s.label}>{localeTexts.gasToFlare}</span>
              <span className={s.unit}>(%)</span>
            </label>

            <div className={s.sliderContainer}>
              <input
                id="flare"
                type="range"
                min="0"
                max="100"
                step="0.1"
                value={localVars.percentage_gas_to_flare}
                onChange={(e) =>
                  handleChange("percentage_gas_to_flare", e.target.value)
                }
                className={s.slider}
              />
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={localVars.percentage_gas_to_flare}
                onChange={(e) =>
                  handleChange("percentage_gas_to_flare", e.target.value)
                }
                className={s.numberInput}
              />
            </div>

            <div className={s.distribution}>
              <span className={s.flare}>
                {localeTexts.flare}:{" "}
                {localVars.percentage_gas_to_flare.toFixed(1)}%
              </span>
              <span className={s.util}>
                {localeTexts.utilization}:{" "}
                {(100 - localVars.percentage_gas_to_flare).toFixed(1)}%
              </span>
            </div>
          </div>
          {/* GAS PERCENTAGE */}
          <div className={s.paramGroup}>
            <label htmlFor="gasPercentage">
              <span className={s.label}>{localeTexts.gasContent}</span>
              <span className={s.unit}>(%)</span>
            </label>
            <div className={s.sliderContainer}>
              <input
                id="gasPercentage"
                type="range"
                min="0"
                max="100"
                step="0.1"
                value={localVars.gasPercentage}
                onChange={(e) => handleChange("gasPercentage", e.target.value)}
                className={s.slider}
              />
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={localVars.gasPercentage}
                onChange={(e) => handleChange("gasPercentage", e.target.value)}
                className={s.numberInput}
              />
            </div>
            <span className={s.current}>
              {localeTexts.current}: {localVars.gasPercentage.toFixed(1)}%
            </span>
          </div>
          {/* EQUIPMENT TYPE */}
          <div className={s.paramGroup}>
            <label htmlFor="equipmentType">
              <span className={s.label}>{localeTexts.equipmentType}</span>
            </label>
            <select
              id="equipmentType"
              value={localVars.equipmentType}
              onChange={(e) => handleChange("equipmentType", e.target.value)}
              className={s.select}
            >
              {Object.entries(variables.EQUIPMENT_TYPES).map(
                ([key, { label, labelKey }]) => (
                  <option key={key} value={key}>
                    {localeTexts.equipmentOptions[labelKey] ?? label}
                  </option>
                ),
              )}
            </select>
            <span className={s.current}>
              {localeTexts.uncertainty}: {localVars.uncertainty}%
            </span>
          </div>
          {/* SERIAL NUMBER */}
          <div className={s.paramGroup}>
            <label htmlFor="serial_number">
              <span className={s.label}>{localeTexts.serialNumber}</span>
            </label>
            <input
              disabled={isPinkBagEquipment(localVars.equipmentType)}
              id="serial_number"
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              value={localVars.serial_number ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                if (!isPinkBagEquipment(localVars.equipmentType)) {
                  if (v === "") {
                    setLocalVars((prev) => ({ ...prev, serial_number: null }));
                    return;
                  }
                  if (/^\d+$/.test(v)) {
                    setLocalVars((prev) => ({
                      ...prev,
                      serial_number: Number(v),
                    }));
                  }
                }
              }}
              className={s.input}
            />
            <span className={s.current}>
              {localeTexts.current}: {localVars.serial_number}
            </span>
          </div>
          {/* OPERATING MODE */}
          <div className={s.paramGroup}>
            <label htmlFor="Operating_mode">
              <span className={s.label}>{localeTexts.operatingMode}</span>
              <span className={s.unit}>({localeTexts.operatingModeDays})</span>
            </label>
            <input
              id="Operating_mode"
              type="number"
              min="1"
              max="365"
              step="1"
              inputMode="numeric"
              value={localVars.Operating_mode ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "") return;
                const int = Math.trunc(Number(v));
                if (Number.isFinite(int) && int >= 1 && int <= 365) {
                  setLocalVars((prev) => ({ ...prev, Operating_mode: int }));
                }
              }}
              className={s.input}
            />
            <span className={s.current}>
              {localeTexts.current}: {localVars.Operating_mode}
            </span>
          </div>
          {/* GAS TYPE */}
          <div className={s.paramGroup}>
            <label htmlFor="gasType">
              <span className={s.label}>{localeTexts.gasType}</span>
            </label>
            <select
              id="gasType"
              value={localVars.gasType}
              onChange={(e) => handleChange("gasType", e.target.value)}
              className={s.select}
            >
              {Object.entries(variables.GAS_TYPES).map(
                ([key, { label, labelKey }]) => (
                  <option key={key} value={key}>
                    {localeTexts.gasOptions[labelKey] ?? label}
                  </option>
                ),
              )}
            </select>
            <span className={s.current}>
              {localeTexts.current}: {localVars.density}
            </span>
          </div>

          {/* GWP */}
          <div className={s.paramGroup}>
            <label htmlFor="GWP">
              <span className={s.label}>GWP</span>
            </label>
            <input
              id="GWP"
              type="number"
              min="0"
              step="0.1"
              value={localVars.GWP}
              onChange={(e) => handleChange("GWP", e.target.value)}
              className={s.input}
            />
            <span className={s.current}>
              {localeTexts.current}: {localVars.GWP}
            </span>
          </div>
          {/* GWP_Minus */}
          <div className={s.paramGroup}>
            <label htmlFor="GWP_Minus">
              <span className={s.label}>GWP_Minus</span>
            </label>
            <input
              id="GWP_Minus"
              type="number"
              min="0"
              step="0.1"
              value={localVars.GWP_Minus}
              onChange={(e) => handleChange("GWP_Minus", e.target.value)}
              className={s.input}
            />
            <span className={s.current}>
              {localeTexts.current}: {localVars.GWP_Minus}
            </span>
          </div>
        </div>

        {/* ===== FOOTER ===== */}
        <div className={s.footer}>
          <button className={s.cancelBtn} onClick={handleCancel}>
            Отмена
          </button>
          <button
            className={s.saveBtn}
            onClick={handleSave}
            disabled={!isDirty}
          >
            Сохранить
          </button>
        </div>
      </div>

      {/* ===== CONFIRM (PORTAL) ===== */}
      {showConfirm &&
        createPortal(
          <div className={s.confirmDialog}>
            <div className={s.confirmContent}>
              <span className={s.confirmIcon}>❓</span>
              <h3>Отменить изменения?</h3>
              <p>Вы уверены? Все несохранённые изменения будут потеряны.</p>
            </div>

            <div className={s.confirmFooter}>
              <button className={s.confirmKeepBtn} onClick={handleKeepEditing}>
                Продолжить редактирование
              </button>
              <button
                className={s.confirmDiscardBtn}
                onClick={handleDiscardChanges}
              >
                Отменить изменения
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
