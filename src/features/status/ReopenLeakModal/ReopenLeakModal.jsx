import { useMemo, useState } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import * as variables from "@/data/variables";
import CalculationParametersForm from "@/features/calculationParameters/CalculationParametersForm";
import {
  buildReopenCalcVars,
  REOPEN_MEASUREMENT_FIELDS,
} from "@/utils/reopenLeak";
import { isPinkBagEquipment } from "@/utils/calculations/calculations";
import s from "./ReopenLeakModal.module.scss";

function formatValue(value) {
  return value == null || value === "" ? "-" : String(value);
}

function gasLabel(key) {
  return variables.GAS_TYPES[key]?.label ?? key;
}

export default function ReopenLeakModal({ leak, vars, onConfirm, onClose }) {
  const { lang } = useLanguage();
  const initialCalcVars = useMemo(
    () => buildReopenCalcVars({ leak, vars }),
    [leak, vars],
  );
  const [draft, setDraft] = useState(() =>
    Object.fromEntries(REOPEN_MEASUREMENT_FIELDS.map(({ key }) => [key, ""])),
  );
  const [calcOpen, setCalcOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [calcDraft, setCalcDraft] = useState(() => initialCalcVars);
  const [calcModalDraft, setCalcModalDraft] = useState(() => initialCalcVars);

  const effectiveCalcVars = useMemo(
    () => buildReopenCalcVars({ leak, vars, draft: { calcVars: calcDraft } }),
    [calcDraft, leak, vars],
  );
  const modalCalcVars = useMemo(
    () =>
      buildReopenCalcVars({
        leak,
        vars,
        draft: { calcVars: calcModalDraft },
      }),
    [calcModalDraft, leak, vars],
  );

  const texts = useMemo(
    () =>
      lang === "ru"
        ? {
            title: "Повторное открытие утечки",
            subtitle: `№ ${leak?.leak_id ?? leak?.index ?? "-"}`,
            old: "Было",
            copy: "Скопировать",
            copyAll: "Скопировать все",
            calcTitle: "Параметры расчета",
            editCalc: "Изменить параметры",
            equipment: "Тип оборудования",
            serial: "Серийный номер оборудования",
            operatingMode: "Режим работы",
            gasType: "Тип газа",
            gasToFlare: "Газ на сжигание",
            flare: "Сжигание",
            utilization: "Утилизация",
            gasContent: "Содержание газа в смеси",
            current: "Текущее",
            daysPerYear: "дней за год",
            serialRequired: "Укажите серийный номер оборудования",
            cancel: "Отмена",
            save: "Сохранить",
            confirm: "Открыть",
            placeholder: "Новое значение",
          }
        : {
            title: "Reopen leak",
            subtitle: `No. ${leak?.leak_id ?? leak?.index ?? "-"}`,
            old: "Previous",
            copy: "Copy",
            copyAll: "Copy all",
            calcTitle: "Calculation parameters",
            editCalc: "Edit parameters",
            equipment: "Equipment type",
            serial: "Equipment serial number",
            operatingMode: "Operating mode",
            gasType: "Gas type",
            gasToFlare: "Gas to flare",
            flare: "Flare",
            utilization: "Utilization",
            gasContent: "Gas content",
            current: "Current",
            daysPerYear: "days per year",
            serialRequired: "Enter equipment serial number",
            cancel: "Cancel",
            save: "Save",
            confirm: "Open",
            placeholder: "New value",
          },
    [lang, leak?.index, leak?.leak_id],
  );
  const calcFormTexts = useMemo(
    () => ({
      gasToFlare: texts.gasToFlare,
      flare: texts.flare,
      utilization: texts.utilization,
      gasContent: texts.gasContent,
      current: texts.current,
      equipmentType: texts.equipment,
      uncertainty: lang === "ru" ? "Неопределенность" : "Uncertainty",
      serialNumber: texts.serial,
      serialNumberRequired: texts.serialRequired,
      operatingMode: texts.operatingMode,
      operatingModeDays: texts.daysPerYear,
      gasType: texts.gasType,
      equipmentOptions: {},
      gasOptions: {},
    }),
    [lang, texts],
  );

  const setField = (key, value) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const openCalcModal = () => {
    setCalcModalDraft(calcDraft);
    setCalcOpen(true);
  };

  const saveCalcModal = () => {
    setSubmitted(true);
    if (
      !isPinkBagEquipment(modalCalcVars.equipmentType) &&
      modalCalcVars.serial_number == null
    ) {
      return;
    }
    setCalcDraft(modalCalcVars);
    setCalcOpen(false);
  };

  const copyField = (key) => setField(key, leak?.[key] ?? "");
  const copyAll = () =>
    setDraft(
      Object.fromEntries(
        REOPEN_MEASUREMENT_FIELDS.map(({ key }) => [key, leak?.[key] ?? ""]),
      ),
    );

  const confirm = () => {
    setSubmitted(true);
    if (
      !isPinkBagEquipment(effectiveCalcVars.equipmentType) &&
      effectiveCalcVars.serial_number == null
    ) {
      openCalcModal();
      return;
    }
    onConfirm({ ...draft, calcVars: effectiveCalcVars });
  };

  return (
    <div
      className={s.overlay}
      onClick={() => (calcOpen ? setCalcOpen(false) : onClose())}
    >
      <div className={s.sheet} onClick={(event) => event.stopPropagation()}>
        <div className={s.handle} />
        <div className={s.header}>
          <h2 className={s.title}>{texts.title}</h2>
          <p className={s.subtitle}>{texts.subtitle}</p>
        </div>

        <div className={s.body}>
          {REOPEN_MEASUREMENT_FIELDS.map(({ key, ru, en }) => (
            <label key={key} className={s.field}>
              <span className={s.label}>{lang === "ru" ? ru : en}</span>
              <span className={s.previous}>
                {texts.old}: {formatValue(leak?.[key])}
              </span>
              <div className={s.inputRow}>
                <input
                  className={s.input}
                  inputMode="decimal"
                  value={draft[key]}
                  onChange={(event) => setField(key, event.target.value)}
                  placeholder={texts.placeholder}
                />
                <button
                  type="button"
                  className={s.copyBtn}
                  onClick={() => copyField(key)}
                >
                  {texts.copy}
                </button>
              </div>
            </label>
          ))}

          <button type="button" className={s.copyAllBtn} onClick={copyAll}>
            {texts.copyAll}
          </button>

          <section className={s.calcSection}>
            <div className={s.calcHeader}>
              <div>
                <h3 className={s.calcTitle}>{texts.calcTitle}</h3>
                <p className={s.calcSummary}>
                  {formatValue(effectiveCalcVars.equipmentType)} ·{" "}
                  {formatValue(effectiveCalcVars.serial_number)} ·{" "}
                  {gasLabel(effectiveCalcVars.gasType)} · GWP{" "}
                  {formatValue(effectiveCalcVars.GWP)}
                </p>
              </div>
              <button
                type="button"
                className={s.calcToggle}
                onClick={openCalcModal}
              >
                {texts.editCalc}
              </button>
            </div>
          </section>
        </div>

        <div className={s.footer}>
          <button type="button" className={s.btnCancel} onClick={onClose}>
            {texts.cancel}
          </button>
          <button type="button" className={s.btnConfirm} onClick={confirm}>
            {texts.confirm}
          </button>
        </div>
      </div>

      {calcOpen && (
        <div
          className={s.calcModalBackdrop}
          onClick={(event) => {
            event.stopPropagation();
            setCalcOpen(false);
          }}
        >
          <div
            className={s.calcModal}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={s.calcModalHeader}>
              <h3>{texts.calcTitle}</h3>
              <button
                type="button"
                className={s.calcModalClose}
                onClick={() => setCalcOpen(false)}
              >
                x
              </button>
            </div>

            <div className={s.calcModalContent}>
              <CalculationParametersForm
                value={modalCalcVars}
                setValue={setCalcModalDraft}
                texts={calcFormTexts}
                submitted={submitted}
                idPrefix="reopen-calc"
              />
            </div>

            <div className={s.calcModalFooter}>
              <button
                type="button"
                className={s.calcModalCancel}
                onClick={() => setCalcOpen(false)}
              >
                {texts.cancel}
              </button>
              <button
                type="button"
                className={s.calcModalDone}
                onClick={saveCalcModal}
              >
                {texts.save}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
