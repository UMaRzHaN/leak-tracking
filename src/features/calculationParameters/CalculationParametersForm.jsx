import * as variables from "@/data/variables";
import { isPinkBagEquipment } from "@/utils/calculations/calculations";
import s from "./CalculationParametersForm.module.scss";

function formatFixed(value, digits = 1) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(digits) : "-";
}

function formatValue(value) {
  return value == null || value === "" ? "-" : String(value);
}

function toNumber(value) {
  const number = Number(value);
  return Number.isNaN(number) ? null : number;
}

export default function CalculationParametersForm({
  value,
  setValue,
  texts,
  submitted = false,
  idPrefix = "calc",
}) {
  const serialNumberMissing =
    submitted &&
    !isPinkBagEquipment(value.equipmentType) &&
    value.serial_number == null;

  const handleChange = (key, nextValue) => {
    setValue((prev) => {
      const next = { ...prev };

      if (key === "gasType") {
        const gas = variables.GAS_TYPES[nextValue];
        if (!gas) return prev;

        next.gasType = nextValue;
        next.density = gas.density;
        return next;
      }

      if (key === "equipmentType") {
        const equipment = variables.EQUIPMENT_TYPES[nextValue];
        if (!equipment) return prev;

        next.equipmentType = nextValue;
        next.uncertainty = equipment.uncertainty;
        next.serial_number = equipment.serial_number;
        return next;
      }

      const number = toNumber(nextValue);
      if (number == null) return prev;

      if (
        (key === "percentage_gas_to_flare" || key === "gasPercentage") &&
        (number < 0 || number > 100)
      ) {
        return prev;
      }
      if ((key === "GWP" || key === "GWP_Minus") && number < 0) return prev;

      next[key] = number;
      if (key === "percentage_gas_to_flare") {
        next.percentage_gas_to_utilization = 100 - number;
      }

      return next;
    });
  };

  const handleSerialChange = (nextValue) => {
    if (isPinkBagEquipment(value.equipmentType)) return;

    setValue((prev) => {
      if (nextValue === "") return { ...prev, serial_number: null };
      if (!/^\d+$/.test(nextValue)) return prev;
      return { ...prev, serial_number: Number(nextValue) };
    });
  };

  const handleOperatingModeChange = (nextValue) => {
    if (nextValue === "") return;
    const int = Math.trunc(Number(nextValue));
    if (!Number.isFinite(int) || int < 1 || int > 365) return;
    setValue((prev) => ({ ...prev, Operating_mode: int }));
  };

  return (
    <div className={s.root}>
      <div className={s.paramGroup}>
        <label htmlFor={`${idPrefix}-flare`}>
          <span className={s.label}>{texts.gasToFlare}</span>
          <span className={s.unit}>(%)</span>
        </label>

        <div className={s.sliderContainer}>
          <input
            id={`${idPrefix}-flare`}
            type="range"
            min="0"
            max="100"
            step="0.1"
            value={value.percentage_gas_to_flare ?? 0}
            onChange={(event) =>
              handleChange("percentage_gas_to_flare", event.target.value)
            }
            className={s.slider}
          />
          <input
            type="number"
            min="0"
            max="100"
            step="0.1"
            value={value.percentage_gas_to_flare ?? ""}
            onChange={(event) =>
              handleChange("percentage_gas_to_flare", event.target.value)
            }
            className={s.numberInput}
          />
        </div>

        <div className={s.distribution}>
          <span className={s.flare}>
            {texts.flare}: {formatFixed(value.percentage_gas_to_flare)}%
          </span>
          <span className={s.util}>
            {texts.utilization}:{" "}
            {formatFixed(
              value.percentage_gas_to_utilization ??
                100 - Number(value.percentage_gas_to_flare ?? 0),
            )}
            %
          </span>
        </div>
      </div>

      <div className={s.paramGroup}>
        <label htmlFor={`${idPrefix}-gas-percentage`}>
          <span className={s.label}>{texts.gasContent}</span>
          <span className={s.unit}>(%)</span>
        </label>
        <div className={s.sliderContainer}>
          <input
            id={`${idPrefix}-gas-percentage`}
            type="range"
            min="0"
            max="100"
            step="0.1"
            value={value.gasPercentage ?? 0}
            onChange={(event) =>
              handleChange("gasPercentage", event.target.value)
            }
            className={s.slider}
          />
          <input
            type="number"
            min="0"
            max="100"
            step="0.1"
            value={value.gasPercentage ?? ""}
            onChange={(event) =>
              handleChange("gasPercentage", event.target.value)
            }
            className={s.numberInput}
          />
        </div>
        <span className={s.current}>
          {texts.current}: {formatFixed(value.gasPercentage)}%
        </span>
      </div>

      <div className={s.paramGroup}>
        <label htmlFor={`${idPrefix}-equipment`}>
          <span className={s.label}>{texts.equipmentType}</span>
        </label>
        <select
          id={`${idPrefix}-equipment`}
          value={value.equipmentType ?? ""}
          onChange={(event) =>
            handleChange("equipmentType", event.target.value)
          }
          className={s.select}
        >
          {Object.entries(variables.EQUIPMENT_TYPES).map(
            ([key, { label, labelKey }]) => (
              <option key={key} value={key}>
                {texts.equipmentOptions?.[labelKey] ?? label}
              </option>
            ),
          )}
        </select>
        <span className={s.current}>
          {texts.uncertainty}: {formatValue(value.uncertainty)}%
        </span>
      </div>

      <div className={s.paramGroup}>
        <label htmlFor={`${idPrefix}-serial-number`}>
          <span className={s.label}>
            {texts.serialNumber}
            {!isPinkBagEquipment(value.equipmentType) && (
              <span className={s.required}> *</span>
            )}
          </span>
        </label>
        <input
          id={`${idPrefix}-serial-number`}
          disabled={isPinkBagEquipment(value.equipmentType)}
          type="number"
          min="0"
          step="1"
          inputMode="numeric"
          value={value.serial_number ?? ""}
          onChange={(event) => handleSerialChange(event.target.value)}
          className={`${s.input} ${serialNumberMissing ? s.inputError : ""}`}
        />
        {serialNumberMissing && (
          <span className={s.errorText}>{texts.serialNumberRequired}</span>
        )}
        <span className={s.current}>
          {texts.current}: {formatValue(value.serial_number)}
        </span>
      </div>

      <div className={s.paramGroup}>
        <label htmlFor={`${idPrefix}-operating-mode`}>
          <span className={s.label}>{texts.operatingMode}</span>
          <span className={s.unit}>({texts.operatingModeDays})</span>
        </label>
        <input
          id={`${idPrefix}-operating-mode`}
          type="number"
          min="1"
          max="365"
          step="1"
          inputMode="numeric"
          value={value.Operating_mode ?? ""}
          onChange={(event) => handleOperatingModeChange(event.target.value)}
          className={s.input}
        />
        <span className={s.current}>
          {texts.current}: {formatValue(value.Operating_mode)}
        </span>
      </div>

      <div className={s.paramGroup}>
        <label htmlFor={`${idPrefix}-gas-type`}>
          <span className={s.label}>{texts.gasType}</span>
        </label>
        <select
          id={`${idPrefix}-gas-type`}
          value={value.gasType ?? "methane"}
          onChange={(event) => handleChange("gasType", event.target.value)}
          className={s.select}
        >
          {Object.entries(variables.GAS_TYPES).map(
            ([key, { label, labelKey }]) => (
              <option key={key} value={key}>
                {texts.gasOptions?.[labelKey] ?? label}
              </option>
            ),
          )}
        </select>
        <span className={s.current}>
          {texts.current}: {formatValue(value.density)} kg/m³
        </span>
      </div>

      <div className={s.paramGroup}>
        <label htmlFor={`${idPrefix}-gwp`}>
          <span className={s.label}>GWP</span>
        </label>
        <input
          id={`${idPrefix}-gwp`}
          type="number"
          min="0"
          step="0.1"
          value={value.GWP ?? ""}
          onChange={(event) => handleChange("GWP", event.target.value)}
          className={s.input}
        />
        <span className={s.current}>
          {texts.current}: {formatValue(value.GWP)}
        </span>
      </div>

      <div className={s.paramGroup}>
        <label htmlFor={`${idPrefix}-gwp-minus`}>
          <span className={s.label}>GWP_Minus</span>
        </label>
        <input
          id={`${idPrefix}-gwp-minus`}
          type="number"
          min="0"
          step="0.1"
          value={value.GWP_Minus ?? ""}
          onChange={(event) => handleChange("GWP_Minus", event.target.value)}
          className={s.input}
        />
        <span className={s.current}>
          {texts.current}: {formatValue(value.GWP_Minus)}
        </span>
      </div>
    </div>
  );
}
