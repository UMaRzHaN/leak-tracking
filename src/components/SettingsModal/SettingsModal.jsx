import { useState, useMemo } from "react";
import s from "./SettingsModal.module.scss";
import * as variables from "../../data/variables";

export default function SettingsModal({
  open,
  onClose,
  variables: currentVars,
  onVariableChange,
}) {
  const [localVars, setLocalVars] = useState({
    gasType: currentVars.gasType,
    density: currentVars.density,
    percentage_gas_to_flare: currentVars.percentage_gas_to_flare,
    Uncertainty: currentVars.Uncertainty,
  });

  const [showConfirm, setShowConfirm] = useState(false);

  // Проверяем, были ли изменения
  const isDirty = useMemo(() => {
    return (
      localVars.gasType !== currentVars.gasType ||
      localVars.density !== currentVars.density ||
      localVars.percentage_gas_to_flare !==
        currentVars.percentage_gas_to_flare ||
      localVars.Uncertainty !== currentVars.Uncertainty
    );
  }, [localVars, currentVars]);

  const handleChange = (key, value) => {
    if (key === "gasType") {
      // При изменении типа газа обновляем плотность
      const newDensity = variables.GAS_TYPES[value].density;
      setLocalVars((prev) => ({
        ...prev,
        gasType: value,
        density: newDensity,
      }));
    } else {
      const numValue = parseFloat(value);
      if (!isNaN(numValue)) {
        setLocalVars((prev) => ({ ...prev, [key]: numValue }));
      }
    }
  };

  const handleSave = () => {
    onVariableChange("gasType", localVars.gasType);
    onVariableChange("density", localVars.density);
    onVariableChange(
      "percentage_gas_to_flare",
      localVars.percentage_gas_to_flare,
    );
    onVariableChange("Uncertainty", localVars.Uncertainty);
    setShowConfirm(false);
    onClose(false);
  };

  const handleCancel = () => {
    if (isDirty) {
      setShowConfirm(true);
    } else {
      setLocalVars({
        gasType: currentVars.gasType,
        density: currentVars.density,
        percentage_gas_to_flare: currentVars.percentage_gas_to_flare,
        Uncertainty: currentVars.Uncertainty,
      });
      onClose(false);
    }
  };

  const handleDiscardChanges = () => {
    setLocalVars({
      gasType: currentVars.gasType,
      density: currentVars.density,
      percentage_gas_to_flare: currentVars.percentage_gas_to_flare,
      Uncertainty: currentVars.Uncertainty,
    });
    setShowConfirm(false);
    onClose(true);
  };

  const handleKeepEditing = () => {
    setShowConfirm(false);
  };

  if (!open) return null;

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
          </div>
        )}

        <div className={s.content}>
          <div className={s.paramGroup}>
            <label htmlFor="gasType">
              <span className={s.label}>Тип газа</span>
            </label>
            <select
              id="gasType"
              value={localVars.gasType}
              onChange={(e) => handleChange("gasType", e.target.value)}
              className={s.select}
            >
              {Object.entries(variables.GAS_TYPES).map(([key, { label }]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
            <span className={s.current}>Плотность: {localVars.density}</span>
          </div>

          <div className={s.paramGroup}>
            <label htmlFor="density">
              <span className={s.label}>Плотность</span>
              <span className={s.unit}>(density)</span>
            </label>
            <input
              id="density"
              type="number"
              step="0.000001"
              value={localVars.density}
              onChange={(e) => handleChange("density", e.target.value)}
              className={s.input}
              disabled
            />
            <span className={s.current}>Автоматически установлена</span>
          </div>

          <div className={s.paramGroup}>
            <label htmlFor="flare">
              <span className={s.label}>Газ на факелирование</span>
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
                step="0.1"
                min="0"
                max="100"
                value={localVars.percentage_gas_to_flare}
                onChange={(e) =>
                  handleChange("percentage_gas_to_flare", e.target.value)
                }
                className={s.numberInput}
              />
            </div>
            <div className={s.distribution}>
              <span className={s.flare}>
                Факелирование: {localVars.percentage_gas_to_flare.toFixed(1)}%
              </span>
              <span className={s.util}>
                Утилизация:{" "}
                {(100 - localVars.percentage_gas_to_flare).toFixed(1)}%
              </span>
            </div>
          </div>

          <div className={s.paramGroup}>
            <label htmlFor="uncertainty">
              <span className={s.label}>Неопределённость</span>
              <span className={s.unit}>(%)</span>
            </label>
            <input
              id="uncertainty"
              type="number"
              step="0.1"
              min="0"
              value={localVars.Uncertainty}
              onChange={(e) => handleChange("Uncertainty", e.target.value)}
              className={s.input}
            />
            <span className={s.current}>Текущее: {localVars.Uncertainty}</span>
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
