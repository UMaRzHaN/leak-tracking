import { useState, useMemo, useEffect } from "react";
import s from "./SettingsModal.module.scss";
import * as variables from "../../data/variables";

export default function SettingsModal({
  open,
  onClose,
  variables: currentVars,
  onSave,
}) {
  /* =========================
     LOCAL DRAFT STATE
  ========================= */
  const [localVars, setLocalVars] = useState(() => ({
    gasType: currentVars.gasType,
    density: currentVars.density,
    percentage_gas_to_flare: currentVars.percentage_gas_to_flare,
    Uncertainty: currentVars.Uncertainty,
  }));

  const [showConfirm, setShowConfirm] = useState(false);

  /* =========================
     SYNC ON OPEN / PROJECT CHANGE
  ========================= */
  useEffect(() => {
    if (!open) return;

    setLocalVars({
      gasType: currentVars.gasType,
      density: currentVars.density,
      percentage_gas_to_flare: currentVars.percentage_gas_to_flare,
      Uncertainty: currentVars.Uncertainty,
    });

    setShowConfirm(false);
  }, [open, currentVars]);

  /* =========================
     DIRTY CHECK
  ========================= */
  const isDirty = useMemo(() => {
    return (
      localVars.gasType !== currentVars.gasType ||
      localVars.density !== currentVars.density ||
      localVars.percentage_gas_to_flare !==
        currentVars.percentage_gas_to_flare ||
      localVars.Uncertainty !== currentVars.Uncertainty
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
      percentage_gas_to_utilization:
        100 - localVars.percentage_gas_to_flare,
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
      <div className={s.backdrop} onClick={handleCancel} />

      <div className={s.modal}>
        <div className={s.header}>
          <h2>Параметры расчёта</h2>
          <button className={s.closeBtn} onClick={handleCancel}>
            ✕
          </button>
        </div>

        {showConfirm && (
          <div className={s.confirmDialog}>
            <div className={s.confirmContent}>
              <span className={s.confirmIcon}>❓</span>
              <h3>Отменить изменения?</h3>
              <p>
                Вы уверены? Все несохранённые изменения будут
                потеряны.
              </p>
            </div>
            <div className={s.confirmFooter}>
              <button
                className={s.confirmKeepBtn}
                onClick={handleKeepEditing}
              >
                Продолжить редактирование
              </button>
              <button
                className={s.confirmDiscardBtn}
                onClick={handleDiscardChanges}
              >
                Отменить изменения
              </button>
            </div>
          </div>
        )}

        <div className={s.content}>
          {/* GAS TYPE */}
          <div className={s.paramGroup}>
            <label htmlFor="gasType">
              <span className={s.label}>Тип газа</span>
            </label>
            <select
              id="gasType"
              value={localVars.gasType}
              onChange={(e) =>
                handleChange("gasType", e.target.value)
              }
              className={s.select}
            >
              {Object.entries(variables.GAS_TYPES).map(
                ([key, { label }]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                )
              )}
            </select>
            <span className={s.current}>
              Плотность: {localVars.density}
            </span>
          </div>

          {/* DENSITY */}
          <div className={s.paramGroup}>
            <label htmlFor="density">
              <span className={s.label}>Плотность</span>
              <span className={s.unit}>(density)</span>
            </label>
            <input
              id="density"
              type="number"
              value={localVars.density}
              className={s.input}
              disabled
            />
            <span className={s.current}>
              Автоматически установлена
            </span>
          </div>

          {/* FLARE */}
          <div className={s.paramGroup}>
            <label htmlFor="flare">
              <span className={s.label}>
                Газ на факелирование
              </span>
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
                  handleChange(
                    "percentage_gas_to_flare",
                    e.target.value
                  )
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
                  handleChange(
                    "percentage_gas_to_flare",
                    e.target.value
                  )
                }
                className={s.numberInput}
              />
            </div>

            <div className={s.distribution}>
              <span className={s.flare}>
                Факелирование:{" "}
                {localVars.percentage_gas_to_flare.toFixed(1)}%
              </span>
              <span className={s.util}>
                Утилизация:{" "}
                {(100 -
                  localVars.percentage_gas_to_flare
                ).toFixed(1)}
                %
              </span>
            </div>
          </div>

          {/* UNCERTAINTY */}
          <div className={s.paramGroup}>
            <label htmlFor="uncertainty">
              <span className={s.label}>
                Неопределённость
              </span>
              <span className={s.unit}>(%)</span>
            </label>
            <input
              id="uncertainty"
              type="number"
              min="0"
              step="0.1"
              value={localVars.Uncertainty}
              onChange={(e) =>
                handleChange("Uncertainty", e.target.value)
              }
              className={s.input}
            />
            <span className={s.current}>
              Текущее: {localVars.Uncertainty}
            </span>
          </div>
        </div>

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
    </>
  );
}
