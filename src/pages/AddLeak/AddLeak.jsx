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
import { isPinkBagEquipment } from "@/utils/calculations/calculations";
import Notification from "@/components/ui/Notification/Notification";
import AddLeakSuccess from "./components/AddLeakSuccess";
import s from "./AddLeak.module.scss";

export default function AddLeak({
  data,
  setData,
  coords,
  setPage,
  onBack,
  userProfile,
}) {
  const { t, lang } = useLanguage();
  const { form, setForm } = useLeakFormContext();
  const { savePhoto, ready: photoReady } = usePhotoStorage();
  const { saveDraft, loadDraft, clearDraft, hasDraft } = useFormDraft();
  const { isSaving, run } = useSafeSave();
  const [draftPrompt, setDraftPrompt] = useState(false);
  const [notification, setNotification] = useState(null);
  const [savedLeak, setSavedLeak] = useState(null);
  const photoReadyRef = useRef(photoReady);

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
      success: {
        title: t("addLeak.success.title", {
          defaultValue: lang === "ru" ? "Утечка сохранена" : "Leak saved",
        }),
        description: t("addLeak.success.description", {
          defaultValue:
            lang === "ru"
              ? "Запись добавлена в журнал и доступна в базе данных."
              : "The record has been added to the log and is available in the database.",
        }),
        newLeak: t("addLeak.success.newLeak", {
          defaultValue: lang === "ru" ? "Новая утечка" : "New leak",
        }),
        home: t("addLeak.success.home", {
          defaultValue: lang === "ru" ? "На главную" : "Return home",
        }),
        tag: t("addLeak.success.tag", {
          defaultValue: lang === "ru" ? "№" : "Tag",
        }),
        component: t("addLeak.success.component", {
          defaultValue: lang === "ru" ? "Компонент" : "Component",
        }),
        leakRate: t("addLeak.success.leakRate", {
          defaultValue: lang === "ru" ? "Скорость" : "Leak rate",
        }),
      },
    }),
    [t, lang],
  );

  useEffect(() => {
    photoReadyRef.current = photoReady;
  }, [photoReady]);

  useEffect(() => {
    const profileName = userProfile?.name?.trim();
    if (!profileName || form.detectedBy != null) return;
    setForm((prev) => ({ ...prev, detectedBy: profileName }));
  }, [form.detectedBy, setForm, userProfile?.name]);

  /* Offer to restore draft on mount */
  useEffect(() => {
    if (hasDraft() && Object.keys(form).length === 0) {
      setDraftPrompt(true);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* Autosave draft with a short debounce */
  useEffect(() => {
    if (Object.keys(form).length === 0) return;
    const t = setTimeout(() => saveDraft(form, 1), 1000);
    return () => clearTimeout(t);
  }, [form, saveDraft]);

  /* Restore draft */
  const handleRestoreDraft = () => {
    const draft = loadDraft();
    if (draft?.form) setForm(draft.form);
    setDraftPrompt(false);
  };

  const handleDiscardDraft = () => {
    clearDraft();
    setDraftPrompt(false);
  };

  const waitForPhotoReady = async (timeoutMs = 2000) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (photoReadyRef.current) return true;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return photoReadyRef.current;
  };

  const handleAdd = async (row) => {
    return run(async () => {
      try {
        const id = Date.now() * 1000 + Math.floor(Math.random() * 999);
        const lat = toNullableNumber(coords?.lat);
        const lng = toNullableNumber(coords?.lng);

        if (Number.isFinite(lat) && (lat < -90 || lat > 90)) {
          hapticWarning();
          setNotification({
            type: "error",
            message: t("addLeak.validation.lat", { lat }),
          });
          return null;
        }
        if (Number.isFinite(lng) && (lng < -180 || lng > 180)) {
          hapticWarning();
          setNotification({
            type: "error",
            message: t("addLeak.validation.lng", { lng }),
          });
          return null;
        }

        const profileName = userProfile?.name?.trim() ?? "";
        if (!profileName) {
          hapticWarning();
          setNotification({
            type: "error",
            message:
              lang === "ru"
                ? "Заполните имя пользователя в профиле"
                : "Fill in the user name in the profile",
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
            message:
              lang === "ru"
                ? "Заполните серийный номер оборудования в параметрах расчета"
                : "Fill in the equipment serial number in calculation parameters",
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
              setNotification({
                type: "error",
                message: t("addLeak.validation.photoReady"),
              });
              return null;
            }
          }
          photoPath = await savePhoto(rawPhoto, String(id), [], {
            cleanupOldVersions: false,
          });
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
        await setData(updated);

        clearDraft();
        hapticSuccess();
        setSavedLeak(newRow);
        return newRow;
      } catch (err) {
        logger.error("[AddLeak] Error adding leak:", err);
        hapticWarning();
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
              "addLeak.fields.leak_speed.unit",
              { defaultValue: lang === "ru" ? "л/мин" : "L/min" },
            )}`,
          }
        : null,
    ].filter(Boolean);
  }, [savedLeak, localeTexts, t, lang]);

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
          coords={coords}
          onBack={onBack}
          lastItem={data.at(-1)}
        />
      )}
    </>
  );
}
