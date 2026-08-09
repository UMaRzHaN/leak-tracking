import { useEffect, useMemo, useState, useRef } from "react";
import LeakForm from "@/features/leakForm/LeakForm";
import { usePhotoStorage } from "@/hooks/usePhotoStorage";
import { useFormDraft } from "@/hooks/useFormDraft";
import { useSafeSave } from "@/hooks/useSafeSave";
import { useLeakFormContext } from "@/features/leakForm/LeakFormContext";
import { useLanguage } from "@/app/hooks/useLanguage";
import { hapticSuccess, hapticWarning } from "@/utils/haptics";
import { logger } from "@/utils/logger";
import { toNullableNumber } from "@/utils/normalize/toNullableNumber";
import { STATUS } from "@/utils/status";
import { priorityFromSpeed } from "@/utils/priority";
import { dataUrlToBlob } from "@/utils/photoConversion";
import { formatNativeError } from "@/utils/nativeErrorMessage";
import { isPinkBagEquipment } from "@/utils/calculations/calculations";
import { normalizeLeakTag } from "@/utils/leakIdentity";
import { isValidLatitude, isValidLongitude } from "@/utils/coordinates";
import { isLeakFormDirty } from "@/features/leakForm/utils/isLeakFormDirty";
import { createRecordId } from "@/utils/createRecordId";
import Notification from "@/components/ui/Notification/Notification";
import ConfirmSheet from "@/components/ui/ConfirmSheet/ConfirmSheet";
import AddLeakSuccess from "./components/AddLeakSuccess";
import s from "./AddLeak.module.scss";

export default function AddLeak({
  data,
  setData,
  coords,
  gpsEnabled = true,
  setPage,
  onBack,
  userProfile,
  projectId,
}) {
  const { t } = useLanguage();
  const { form, setForm } = useLeakFormContext();
  const {
    deletePhoto,
    savePhoto,
    ready: photoReady,
    storageError,
  } = usePhotoStorage();
  const { saveDraft, loadDraft, clearDraft } = useFormDraft(projectId);
  const { isSaving, run } = useSafeSave();
  const [draftPrompt, setDraftPrompt] = useState(false);
  const [draftReadyProjectId, setDraftReadyProjectId] = useState(null);
  const [notification, setNotification] = useState(null);
  const [savedLeak, setSavedLeak] = useState(null);
  const [coordsPrompt, setCoordsPrompt] = useState(false);
  // Holds the answer the sheet is waiting to give back to handleAdd. A promise
  // rather than a callback because LeakForm awaits onAdd and only clears the
  // form once it resolves with a saved row — asking the question inside that
  // await keeps the contract, so cancelling leaves everything typed in place.
  const coordsDecisionRef = useRef(null);
  const photoReadyRef = useRef(photoReady);
  const storageErrorRef = useRef(storageError);
  const normalizedProjectId = String(projectId ?? "");

  const localeTexts = useMemo(
    () => ({
      pageTitle: t("addLeak.pageTitle"),
      stepPrefix: t("addLeak.stepPrefix"),
      draftBanner: {
        message: t("addLeak.draftBanner.message"),
        restore: t("addLeak.draftBanner.restore"),
        discard: t("addLeak.draftBanner.discard"),
      },
      buttons: {
        prev: t("addLeak.buttons.prev"),
        next: t("addLeak.buttons.next"),
        save: t("addLeak.buttons.save"),
        saving: t("addLeak.buttons.saving"),
        clearStep: t("addLeak.buttons.clearStep"),
        clearAll: t("addLeak.buttons.clearAll"),
      },
      confirm: {
        title: t("addLeak.confirm.title"),
        description: t("addLeak.confirm.description"),
        confirmLabel: t("addLeak.confirm.confirmLabel"),
        cancelLabel: t("addLeak.confirm.cancelLabel"),
      },
      noCoords: {
        title: t("addLeak.noCoords.title"),
        // Two reasons produce the same empty coordinates and want different
        // advice: one is fixed by a tap, the other by waiting or stepping
        // outside.
        description: gpsEnabled
          ? t("addLeak.noCoords.noFix")
          : t("addLeak.noCoords.gpsOff"),
        confirmLabel: t("addLeak.noCoords.confirmLabel"),
        cancelLabel: t("addLeak.noCoords.cancelLabel"),
      },
      success: {
        title: t("addLeak.success.title"),
        description: t("addLeak.success.description"),
        newLeak: t("addLeak.success.newLeak"),
        home: t("addLeak.success.home"),
        tag: t("addLeak.success.tag"),
        component: t("addLeak.success.component"),
        leakRate: t("addLeak.success.leakRate"),
      },
    }),
    [t, gpsEnabled],
  );

  useEffect(() => {
    photoReadyRef.current = photoReady;
  }, [photoReady]);

  useEffect(() => {
    storageErrorRef.current = storageError;
  }, [storageError]);

  useEffect(() => {
    const profileName = userProfile?.name?.trim();
    if (!profileName || form.detectedBy != null) return;
    setForm((prev) => ({ ...prev, detectedBy: profileName }));
  }, [form.detectedBy, setForm, userProfile?.name]);

  /* Offer to restore draft on mount */
  useEffect(() => {
    const storedDraft = loadDraft();
    const draftExists = isLeakFormDirty(storedDraft?.form);
    if (storedDraft && !draftExists) clearDraft();
    setDraftPrompt(draftExists);
    setDraftReadyProjectId(draftExists ? null : normalizedProjectId);
  }, [clearDraft, loadDraft, normalizedProjectId]);

  /* Autosave draft with a short debounce */
  useEffect(() => {
    if (draftPrompt || draftReadyProjectId !== normalizedProjectId) {
      return;
    }
    if (!isLeakFormDirty(form)) {
      clearDraft();
      return;
    }
    const t = setTimeout(() => saveDraft(form, 1), 1000);
    return () => clearTimeout(t);
  }, [
    clearDraft,
    draftPrompt,
    draftReadyProjectId,
    form,
    normalizedProjectId,
    saveDraft,
  ]);

  /* Restore draft */
  const handleRestoreDraft = () => {
    const draft = loadDraft();
    if (draft?.form) setForm(draft.form);
    setDraftPrompt(false);
    setDraftReadyProjectId(normalizedProjectId);
  };

  const handleDiscardDraft = () => {
    clearDraft();
    setDraftPrompt(false);
    setDraftReadyProjectId(normalizedProjectId);
  };

  const waitForPhotoReady = async (timeoutMs = 2000) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (photoReadyRef.current) return true;
      // Хранилище уже отказало — ждать нечего, показываем причину сразу.
      if (storageErrorRef.current) return false;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return photoReadyRef.current;
  };

  const settleCoordsPrompt = (proceed) => {
    setCoordsPrompt(false);
    const decide = coordsDecisionRef.current;
    coordsDecisionRef.current = null;
    decide?.(proceed);
  };

  const handleAdd = async (row) => {
    const lat = toNullableNumber(coords?.lat);
    const lng = toNullableNumber(coords?.lng);

    // A leak saved without coordinates is filtered out of the map, and until
    // now that happened silently: the record existed in the database, never
    // showed up on the map, and nothing said why. Asking first is not a
    // blocker — plenty of leaks are logged where there is no signal — it just
    // stops the loss from being invisible.
    if (lat == null || lng == null) {
      const proceed = await new Promise((resolve) => {
        coordsDecisionRef.current = resolve;
        setCoordsPrompt(true);
      });
      if (!proceed) return null;
    }

    return run(async () => {
      try {
        const id = createRecordId();

        if (lat != null && !isValidLatitude(lat)) {
          hapticWarning();
          setNotification({
            type: "error",
            message: t("addLeak.validation.lat", { lat }),
          });
          return null;
        }
        if (lng != null && !isValidLongitude(lng)) {
          hapticWarning();
          setNotification({
            type: "error",
            message: t(
              "addLeak.validation.lng",
              /** @type {any} */ ({
                lng,
                defaultValue: `Invalid longitude: ${lng}`,
              }),
            ),
          });
          return null;
        }

        const profileName = userProfile?.name?.trim() ?? "";
        if (!profileName) {
          hapticWarning();
          setNotification({
            type: "error",
            message: t("addLeak.errors.userNameRequired"),
          });
          return null;
        }

        const serialNumberMissing =
          row.equipmentType &&
          !isPinkBagEquipment(row.equipmentType) &&
          (row.serial_number == null || row.serial_number === "");
        if (serialNumberMissing) {
          hapticWarning();
          setNotification({
            type: "error",
            message: t("addLeak.errors.serialNumberRequired"),
          });
          return null;
        }

        const normalizedLeakTag = normalizeLeakTag(row.leak_id);
        if (
          normalizedLeakTag &&
          data.some(
            (leak) => normalizeLeakTag(leak.leak_id) === normalizedLeakTag,
          )
        ) {
          hapticWarning();
          setNotification({
            type: "error",
            message: t("addLeak.errors.duplicateTag"),
          });
          return null;
        }

        /* Save photo */
        let photoPath = null;
        const rawPhoto =
          row.photo?.raw ??
          (row.photo?.src ? dataUrlToBlob(row.photo.src) : null);
        if (rawPhoto) {
          if (!photoReadyRef.current) {
            const ready = await waitForPhotoReady();
            if (!ready) {
              hapticWarning();
              // Причина отказа хранилища важнее общего «повторите позже»:
              // раньше она уходила только в storageError и нигде не всплывала.
              const reason = formatNativeError(storageErrorRef.current);
              if (reason) {
                logger.error("Photo storage unavailable", reason);
              }
              setNotification({
                type: "error",
                message: reason
                  ? t("addLeak.validation.photoStorageError", { reason })
                  : t("addLeak.validation.photoReady"),
                ...(reason ? { autoCloseMs: 8000 } : {}),
              });
              return null;
            }
          }
          photoPath = await savePhoto(rawPhoto, String(id), [], {
            cleanupOldVersions: false,
          });
          if (!photoPath) {
            throw new Error(t("addLeak.errors.photoSaveFailed"));
          }
        }

        const cleanRow = { ...row };
        delete cleanRow.photo;
        cleanRow.detectedBy =
          String(cleanRow.detectedBy ?? "").trim() || profileName;

        const newRow = {
          id,
          lat,
          lng,
          index: data.length + 1,
          status: STATUS.OPEN,
          priority: priorityFromSpeed(cleanRow.leak_speed),
          history: [
            {
              action: "created",
              date: new Date().toISOString(),
              user: cleanRow.detectedBy || undefined,
            },
          ],
          ...cleanRow,
          photo: photoPath,
        };

        const updated = [...data, newRow];
        setNotification(null);
        try {
          await setData(updated);
        } catch (error) {
          if (photoPath) {
            await deletePhoto(photoPath).catch(() => {});
          }
          throw error;
        }

        clearDraft();
        hapticSuccess();
        setSavedLeak(newRow);
        return newRow;
      } catch (err) {
        logger.error("[AddLeak] Error adding leak:", err);
        hapticWarning();
        setNotification({
          type: "error",
          message: err?.message || t("addLeak.errors.saveFailed"),
        });
        return null;
      }
    });
  };

  const successChips = useMemo(() => {
    if (!savedLeak) return [];
    return [
      savedLeak.leak_id
        ? { label: localeTexts.success.tag, value: savedLeak.leak_id }
        : null,
      savedLeak.component
        ? {
            label: localeTexts.success.component,
            value: savedLeak.component,
          }
        : null,
      savedLeak.leak_speed != null && savedLeak.leak_speed !== ""
        ? {
            label: localeTexts.success.leakRate,
            value: `${savedLeak.leak_speed} ${t(
              "common.units.litresPerMinute",
            )}`,
          }
        : null,
    ].filter(Boolean);
  }, [savedLeak, localeTexts, t]);

  const handleNewLeak = () => {
    setSavedLeak(null);
    setDraftPrompt(false);
    setNotification(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <>
      <Notification
        notification={notification}
        onClose={() => setNotification(null)}
      />

      <ConfirmSheet
        open={coordsPrompt}
        title={localeTexts.noCoords.title}
        description={localeTexts.noCoords.description}
        confirmLabel={localeTexts.noCoords.confirmLabel}
        cancelLabel={localeTexts.noCoords.cancelLabel}
        onConfirm={() => settleCoordsPrompt(true)}
        onCancel={() => settleCoordsPrompt(false)}
      />

      {draftPrompt && (
        <div className={s.draftBanner}>
          <span className={s.draftBannerText}>
            {localeTexts.draftBanner.message}
          </span>
          <button
            className={`${s.draftBtn} ${s.draftBtnRestore}`}
            onClick={handleRestoreDraft}
          >
            {localeTexts.draftBanner.restore}
          </button>
          <button
            className={`${s.draftBtn} ${s.draftBtnDiscard}`}
            onClick={handleDiscardDraft}
          >
            {localeTexts.draftBanner.discard}
          </button>
        </div>
      )}

      {savedLeak ? (
        <AddLeakSuccess
          localeTexts={localeTexts.success}
          chips={successChips}
          onNewLeak={handleNewLeak}
          onHome={() => setPage("")}
        />
      ) : (
        <LeakForm
          onAdd={handleAdd}
          onSaved={setSavedLeak}
          isSaving={isSaving}
          onBack={onBack}
          lastItem={data.at(-1)}
        />
      )}
    </>
  );
}
