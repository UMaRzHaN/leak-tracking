import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ConfirmSheet from "@/components/ui/ConfirmSheet/ConfirmSheet";
import PageHeader from "@/components/layout/PageHeader/PageHeader";
import AddLeakFooter from "@/features/leakForm/Footer/AddLeakFooter";
import ClearActions from "@/features/leakForm/components/ClearActions";
import VoiceButton from "@/features/voice/VoiceButton/VoiceButton";
import VoicePreviewSheet from "@/features/voice/VoicePreviewSheet/VoicePreviewSheet";
import { useVoiceControl } from "@/app/hooks/useVoiceControl";
import StepRenderer from "@/features/leakForm/components/StepRenderer/StepRenderer";
import {
  isValidComponentUid,
  missingRequiredFields,
} from "@/domain/componentRegistry";
import { isValidLatitude, isValidLongitude } from "@/utils/coordinates";
import { toNullableNumber } from "@/utils/normalize/toNullableNumber";
import { hasCoordsFix, waitForCoordsFix } from "@/utils/coordsFix";
import { hasRestorablePhoto } from "@/utils/restorablePhoto";
import { useFormDraft } from "@/hooks/useFormDraft";
import { isFormDirty } from "@/features/leakForm/utils/isLeakFormDirty";
import { translateAutocompleteOption } from "@/features/search/Autocomplete/optionTranslations";
import { getCopyPreviousKeys } from "@/features/leakForm/utils/copyPrevious";
import { buildGhostPlaceholders } from "@/features/leakForm/utils/ghostPlaceholders";
import { localizeComponentSteps } from "./localizeComponentSteps";
import leak from "@/features/leakForm/LeakForm.module.scss";
import s from "./ComponentRegistry.module.scss";
import { fromEntries } from "@/utils/fromEntries";

/** Проставляет приложение, а не человек: фикс снимается при открытии формы. */
const DRAFT_DERIVED_FIELDS = ["lat", "lng"];

/**
 * The card a walker fills in standing in front of a piece of equipment.
 *
 * Built from the leak form's own parts — PageHeader, StepRenderer, ClearActions,
 * AddLeakFooter and its stylesheet — so a walker moving between the two screens
 * meets the same interface twice rather than two dialects of one.
 *
 * What differs is the rules, not the look. A duplicate identity number warns but
 * never refuses: the app cannot see another device's numbers, so refusing would
 * only strand somebody at a wellhead. And coordinates are stamped from the
 * receiver without ever being asked for, the way a leak records them.
 */
export default function ComponentCardForm({
  steps: rawSteps,
  projectId = null,
  coords = null,
  gpsEnabled = true,
  setGpsEnabled = null,
  onSavedWithoutCoords = null,
  copyableFields = [],
  lastComponent = null,
  component = null,
  findConflicts,
  onSave,
  onCancel,
  texts,
  t,
  photoRequired = true,
  voice = null,
}) {
  const steps = useMemo(() => {
    const localized = localizeComponentSteps(rawSteps, t);
    if (photoRequired) return localized;
    // Turned off in settings, the photo stops gating the card entirely rather
    // than being asked for and then waved through.
    return localized.map((step) => ({
      ...step,
      title: step.title.replace(" *", ""),
      fields: step.fields.map((field) =>
        field.type === "photo" ? { ...field, required: false } : field,
      ),
    }));
  }, [photoRequired, rawSteps, t]);
  const isEditing = Boolean(component?.id);

  const [form, setForm] = useState(() =>
    isEditing
      ? { ...component }
      : {
          // The fix is stamped once, when the card is opened rather than at
          // save: the walker is standing at the equipment now, and by the time
          // the passport fields are filled in they may have moved on.
          //
          // The identity number is not prefilled. It is written on a tag the
          // walker assigns, and a number already sitting in the field invites
          // being left as it is.
          lat: toNullableNumber(coords?.lat) ?? "",
          lng: toNullableNumber(coords?.lng) ?? "",
        },
  );
  const [step, setStep] = useState(1);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [draftPrompt, setDraftPrompt] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const pendingKeysRef = useRef([]);

  /*
   * Черновик карточки.
   *
   * Обход прерывают постоянно — по звонку, по разряженной батарее, по «сначала
   * дойду до конца нитки». Карточка заполняется в четыре шага у железа, и
   * потерять её на полпути значит идти к этому железу второй раз.
   *
   * Только при заведении. В правке черновик перезаписывал бы сохранённую
   * карточку недоделанной правкой — а её никто не просил сохранять.
   *
   * `lat`/`lng` не считаются заполненным: они штампуются в момент открытия
   * формы, и без этого только что открытая карточка выглядела бы начатой.
   */
  const { saveDraft, loadDraft, clearDraft } = useFormDraft(
    projectId,
    "component",
  );
  const draftEnabled = Boolean(projectId) && !isEditing;

  useEffect(() => {
    if (!draftEnabled) {
      setDraftReady(true);
      return;
    }
    const stored = loadDraft();
    const worthRestoring = isFormDirty(stored?.form, DRAFT_DERIVED_FIELDS);
    if (stored && !worthRestoring) clearDraft();
    setDraftPrompt(worthRestoring);
    setDraftReady(!worthRestoring);
  }, [clearDraft, draftEnabled, loadDraft]);

  useEffect(() => {
    if (!draftEnabled || draftPrompt || !draftReady) return undefined;
    if (!isFormDirty(form, DRAFT_DERIVED_FIELDS)) {
      clearDraft();
      return undefined;
    }
    const timer = setTimeout(() => saveDraft(form, step), 1000);
    return () => clearTimeout(timer);
  }, [
    clearDraft,
    draftEnabled,
    draftPrompt,
    draftReady,
    form,
    saveDraft,
    step,
  ]);

  const handleRestoreDraft = useCallback(() => {
    const stored = loadDraft();
    if (stored?.form) setForm(stored.form);
    if (stored?.step) setStep(stored.step);
    setDraftPrompt(false);
    setDraftReady(true);
  }, [loadDraft]);

  const handleDiscardDraft = useCallback(() => {
    clearDraft();
    setDraftPrompt(false);
    setDraftReady(true);
  }, [clearDraft]);

  const required = useMemo(
    () =>
      steps.flatMap((s) =>
        s.fields.filter((f) => f.required).map((f) => f.key),
      ),
    [steps],
  );

  /*
   * Значение предыдущей карточки серым в пустом поле — так же, как в форме
   * утечки. Обход однообразен: то же подразделение, та же среда, тот же тип
   * соединения вдоль всей нитки, и быстрее всего сказать «здесь так же»,
   * увидев, что было в прошлый раз. Подсказка ничего не пишет: значение
   * попадёт в карточку, только если его напечатать или принять предложение
   * при сохранении.
   *
   * Только при заведении. В правке серым стояло бы то, что человек мог принять
   * за уже сохранённое значение соседней карточки.
   */
  const ghostPlaceholders = useMemo(
    () =>
      isEditing
        ? null
        : buildGhostPlaceholders(lastComponent, steps[step - 1]?.fields, form),
    [form, isEditing, lastComponent, step, steps],
  );

  /*
   * Голос заводится здесь, а не на странице: распознанное нужно положить в
   * поля этого шага, а о шаге знает только форма. Раньше кнопка стояла на
   * странице, распознавание запускалось — и результат было некуда деть.
   */
  const {
    pendingVoiceData,
    dismissVoiceData,
    startVoiceInput,
    stopVoiceInput,
  } = useVoiceControl({ step, steps: steps, voice });

  const handleVoiceConfirm = useCallback(
    (confirmed) => {
      setForm((current) => ({ ...current, ...confirmed }));
      dismissVoiceData();
    },
    [dismissVoiceData],
  );

  const conflicts = useMemo(
    () => findConflicts?.(form.component_uid, component?.id) ?? [],
    [findConflicts, form.component_uid, component?.id],
  );

  const handleChange = useCallback((key, value) => {
    setForm((current) => {
      const next = { ...current, [key]: value };
      // Naming the component fills the English column the workbook expects, so
      // the operator names it once instead of twice. Перевод берётся общим
      // переводчиком подсказок — тем же, что переводит это поле у утечки.
      if (key === "component" && !current.component_name_en) {
        const translated = translateAutocompleteOption(value, "en");
        // Незнакомое наименование возвращается как есть; в английскую колонку
        // русское слово класть нельзя — лучше пусто, чем неверно.
        if (translated && translated !== value) {
          next.component_name_en = translated;
        }
      }
      return next;
    });
    setErrors((current) =>
      current[key] ? { ...current, [key]: undefined } : current,
    );
  }, []);

  /** The first step carrying one of these keys, so an error is never hidden. */
  const stepOf = useCallback(
    (keys) => {
      for (const [index, formStep] of steps.entries()) {
        if (formStep.fields.some((field) => keys.includes(field.key))) {
          return index + 1;
        }
      }
      return 1;
    },
    [steps],
  );

  /**
   * Which required fields of one step are still missing.
   *
   * A photo is checked for its parts rather than its presence: PhotoInput
   * holds an object, and an empty one would pass a truthiness test while the
   * card carries no evidence at all.
   */
  const missingOnStep = useCallback(
    (stepIndex) =>
      (steps[stepIndex - 1]?.fields ?? [])
        .filter((field) => field.required)
        .filter((field) => {
          const value = form[field.key];
          // Снимок, восстановленный из черновика, приходит без `raw` — только
          // предпросмотром. Требовать `raw` значило бы объявить его
          // отсутствующим: фотография на экране есть, а форма не сохраняется.
          if (field.type === "photo") return !hasRestorablePhoto(value);
          return value == null || String(value).trim() === "";
        })
        .map((field) => field.key),
    [form, steps],
  );

  /**
   * Blocks the step until its required fields are answered. The walk moves
   * forward one screen at a time, so a missing number is caught where it is
   * asked for rather than three steps later at the save button.
   */
  const validateStep = useCallback(
    (stepIndex) => {
      const missing = missingOnStep(stepIndex);
      if (missing.length === 0) return true;

      setErrors(
        fromEntries(
          missing.map((key) => [
            key,
            key === "photo"
              ? texts.errors.photoRequired
              : texts.errors.required,
          ]),
        ),
      );
      return false;
    },
    [missingOnStep, texts],
  );

  const nextStep = useCallback(() => {
    if (!validateStep(step)) return;
    setErrors({});
    setStep((value) => Math.min(value + 1, steps.length));
  }, [step, steps.length, validateStep]);

  const validate = useCallback(() => {
    const next = {};
    for (const key of missingRequiredFields(form, required)) {
      next[key] = texts.errors.required;
    }
    // The photo is an object, not a string, so the shared check cannot see it.
    const photoStep = steps.findIndex((formStep) =>
      formStep.fields.some((field) => field.type === "photo" && field.required),
    );
    if (photoStep !== -1 && missingOnStep(photoStep + 1).includes("photo")) {
      next.photo = texts.errors.photoRequired;
    } else {
      delete next.photo;
    }
    if (form.component_uid && !isValidComponentUid(form.component_uid)) {
      next.component_uid = texts.errors.digitsOnly;
    }
    // A coordinate typed by hand can land anywhere; one that is out of range
    // would put the component on the far side of the planet on the map.
    if (
      form.lat !== "" &&
      form.lat != null &&
      !isValidLatitude(Number(form.lat))
    ) {
      next.lat = texts.errors.badCoordinate;
    }
    if (
      form.lng !== "" &&
      form.lng != null &&
      !isValidLongitude(Number(form.lng))
    ) {
      next.lng = texts.errors.badCoordinate;
    }
    setErrors(next);
    return Object.keys(next);
  }, [form, missingOnStep, required, steps, texts]);

  /**
   * Copyable fields the operator left empty that the previous card can fill.
   *
   * Only the empty ones: what was typed here describes the equipment in front
   * of the walker and is never overwritten by the card before it.
   */
  const findFillableKeys = useCallback(
    (candidate) => {
      if (!lastComponent) return [];
      return getCopyPreviousKeys(copyableFields).filter((key) => {
        const current = candidate[key];
        if (current != null && String(current).trim() !== "") return false;
        const previous = lastComponent[key];
        return previous != null && String(previous).trim() !== "";
      });
    },
    [copyableFields, lastComponent],
  );

  /*
   * Читается по ссылке, а не по значению: ожидание фикса идёт внутри
   * сохранения, и координата, пришедшая за эти секунды, должна быть видна.
   */
  const coordsRef = useRef(coords);
  useEffect(() => {
    coordsRef.current = coords;
  }, [coords]);

  const commitSave = useCallback(
    async (payload) => {
      setSaving(true);
      try {
        let card = payload;

        /*
         * Карточка без координат выпадает с карты, и до сих пор она так и
         * сохранялась молча: фикс снимался при открытии, а если приёмник был
         * выключен — в карточку уходила пустота. Теперь так же, как в форме
         * утечки: приёмник включается сам, ему дают время, и только потом
         * карточка уходит без координат — но уже вслух.
         *
         * Только при заведении. У карточки, заведённой без координат когда-то,
         * они уже не появятся, и держать правку по пятнадцать секунд каждый
         * раз значило бы наказывать за чужую давнюю пустоту.
         */
        if (!isEditing && !hasCoordsFix(card)) {
          if (!gpsEnabled) setGpsEnabled?.(true);
          const fix = await waitForCoordsFix(coordsRef);
          if (fix) card = { ...card, lat: fix.lat, lng: fix.lng };
        }

        await onSave(card);
        // Черновик снимается только после успешной записи: упади сохранение
        // раньше — заполненное осталось бы единственной копией и исчезло.
        clearDraft();
        if (!hasCoordsFix(card)) onSavedWithoutCoords?.();
      } finally {
        setSaving(false);
      }
    },
    [
      clearDraft,
      gpsEnabled,
      isEditing,
      onSave,
      onSavedWithoutCoords,
      setGpsEnabled,
    ],
  );

  const handleConfirmCopy = useCallback(() => {
    const merged = { ...form };
    for (const key of pendingKeysRef.current) merged[key] = lastComponent[key];
    setConfirmOpen(false);
    void commitSave(merged);
  }, [commitSave, form, lastComponent]);

  const handleCancelCopy = useCallback(() => {
    setConfirmOpen(false);
    void commitSave({ ...form });
  }, [commitSave, form]);

  const handleSave = useCallback(async () => {
    const failed = validate();
    if (failed.length > 0) {
      // Land on the step that actually holds the problem. Saving is allowed
      // from any step, so a fixed jump to the first one would hide an error
      // sitting three steps away and look like a button that does nothing.
      setStep(stepOf(failed));
      return;
    }
    const fillable = findFillableKeys(form);
    if (fillable.length === 0) {
      await commitSave(form);
      return;
    }

    // Offered rather than applied: a blank passport field may mean "same as the
    // last one" or "the plate was unreadable", and only the person holding the
    // card knows which.
    pendingKeysRef.current = fillable;
    setConfirmOpen(true);
  }, [commitSave, findFillableKeys, form, stepOf, validate]);

  const hasStepData = (steps[step - 1]?.fields ?? []).some(
    ({ key }) => form[key] != null && String(form[key]).trim() !== "",
  );

  /**
   * Clearing leaves the identity number and the recorded fix alone: one is the
   * card's identity and the other is where the walker is standing, and neither
   * is something the button is meant to throw away.
   */
  const keepOnClear = useCallback(
    (current) => ({
      component_uid: current.component_uid,
      lat: current.lat,
      lng: current.lng,
    }),
    [],
  );

  const clearStep = useCallback(() => {
    setForm((current) => {
      const next = { ...current };
      for (const field of steps[step - 1]?.fields ?? []) {
        if (field.key in keepOnClear(current)) continue;
        delete next[field.key];
      }
      return next;
    });
    setErrors({});
  }, [keepOnClear, step, steps]);

  const clearAll = useCallback(() => {
    setForm((current) => keepOnClear(current));
    setErrors({});
    setStep(1);
  }, [keepOnClear]);

  return (
    <div className={`${leak.card} content`}>
      {draftPrompt && (
        <div className={s.draftBanner}>
          <span className={s.draftBannerText}>
            {t("components.draftBanner.message")}
          </span>
          <button
            type="button"
            className={`${s.draftBtn} ${s.draftBtnRestore}`}
            onClick={handleRestoreDraft}
          >
            {t("components.draftBanner.restore")}
          </button>
          <button
            type="button"
            className={`${s.draftBtn} ${s.draftBtnDiscard}`}
            onClick={handleDiscardDraft}
          >
            {t("components.draftBanner.discard")}
          </button>
        </div>
      )}

      <PageHeader
        title={isEditing ? texts.editTitle : texts.addTitle}
        subtitle={`${texts.stepPrefix} ${step} / ${steps.length} · ${
          steps[step - 1]?.title ?? ""
        }`}
        badge={`${step}/${steps.length}`}
        backLabel={texts.cancel}
        onBack={() => {
          stopVoiceInput?.();
          onCancel();
        }}
        right={
          /* Микрофон только там, где ему есть что заполнять: тип проекта
             вправе не давать реестру голосового словаря. */
          voice ? (
            <VoiceButton
              startVoiceInput={startVoiceInput}
              stopVoiceInput={stopVoiceInput}
              dark
            />
          ) : null
        }
      />

      {conflicts.length > 0 && (
        <p className={s.warning} role="status">
          {texts.duplicateWarning(conflicts.length)}
        </p>
      )}

      <StepRenderer
        step={step}
        steps={steps}
        form={form}
        errors={errors}
        onChange={handleChange}
        nextStep={nextStep}
        save={handleSave}
        ghostPlaceholders={ghostPlaceholders}
      />

      <VoicePreviewSheet
        pending={pendingVoiceData}
        steps={steps}
        onConfirm={handleVoiceConfirm}
        onDismiss={dismissVoiceData}
      />

      <ClearActions
        hasStepData={hasStepData}
        onClearStep={clearStep}
        onClearAll={clearAll}
        localeTexts={texts}
      />

      <AddLeakFooter
        prevStep={() => setStep((value) => Math.max(1, value - 1))}
        nextStep={nextStep}
        save={handleSave}
        step={step}
        stepsLength={steps.length}
        isSaving={saving}
        localeTexts={texts}
      />

      <ConfirmSheet
        open={confirmOpen}
        title={texts.copyConfirm.title}
        description={texts.copyConfirm.description}
        confirmLabel={texts.copyConfirm.confirmLabel}
        cancelLabel={texts.copyConfirm.cancelLabel}
        onConfirm={handleConfirmCopy}
        onCancel={handleCancelCopy}
      />
    </div>
  );
}
