import { useId, useMemo, useState } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import { useModalDialog } from "@/hooks/useModalDialog";
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
  const titleId = useId();
  const calcTitleId = useId();
  const dialogRef = useModalDialog({ open: !calcOpen, onClose });
  const calcDialogRef = useModalDialog({
    open: calcOpen,
    onClose: () => setCalcOpen(false),
  });

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
            measurements: "Новые замеры",
            emptyKeepsValue: "Пустое поле сохранит прежнее значение",
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
            measurements: "New measurements",
            emptyKeepsValue: "An empty field keeps its previous value",
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
      String(modalCalcVars.serial_number ?? "").trim() === ""
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
      String(effectiveCalcVars.serial_number ?? "").trim() === ""
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
      <div
        ref={dialogRef}
        className={s.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={s.handle} />
        <div className={s.header}>
          <h2 id={titleId} className={s.title}>
            {texts.title}
          </h2>
          <p className={s.subtitle}>{texts.subtitle}</p>
        </div>

        <div className={s.body}>
          <section className={s.measurementsSection}>
            <div className={s.measurementsHeader}>
              <div>
                <h3>{texts.measurements}</h3>
                <p>{texts.emptyKeepsValue}</p>
              </div>
              <button type="button" className={s.copyAllBtn} onClick={copyAll}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="8" y="8" width="11" height="11" rx="2" />
                  <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
                </svg>
                {texts.copyAll}
              </button>
            </div>

            <div className={s.fields}>
              {REOPEN_MEASUREMENT_FIELDS.map(({ key, ru, en }) => {
                const fieldLabel = lang === "ru" ? ru : en;
                return (
                  <div key={key} className={s.field}>
                    <div className={s.fieldHeader}>
                      <label className={s.label} htmlFor={`reopen-${key}`}>
                        {fieldLabel}
                      </label>
                      <span className={s.previous}>
                        {texts.old}: <strong>{formatValue(leak?.[key])}</strong>
                      </span>
                    </div>
                    <div className={s.inputRow}>
                      <input
                        id={`reopen-${key}`}
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
                        aria-label={`${texts.copy}: ${fieldLabel}`}
                        title={`${texts.copy}: ${fieldLabel}`}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <rect x="8" y="8" width="11" height="11" rx="2" />
                          <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
                        </svg>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className={s.calcSection}>
            <div className={s.calcHeader}>
              <h3 className={s.calcTitle}>{texts.calcTitle}</h3>
              <button
                type="button"
                className={s.calcToggle}
                onClick={openCalcModal}
              >
                {texts.editCalc}
              </button>
            </div>
            <div className={s.calcSummary}>
              <span>{formatValue(effectiveCalcVars.equipmentType)}</span>
              <span>№ {formatValue(effectiveCalcVars.serial_number)}</span>
              <span>{gasLabel(effectiveCalcVars.gasType)}</span>
              <span>GWP {formatValue(effectiveCalcVars.GWP)}</span>
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
            ref={calcDialogRef}
            className={s.calcModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby={calcTitleId}
            tabIndex={-1}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={s.calcModalHeader}>
              <h3 id={calcTitleId}>{texts.calcTitle}</h3>
              <button
                type="button"
                className={s.calcModalClose}
                onClick={() => setCalcOpen(false)}
                aria-label={texts.cancel}
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
